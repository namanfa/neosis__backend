"""Pure validation rules shared by the authentication gateway and tests."""
from urllib.parse import unquote, urlsplit


def safe_next(value):
    if not isinstance(value, str) or not value.startswith("/") or value.startswith("//") or "\\" in value:
        return "/#/"
    if any(ord(char) < 32 or ord(char) == 127 for char in value) or "\\" in unquote(value):
        return "/#/"
    parsed = urlsplit(value)
    if parsed.scheme or parsed.netloc or not parsed.path.startswith("/") or parsed.path.startswith("//"):
        return "/#/"
    return value


def email_is_allowed(email, domains, exceptions=()):
    normalized = str(email or "").strip().casefold()
    allowed_emails = {str(item).strip().casefold() for item in exceptions if str(item).strip()}
    if normalized in allowed_emails:
        return True
    if "@" not in normalized:
        return False
    domain = normalized.rsplit("@", 1)[1]
    allowed_domains = {str(item).strip().casefold().lstrip("@") for item in domains if str(item).strip()}
    return domain in allowed_domains
