# Moving shared state out of process memory and into Redis

Status: proposal / draft plan
Base: `origin/main` @ `dbab744`
Scope: `server/`. Frontend changes limited to one Socket.IO transport option.

---

## 0. Summary

The backend keeps seven pieces of mutable state in process memory. Recent work
(`#16`, `#17`, `fix/r1-calls-map-cleanup`) has already fixed most of the
_hygiene_ problems with that — the call table is a `Map` with proper release,
ICE retry timers are tracked, rating locks have a real 24 h TTL. So this is
**not** a "rescue a leaking codebase" proposal.

What is left is structural: process memory means exactly one backend process,
which means no horizontal scale, no rolling deploys, and state destroyed on
every restart. One of those losses is directly user-visible — after a deploy,
anyone who just finished a call is told
`"You have not been in a call with this user"` when they try to rate their
partner (§2.2).

The performance argument is more modest than it might first appear, and §4
says so plainly: Redis makes most individual operations _slower_ in absolute
terms. The honest wins are throughput, capacity, correctness across restarts,
and one specific latency win — the shared identity cache (§4.3).

---

## 1. What is in memory today

| #   | State                | Where                                             | Shape                                         | Existing bound                           |
| --- | -------------------- | ------------------------------------------------- | --------------------------------------------- | ---------------------------------------- |
| 1   | `userCount`          | `services/realtime.ts:28`                         | `number`                                      | n/a                                      |
| 2   | `calls`              | `services/realtime.ts:29`                         | `Map<callId, Call>` — **holds live `Socket`** | released per socket (`signaling.ts:112`) |
| 3   | `interactions`       | `services/realtime.ts:30`                         | `rater → target → timestamp`                  | 24 h lock, lazily pruned                 |
| 4   | `pairings`           | `services/realtime.ts:32`, `services/pairings.ts` | `Pairing[]`                                   | 1 h TTL + `MAX_PAIRINGS` 10 000          |
| 5   | `stats`              | `services/realtime.ts:33`                         | counters + `serverStartTime`                  | monotonic                                |
| 6   | `identityCache`      | `services/identity.ts:84`                         | `accessToken → Identity`                      | 5 min TTL, pruned on miss                |
| 7   | rate-limiter buckets | `app.ts:15` (`express-rate-limit` default store)  | in-process `MemoryStore`                      | window-scoped                            |

Item 7 is easy to miss and matters: `express-rate-limit` defaults to an
in-memory store, so the "30 writes / 15 min" limit is **per process**. The
moment there are N replicas the effective limit becomes 30 × N, and it resets
on every deploy. Any move to multi-instance has to bring `rate-limit-redis`
with it or the limiter quietly stops meaning what it says.

`socket.data.currentCallId` and `socket.data.user` are also state, but they
are legitimately node-local — a socket only exists on the process that
terminated its connection. They stay where they are.

### 1.1 The blocking constraint

`Call` holds **live Socket.IO `Socket` objects**, not identifiers:

```ts
offerMaker: Socket;
answerMaker: Socket | null;
pendingAnswerMaker: Socket | null;
```

and the handlers call `call.offerMaker.emit(...)` directly
(`signaling.ts:221, 239, 252, 337`). Socket objects own file descriptors,
timers and buffers; they cannot be serialised.

**This is the single most important fact about the migration.** The job is not
"swap the backing store for `state`". It is "stop holding socket references,
address peers by id or room, and let the Socket.IO Redis adapter route the
emit to whichever node owns that socket". The store swap then falls out almost
for free. Identity comparisons like `call.pendingAnswerMaker !== socket`
(`signaling.ts:272`) — a real authorisation check — become `!== socket.id`, so
they survive the change, but every one of them needs revisiting deliberately.

---

## 2. Why move

### 2.1 One process is the ceiling

