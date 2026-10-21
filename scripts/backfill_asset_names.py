#!/usr/bin/env python3
"""Dry-run-first backfill for Testing asset display labels.

Run from the repository root with the configured STORAGE_BACKEND:
  python scripts/backfill_asset_names.py --brand-slug example-brand --source labels.csv
Pass --apply only after reviewing the dry-run output. The source can be CSV/JSON
with slug,label fields or a directory containing the original asset folders.
"""
import argparse
import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT / "backend"
from dotenv import load_dotenv  # noqa: E402

load_dotenv(ROOT / "deploy" / ".env", override=False)
sys.path.insert(0, str(BACKEND_DIR))

from services import toolkit_library  # noqa: E402
from storage import get_storage  # noqa: E402


def read_labels(source):
    if source.is_dir():
        labels = {}
        for folder in sorted(path for path in source.iterdir() if path.is_dir()):
            if any(path.is_file() for path in folder.rglob("*")):
                labels.setdefault(toolkit_library._slug(folder.name, "Asset"), folder.name.strip())
        return labels
    if source.suffix.lower() == ".csv":
        with source.open("r", encoding="utf-8-sig", newline="") as stream:
            rows = csv.DictReader(stream)
            if not rows.fieldnames or not {"slug", "label"}.issubset({name.strip().lower() for name in rows.fieldnames}):
                raise ValueError("CSV must have slug,label headers")
            fields = {name.strip().lower(): name for name in rows.fieldnames}
            labels = {}
            for row in rows:
                slug = (row.get(fields["slug"]) or "").strip()
                label = (row.get(fields["label"]) or "").strip()
                if slug and label:
                    labels.setdefault(slug, label)
            return labels
    data = json.loads(source.read_text(encoding="utf-8"))
    if isinstance(data, dict):
        data = data.get("asset_names", data)
    if isinstance(data, dict):
        return {str(slug).strip(): str(label).strip() for slug, label in data.items() if str(slug).strip() and str(label).strip()}
    if isinstance(data, list):
        labels = {}
        for row in data:
            if isinstance(row, dict) and row.get("slug") and row.get("label"):
                labels.setdefault(str(row["slug"]).strip(), str(row["label"]).strip())
        return labels
    raise ValueError("JSON must be an object mapping slugs to labels or a list of slug,label objects")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--brand-slug", required=True)
    parser.add_argument("--source", required=True, type=Path, help="CSV/JSON mapping, or directory of original asset folders")
    parser.add_argument("--apply", action="store_true", help="Write labels; default behavior is dry-run")
    args = parser.parse_args()
    if not args.source.exists():
        parser.error(f"Source does not exist: {args.source}")

    storage = get_storage()
    brand = next((item for item in toolkit_library._cached_brands(storage) if item.get("slug") == args.brand_slug), None)
    if not brand:
        parser.error(f"Unknown brand slug: {args.brand_slug}")
    manifest, _ = toolkit_library._gallery_manifest(storage, "testing", args.brand_slug)
    existing_assets = set(manifest.get("assets", []))
    labels = read_labels(args.source)
    invalid = sorted(set(labels) - existing_assets)
    if invalid:
        parser.error("These asset slugs do not exist for the brand: " + ", ".join(invalid))

    current = toolkit_library._read_asset_names(storage, args.brand_slug)
    for slug, label in sorted(labels.items()):
        action = "KEEP" if slug in current else "WRITE"
        suffix = f" (existing label: {current[slug]!r}; first-seen label wins)" if slug in current else ""
        print(f"{action} {slug} -> {label!r}{suffix}")
    if not args.apply:
        print("Dry run only. Re-run with --apply to persist these labels.")
        return
    saved = toolkit_library._remember_asset_names(storage, args.brand_slug, labels)
    toolkit_library._refresh_gallery(storage, "testing", args.brand_slug, asset_names=saved)
    print(f"Applied labels for {sum(1 for slug in labels if slug in saved)} asset(s).")


if __name__ == "__main__":
    main()
