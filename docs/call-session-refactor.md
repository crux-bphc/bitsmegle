# Client call-session refactor (PR 2 of the call-state overhaul)

Implementation spec for rewriting the frontend's call lifecycle around an explicit
state machine. Self-contained: everything needed to implement is in this document
plus the referenced files.

## Background

A production incident (2026-08-07): user A connected with B; B saw A's video but got
no audio; A got nothing from B; A's UI reverted to Idle while B kept receiving A's
live video. The server half was fixed in PR #22 (`fix(signaling): notify the peer on
every call-release path`), which is a **prerequisite** for this work: the server now
guarantees a `call-ended` event with a `{ callId, reason }` payload
(`reason: 'ended' | 'peer-disconnected' | 'replaced'`) on every path that releases a
call. This PR fixes the client half.

### Client-side root causes (all in current `main`)

1. **The "state machine" is the first letter of a display string.**
   `currentStatus` (`src/lib/stores/statusStore.ts`) is a free-text string, and
   lifecycle decisions check `$currentStatus[0]`: `'C'` = connected, `'F'` = finding,
   `'I'` = idle (`src/routes/talk/+page.svelte:148,226,230,241,395,397`,
   `src/components/Video.svelte:124`). Collisions: the media-error strings
   `'Camera/mic already in use by another app'` and `'Could not access camera/mic'`
   start with `'C'`, so after a media error the app behaves as if connected;
   `'Found someone'` and `'Finding someone...'` collide on `'F'`; `'Stopped, please
refresh to start again'` starts with `'S'`, matching no branch, so the buttons
   mislabel. Two spellings (`'Finding someone...'` / `'Finding somebody...'`) exist
   for the same state.
2. **Three unserialized teardown triggers race over shared mutable state.**
   `peerConnection` and `currentCallId` are plain component variables in
   `talk/+page.svelte`. The ICE `iceconnectionstatechange === 'disconnected'` handler
   (line 221), the Skip button (`handleConnect`, line 240), and the `call-ended`
   listener (line 147, which auto-requeues since commit `94c383f`) each run
   `endWebRTC()` + `initiateWebRTC()` with no re-entrancy guard. Nothing checks that
   an inbound `answer-made` / `add-ice-candidate` / `call-data` event belongs to the
   current call, so stale events for an old call are applied to the new
   `RTCPeerConnection`.
3. **Rating is entangled with teardown.** `endWebRTC(rate = true)` (line 294) shows
   the Rate panel and awaits a store-based promise before finishing teardown — it can
   block for minutes while socket events keep firing. `Rate.svelte`'s Report button
   is a plain `<a href="/report...">` that navigates away and never resolves that
   promise. `remoteUser`/`remoteStream` are only cleared after rating completes.
4. **Listener hygiene.** `MobileChat.svelte:37` attaches `chat-message-recv` at
   component-init via `$socket?.on` (silently skipped if the socket store is still
   null, never detached); no `.off()` exists anywhere in `src/`; chat messages are
   never cleared between calls. `Video.svelte:49` polls with a 1 s `setInterval` to
   attach `srcObject`.

### Decisions already made (do not relitigate)

- **Rating UX**: requeue in the background; the rating panel is a pure overlay that
  auto-dismisses when the next call connects. It must never block or gate lifecycle.
- **ICE handling**: the server's `call-ended` is the primary end signal. ICE state is
  a fallback detector: tear down immediately only on `'failed'`; on `'disconnected'`
  start a ~4 s debounce timer that cancels if the connection returns to
  `'connected'`.
- **Wire protocol**: unchanged except consuming the `call-ended { callId, reason }`
  payload that PR #22 added. All event names and other payloads stay as they are.

## Design

### New module: `src/lib/call/session.ts`

The single owner of the call lifecycle. Nothing else may create an
`RTCPeerConnection`, hold a callId, or emit lifecycle socket events.

```ts
export type CallState =
	| 'idle' //         media acquired, not searching, no call
	| 'media_error' //  getUserMedia failed; mediaErrorMessage holds the reason
	| 'searching' //    looking-for-somebody emitted; waiting for a match
	| 'connecting' //   matched; SDP/ICE exchange in progress
	| 'connected' //    RTCPeerConnection.connectionState === 'connected'
	| 'stopped'; //     user pressed End; local tracks stopped
```

Export a factory plus an app-level singleton:

```ts
export interface SessionDeps {
	emit: (event: string, payload?: unknown) => void;
	on: (event: string, handler: (payload: any) => void) => void;
	off: (event: string, handler: (payload: any) => void) => void;
	createPeerConnection: () => RTCPeerConnection;
}
export function createCallSession(deps: SessionDeps) { ... }
```

