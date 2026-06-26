# Layer 1 completion — "make auth real" (handoff for Claude Code)

Scope for the next chunk of work. Sign-in already works; this turns it into a
real identity layer: persistent per-user Strava tokens, invite-only gating, and
the plumbing a login wall will later sit on. **It intentionally stops short of
forcing login on initial navigation** — see Non-goals.

---

## 0. Current state (read before starting)

Just merged (branch `upgrade-next-16`):

- App is on **Next.js 16.2.9 / React 19.2.7** (Turbopack). `next build` is green.
- **Neon Auth passwordless email-OTP sign-in works end to end.** Verified in dev:
  `POST /api/auth/email-otp/send-verification-otp 200` → `POST /api/auth/sign-in/email-otp 200`
  → session established → redirect home.

Already wired (don't rebuild):

- `src/lib/auth/server.ts` — `createNeonAuth({ baseUrl, cookies:{ secret } })` → `auth`.
- `src/lib/auth/client.ts` — `createAuthClient()` → `authClient` (client components).
- `src/app/api/auth/[...path]/route.ts` — `export const { GET, POST } = auth.handler();`
- `src/app/(auth)/` — Tailwind-scoped route group: `layout.tsx` (NeonAuthUIProvider,
  emailOTP), `auth/[path]/page.tsx` (AuthView), `auth-tailwind.css`. Tailwind v4 is
  scoped to this route group only; **do not** add global Tailwind.
- `src/app/layout.tsx` — root layout has `suppressHydrationWarning` on `<html>`
  (Neon Auth UI sets `color-scheme` pre-hydration). Leave it.

Database (Layer 0, `src/lib/db/schema.ts`, Drizzle over Neon Postgres):

- Tables in `public`: `invite_codes`, `strava_tokens`, `prompts`, `recommendations`,
  `feedback`. All `user_id` columns are **`text`** (hold a Neon Auth user id).
- `drizzle.config.ts` uses `schemaFilter: ["public"]` — drizzle-kit never touches the
  managed `neon_auth` schema. Keep it that way; never put an FK onto `neon_auth.*`.
- Drizzle client: `src/lib/db/client.ts`.

Strava tokens **currently live in a signed cookie** (`src/lib/session.ts`) — the
scaffold this chunk replaces.

### Hard constraint that shapes the design

Neon Auth is a **managed** Better Auth service (currently Better Auth **1.4.18**).
`createNeonAuth()` accepts only `{ baseUrl, cookies }` — **no `hooks` / `databaseHooks`
/ plugins.** User creation happens inside Neon's service, not our code. Neon's own
docs say to self-host Better Auth only if you need "custom plugins, hooks, and options
not yet supported by Neon Auth."

**Consequence:** we **cannot** reject sign-ups with a Better Auth `before` hook. Anyone
can authenticate. **Invite gating must be enforced in the app, after sign-in** (WI-4).

### Neon Auth server API (verified, use these)

- `const { data: session } = await auth.getSession();` → `session?.user` has `id`,
  `email`, `name`. Any Server Component that calls it must
  `export const dynamic = 'force-dynamic'`. Cached in a signed cookie (TTL 300s);
  concurrent calls are deduped — calling it per request is fine.
- `auth.signOut()` (server action) or `authClient.signOut()` (client).
- `auth.middleware({ loginUrl: '/auth/sign-in' })` for route protection (WI-6).
  ⚠️ Neon docs show this in `middleware.ts`; on **Next 16 the file is `proxy.ts`**.

---

## 1. Goal & non-goals

**Goal:** a signed-in user has a durable identity that (a) is gated to invited
runners, and (b) owns their Strava tokens in Postgres so personalization is tied to
the account instead of a browser cookie.

**Non-goals (deferred on purpose — do not implement):**

- **No login wall on `/`.** The landing page (prompt → recommendation) stays usable
  logged-out. Founders' decision: a wall has no teeth until invites + per-user
  personalization exist, and it blocks demoing the engine. WI-6 *prepares* the wall
  but leaves it disarmed.
- No pace-on-grade model, no Strava webhook, no feedback persistence — later layers.

---

## 2. Work items

Each item lists **files**, **approach**, **acceptance**, and **risks**. Verify the
exact Neon Auth API against the installed `@neondatabase/auth` types before coding.

### WI-5 — Reconcile `user_id` type (do this first; it's a 10-minute decision)

There's a live contradiction: schema task #47 set `user_id` to **`text`**, while open
task #50 says switch it to **`uuid`**. Resolve it before building on top.

- **Verify the real type:**
  ```sql
  SELECT pg_typeof(id) FROM neon_auth.users_sync LIMIT 1;
  -- or: SELECT data_type FROM information_schema.columns
  --     WHERE table_schema='neon_auth' AND table_name='users_sync' AND column_name='id';
  ```
- **Expectation / recommendation:** Better Auth generates ids as **random strings by
  default** (not UUIDs), and Neon exposes `auth.user_id()` as **text**. So **keep
  `text`.** It works whether or not the id happens to be UUID-shaped, and matches the
  helper. **Close #50 as "won't do — text is correct,"** and update the comment in
  `schema.ts` to record the decision.
- Only migrate to `uuid` if the live type is genuinely `uuid` *and* you want native
  uuid indexing — not required for the pilot.
- **Acceptance:** decision documented in `schema.ts`; columns unchanged (or a single
  migration if you deliberately choose uuid); `npm run db:generate` shows no drift.

### WI-1 — Server session helpers

- **File:** `src/lib/auth/session.ts` (new — distinct from the Strava
  `src/lib/session.ts`, which WI-3 trims).
- **Approach:** thin wrappers over `auth.getSession()`:
  - `getCurrentUser()` → `{ id, email } | null`.
  - `requireUser()` → returns the user or `redirect('/auth/sign-in')` (for pages) /
    a 401 helper for API routes.
- **Acceptance:** a Server Component / route handler can read the current user id in
  one call; unauthenticated API routes return 401, unauthenticated pages redirect.
- **Risks:** remember `dynamic = 'force-dynamic'` wherever the session is read in a
  Server Component.

### WI-2 — Session-aware landing page + sign-in / sign-out affordance

- **Files:** `src/app/page.tsx` (+ a small client component, e.g.
  `src/components/AccountMenu.tsx`).
- **Approach:** logged-out → a "Sign in" link to `/auth/sign-in`. Logged-in → show the
  email and a "Sign out" control (`authClient.signOut()` then refresh to `/`). Read the
  session server-side (WI-1) where possible; use `authClient` only for the client-side
  sign-out action. **Keep the prompt → recommendation flow fully usable logged-out.**
- **Acceptance:** landing reflects auth state on load; sign-out returns to a
  logged-out `/`; no hydration warnings.
- **Risks:** `page.tsx` is interactive — don't convert the whole page to read session
  in a way that forces it dynamic if that hurts the public path; isolate the session
  read to the header.

### WI-3 — Per-user Strava token store (replace the cookie scaffold)

- **Files:** new `src/lib/strava-store.ts`; edit `src/lib/session.ts` (trim to
  CSRF-only); edit the 5 Strava call sites.
- **Approach:**
  - New store over the `strava_tokens` table (keyed by `userId`):
    `saveStravaTokens(userId, tokens)`, `loadStravaTokens(userId)`,
    `clearStravaTokens(userId)` using `src/lib/db/client.ts`.
  - **Time conversion:** `StravaTokens.expires_at` is unix **seconds**; the column is
    a `timestamptz`. Write `new Date(expires_at * 1000)`; read back
    `Math.floor(row.expiresAt.getTime() / 1000)`. Persist `athleteId = tokens.athlete?.id`
    and `scope`.
  - **Require sign-in to connect Strava:** in `api/strava/authorize`, if there's no
    session, redirect to `/auth/sign-in`. In `api/strava/callback`, resolve the user id
    from the session and `saveStravaTokens(userId, …)`. Update `api/strava/me`,
    `api/strava/disconnect`, and `getUserAvgPace()` in `api/recommend` to load/clear by
    user id. (Recommend stays usable logged-out — it just has no pace personalization
    without a signed-in, Strava-connected user.)
  - **Keep the CSRF state cookie** (`setOAuthState` / `consumeOAuthState`) — it's
    pre-identity and fine as a short-lived signed cookie. Only the *token* functions
    move to the DB. After this, `src/lib/session.ts` holds CSRF state only (consider
    renaming to `src/lib/oauth-state.ts`).
- **Decision to surface:** `strava_tokens` stores `athlete_id` but no athlete *name*;
  `/me` currently shows the name from the token payload. Either re-fetch the athlete in
  `/me`, or add a `name`/`athlete` column. Pick one and note it.
- **Acceptance:** connecting Strava while signed in writes a row keyed by user id;
  refresh updates it; disconnect deletes it; `recommend` personalization reads it; **no
  Strava token is stored in a cookie anymore**. `npm run build` green.
- **Risks:** token-expiry conversion; serverless DB writes (neon-http) from the
  callback; make sure the 90-day pull still works after the source swap.

### WI-4 — Invite-code gating (app-level, post-sign-in)

Enforced in the app, not in Neon Auth (see §0 constraint).

- **Files:** a server action / API for redemption (e.g.
  `src/app/onboarding/invite/` + an action), a check helper in `src/lib/auth/`, and a
  seed script `scripts/seed-invites.ts` (+ npm script).
- **Approach:**
  - Anyone can authenticate. After sign-in, check whether the user has redeemed a code:
    `SELECT 1 FROM invite_codes WHERE used_by_user_id = $userId`.
  - If none → user is **unprovisioned**: send them to an "Enter your invite code"
    screen. Don't let unprovisioned users reach authenticated actions (Strava connect,
    any persisted writes).
  - **Race-safe redemption** (single-use): conditional update, check row count:
    ```sql
    UPDATE invite_codes
       SET used_by_user_id = $userId, used_at = now()
     WHERE code = $code AND used_by_user_id IS NULL
    RETURNING code;
    ```
    0 rows → invalid or already used.
  - Expose `isInvited(userId): Promise<boolean>` — the same gate WI-6 will use.
  - **Seed:** insert ~30 codes (readable slugs or `crypto.randomUUID()`); print them.
