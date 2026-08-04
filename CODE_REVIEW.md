# BITSmegle — Code Review

**Date:** 2026-08-03
**Scope:** Full repository — `src/` (SvelteKit frontend) and `server/` (Express + Socket.IO backend), ~2,700 LOC across 25 source files, plus build/config/deploy files.
**Method:** Every source file read end to end. Three behaviours confirmed by executing the logic in isolation (marked **Verified** below). Absence claims confirmed by grep across `src/` and `server/src/`.

50 findings, grouped by category and ordered by severity within each. Items marked `[known]` are already listed under "Known rough edges" in `AGENTS.md`; they are repeated here with their impact spelled out.

---

## Contents

| Category                                                     | Count | Highest severity |
| ------------------------------------------------------------ | ----- | ---------------- |
| [Security](#security)                                        | 14    | Critical         |
| [Correctness](#correctness)                                  | 11    | Critical         |
| [Privacy](#privacy)                                          | 2     | High             |
| [Performance & resource leaks](#performance--resource-leaks) | 5     | High             |
| [Design & architecture](#design--architecture)               | 8     | High             |
| [Build, config & ops](#build-config--ops)                    | 9     | High             |
| [Accessibility & UX](#accessibility--ux)                     | 5     | Medium           |

---

## Security

### S1 · Critical — The BITS-only restriction does not exist

The product premise is a video chat "restricted to BITS Pilani students", but nothing enforces it. `generateAuthUrl` in `src/routes/signup/+page.server.ts:12` sets no `hosted_domain` parameter, and `getIdFromEmail` in `server/src/routes/users.ts:13` simply slices whatever email arrives. There is no domain allowlist and no `email_verified` check anywhere in the codebase.

**Verified:** `attacker@gmail.com` → id `attackerg`, and the account is created by `addUserToDB`.

Any Google account can enter a video chat with students. Fix requires both `hosted_domain` on the consent URL (a UX hint, not a control) _and_ a server-side domain check on the verified email before the user document is created.

**Not being worked on:** the restriction is instead enforced in the Google OAuth client's configuration on Cloud Console, not in application code.

### S2 · Critical — Reputation is forgeable

`POST /api/users/rep` (`server/src/routes/users.ts:109-123`) takes `targetId` directly from the request body. There is no check that the caller was ever in a call with that user, and no check that `targetId` is not the caller. The value flows straight into `users.updateOne({ id: targetId }, { $inc: { reputation: delta } })`.

Anyone can boost their own reputation or tank any other user's by ID. Currently masked only because the endpoint is broken (see [B1](#b1--critical--post-apiusersrep-always-returns-500-the-entire-likedislike-feature-is-dead)) — repairing that bug without adding authorisation ships the vulnerability.

Additionally, `action` is not validated: any value other than the string `'like'` is treated as a dislike.

### S3 · Critical — OAuth refresh tokens in a JavaScript-readable cookie

`src/routes/api/oauth/+server.ts:53-59` serialises the _entire_ Google token response — `access_token` **and** `refresh_token` — into the `user` cookie with `httpOnly: false`. The same pattern appears at `server/src/routes/users.ts:88-94`.

Any XSS, any malicious browser extension, or any third-party script reads `document.cookie` and obtains a long-lived refresh token, giving persistent access to the victim's Google profile scope. Refresh tokens must never be exposed to client-side JavaScript.

**Fixed:** #2 — refresh token moved to a separate `httpOnly` cookie (`src/lib/server/session.ts`), refresh flow moved to `/api/refresh`.

### S4 · High — No token audience verification (confused deputy)

Both `getUserData` implementations (`server/src/routes/users.ts:39-54` and `src/routes/api/oauth/+server.ts:7-21`) pass an arbitrary bearer token to Google's userinfo endpoint and trust whatever comes back. Nothing verifies the token was issued to _this_ application's `client_id`.

An access token minted by any other Google OAuth app holding the userinfo scope will authenticate successfully here. The fix is to verify the `id_token` with `verifyIdToken({ audience: SECRET_CLIENT_ID })`, or to check `aud` via the tokeninfo endpoint.

### S5 · High — Access tokens passed in URL query strings

`server/src/routes/users.ts:41` and `src/routes/api/oauth/+server.ts:9` both build `...userinfo?access_token=${token}`. Query strings are recorded in proxy, CDN and server access logs and leak via `Referer`. Use an `Authorization: Bearer` header.

### S6 · High — `/stats/*` is public and leaks a social graph

`GET /stats/interactions` (`server/src/routes/stats.ts:59-66`) returns the complete `interactions` map: every BITS ID and the list of every user they have rated. None of the four stats routes has any authentication.

### S7 · High — Unauthenticated mail relay

The `/report` form action (`src/routes/report/+page.server.ts`) sends mail with no authentication check, no rate limit and no captcha. `reporterName` and `reporterEmail` are hidden form fields under full client control, so report attribution is forgeable.

Anyone can POST arbitrary content repeatedly and spam through — or get suspended — the project's Gmail account. The client-supplied values are also interpolated directly into the `subject:` header.

### S8 · High — TLS verification disabled on the SMTP connection

`src/routes/report/+page.server.ts:16-18` sets `tls: { rejectUnauthorized: false }`. The Gmail app password is transmitted over a connection that will accept any certificate, including an attacker's. There is no reason to disable verification against `smtp.gmail.com`.

### S9 · Medium — Identity is client-supplied in signalling

`talk/+page.svelte:224` emits `looking-for-somebody` with the client's own `$user` object. The server stores it verbatim as `offerMakerUser` / `answerMakerUser` (`server/src/sockets/signaling.ts:21-54`) and echoes it back to the peer via `remote-user`.

A patched client can present any name and email to its peer — in-call impersonation. That value also feeds the `targetId` computed by `Rate.svelte`.

### S10 · Medium — Signalling events perform no participant check

`make-answer`, `answerCandidate`, `call-accepted` and `who-is-remote` (`server/src/sockets/signaling.ts:69-110`) look a call up by `callId` alone and never verify the emitting socket belongs to it. In particular `call-accepted` lets any socket that learns a `callId` overwrite `call.answerMaker` and receive the offer.

### S11 · Medium — CORS is wide open on REST but restricted on WebSocket

`server/src/app.ts:7` uses bare `app.use(cors())`, allowing every origin, while Socket.IO enforces a four-entry allowlist (`server/src/index.ts:14-22`). Combined with the JS-readable cookie ([S3](#s3--critical--oauth-refresh-tokens-in-a-javascript-readable-cookie)), `/api/users` and `/api/users/rep` are invokable from any website.

### S12 · Medium — No rate limiting and no security headers

Confirmed absent by grep: no `express-rate-limit`, no `helmet`. Every `POST /api/users` triggers an outbound Google request plus a Mongo query, unauthenticated and unbounded.

### S13 · Low — Secrets written to logs

`src/routes/api/oauth/+server.ts:47` logs `console.log('credentials', user)` — the access and refresh tokens. Line 29 logs the OAuth authorization code.

### S14 · Low — No validation or size caps on socket payloads

`chat-message` accepts any type and any length (`signaling.ts:112`); `make-offer` accepts an arbitrary object that is pushed into server memory.

---

## Correctness

### B1 · Critical — `POST /api/users/rep` always returns 500; the entire like/dislike feature is dead

`server/src/routes/users.ts:110`:

```ts
const { data, targetId, action } =
	typeof req.body.data === 'string' ? JSON.parse(req.body) : req.body;
```

The client sends `data` as a JSON **string** (`src/components/Rate.svelte:36` passes the raw cookie value), so the condition is true and the code runs `JSON.parse` on `req.body`, which is an _object_.

**Verified:** `SyntaxError: "[object Object]" is not valid JSON` → caught → `500 Server error`.

The ternary is inverted; it should parse `req.body.data`, not `req.body`. The failure is invisible in the UI because `Rate.svelte:41` only writes to `console.error`.

**Fixed:** #3 — `targetId`/`action` now read off `req.body`, and `data` is parsed from `req.body.data`.

### B2 · High — Users whose name contains a double or trailing space can never log in

Both title-case helpers map over space-split tokens and dereference `w[0]` (`server/src/routes/users.ts:47-50`, `src/routes/api/oauth/+server.ts:16-19`). An empty token has no index 0.

**Verified:** `"John  Doe"` and `"Priya "` both throw `TypeError: Cannot read properties of undefined`. In `users.ts` this is caught and returned as `401 Authentication failed`, indistinguishable from a genuine auth failure.

**Fixed:** #3 — both copies filter out empty tokens before title-casing. The frontend copy (`src/routes/api/oauth/+server.ts`) was later deleted outright as dead code, since its only call site was already commented out.

### B3 · High — Token refresh is unreachable dead code, and expiry renders a blank page

`server/src/routes/users.ts:83` guards the refresh path with `if (!user.name)`. That can never be true, because `getUserData` throws at line 44 whenever `data.name` is missing. `refreshToken()` is therefore never called and no refreshed cookie is ever issued.

The downstream effect is worse than a missing refresh. An expired token produces a 401 whose body is the _plain text_ `Authentication failed`. Both callers then call `res.json()` with no `.catch` (`src/routes/talk/+page.svelte:70`, `src/components/Nav.svelte:45`), which throws, so `user.set(...)` never runs, `$user` stays `null`, and the `{#if $user}` gate at `talk/+page.svelte:308` renders nothing.

**An expired session shows a completely blank `/talk` page with no error and no redirect.**

**Fixed:** #3 fixed the blank-page symptom — both callers now check `res.ok` before `res.json()` and redirect to `/signup` on failure. The unreachable-refresh root cause ended up fixed separately by #2's redesign: refresh moved to `POST /api/refresh`, which runs same-origin and can read the httpOnly refresh cookie the backend never had access to. #3's own backend retry-with-refresh logic conflicted with that redesign and was dropped in favor of it when the branches were merged.

### B4 · Medium — Stale closure in the refresh timer

`src/components/Nav.svelte:79-80` reads the cookie once at mount and then re-posts that captured string every 10 minutes indefinitely. If the cookie is ever updated the timer keeps sending the superseded value. The interval is also never cleared on component destroy.

**Partially fixed:** #3 and #2 independently fixed the stale-closure half — `checkExpiration` now re-reads `document.cookie` on every tick instead of a value captured at mount (#2's version is what shipped, since #3's `Nav.svelte` changes were superseded by #2's refresh redesign during the merge — see B3). The `setInterval` is still never cleared on destroy.

### B5 · Medium — Chat listener registered in the component body

`src/components/MobileChat.svelte:37` binds `chat-message-recv` during component initialisation rather than in `onMount`, never calls `.off()`, and reads `$socket` at that moment — but the socket is only created in `Nav.svelte`'s own `onMount` (line 53). Initialisation order therefore decides whether chat works at all, and any remount adds a duplicate listener, producing duplicated messages.

### B6 · Medium — `peerConnection` can be dereferenced before it exists

The socket handlers registered in `talk/+page.svelte`'s `onMount` (lines 80-113) all use `peerConnection`, but it is only constructed by `initiateWebRTC()`, which runs after the user dismisses the modal (line 133 / 307). Any signalling event arriving first throws.

### B7 · Low — Latent temporal-dead-zone bug in `endWebRTC`

`src/routes/talk/+page.svelte:275-283`: `rating.subscribe(...)` invokes its callback synchronously, and that callback references `unsubscribe` before the `const` binding is initialised. It is safe today only because `$rating` is set to `true` immediately beforehand; any reordering turns it into a `ReferenceError`.

### B8 · Low — `email.split('@')[1][0]` throws on a malformed email

`src/components/Video.svelte:22`, `src/components/Nav.svelte:26`, `src/routes/leaderboard/+page.svelte:6`.

### B9 · Low — `await peerConnection.close()`

`src/routes/talk/+page.svelte:270` — `RTCPeerConnection.close()` is synchronous and returns `void`; the `await` implies a wait that does not happen.

### B10 · Low — Dead Mongo import in the leaderboard loader

`src/routes/leaderboard/+page.server.ts:1` imports `users` and never uses it — the loader fetches the backend HTTP API instead — yet the import still instantiates the SvelteKit Mongo client. The loader also uses global `fetch` rather than the event's `fetch`, and destructures an unused `params`.

### B11 · Low — Every profile-load failure is reported as 404

`src/routes/profile/[slug]/+page.server.ts:12-14` never checks `res.ok` and relies on `res.json()` throwing. A backend 500 or a full outage is presented to the user as "Profile Not found".

---

## Privacy

### P1 · High — The privacy policy contradicts the implementation

`src/routes/privacy/+page.svelte` states: _"We refrain from gathering your video and audio streams… Consequently, your conversations remain unmonitored."_

Video and audio are indeed peer-to-peer. **Text chat is not.** `server/src/sockets/signaling.ts:132` logs every message together with both participants' names to the server console:

```ts
console.log(`Message from ${sender.name} to ${target.name}:`, msg);
```

Lines 22 and 29 additionally log every user's name on every match attempt. Either remove the message logging or correct the policy.

### P2 · Medium — Unauthenticated PII exposure

`GET /api/users/leaderboard` (`users.ts:135`) and `GET /api/users/profile/:id` (`users.ts:147`) return whole Mongo documents, including `email`, to any unauthenticated caller. Because IDs follow a predictable format, the user table is enumerable.

---

## Performance & resource leaks

### R1 · High — `state.calls` grows without bound, and every lookup is a linear scan `[known, partially]`

`server/src/sockets/signaling.ts:15-17` removes only _unpaired_ calls belonging to the disconnecting socket. Every call that reached the paired state persists for the lifetime of the process.

Meanwhile `state.calls.find(...)` runs on every ICE candidate and every chat message (lines 24, 57, 70, 78, 88, 102, 119). This is simultaneously a memory leak and a matchmaking path that degrades linearly with cumulative usage.

### R2 · High — A leaked 100 ms interval per ICE candidate `[known]`

`server/src/sockets/signaling.ts:60-65` starts a `setInterval` for every offer candidate, cleared only once `call.answerMaker` is set. If the peer never answers, it spins forever. With `iceCandidatePoolSize: 10` on the client, that is roughly ten or more permanent timers per abandoned call.

### R3 · Medium — `state.interactions` never resets `[known]`

`server/src/routes/users.ts:119` returns "Already rated today", but nothing ever clears the map. The rating lock is permanent rather than daily, and the structure grows without bound.

### R4 · Medium — Leaked subscriptions and intervals in `Video.svelte`

`src/components/Video.svelte:42-63` subscribes to `storeStream` and `currentUser` inside `onMount` and never unsubscribes. Each stream emission also starts a fresh 1 s `setInterval` that clears only once `videoElement` is non-null — and when the "them" tile is swapped out for `<Rate>` (`talk/+page.svelte:313-317`), that element no longer exists, so the interval runs indefinitely.

### R5 · Low — All state is in-process `[known]`

`server/src/services/realtime.ts` holds calls, interactions, user count and stats in module-level memory, and `Call` objects store live `Socket` references. The backend cannot be restarted or horizontally scaled without dropping every active call.

---

## Design & architecture

### D1 · High — No TURN server

`src/routes/talk/+page.svelte:150-157` configures only Google's public STUN servers. Peers behind symmetric NAT or restrictive networks can never establish a connection.

This is visible in the product: `src/components/Modal.svelte` instructs every user to "Use mobile data instead of LAN" and "Use warp if on LAN". That is a connectivity defect being worked around with user instructions. A TURN relay (coturn, or a hosted provider) is the actual fix.

### D2 · High — No session layer

The client holds raw Google tokens and replays them on every request; the backend re-verifies each one with Google (`users.ts:79`, `users.ts:114`). This adds a network round-trip and a hard runtime dependency on Google availability to every single request, and makes revocation impossible.

A signed, httpOnly, server-side session would resolve [S3](#s3--critical--oauth-refresh-tokens-in-a-javascript-readable-cookie), [S4](#s4--high--no-token-audience-verification-confused-deputy), [S5](#s5--high--access-tokens-passed-in-url-query-strings) and this item together, and is the single highest-leverage change in this document.

### D3 · Medium — No `call-ended` event `[known]`

Teardown depends entirely on `oniceconnectionstatechange`, which the code's own comment notes "fires quite late even after user disconnects" (`talk/+page.svelte:197-198`).

### D4 · Medium — Control flow branches on the first letter of a display string

`$currentStatus[0] === 'C' | 'F' | 'I'` at `talk/+page.svelte:201, 205, 216, 332, 365, 367` and `Video.svelte:115`. Renaming a user-facing status string silently changes application behaviour. This should be an enum or discriminated union, with the human-readable label held separately.

### D5 · Medium — Two Mongo clients disagree on the database name

`src/db/mongo.ts:11` calls `client.db()` with no argument, inheriting the database from the connection string, while `server/src/config/mongo.ts:14` hard-codes `'bitsmegle'`. If the URI omits a default database or names a different one, the two halves of the application operate on different data.

### D6 · Medium — Shared logic duplicated rather than extracted

- `User` and `TokenResponse` defined twice (`src/lib/types.ts`, `server/src/models/User.ts`).
- `parseCookie` copy-pasted into four files: `Nav.svelte`, `Rate.svelte`, `report/+page.svelte`, `talk/+page.svelte`.
- The email→ID transform exists in five places (`Video.svelte`, `Nav.svelte`, `Rate.svelte`, `leaderboard/+page.svelte`, `server/src/routes/users.ts`) in **two different implementations** — some take the first character of the full domain, others the first character of the campus subdomain. They agree on current inputs, but only by coincidence.

### D7 · Low — Imperative DOM manipulation fights the framework

`src/components/Video.svelte:27-62` calls `classList.add/remove('hidden')` on elements whose `class` attribute is also managed by the Svelte template. State should drive the class.

### D8 · Low — The signalling layer is entirely `any`-typed

Every field of the `Call` interface (`server/src/services/realtime.ts:1-12`) and every socket handler parameter is `any`, despite `strict: true` in both tsconfigs. The wire protocol has no type contract, so a rename on one side fails silently on the other.

---

## Build, config & ops

### C1 · High — `docker-compose.yml` cannot start the backend

The compose file passes only `NODE_ENV`. `server/src/config/env.ts:4-11` throws unless `DB_URI`, `SECRET_CLIENT_ID`, `SECRET_CLIENT_SECRET` **and** `PORT` are all present. There is no `env_file:` and no other `environment:` entries.

The container throws at boot, and `restart: unless-stopped` turns that into a crash loop.

### C2 · Medium — Adapter mismatch

`svelte.config.js` uses `adapter-auto` while `@sveltejs/adapter-node` is an explicit production dependency. `adapter-auto` fails on unrecognised platforms; the intended adapter should be pinned.

### C3 · Medium — Dockerfile issues

`server/Dockerfile` runs `npm install` rather than `npm ci`, ignoring the lockfile it just copied in. It is single-stage, so devDependencies and TypeScript sources ship to production. It runs as root, sets no `NODE_ENV=production`, and defines no healthcheck.

### C4 · Medium — Unused production dependencies

`firebase`, `express`, `cors` and `dotenv` are listed in the root `dependencies` but imported nowhere in `src/` (verified by grep). `firebase` in particular is very large. The root also pins `express ^4.18.3` while the server uses `^5.1.0`, with `@types/express ^5` in the root devDependencies.

### C5 · Medium — No tests and no CI

`npm run check` and `npm run lint` exist but nothing runs them automatically. The backend's `dev` script uses `--transpile-only`, so type errors surface only when someone runs `npm run build` inside `server/`.

### C6 · Low — Socket.IO CORS origins hard-coded `[known]`

`server/src/index.ts:15-20` embeds four origins in source. A new deploy target requires a code change and redeploy; this belongs in an environment variable.

### C7 · Low — Repository hygiene `[known]`

`GeForceNOWSetup.log` (17 KB, unrelated to this project) sits at the repository root. `.gitignore` ends with `ngrok.exe` and no trailing newline.

### C8 · Low — README API section is out of date

It documents `POST /api/rep` and `GET /api/users/:id`. The actual routes are `POST /api/users/rep` and `GET /api/users/profile/:id`, and `GET /api/users/leaderboard` is undocumented. Trust the router files.

### C9 · Low — `PORT` is not validated as numeric

`server/src/config/env.ts` checks only for presence. A non-numeric value makes `+PORT` evaluate to `NaN` at `index.ts:25`, and `listen(NaN)` silently binds an arbitrary free port.

---

## Accessibility & UX

### A1 · Medium — Invalid HTML

- `<a>` nested inside `<button>` (`src/components/Rate.svelte:90-96`, the Report control). Invalid, and it breaks keyboard activation.
- `<td>` used outside any table (`src/routes/profile/[slug]/+page.svelte:10`).

### A2 · Medium — The modal is not accessible

`src/components/Modal.svelte` has no focus trap, no Escape handler, no `role="dialog"` or `aria-modal`, and a non-interactive backdrop. It is also the only path that starts the camera (`talk/+page.svelte:307` → `handleModalClose` → `start()`), so a keyboard-only user who cannot reach the close button cannot use the application at all.

### A3 · Low — `og:image` points at an expiring URL

`src/app.html:25` references a Discord CDN link carrying signed `ex=` and `hm=` parameters. Those have expired, so link previews are already broken. `static/banner.png` exists and should be used instead.

### A4 · Low — Chat input has no label and no live region

`src/components/MobileChat.svelte:95-99` — the input has only a placeholder, and incoming messages are not announced (no `aria-live` on the message container).

### A5 · Low/Medium — Failures reported to the user as success

`src/routes/report/+page.server.ts:39-47` calls `transporter.sendMail` with a callback and does **not** await it, then unconditionally returns `{ success: true }`. The user sees "Report submitted successfully" even when delivery failed. Rating failures are likewise only written to `console.error` (`Rate.svelte:41`).

---

## Recommended order of work

If nothing else is addressed, address these:

1. **[S1](#s1--critical--the-bits-only-restriction-does-not-exist)** — enforce the BITS domain server-side. The entire access-control premise of the product is currently absent.
2. **[B1](#b1--critical--post-apiusersrep-always-returns-500-the-entire-likedislike-feature-is-dead) + [S2](#s2--critical--reputation-is-forgeable)** — `/rep` is both broken _and_ unauthorised. Fix the parse and add participant verification in the same change, or repairing the bug ships the vulnerability.
3. **[S3](#s3--critical--oauth-refresh-tokens-in-a-javascript-readable-cookie) + [S4](#s4--high--no-token-audience-verification-confused-deputy) + [D2](#d2--high--no-session-layer)** — replace the readable raw-token cookie with an httpOnly server session and verify token audience.
4. **[C1](#c1--high--docker-composeyml-cannot-start-the-backend)** — the compose file cannot boot the backend at all.
5. **[R1](#r1--high--statecalls-grows-without-bound-and-every-lookup-is-a-linear-scan-known-partially) + [R2](#r2--high--a-leaked-100-ms-interval-per-ice-candidate-known)** — the two unbounded leaks that degrade any long-running server.
6. **[D1](#d1--high--no-turn-server)** — add TURN, and delete the connectivity workarounds from the modal.
