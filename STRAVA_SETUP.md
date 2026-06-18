# Strava API app registration

You need a registered Strava app to get a client ID/secret. Do this once.

## 1. Create the app

Go to https://www.strava.com/settings/api (logged in as the account that will
own the pilot — decide this with Emma; it's open question #5 in the scope doc).

Fill in:

| Field | Value |
|---|---|
| Application Name | Marin Trails (or your pilot name) |
| Category | Training / Other |
| Website | your Vercel URL or a simple landing page |
| Authorization Callback Domain | `localhost` for dev. For prod, your Vercel domain, e.g. `marin-trails.vercel.app` — **domain only, no scheme or path** |

You can only set ONE callback domain. For local dev use `localhost`; switch it
to your Vercel domain when you deploy (or register a second app for prod).

## 2. Copy credentials into `.env`

After creating, you'll see **Client ID** and **Client Secret**.

```
STRAVA_CLIENT_ID=12345
STRAVA_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
STRAVA_SCOPES=activity:read_all,profile:read_all
APP_BASE_URL=http://localhost:3000
OAUTH_STATE_SECRET=<paste output of: openssl rand -hex 32>
```

## 3. Scopes — and how to justify them

The scope doc asks for `activity:read_all` and `profile:read_all`.

- `activity:read_all` — needed to read the user's runs (incl. private ones) to
  fit the per-user pace-on-grade model and the "you've run this before" signal.
- `profile:read_all` — name/location for personalization and display.

Request **only these two**. Do not request `activity:write` unless/until you
build "share to Strava as a planned route" — and even then, scope it carefully.
Over-asking is the most common reason Strava flags an app before public launch.

## 4. Brand compliance (before real users)

Strava requires "Connect with Strava" / "Powered by Strava" branding and has
strict rules on logos and the orange (#FC4C02). The scaffold's connect button
uses the official mark and color. Review the brand guidelines and add a
"Powered by Strava" mark before the pilot:
https://developers.strava.com/guidelines/

## 5. Rate limits

Default: **200 requests / 15 min** and **2,000 / day** across the whole app.
For ~20–50 users this is fine *if* you don't poll. Plan:
- Pull 90 days **once** on connect (a few paginated requests per user).
- Use **webhooks** for new activities instead of polling (next milestone).
- Treat `429` as back-off-and-retry (helper already throws `RateLimitError`).
