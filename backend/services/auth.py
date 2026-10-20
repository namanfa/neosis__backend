"""Google OAuth 2.0/OIDC gateway and default-deny session middleware."""
import base64
import hashlib
import json
import logging
import os
import secrets
import threading
import time
from collections import defaultdict, deque
from urllib.parse import urlencode, urlsplit

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse, RedirectResponse
from starlette.datastructures import MutableHeaders

from services import auth_store
from services.auth_policy import email_is_allowed, safe_next

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["Authentication"])
GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs"
_jwks = None
_jwks_until = 0
_rate_lock = threading.Lock()
_login_attempts = defaultdict(deque)


class OAuthFlowError(Exception):
    def __init__(self, code):
        self.code = code
        super().__init__(code)


def _config(name, default=""):
    return os.environ.get(name, default).strip()


def _int_env(name, default, minimum, maximum):
    try:
        return max(minimum, min(maximum, int(_config(name, str(default)))))
    except (TypeError, ValueError):
        return default


def session_idle_minutes():
    return _int_env("SESSION_IDLE_MINUTES", 480, 5, 1440)


def session_max_days():
    return _int_env("SESSION_MAX_DAYS", 7, 1, 30)


def cookie_secure():
    return _config("COOKIE_SECURE", "true").lower() in {"1", "true", "yes", "on"}


def cookie_name():
    return "__Host-ir_session" if cookie_secure() else "ir_session"


def cookie_token(request):
    return request.cookies.get(cookie_name())


def _app_origin(request=None):
    configured = _config("APP_BASE_URL").rstrip("/")
    if configured:
        parsed = urlsplit(configured)
        return f"{parsed.scheme}://{parsed.netloc}" if parsed.scheme and parsed.netloc else ""
    if request is not None:
        return f"{request.url.scheme}://{request.url.netloc}"
    return ""


def _same_origin(request):
    origin = request.headers.get("origin", "").rstrip("/")
    expected = _app_origin(request)
    return bool(origin and expected and secrets.compare_digest(origin, expected))


def _rate_limited(request):
    ip = request.client.host if request.client else "unknown"
    now = time.monotonic()
    with _rate_lock:
        bucket = _login_attempts[ip]
        while bucket and bucket[0] < now - 300:
            bucket.popleft()
        if len(bucket) >= 10:
            return True
        bucket.append(now)
        return False


def _login_url(request, *, error=None, expired=False, signed_out=False, next_path="/"):
    params = {"next": safe_next(next_path)}
    if error:
        params["error"] = error
    if expired:
        params["expired"] = "1"
    if signed_out:
        params["signed_out"] = "1"
    return "/login?" + urlencode(params)


def _make_pkce_pair():
    verifier = secrets.token_urlsafe(48)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode("ascii")).digest()).rstrip(b"=").decode("ascii")
    return verifier, challenge


async def _google_jwks(force=False):
    global _jwks, _jwks_until
    from authlib.jose import JsonWebKey
    now = time.monotonic()
    if _jwks and not force and now < _jwks_until:
        return _jwks
    async with httpx.AsyncClient(timeout=8, follow_redirects=False) as client:
        response = await client.get(GOOGLE_JWKS_URL)
        response.raise_for_status()
        key_set = response.json()
    if not isinstance(key_set, dict) or not isinstance(key_set.get("keys"), list):
        raise ValueError("Google returned invalid signing keys")
    _jwks = JsonWebKey.import_key_set(key_set)
    _jwks_until = now + 3600
    return _jwks