`state` is process memory, so a second replica is not merely unhelpful, it is
wrong: two users on different nodes never see each other's offers
(`looking-for-somebody` iterates only that node's `state.calls`), and
`userCount` reports a fraction of the truth on each. Today that means one CPU
core for all signalling, no redundancy, and no rolling-deploy target.

### 2.2 Restart destroys state, and one loss is user-visible

`docker-compose.yml` runs a single `backend`; deploying is rebuild + restart.

- **`pairings` (item 4) is the authorisation ledger for ratings.** `POST /rep`
  refuses with 403 `"You have not been in a call with this user"` unless
  `claimRating` finds a pairing (`users.ts:63-65`). Pairings live 1 h and only
  in memory, so **every deploy silently revokes the right to rate for everyone
  who spoke in the previous hour.** They see the rating panel, click it, and
  get a 403 that blames them. This is the clearest single argument in the
  whole document.
- **`calls` (2)** — anyone mid-negotiation starts over.
- **`stats` (5)** resets, so `/stats` means "since the last deploy" rather
  than anything about the product.
- **`interactions` (3)** resets, so the 24 h "already rated" lock is really
  "until the next deploy".
- **`identityCache` (6)** cold-starts: every reconnecting socket pays two
  sequential Google round trips again (§4.3).

### 2.3 Bugs found while reading (fix these first, no Redis needed)

These are in `origin/main` today, independent of the migration. Fixing them
first also makes the §4.6 benchmark a comparison against a correct baseline.

**R1 — `GET /stats/interactions` returns `NaN`.** `stats.ts:65` does:

```ts
totalInteractions += interactions[userId].length;
```

`InteractionsMap` changed from `Record<string, string[]>` to
`Record<string, Record<string, number>>` (`realtime.ts:22`) but this reader was
not updated. The inner value is now an object, `.length` is `undefined`, and
`totalInteractions` is `NaN` on every request. Fix:
`Object.keys(interactions[userId]).length`.

**R2 — `releaseCall` orphans ICE retry timers.** `releaseCall`
(`signaling.ts:112`) deletes the call from `state.calls` but never calls
`clearPendingIceRelays(callId)`. It runs at `make-offer:193` and
`looking-for-somebody:174`, i.e. whenever a socket abandons one call for
another. The abandoned call's `setInterval` handles keep polling
`call.answerMaker` every 100 ms on a `Call` no longer reachable from `state`,
so the condition can never become true and the timer never clears. The
`disconnect` path only clears relays for the socket's _current_ callId, so it
does not catch these. Narrower than the pre-`#17` leak, same class. Fix: call
`clearPendingIceRelays(callId)` inside `releaseCall`.

**R3 — `interactions` is still unbounded over long uptimes.**
`hasActiveInteractionLock` prunes lazily, only for the exact `(rater, target)`
pair being queried. A user who rates someone once and never returns leaves
that entry in memory forever. Fix with a periodic sweep, or fold it into Redis
with `EXPIREAT` (§3.3), which removes the problem by construction.

**R4 — a rating can be spent without being applied.** `claimRating`
(`users.ts:63`) pushes the rater into `pairing.ratedBy` _before_ the Mongo
`$inc`. If Mongo throws, or the target does not exist (`matchedCount === 0`
→ 404 at `users.ts:70`), the claim is already consumed and the user can never
retry. Fix by claiming after a successful write, or rolling the claim back on
failure. Worth settling before Redis, because in a distributed store this
sequence becomes a genuine race rather than merely an ordering bug.

---

## 3. Target design

### 3.1 Libraries

- **`ioredis`** for application commands — first-class Lua (`defineCommand`),
  good types.
- **`@socket.io/redis-adapter`** for cross-node emit. It needs its own pub and
  sub connections, so budget **three** Redis connections per instance.
  (`@socket.io/redis-streams-adapter` is the upgrade path if broadcast loss
  during a Redis failover ever becomes a real complaint; start with the
  classic adapter.)
- **`rate-limit-redis`** as the `express-rate-limit` store, per item 7.

### 3.2 Sockets out of the data model: use rooms

Replace stored `Socket`s with `socket.id`, and join both peers to a room
`call:<callId>` at `call-accepted`. Then:

- peer relay becomes a room emit — `socket.to('call:' + callId).emit(...)` —
  which the adapter routes to whichever node holds the peer;
- `chat-message` needs no call lookup at all: room membership _is_ the
  authorisation check, structurally stronger than today's `currentCallId` +
  `paired` checks;
- the `pendingAnswerMaker !== socket` guard (`signaling.ts:272`) becomes an id
  comparison and keeps working across nodes;
- `Call` becomes a plain serialisable record.

### 3.3 Key layout

Prefixed via `REDIS_PREFIX` (default `bm:`) so several worktrees share one dev
Redis — mirroring the existing "one Mongo, different database name per
worktree" convention.

| Purpose        | Key                                                 | Type                                                                    | TTL                 | Replaces               |
| -------------- | --------------------------------------------------- | ----------------------------------------------------------------------- | ------------------- | ---------------------- |
| Waiting offers | `bm:waiting`                                        | LIST of callId                                                          | validated on pop    | the unpaired part of 2 |
| Call record    | `bm:call:<id>`                                      | HASH: offer, answer, offererSid, answererSid, pendingSid, users, paired | 10 min, refreshed   | a `Call`               |
| Buffered ICE   | `bm:call:<id>:ice:offer` / `:ice:answer`            | LIST                                                                    | as call             | the `setInterval` loop |
| Socket → call  | `bm:sock:<socketId>`                                | STRING                                                                  | 10 min              | cross-node lookup only |
| Presence       | `bm:presence:<instanceId>`                          | STRING (that node's count)                                              | 15 s, heartbeat 5 s | 1                      |
| Rating lock    | `bm:rep:<raterId>`                                  | HASH target → ts                                                        | `EXPIREAT` +24 h    | 3 (fixes R3)           |
| Pairings       | `bm:pairing:<callId>` + `bm:paired:<a>:<b>` pointer | HASH participants, ratedBy                                              | 1 h                 | 4                      |
| Identity cache | `bm:identity:<sha256(token)>`                       | STRING (JSON)                                                           | 5 min               | 6                      |
| Rate limiter   | managed by `rate-limit-redis`                       | —                                                                       | window              | 7                      |
| Counters       | `bm:stats`                                          | HASH, `HINCRBY`                                                         | none                | 5                      |

Choices worth defending:

- **Presence is per-node, not one shared counter.** `INCR`/`DECR` on a single
  key drifts permanently upward if a node is SIGKILLed while holding
  connections. A per-node key with a heartbeat TTL self-heals — the dead
  node's contribution expires in 15 s. Total = sum of a handful of small keys,
  read on a 1 s debounce rather than per event.
- **Hash the access token before using it as a key.** Item 6 is currently
  keyed by the raw Google access token. In process memory that is
  unremarkable; in Redis it means live bearer tokens sit in a store that AOF
  and RDB write to disk and anyone with `redis-cli` can read. Key on
  `sha256(token)` and store only the derived `Identity`.
- **`pairings` needs a lookup by pair, not a scan.** `claimRating` currently
  does `state.pairings.find(p => p.participants.includes(...))`. Keep an
  explicit `bm:paired:<min(a,b)>:<max(a,b)>` → callId pointer so the lookup is
  O(1) rather than porting a linear scan into Redis.
- **`serverStartTime` has to be redefined.** With N instances "server uptime"
  is meaningless. Store `bm:stats.countersSince` and report that; keep
  per-instance uptime in `/healthz` for ops.
- **Everything transient carries a TTL**, so a missed cleanup path costs a few
  stale keys rather than an unbounded leak.

### 3.4 Matching must become explicitly atomic

Today's matcher is atomic by accident: there is no `await` between finding an
unpaired call (`signaling.ts:156-166`) and claiming it
(`signaling.ts:171-176`), so Node's single thread guarantees no two seekers
claim the same offer. Across processes that guarantee is gone.

Restore it with one Lua script, `matchOffer(seekerSid, seekerUserId)`:

```lua
for i = 1, 20 do                                  -- bounded: a poisoned queue can't stall us
  local id = redis.call('RPOP', KEYS[1])          -- bm:waiting
  if not id then return nil end
  local key = KEYS[2] .. id                       -- bm:call:<id>
  if redis.call('EXISTS', key) == 1
     and redis.call('HGET', key, 'offererSid')  ~= ARGV[1]
     and redis.call('HGET', key, 'offererUser') ~= ARGV[2]   -- mirrors signaling.ts:161
     and redis.call('HGET', key, 'paired')      ~= '1' then
    redis.call('HSET', key, 'paired', '1', 'pendingSid', ARGV[1])
    return id
  end
end
return nil
```

One round trip, atomic across all nodes, and stale ids are dropped as a side
effect of popping, so the queue self-cleans.

`claimRating` needs the same treatment for the same reason — check-then-write
across a network is a race. One Lua script that verifies the pairing, checks
`ratedBy` and appends atomically (and settles R4's ordering question while it
is being written).

### 3.5 Retire the ICE `setInterval` while we are here

The retry loop (`signaling.ts:219-226`) exists only because there is no way to
notify a buffered candidate that the answerer has arrived. With Redis:

- candidate arrives before the answerer → `RPUSH bm:call:<id>:ice:offer`;
- candidate arrives after → emit straight into the room;
- on `call-accepted`, `LRANGE` + `DEL` the buffer and flush it in one go.

This deletes `pendingIceRelays` and its three helpers outright, removes R2's
failure mode by construction, and drops up to 100 ms of polling latency from
every buffered candidate.

### 3.6 `userCountChange` must not fan out N times

The adapter turns every `io.emit` into a pub/sub message delivered to every
node, which then emits to its own sockets. `signaling.ts:124,146` fires
`io.sockets.emit('userCountChange')` on **every** connect and disconnect —
under the adapter that becomes N× amplification of the noisiest event in the
system.

Instead: update the node's presence key → `PUBLISH bm:presence-changed`
(debounced to ≤1/s) → every node recomputes the total and calls
**`io.local.emit('userCountChange', total)`**. Local emit, so each client gets
exactly one copy and the adapter stays out of the fan-out path.

---

## 4. Performance: current vs Redis

### 4.1 Be clear about what is already fixed

An earlier draft of this document argued Redis would replace O(n) scans over
an ever-growing `calls` array. That argument is obsolete. Since `#17`:

- `state.calls` is a `Map` — `get` is O(1) (`signaling.ts:216, 236, 249, 266, 299, 325`);
- it is bounded by _concurrently active_ calls, not calls ever made, because
  `releaseCall` runs on disconnect and on committing to a new call;
- `looking-for-somebody` iterates `state.calls.values()`, which is O(active
  calls) — tens, not thousands.

The current implementation is genuinely fast, and **Redis will make these
specific operations slower**. Any pitch claiming otherwise is wrong.

### 4.2 The one remaining O(n) hot path

`services/pairings.ts` still scans:

- `prune()` rebuilds the whole `state.pairings` array with `.filter()` on
  **every** `recordPairing` (every `call-accepted`) and **every**
  `claimRating` (every rating submission);
- `recordPairing` then does a `.some()` scan, `claimRating` a `.find()` scan.

At `MAX_PAIRINGS = 10_000`, a busy server allocates a fresh 10 000-element
array per accepted call, on the event loop. Estimated ~0.1–0.5 ms plus GC
pressure — modest, but it is the one place where the Redis version (O(1)
keyed lookups, TTL expiry instead of a rebuild) is faster on raw latency as
well as on scale.

### 4.3 The one real latency win: the identity cache

`identify()` on a cache miss makes **two sequential HTTPS calls to Google**
(`tokeninfo`, then `userinfo`) plus a Mongo `findOne` — realistically
200–600 ms. It sits in socket middleware (`signaling.ts:97-107`), so it is on
the connect path, and `identity.ts:78-82` notes the app explicitly asks users
to be on mobile data, which makes reconnects frequent.

Today that cache is per-process:

| Scenario     | Per-process cache                                                                       | Shared Redis cache                |
| ------------ | --------------------------------------------------------------------------------------- | --------------------------------- |
| 1 node       | baseline                                                                                | ≈ baseline (+0.3 ms on hit)       |
| N nodes      | up to **N× the Google round trips**; a reconnect landing on a cold node pays 200–600 ms | 1× — a hit on any node serves all |
| after deploy | every socket re-authenticates against Google                                            | cache survives the restart        |

Trading 0.3 ms of Redis for the chance to skip a 200–600 ms double round trip
to Google is the clearest per-request win available, and it improves — not
degrades — as the app scales. It also keeps the app further from Google's
per-project tokeninfo quotas.

### 4.4 Per-operation estimates

Modelled, not measured — see §4.6. Assumes Redis on the same host/VPC
(~0.3 ms RTT).

| Operation                       | Today                                              | With Redis                                 | Verdict                                                             |
| ------------------------------- | -------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------- |
| `make-offer`                    | `Map.set`, ~0                                      | `HSET` + `LPUSH` pipelined, ~0.3 ms        | **slower**; irrelevant inside a ~200 ms negotiation                 |
| `looking-for-somebody`          | O(active) iteration, ~1–10 µs, event-loop blocking | 1 Lua RT, ~0.3–0.5 ms, non-blocking        | **slower** wall-clock; correct across nodes, and off the event loop |
| `offerCandidate`                | `Map.get` + **0–100 ms `setInterval` wait**        | 1 RT, immediate flush                      | **faster** — removes up to 100 ms (§3.5)                            |
| `make-answer` / `call-accepted` | `Map.get`, ~0                                      | 1–2 RT, ~0.6 ms                            | slower, negligible                                                  |
| `chat-message`                  | `Map.get` + direct emit                            | room emit; +~0.2 ms only if peer is remote | negligible                                                          |
| `recordPairing` / `claimRating` | **`prune()` full-array filter, ~0.1–0.5 ms @ 10k** | O(1) keyed ops + TTL, ~0.3–0.6 ms          | **comparable or faster**, and no GC churn                           |
| `identify()` **cache hit**      | `Map.get`, ~0                                      | 1 `GET`, ~0.3 ms                           | slower per hit — but §4.3 shows the hit _rate_ is what matters      |
| `identify()` **cache miss**     | 200–600 ms (2× Google + Mongo)                     | same, but missed far less often            | **much faster in aggregate**                                        |
| `GET /stats/user-count`         | 0                                                  | `MGET` over ≤N keys, ~0.3 ms               | negligible vs HTTP overhead                                         |
| `POST /rep`                     | O(n) prune + O(1) lock                             | 2 Lua RT, ~0.6 ms                          | noise — the handler already does `identify()` + a Mongo write       |

The `/rep` row generalises. Every path where Redis adds latency is already
dominated by a Mongo query, an HTTPS call to Google, or WebRTC negotiation
(itself 100–500 ms of STUN/ICE/DTLS on top of a 20–100 ms browser↔server RTT).
Adding 1–3 round trips to signalling is **under 2% of call-setup time** and is
not perceivable. There is no hot loop in this codebase where sub-millisecond
state access governs throughput.

### 4.5 Where the wins actually are

| Dimension                          | Today                                               | With Redis                                                          |
| ---------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------- |
| Max concurrent users               | one process, one core                               | ~linear in replica count                                            |
| Redis load @ 1 000 call setups/min | —                                                   | ~30–50 ops per call ⇒ **~25–40 ops/s** against a ~100k ops/s budget |
| Deploy                             | drops pairings (§2.2), stats, locks, identity cache | all survive; rolling restart possible                               |
| Rating integrity after deploy      | 403 "you have not been in a call with this user"    | unaffected                                                          |
| Rate limiting (item 7)             | 30 per window **per process**, resets on deploy     | genuinely 30 per window, cluster-wide                               |
| Google API pressure                | scales with node count and restarts                 | flat                                                                |
| Failure blast radius               | process dies ⇒ everything gone                      | node dies ⇒ its users reconnect elsewhere; state intact             |

### 4.6 Measure — do not trust the table

Treat §4.4 as hypotheses and settle them:

1. **Baseline first.** `perf_hooks` timing around each socket handler, plus
   gauges for `state.calls.size` and `state.pairings.length`.
2. **`redis-benchmark -t get,set,hset -q`** on the target host for the real
   RTT floor.
3. **Artillery + the `socket.io` engine** driving match → offer → answer → ICE
   → chat at 50 / 200 / 1 000 concurrent VUs, against both implementations via
   the `STATE_BACKEND` flag (§6). Compare p50/p95/p99 time-to-`call-found` and
   time-to-`connected`. Expect Redis to lose slightly at 50 and win at 1 000.
4. **`autocannon` on `/stats/calls` and `/rep`** with `state.pairings` seeded
   to 10 000 — this is where §4.2 should show up.
5. **Identity cache hit rate** instrumented on both, at N=1 and N=3 replicas.
   This number decides whether §4.3 is real.
6. **24 h soak**, watching RSS. R3 should be visible on the current build.

`server/test/rep.test.cjs` already exists and `npm test` runs it — extend it
to cover the store interface so both backends are tested against the same
assertions.

---

## 5. Deployment

### 5.1 Topology

```
                 ┌──────────────┐
   browsers ───▶ │ nginx/Caddy  │ ──▶ backend×N ──┬──▶ Redis  (calls, pairings, presence, identity, limits)
                 │ TLS, WS,     │                 └──▶ Mongo  (users, reputation)
                 │ sticky       │
                 └──────────────┘
```

Redis sits outside the backend's lifecycle. That is the whole point: it is
what lets the backend be restarted freely.

### 5.2 Sticky sessions — do not skip this

The Redis adapter solves cross-node _emit_. It does **not** solve the HTTP
long-polling handshake, which spans several requests that must all reach the
same node. With N nodes and no affinity you get intermittent
`"Session ID unknown"` errors that look like a Redis bug and are not.

- **LB affinity** — nginx `ip_hash`, or `sticky cookie` on Traefik/HAProxy; or
- **skip polling** — `transports: ['websocket']` on the client. The client
  already passes `auth.token` at handshake time (consumed at
  `signaling.ts:98`), so connection options are being set explicitly somewhere
  already and this is a one-line addition there.

Recommendation: do both, so neither is load-bearing alone.

### 5.3 Compose changes

**Dev** — add `redis:7-alpine` to `docker-compose.dev.yml` (project
`bitsmegle-dev`, already shared across worktrees), bound to `127.0.0.1`, with
a healthcheck. Worktrees separate via `REDIS_PREFIX`, not numbered DBs —
managed Redis and Cluster generally only expose db 0, so prefixes port cleanly
and DB indices do not.

Add scripts mirroring the `db:*` family: `redis:up`, `redis:down`,
`redis:shell`, `redis:flush` (prefix-scoped `SCAN` + `DEL`, never `FLUSHALL` —
that would wipe every other worktree). Extend the worktree table in `README.md`
and `AGENTS.md`:

| Variable       | File          | Main checkout            | Second worktree |
| -------------- | ------------- | ------------------------ | --------------- |
| `REDIS_URL`    | `server/.env` | `redis://127.0.0.1:6379` | same            |
| `REDIS_PREFIX` | `server/.env` | `bm:`                    | `bm_feat:`      |

`config/env.ts` validates required vars up front and must gain `REDIS_URL`
(and `REDIS_PREFIX`, if made mandatory) alongside the existing `STATS_API_KEY`
check.

**Production** — add `redis` with a named volume and healthcheck; `backend`
gets `depends_on: redis: {condition: service_healthy}`. To scale, drop the
fixed `${BACKEND_PORT}:3000` mapping (it blocks `--scale`), put nginx in
front, and run `docker compose up -d --scale backend=3`.

Redis config for this workload:

- `appendonly yes`, `appendfsync everysec` — write volume is tiny, and it means
  pairings, stats and rating locks survive a Redis restart too.
- `maxmemory` set, **`maxmemory-policy noeviction`**. Do _not_ use
  `allkeys-lru`: evicting a live call or pairing breaks it silently and
  undebuggably. Everything transient already carries a TTL, so `noeviction`
  makes a memory problem fail loudly instead of corrupting calls.
- Bind to the internal network only; the identity cache holds derived
  identities and, if §3.3's hashing advice were skipped, would hold bearer
  tokens.

### 5.4 Rolling deploys

Add `GET /healthz` (pinging Redis and Mongo) and wire it to both the compose
healthcheck and the LB. It must sit _outside_ the `requireStatsApiKey`
middleware that now guards `/stats`.

Graceful drain on `SIGTERM`:

1. fail `/healthz` so the LB stops sending new connections;
2. `io.local.emit('server-draining')` — the client's existing auto-reconnect
   moves it to another node;
3. wait ~15–30 s;
4. `io.close()`, close Redis and Mongo, exit.

Worth stating plainly: **WebRTC media is peer-to-peer and never traverses this
server.** A backend restart mid-call does not drop anyone's video or audio; it
interrupts chat relay and the ratings handshake only. Draining therefore
matters mostly for users mid-_matching_ — a much smaller window than it first
appears — and §2.2's rating regression is fixed by Redis persistence rather
than by draining.

### 5.5 Redis availability

Single Redis is a new SPOF. For this app's scale that is a proportionate
trade: AOF + `restart: unless-stopped` + a documented degraded mode (no new
matches; existing calls unaffected). If that stops being acceptable, the
ordered options are managed Redis → Sentinel → Cluster. Do not reach for
Cluster; nothing here needs it, and §3.4's Lua script would need all its keys
hash-tagged.

---

## 6. Phased plan

Each phase leaves the tree working and shippable, per the repo's atomic-commit
convention.

**Phase 0 — fix R1–R4.** No Redis. Small, independently valuable, and it makes
the phase-5 benchmark a comparison against a correct baseline.
_Files:_ `routes/stats.ts`, `sockets/signaling.ts`, `services/realtime.ts`,
`services/pairings.ts`, `routes/users.ts`.

**Phase 1 — extract a `StateStore` interface.** `server/src/services/store/`
with the ~18 operations the handlers need (`createCall`, `matchOffer`,
`getCall`, `setAnswer`, `pushIce`, `drainIce`, `endCall`, `heartbeat`,
`onlineCount`, `recordPairing`, `claimRating`, `hasLock`, `recordLock`,
`bumpStat`, `readStats`, `cacheIdentity`, `getCachedIdentity`). Implement
`MemoryStore` against it, rewire the handlers, change no behaviour. Pure
refactor. Point `rep.test.cjs` at the interface.

**Phase 2 — sockets out of the data model.** Store `socketId`; join
`call:<id>` rooms; relay via `socket.to(room)`; convert the
`pendingAnswerMaker` / `offerMaker` identity guards to id comparisons. Still
single-node, still `MemoryStore`. This is the behaviour-risk phase — do it
while only one thing is moving.

**Phase 3 — `RedisStore` + adapter.** `ioredis`, `@socket.io/redis-adapter`,
`rate-limit-redis`, the Lua scripts, TTLs, presence heartbeat, hashed identity
keys, `REDIS_URL` / `REDIS_PREFIX` in `config/env.ts`. Select with
`STATE_BACKEND=memory|redis` so production rolls back with an env var rather
than a redeploy. **Ship at one replica first** — Redis in the path, scaling
not yet on, so any regression is attributable to Redis alone.

**Phase 4 — go multi-instance.** nginx + sticky / websocket-only, `/healthz`,
graceful drain, compose `--scale`, dev-compose Redis, docs.

**Phase 5 — measure, then delete.** Run §4.6 against both backends, publish
the numbers, then remove `MemoryStore` and the flag once Redis has run clean
for a release cycle.

### Effort and risk

| Phase | Rough size   | Risk                                                       |
| ----- | ------------ | ---------------------------------------------------------- |
| 0     | small        | low — isolated bug fixes                                   |
| 1     | medium       | low — mechanical, no behaviour change                      |
| 2     | medium       | **highest** — rewrites the signalling relay and its guards |
| 3     | medium–large | medium — new dependency, new failure mode                  |
| 4     | small–medium | medium — sticky sessions are the classic trap              |
| 5     | small        | low                                                        |

### Open questions

1. **Is horizontal scale actually needed yet?** Everything in §4 says the
   single-node implementation is fast. If current peak concurrency sits
   comfortably inside one process, phases 0–2 capture most of the value
   (correctness, testability, a clean seam) and phase 3 onward can wait for
   real load. Worth deciding on measured numbers before committing.
2. Should `stats` counters be lifetime-cumulative? If so they need periodic
   mirroring to Mongo — Redis AOF is good, but it is not a system of record.
3. Should the rating lock be a rolling 24 h (current behaviour) or a calendar
   day in IST? The 409 text says "Already rated today"; the code means a
   rolling window. §3.3 assumes rolling is intended.
4. Managed Redis or self-hosted in the same compose stack? Decides §5.5 and
   whether `REDIS_URL` needs TLS support.
5. `pairings` is keyed by call but looked up by participant pair. If two users
   are matched twice within the 1 h TTL, `claimRating`'s `find` returns the
   older pairing. Is the intent one rating per _pair per hour_ or per _call_?
   The 409 text says "Already rated this call".
