"""Generate missing Testing Images and Packshot derivatives in bounded workers.

Run from the repository root with the configured STORAGE_BACKEND. The script is
idempotent and never rewrites or deletes original image objects.
"""
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / "deploy" / ".env", override=False)
sys.path.insert(0, str(ROOT / "backend"))

from services.toolkit_library import IMAGE_EXTENSIONS, _derivative_gate, _ensure_derivatives, _version_for
from storage import get_storage
from storage.brands import get_brands


def main():
    storage = get_storage()
    jobs = []
    for brand in get_brands(storage):
        slug = brand.get("slug", "")
        for kind in ("testing", "packshots"):
            for entry in storage.list_entries(f"{kind}/{slug}"):
                if Path(entry["key"]).suffix.lower() in IMAGE_EXTENSIONS:
                    jobs.append((kind, slug, entry))
    completed = failures = skipped = compressed = no_savings = 0
    original_bytes = sum(int(entry.get("size") or 0) for _, _, entry in jobs)
    gallery_card_bytes = 0
    with ThreadPoolExecutor(max_workers=4, thread_name_prefix="thumb-backfill") as pool:
        futures = {
            pool.submit(_ensure_derivatives, storage, kind, slug, entry["key"], _version_for(entry)): entry["key"]
            for kind, slug, entry in jobs
        }
        for future in as_completed(futures):
            try:
                result = future.result()
                completed += 1
                gallery_card_bytes += int(result.get("card_bytes") or result.get("original_bytes") or 0)
                if result.get("derivative") == "generated":
                    compressed += 1
                elif not _derivative_gate(result.get("original_bytes") or 0, result.get("width") or 0, result.get("height") or 0):
                    skipped += 1
                else:
                    no_savings += 1
            except Exception as exc:
                failures += 1
                print(f"Failed to generate a preview for {futures[future]}: {exc}")
    print(f"Processed {completed} images; {skipped} skipped by size gate; {compressed} compressed; {no_savings} had no smaller WebP; {failures} failed.")
    print(f"Original gallery bytes: {original_bytes}; card bytes after gate: {gallery_card_bytes}.")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