async def _verify_id_token(token, transaction, client_id):
    from authlib.jose import JsonWebToken
    jwt_rs256 = JsonWebToken(["RS256"])
    if not isinstance(token, str) or len(token) > 16384:
        raise ValueError("Missing or invalid ID token")
    header_part = token.split(".", 1)[0]
    header = json.loads(base64.urlsafe_b64decode(header_part + "=" * (-len(header_part) % 4)))
    if header.get("alg") != "RS256" or not header.get("kid"):
        raise ValueError("Unexpected ID token signing algorithm")
    key_set = await _google_jwks()
    try:
        claims = jwt_rs256.decode(token, key_set)
    except Exception:
        # Google rotates signing keys; refresh once before rejecting a token.
        claims = jwt_rs256.decode(token, await _google_jwks(force=True))
    claims.validate(leeway=60)
    now = int(time.time())
    audience = claims.get("aud")
    audiences = audience if isinstance(audience, list) else [audience]
    if claims.get("iss") not in {"https://accounts.google.com", "accounts.google.com"}:
        raise ValueError("Unexpected ID token issuer")
    if client_id not in audiences or (len(audiences) > 1 and claims.get("azp") != client_id):
        raise ValueError("ID token audience mismatch")
    if not isinstance(claims.get("exp"), (int, float)) or claims["exp"] <= now:
        raise ValueError("Expired ID token")
    if not isinstance(claims.get("iat"), (int, float)) or claims["iat"] > now + 60:
        raise ValueError("Invalid ID token issue time")
    if not secrets.compare_digest(str(claims.get("nonce", "")), transaction["nonce"]):
        raise ValueError("ID token nonce mismatch")
    if claims.get("email_verified") is not True:
        raise ValueError("Google account email is not verified")
    email = claims.get("email")
    if not isinstance(email, str) or "@" not in email:
        raise ValueError("Google did not provide an email address")
    return claims


def _allowed_email(email):
    domains = _config("ALLOWED_EMAIL_DOMAINS").split(",")
    exceptions = _config("ALLOWED_EMAILS").split(",")
    return email_is_allowed(email, domains, exceptions)


@router.get("/login")
async def begin_google_login(request: Request, next: str = "/"):
    next_path = safe_next(next)
    if _rate_limited(request):
        return RedirectResponse(_login_url(request, error="rate_limited", next_path=next_path), status_code=303)
    client_id = _config("GOOGLE_CLIENT_ID")
    if not client_id or not _config("GOOGLE_CLIENT_SECRET") or not _config("OAUTH_REDIRECT_URI") or not _config("SESSION_SECRET"):
        return RedirectResponse(_login_url(request, error="not_configured", next_path=next_path), status_code=303)
    state, nonce = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
    verifier, challenge = _make_pkce_pair()
    auth_store.save_oauth_transaction(state, nonce, verifier, next_path)
    params = {
        "client_id": client_id,
        "redirect_uri": _config("OAUTH_REDIRECT_URI"),
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "nonce": nonce,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
        "prompt": "select_account",
    }
    return RedirectResponse(f"{GOOGLE_AUTH_URL}?{urlencode(params)}", status_code=302)


@router.get("/callback")
async def google_callback(request: Request):
    state = request.query_params.get("state", "")
    transaction = auth_store.consume_oauth_transaction(state) if state else None
    if not transaction:
        return RedirectResponse(_login_url(request, error="invalid_state"), status_code=303)
    if request.query_params.get("error"):
        failure = request.query_params.get("error")
        code = "access_denied" if failure == "access_denied" else "google_error"
        return RedirectResponse(_login_url(request, error=code, next_path=transaction["next_path"]), status_code=303)
    code = request.query_params.get("code")
    client_id, client_secret = _config("GOOGLE_CLIENT_ID"), _config("GOOGLE_CLIENT_SECRET")
    if not code or not client_id or not client_secret:
        return RedirectResponse(_login_url(request, error="token_exchange", next_path=transaction["next_path"]), status_code=303)
    try:
        async with httpx.AsyncClient(timeout=10, follow_redirects=False) as client:
            response = await client.post(GOOGLE_TOKEN_URL, data={
                "grant_type": "authorization_code", "code": code,
                "redirect_uri": _config("OAUTH_REDIRECT_URI"),
                "client_id": client_id, "client_secret": client_secret,
                "code_verifier": transaction["verifier"],
            })
            try:
                token_data = response.json()
            except ValueError:
                token_data = {}
            if response.status_code >= 400:
                provider_error = token_data.get("error") if isinstance(token_data, dict) else None
                if provider_error == "redirect_uri_mismatch":
                    raise OAuthFlowError("redirect_uri_mismatch")
                if provider_error == "invalid_grant":
                    raise OAuthFlowError("invalid_code")
                raise OAuthFlowError("token_exchange")
            if not isinstance(token_data, dict):
                raise OAuthFlowError("token_exchange")
        claims = await _verify_id_token(token_data.get("id_token"), transaction, client_id)
    except OAuthFlowError as exc:
        logger.warning("OAuth callback failed (%s)", exc.code)
        return RedirectResponse(_login_url(request, error=exc.code, next_path=transaction["next_path"]), status_code=303)
    except httpx.TransportError as exc:
        logger.warning("Google OAuth service unavailable (%s)", type(exc).__name__)
        return RedirectResponse(_login_url(request, error="google_unreachable", next_path=transaction["next_path"]), status_code=303)
    except Exception as exc:
        # Do not include provider response bodies, codes, tokens or secrets in logs.
        logger.warning("OAuth callback verification failed (%s)", type(exc).__name__)
        error_code = "unverified_email" if "email is not verified" in str(exc) else "verification_failed"
        return RedirectResponse(_login_url(request, error=error_code, next_path=transaction["next_path"]), status_code=303)

    email = str(claims["email"]).strip().casefold()
    if not _allowed_email(email):
        return RedirectResponse(_login_url(request, error="access_denied", next_path=transaction["next_path"]), status_code=303)
    token = auth_store.create_session(
        email, str(claims.get("name") or email), str(claims.get("picture") or ""),
        session_idle_minutes(), session_max_days(),
    )
    response = RedirectResponse(transaction["next_path"], status_code=303)
    response.set_cookie(
        cookie_name(), token, max_age=session_max_days() * 86400, path="/",
        secure=cookie_secure(), httponly=True, samesite="lax",
    )
    return response


