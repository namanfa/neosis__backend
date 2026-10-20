# Google sign-in setup

Google sign-in is enforced by FastAPI middleware for app pages and `/api/*` routes. The browser cannot bypass it by calling the API directly. Successful sign-in requires a valid Google ID token, a verified email, and an exact match against `ALLOWED_EMAIL_DOMAINS` or `ALLOWED_EMAILS`.

## 1. Create Google OAuth credentials

In Google Cloud Console:

1. Select or create a project and configure the OAuth consent screen for your organization.
2. Create an OAuth client ID of type **Web application**.
3. Add the deployed origin as an authorized JavaScript origin, for example `https://faneosis.duckdns.org`.
4. Add the exact authorized redirect URI `https://faneosis.duckdns.org/auth/callback`.
5. Copy the client ID and client secret into the server's private `deploy/.env` file. Never put the secret in browser code or commit it.

For a local instance on port 7860, use origin `http://localhost:7860` and redirect URI `http://localhost:7860/auth/callback`; configure the local environment to match. Google requires the registered redirect URI and `OAUTH_REDIRECT_URI` to match exactly.

## 2. Configure server variables

Set these values in `deploy/.env` on the server:

| Variable | Example / meaning |
| --- | --- |
| `APP_BASE_URL` | Public app origin, e.g. `https://faneosis.duckdns.org` (no trailing slash) |
| `OAUTH_REDIRECT_URI` | Exact callback, e.g. `https://faneosis.duckdns.org/auth/callback` |
| `GOOGLE_CLIENT_ID` | Google OAuth Web client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Web client secret |
| `SESSION_SECRET` | Random private secret, at least 32 random bytes encoded as hex |
| `ALLOWED_EMAIL_DOMAINS` | Comma-separated exact email domains approved for access |
| `ALLOWED_EMAILS` | Optional comma-separated individual email exceptions |
| `SESSION_IDLE_MINUTES` | Idle timeout; default `480` (8 hours) |
| `SESSION_MAX_DAYS` | Absolute session lifetime; default `7` |
| `COOKIE_SECURE` | `true` for HTTPS deployments; use `false` only for local HTTP |
| `AUTH_DB_PATH` | SQLite database path; Compose default `/data/auth.sqlite3` |

Generate `SESSION_SECRET` on a trusted machine or the server and paste it into `.env`; do not include it in a command transcript or Git. For example, on Ubuntu: `openssl rand -hex 32`.

The example Compose configuration currently lists `flick2know.com`, `flick2know.in`, `fieldassist.com`, and `fieldassist.in` as allowed domains. Replace this list with the domains your team has explicitly approved. Domain matching is exact and case-insensitive; `example.com` does not grant access to subdomains such as `dept.example.com`. Add contractors or other one-off accounts to `ALLOWED_EMAILS` explicitly.

The existing `AUTH_USER` and `AUTH_HASH` variables remain required by Caddy. HTTP Basic Auth still protects the app in front of Google sign-in; `/health` is excluded so service health checks can reach it.

## 3. Rebuild and check

From `deploy/` after saving the environment file:

```bash
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 app
```

Open the site in a private browser window. The expected sequence is Caddy's existing Basic Auth prompt followed by the IR Data Tool sign-in screen, then Google's account chooser. Test an allowed account and a non-allowlisted account. The latter should see an access denied message. Verify `/api/...` requests return `401` without a session and work after sign-in.

Google callback errors are logged without OAuth codes or state values. Never paste access tokens, client secrets, cookies, or the contents of `.env` into logs or support requests.

## Session and data behavior

The app stores only an opaque browser session token in a secure, HttpOnly, SameSite=Lax cookie. The server stores a keyed token hash, user email/profile, and session expiry in SQLite. OAuth state, nonce, and PKCE verifier are server-side and short-lived; the callback consumes the state once. The Google client secret and ID tokens are never sent to frontend JavaScript.

Keep `/data/auth.sqlite3` on the persistent Compose data volume and back it up with the rest of `deploy/data`. Sessions are invalidated if `SESSION_SECRET` changes. The app uses a single Uvicorn worker because upload sessions and the login rate limiter are process-local.

Existing labeler folders created before account sign-in have no owner mapping and cannot be accessed by authenticated users after this change. Existing Packshots and Testing Images library contents continue using their configured local or R2 storage backend.

## Troubleshooting

- **`redirect_uri_mismatch`:** Ensure Google Console and `OAUTH_REDIRECT_URI` match byte-for-byte, including scheme and path.
- **Google login reports configuration missing:** Check the four required variables `APP_BASE_URL`, `OAUTH_REDIRECT_URI`, `GOOGLE_CLIENT_ID`, and `GOOGLE_CLIENT_SECRET`, plus `SESSION_SECRET`; rebuild/restart after changes.
- **Allowed colleague is denied:** Check the email domain spelling and `ALLOWED_EMAIL_DOMAINS`, or add the exact address to `ALLOWED_EMAILS`.
- **Cookie loops back to login:** Use HTTPS with `COOKIE_SECURE=true`; confirm Caddy proxies the same public host configured in `APP_BASE_URL`.
- **Caddy Basic Auth is still shown:** That gate is intentionally kept. It is separate from Google authentication.