- **Acceptance:** a signed-in user with no redeemed code is prompted; a valid unused
  code provisions them and stamps `used_by_user_id` + `used_at`; a used/invalid code is
  rejected; codes are strictly single-use under concurrent attempts.
- **Risks:** the redemption race (the conditional UPDATE handles it — don't do
  read-then-write); decide where the gate is enforced (server action vs middleware —
  keep DB checks out of edge middleware).

### WI-6 — Route-protection middleware (build, leave disarmed)

- **File:** `src/proxy.ts` (Next 16's renamed middleware — **not** `middleware.ts`).
- **Approach:** wire `auth.middleware({ loginUrl: '/auth/sign-in' })`, but per the
  Non-goals **do not protect `/`.** Scope `config.matcher` to authenticated-only paths
  (e.g. `/onboarding`, a future `/account`), excluding `/`, `/auth/*`, `/api/auth/*`,
  and static assets. Add a clearly-commented one-line switch (add `/` to the matcher)
  to arm the full wall at launch, once WI-4 is live.
- **Acceptance:** with the wall off, `/` is public and the engine works logged-out;
  protected paths redirect to `/auth/sign-in` when logged out; flipping the matcher
  gates the whole app.
- **Risks:** keep middleware to the cookie/session check `auth.middleware()` does — no
  DB calls at the edge. Confirm `auth.middleware()` is exported the same way under the
  `proxy.ts` filename on Next 16.

### WI-7 — Cleanup: duplicate React key `dog-friendly` (task #52)

- A route lists `dog-friendly` twice in a tag array the route panel maps over →
  React duplicate-key warning in the console. Dedupe the tag in the offending
  `route-library/routes/*.geojson` (run `npm run ingest` to re-validate) **or** key by
  index in the panel component. Quick, independent of the rest.

---

## 3. Sequencing

1. **WI-5** (settle `user_id` type) — unblocks everything else cleanly.
2. **WI-1** (session helpers) — foundation for WI-2/3/4.
3. **WI-3** (Strava token store) and **WI-4** (invite gating) — both depend on WI-1;
   can be done in either order.
4. **WI-2** (surface auth state in the UI) — once helpers + flows exist.
5. **WI-6** (disarmed wall) — last, after WI-4 so it's ready to arm.
6. **WI-7** — anytime.

---

## 4. Verification (acceptance for the whole chunk)

- `npm run build` is green.
- `npm run eval` is **unchanged** (intent 8/8, ranking 10/10) — auth must not touch the
  engine.
- **Manual end-to-end:** sign in via OTP → prompted for an invite code → redeem → land
  on `/` signed in → connect Strava → confirm a `strava_tokens` row keyed by user id →
  run a prompt and confirm pace personalization → sign out → state resets. Separately,
  confirm a **logged-out** visit to `/` still returns a recommendation.
- Recommended: a focused review pass over the **redemption race** (WI-4) and the
  **token-expiry conversion** (WI-3) — the two easiest things to get subtly wrong.

---

## 5. Open decisions for the founders

- **Invite distribution:** N pre-seeded single-use codes (current design) vs. one shared
  code vs. an email allowlist (would add a per-email check at redemption — still
  app-level). Capturing the user's email on redemption gives you the invite list for free.
- **Logged-out experience:** can anonymous visitors run prompts (current plan: yes), or
  is sign-in required even to prompt? This decides WI-6's matcher at launch.
- **Anonymous logging:** keep writing `prompts`/`recommendations` with `user_id = null`
  for logged-out usage, or only after sign-in?
- **Strava athlete name:** re-fetch in `/me` vs. add a column (WI-3).

---

## 6. Must verify against the live SDK/DB before coding

- Exact `auth.getSession()` / `auth.middleware()` / `auth.signOut()` shapes for the
  installed `@neondatabase/auth` version (pin: Neon Auth runs Better Auth 1.4.18).
  Reference: Neon Auth Next.js Server SDK (see Sources).
- `createNeonAuth()` exposes **no** hooks param → confirms app-level invite gating.
- `neon_auth.users_sync.id` actual Postgres type (WI-5 query).
- That `auth.middleware()` works under the `proxy.ts` filename on Next 16.

---

## Sources (verified accessible + on-topic, June 2026)

- Neon Auth overview — managed service, Better Auth 1.4.18, "self-host if you need
  hooks/plugins": https://neon.com/docs/auth/overview
- Neon Auth Next.js Server SDK reference — `getSession` / `middleware` / `signOut`:
  https://neon.com/docs/auth/reference/nextjs-server
- Better Auth Hooks — the `before`-hook signup-rejection pattern we *can't* use under
  managed Neon Auth (context for why gating is app-level):
  https://www.better-auth.com/docs/concepts/hooks