The factory takes injected socket functions and a peer-connection factory so unit
tests can drive it with fakes — no DOM, no real WebRTC. The singleton wires it to the
real socket store and a `new RTCPeerConnection(<Google STUN config from the current
initiateWebRTC>)` factory.

Exposed stores (Svelte `writable`/`derived`, read-only to consumers):

- `callState: Readable<CallState>`
- `statusText: Readable<string>` — derived from `callState` (+ media error message).
  Display only; **no code may ever branch on its contents**. Suggested mapping:
  idle → `'Idle'`, searching → `'Finding someone...'`, connecting →
  `'Found someone, connecting...'`, connected → `'Connected'`, stopped →
  `'Stopped, press Start to go again'`, media_error → the stored message.
- `ratingCandidate: Readable<User | null>` — snapshot of the peer to rate.
- `currentCallId: Readable<string | null>` — for MobileChat's per-call reset.

Exposed methods: `attach(socket)`, `detach()`, `startMedia()`, `search()`, `skip()`,
`stop()`, `dismissRating()`.

### Transition table

Events not listed for a state are **ignored** (this rule alone kills the
media-error-looks-connected class of bug).

| From                 | Event                                                 | To                      | Side effects                                                                                                                                               |
| -------------------- | ----------------------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| any                  | `MEDIA_OK` (startMedia resolves)                      | `idle`                  | set localStream                                                                                                                                            |
| any                  | `MEDIA_FAIL(reason)`                                  | `media_error`           | set mediaErrorMessage (map `NotAllowedError`, `NotFoundError`/`DevicesNotFoundError`, `NotReadableError`/`TrackStartError` to the same strings used today) |
| idle                 | `SEARCH`                                              | `searching`             | new generation; fresh pc; emit `looking-for-somebody`                                                                                                      |
| searching            | `call-found(callId)`                                  | `connecting`            | store callId; emit `call-accepted { callId }`; wire answerCandidate trickle                                                                                |
| searching            | `call-not-found`                                      | `searching`             | generate callId (`crypto.randomUUID()`); createOffer; emit `make-offer`; wire offerCandidate trickle                                                       |
| connecting           | `call-data` (matching callId)                         | `connecting`            | setRemoteDescription; createAnswer; emit `make-answer`                                                                                                     |
| connecting           | `answer-made` (matching callId)                       | `connecting`            | setRemoteDescription                                                                                                                                       |
| connecting/connected | `add-ice-candidate` (matching callId)                 | —                       | addIceCandidate                                                                                                                                            |
| connecting           | pc `connectionState === 'connected'`                  | `connected`             | emit `who-is-remote { callId }`; auto-dismiss rating panel                                                                                                 |
| connecting/connected | `call-ended` (matching callId), or ICE fallback fired | `searching`             | snapshot ratingCandidate (only if was `connected`); teardown; new generation; requeue (emit `looking-for-somebody`)                                        |
| connecting/connected | `SKIP`                                                | `searching`             | emit `end-call { callId }`; snapshot rating; teardown; requeue                                                                                             |
| any except stopped   | `STOP`                                                | `stopped`               | emit `end-call` if in a call; teardown; stop local tracks                                                                                                  |
| stopped, media_error | `START`                                               | via MEDIA_OK/MEDIA_FAIL | getUserMedia again                                                                                                                                         |

`remote-user` → set `remoteUser` store (any callful state, matching call only).

### Concurrency rules (the heart of the fix)

- **Generation counter.** `let generation = 0`, bumped on every teardown+setup.
  Every async continuation captures `const gen = generation` at entry and returns
  early after each `await` if `gen !== generation`. Teardown nulls the old pc's
  event handlers before `close()` so its callbacks can never fire into the new
  world.
- **CallId filtering.** Every inbound call-scoped socket event is dropped unless its
  `callId` equals the session's current callId (`call-found` instead requires state
  `searching`). `call-ended` for a foreign callId is ignored — this consumes the
  PR #22 payload.
- **Serialized transitions.** A single promise queue:
  `let chain = Promise.resolve(); const enqueue = (fn) => (chain = chain.then(fn, fn));`
  `search()`, `skip()`, `stop()`, and the call-ended/ICE-fallback handler all run
  through `enqueue`. A second teardown queued behind a first observes the bumped
  generation (or an already-idle state) and no-ops. **Nothing inside the queue ever
  awaits user input.**
- **ICE fallback.** In the pc's state handlers: on `'failed'` → enqueue teardown+
  requeue immediately; on `'disconnected'` → `setTimeout(4000)` storing the handle;
  cancel it on return to `'connected'`; if it fires, enqueue teardown+requeue. Clear
  the timer on any teardown. The server `call-ended` path also clears it.

### Rating decoupling

On teardown of a call that had reached `connected`, synchronously snapshot the
current `remoteUser` into `ratingCandidate`, then clear `remoteUser`/`remoteStream`
and proceed. The panel is rendered from `ratingCandidate`; `dismissRating()` nulls
it; a new call reaching `connected` also nulls it (auto-dismiss — the panel shares
the layout slot with the remote video). There is no promise and nothing to wedge.

