# IR Data Tool

IR Data Tool is an internal browser-based toolkit for image labeling and library management. The current UI is served by a Python FastAPI application. The UI uses React 18 and Babel in the browser; there is no frontend build pipeline. Existing features include Pseudo Labelling, Image Extraction, Testing Images, and Packshots.

## Architecture

- **Backend:** Python 3.11, FastAPI, Uvicorn. Route implementations live in `backend/`.
- **Frontend:** `index.html`, `SKULabeler.jsx`, and `ToolkitPages.jsx`, served from the same origin as the API.
- **Deployment:** Docker Compose on Ubuntu EC2; Caddy terminates HTTPS and proxies to FastAPI. See [`deploy/README.md`](deploy/README.md).
- **Persistent image library:** local files by default, with optional Cloudflare R2 via the existing `STORAGE_BACKEND` configuration.
- **Temporary work:** labeling sessions and extraction jobs use local session storage on the server.
- **Sign-in:** Google OAuth 2.0 / OpenID Connect with server-side sessions and an email allowlist. Setup is in [`docs/AUTH_SETUP.md`](docs/AUTH_SETUP.md).

## Local development

Create a Python environment and install `backend/requirements.txt`, then configure the environment variables described in `deploy/.env.example`. Run the app from `backend/` with `uvicorn main:app --reload --host 127.0.0.1 --port 7860`. Google sign-in requires valid Google OAuth credentials and a redirect URI matching the local app URL. For local-only UI or backend work, don’t weaken the deployed access policy.

## Storage and access notes

The auth database is SQLite at `AUTH_DB_PATH` (Compose default `/data/auth.sqlite3`) and should remain on the mounted `/data` volume. Keep a backup of `deploy/data` when using local storage. The app is configured for one Uvicorn worker because its local session and rate-limit state is process-scoped.

New sessions and extraction jobs are tied to the signed-in email. Session folders created before OAuth was enabled have no owner record and are not accessible through the new authenticated API checks. The image library’s existing backend and object keys are unchanged by the sign-in change.

The Caddy HTTP Basic Auth gate is retained for the application, except `/health`; Google sign-in is an additional gate. `/health` is public to support health checks.

## Tests

Run the backend tests from the repository root:

```bash
python -m unittest discover -s tests -v
```

The browser app relies on external CDN scripts/styles and in-browser Babel compilation, so a production visual smoke test should also be performed after deployment.