@router.get("/me")
async def auth_me(request: Request):
    user = auth_store.load_session(cookie_token(request), session_idle_minutes())
    if not user:
        response = JSONResponse({"detail": "Authentication required"}, status_code=401)
        response.delete_cookie(cookie_name(), path="/", secure=cookie_secure(), httponly=True, samesite="lax")
        return response
    return {"email": user["email"], "name": user["name"], "picture": user["picture"] or None}


@router.post("/logout")
async def auth_logout(request: Request):
    if not _same_origin(request):
        raise HTTPException(403, "Request origin was not allowed")
    auth_store.delete_session(cookie_token(request))
    response = RedirectResponse("/login?signed_out=1", status_code=303)
    response.delete_cookie(cookie_name(), path="/", secure=cookie_secure(), httponly=True, samesite="lax")
    return response


class AuthMiddleware:
    """Protect all routes by default; allow only the health and login surface."""
    def __init__(self, app):
        self.app = app
        self.public_paths = {
            "/health", "/login", "/login.html", "/auth/login", "/auth/callback",
            "/auth/me", "/auth/logout", "/logo/FieldAssistLogoColoured.svg",
            "/logo/ir-tool-mark.svg", "/favicon.ico",
        }

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        request = Request(scope, receive=receive)
        path, method = scope.get("path", "/"), scope.get("method", "GET").upper()
        if method not in {"GET", "HEAD", "OPTIONS"} and path != "/auth/callback":
            if not _same_origin(request):
                response = JSONResponse({"detail": "Request origin was not allowed"}, status_code=403)
                await self._send(response, scope, receive, send)
                return
        is_public = path in self.public_paths or path.startswith("/login-assets/")
        user = None
        if not is_public:
            token = request.cookies.get(cookie_name())
            user = auth_store.load_session(token, session_idle_minutes())
            if not user:
                if path.startswith("/api/"):
                    response = JSONResponse({"detail": "Authentication required"}, status_code=401)
                    response.delete_cookie(cookie_name(), path="/", secure=cookie_secure(), httponly=True, samesite="lax")
                else:
                    query = scope.get("query_string", b"").decode("latin1")
                    next_path = path + (f"?{query}" if query else "")
                    expired = bool(request.cookies.get(cookie_name()))
                    response = RedirectResponse(_login_url(request, next_path=next_path, expired=expired), status_code=302)
                await self._send(response, scope, receive, send)
                return
            scope.setdefault("state", {})["user"] = user
        await self.app(scope, receive, send)

    async def _send(self, response, scope, receive, send):
        async def send_with_security_headers(message):
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                headers.setdefault("X-Content-Type-Options", "nosniff")
                headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
                headers.setdefault("X-Frame-Options", "DENY")
                headers.setdefault("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline' https://unpkg.com https://cdnjs.cloudflare.com 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: https:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'")
                if scope.get("path", "").startswith("/auth/"):
                    headers.setdefault("Cache-Control", "no-store")
            await send(message)
        await response(scope, receive, send_with_security_headers)


def install_auth_middleware(app):
    app.add_middleware(AuthMiddleware)