## Per-file changes

- **Create `src/lib/call/session.ts`** — everything above (~250–300 lines).
- **Rewrite `src/routes/talk/+page.svelte`** — keep the cookie/user-fetch/goto
  logic, the layout markup, and the chat drawer ping logic. Delete `initiateWebRTC`,
  `handleCall`, `handleAnswer`, `endWebRTC`, `handleConnect`, `closeEverything`, the
  six socket listeners, and the `running`/`mediaError`/`rating`/`peerConnection`/
  `currentCallId` locals. Buttons key off `$callState`:
  Connect/Skip label = `$callState === 'idle' ? 'Connect' : 'Skip'`; disable while
  `searching`; End vs Start/Try Again from `stopped`/`media_error`; render
  `{#if $ratingCandidate}<Rate user={$ratingCandidate} ... />{:else}<Video who="them" />{/if}`.
- **Delete `src/lib/stores/statusStore.ts`** — its two importers (`talk/+page.svelte`,
  `Video.svelte`) switch to the session's stores.
- **Modify `src/components/Rate.svelte`** — take `export let user: User` (the
  snapshot) instead of reading `$remoteUser`; on interaction call the session's
  `dismissRating()` via the existing `interaction` dispatch; give the Report link
  `target="_blank" rel="noopener"` **and** make it dismiss the panel.
- **Modify `src/components/Video.svelte`** — loader:
  `paused={$callState !== 'searching' && $callState !== 'connecting'}`; replace the
  1 s `setInterval` srcObject polling with `bind:this` + a reactive statement
  (`$: if (videoElement) videoElement.srcObject = $stream;`); drop the manual
  subscriptions where `$`-syntax suffices.
- **Modify `src/components/MobileChat.svelte`** — subscribe to the `socket` store in
  `onMount`; on each socket instance `.off` the handler from the previous one and
  `.on` the new one; `.off` in `onDestroy`; clear `messages` whenever the session's
  `currentCallId` store changes.

## Tests

Add vitest at the repo root (`npm i -D vitest`; root `package.json` script
`"test": "vitest run"`; `test: { environment: 'node' }` in `vite.config.ts` — the
session module is DOM-free by construction).

`src/lib/call/session.test.ts`, driving `createCallSession` with a fake
emitter/socket and a fake pc factory that records instances and method calls:

1. Transition-table conformance for every listed transition.
2. **Regression:** in `media_error`, `call-ended`/ICE events are ignored (the old
   `'C'`-collision bug).
3. **Regression:** `call-ended` with a foreign callId is ignored; with the current
   callId it tears down and requeues exactly once.
4. **Regression:** `add-ice-candidate`/`answer-made` for a stale callId never touch
   the new pc.
5. **Regression:** concurrent `skip()` + `call-ended` + ICE-failure produce exactly
   one new pc and one `looking-for-somebody` emit.
6. Rating: teardown from `connected` sets `ratingCandidate` and clears
   `remoteUser`/`remoteStream` synchronously; teardown from `connecting` does not
   set it; next `connected` auto-dismisses.
7. ICE fallback: `disconnected` → recovery within 4 s → no teardown;
   `disconnected` → timer fires → one teardown+requeue; `failed` → immediate.

## Manual two-browser verification

1. Two browsers (one incognito), different Google accounts, both on `/talk`, grant
   media. Connect on both → video+audio both ways, status `Connected`, nameplates,
   chat both ways with drawer ping.
2. **Incident repro:** A presses Skip. B must immediately (not after an ICE timeout)
   lose A's video, see the rating panel for A, and auto-requeue; A must no longer
   receive B's media. Both re-pair successfully.
3. Close B's tab mid-call → A gets the rating panel and requeues within ~1 s.
4. Media error: revoke camera permission, Start → specific error text, no Skip
   labeling anywhere, Try Again recovers.
5. Rating panel: Report opens `/report` in a new tab and the panel dismisses; left
   alone, the panel survives searching and auto-dismisses when the next call
   connects.
6. After a skip, open the chat drawer → previous call's messages are gone.
7. Rapid-fire Skip 10× → no console errors (`setRemoteDescription` state errors,
   etc.), no duplicated `looking-for-somebody` per skip in the server log.

## Conventions

Svelte 4 syntax (`$:` reactive statements, stores — no runes). Tabs, single quotes,
no trailing commas, 100-char width (Prettier-enforced). Conventional Commits, no
co-author or tool-attribution trailers. Before committing run `npm run lint` and
`npm run check` at the root; suggested commits: `feat(talk): add call session state
machine`, `refactor(talk): drive the talk page from the call session`, plus the
component/test commits.
