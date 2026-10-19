"""Shared brand index helpers used by Testing Images and Packshots."""
import re
from datetime import datetime, timezone

BRANDS_KEY = "brands.json"


def normalize_brand_name(name: str) -> str:
    return " ".join((name or "").split()).casefold()


def make_brand_slug(name: str) -> str:
    slug = re.sub(r"[\W_]+", "-", " ".join((name or "").split()).casefold(), flags=re.UNICODE).strip("-")
    if not slug:
        raise ValueError("Brand name must contain at least one letter or number")
    return slug


def get_brands(storage):
    if not storage.exists(BRANDS_KEY):
        storage.put_json(BRANDS_KEY, [])
    brands = storage.get_json(BRANDS_KEY)
    if not isinstance(brands, list):
        raise ValueError("brands.json must contain a JSON list")
    return brands


def add_brand(storage, name: str):
    normalized_name = " ".join((name or "").split())
    if not normalized_name:
        raise ValueError("Brand name cannot be empty")
    brands = get_brands(storage)
    existing = next((brand for brand in brands if normalize_brand_name(brand.get("name", "")) == normalize_brand_name(normalized_name)), None)
    if existing:
        raise ValueError(f"Brand already exists: {existing['name']}")
    slug = make_brand_slug(normalized_name)
    if any(brand.get("slug") == slug for brand in brands):
        raise ValueError("Brand name conflicts with an existing brand key")
    brand = {"slug": slug, "name": normalized_name, "created_at": datetime.now(timezone.utc).isoformat()}
    brands.append(brand)
    storage.put_json(BRANDS_KEY, brands)
    return brand
