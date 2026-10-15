# Admin authentication (v1)

The public GitHub Pages site stays a static dashboard. Admin review is **local-only** in v1.

## How to use it

1. From the repo: `npm start`
2. Open `http://127.0.0.1:5173/`
3. Click **Admin Login**
4. Confirm **Continue** (development mock)
5. Click **Menu** to open the development workplace (**Tesla** / **Rivian**, **Development Report**, **Image Review**, **History**, **Dev Time**, **Token Usage**). Those controls stay in the workplace, not on the public chart.
6. The close button (same × control as expanded feature cards) returns to the public chart
7. **Sign out** when finished

GitHub Pages has no admin server. **Admin Login** there reports **Provider not configured**.

## Security boundary

- Allowlist is server-side only (`ADMIN_ALLOWLIST`, default `lei@localhost`).
- The browser never decides who is admin by comparing an email.
- Session cookie is `HttpOnly` + `SameSite=Lax`.
- `data/admin/` overlays are not served as public static files and are gitignored.
- Production OIDC/SSO is **not** wired in v1.

## Environment

| Variable | Purpose |
|---|---|
| `ADMIN_DEV_MOCK=1` | Enable the labeled local mock adapter (`npm start` sets this) |
| `ADMIN_ALLOWLIST` | Comma-separated emails allowed to receive an admin session |
| `ADMIN_SESSION_SECRET` | HMAC secret for the session cookie (dev default only when mock is on) |
| `OIDC_ISSUER` | Optional future SSO issuer |
| `OIDC_CLIENT_ID` | Optional future public client id |
| `OIDC_CLIENT_SECRET` | Server-only. Never put this in `app.js` or the Pages bundle |
| `GLEAN_API_TOKEN` or `ADMIN_GLEAN_TOKEN` | Optional Glean Chat API bearer token. If unset, the Glean button still returns **local review recommendations** |
| `GLEAN_INSTANCE` or `ADMIN_GLEAN_BASE_URL` | Optional Glean instance (`{instance}-be.glean.com`) or full API base URL |
| `ADMIN_GLEAN_ENDPOINT` | Optional override URL instead of Glean Chat |
| `ADMIN_IMAGE_AGENT_ENDPOINT` | Optional image-search agent URL (unset → Image Review search stays unconfigured) |

## Persistence

Decisions and recommendations write to:

- `data/admin/image-candidates.json`
- `data/admin/image-decisions.json`
- `data/admin/recommendations.json`
- `data/admin/dev-history.json` and `data/admin/snapshots/` (development history; see [dev-history.md](./dev-history.md))

Dev Time and Token Usage are computed on demand from local Cursor transcripts and git; they are not stored under `data/admin/`. See [dev-usage.md](./dev-usage.md).

Approved images are applied through the existing `feature-edits.json` overlay only. `data/releases.json` and `data/rivian-releases.json` are not rewritten by image review.
