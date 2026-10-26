# Sign-in and access control

FastAPI's default-deny `AuthMiddleware` protects app pages and every API route. Only `/health`, the login page/assets, OIDC initiation/callback, provider configuration, and profile/logout endpoints are public. `/health` is intentionally public for platform probes; `/auth/me` returns no profile without a valid session. No proxy authentication is required.

## Microsoft Entra work accounts

Configure these backend environment variables:

| Variable | Purpose |
| --- | --- |
| `MICROSOFT_TENANT_ID` | The company's single Entra tenant GUID. Generic `common`, `organizations`, and `consumers` authorities are rejected. |
| `MICROSOFT_CLIENT_ID` | OIDC application client ID. |
| `MICROSOFT_CLIENT_SECRET` | Backend-only OIDC client secret. |
| `MICROSOFT_REDIRECT_URI` | Registered callback; defaults to `OAUTH_REDIRECT_URI` when omitted. |
| `ALLOWED_EMAIL_DOMAINS` | Exact comma-separated domain allowlist. |
| `SESSION_SECRET` | Server-side HMAC key for opaque session and OAuth state hashes. |

Register the exact redirect URI ending in `/auth/callback` as a Web redirect URI. The server uses authorization-code flow with PKCE, validates the signature against keys from the configured tenant's OIDC metadata, and checks issuer, tenant ID, audience, nonce, expiry, and issue time. The immutable Entra `oid` claim is the verified principal identifier; the signed `email` claim (falling back to `preferred_username`) is normalized to lowercase and domain-allowlisted for Neosis's cross-provider email identity. The first allowed sign-in persists a `(tenant ID, oid) → email` binding in SQLite, and later sign-ins reject a changed address for the same object. Entra's email/UPN claims can change, so `oid` supplies stable identity verification while Neosis retains the email identity contract used by existing accounts and owned sessions.

## Google sign-in

Google OAuth is the active sign-in flow. Configure `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `OAUTH_REDIRECT_URI`. Microsoft OIDC server code is retained for later configuration, but the login page currently offers Google only. Google Drive consent for Accuracy Report continues to use the same Google callback independently of the login button.

Microsoft sign-in is not offered on the current login page. No session migration is performed; existing Google sessions remain in the database until their normal idle or absolute expiration.

## Domain access

Set `ALLOWED_EMAIL_DOMAINS` to approved exact domains, such as `flick2know.com,flick2know.in,fieldassist.com,fieldassist.in`. Matching is case-insensitive and does not include subdomains implicitly. Optional `ALLOWED_EMAILS` entries remain exact email exceptions. IR status is resolved from the persisted IR list for every request; all other permitted users have Viewer access.

## Deployment and session lifetime

Set `APP_BASE_URL`, `OAUTH_REDIRECT_URI`, `SESSION_SECRET`, provider values, `SESSION_IDLE_MINUTES`, `SESSION_MAX_DAYS`, `COOKIE_SECURE`, and `AUTH_DB_PATH` in the deployment environment. Keep `/data/auth.sqlite3` on the persistent data volume. Provider secrets and session keys are server configuration only.

The Phase 3 SQLite lease scheduler scans every minute and runs cleanup through one worker at a time, including with multiple Uvicorn workers. It deletes owned Pseudo Labelling, Image Extraction, and Accuracy Report temporary files and ownership rows once they have been inactive for 24 hours. A persisted renewable operation lease keeps inference, extraction, export, and report generation safe while in progress. Signing out does not delete data. Unowned legacy directories are never auto-deleted; inspect with `python -m services.session_cleanup` and explicitly opt in with `--apply` only after review.

`/health` remains publicly reachable for probes. Every other application route is protected by the FastAPI middleware, independent of reverse-proxy configuration. Microsoft and Google provider behavior requires tenant/client credentials for a live end-to-end check; automated tests mock the provider boundary.
