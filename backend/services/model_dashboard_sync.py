"""Read-only metadata sync with a persistent cross-worker lease."""
import threading
import uuid
from datetime import datetime, timezone

from services import control_panel_store, model_dashboard_store as store
from services.tenant_blob_provider import AzureBlobProvider

SYNC_INTERVAL_SECONDS = 86400
SCHEDULER_POLL_SECONDS = 60

# Suffix matching is longest-first. It deliberately resolves ids ending in
# _asset/_rack/_obj as the matching type suffix; see docs/model-dashboard-storage.md.
TRACKED_SUFFIXES = (
    ("_asset_nano.onnx", "asset_onnx"),
    ("_rack_nano.onnx", "rack_onnx"),
    ("_obj_nano.onnx", "obj_onnx"),
    ("_asset.pt", "asset_pt"),
    ("_rack.pt", "rack_pt"),
    ("_obj.pt", "obj_pt"),
    ("_asset.txt", "asset_class"),
    ("_class.txt", "sku_class"),
    ("_nano.onnx", "sku_onnx"),
    (".pt", "sku_pt"),
)


def parse_blob_name(blob_name, last_modified):
    name = str(blob_name or "").replace("\\", "/").rsplit("/", 1)[-1]
    lowered = name.casefold()
    for suffix, slot in TRACKED_SUFFIXES:
        if lowered.endswith(suffix):
            company_id = name[:-len(suffix)]
            if not company_id:
                return None
            return {"company_id": company_id, "slot": slot, "blob_name": str(blob_name),
                    "last_modified": normalize_last_modified(last_modified)}
    return None


def normalize_last_modified(value):
    if value is None:
        return None
    if isinstance(value, datetime):
        dt = value if value.tzinfo else value.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).isoformat()
    text = str(value)
    try:
        dt = datetime.fromisoformat(text.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).isoformat()
    except ValueError:
        return text


def _read_tenant_metadata(tenant, provider):
    connection = control_panel_store.decrypt_connection(tenant["encrypted_connection"])
    # Fully materialize before applying any database changes. A truncated or
    # interrupted listing must not mark unseen files as deleted.
    blobs = list(provider.list_blob_metadata(connection))
    parsed = []
    for blob in blobs:
        item = parse_blob_name(blob.get("name"), blob.get("last_modified"))
        if item:
            parsed.append(item)
    return parsed


def _renew_lease(owner, finished):
    while not finished.wait(10):
        if not store.renew_sync(owner):
            finished.set()
            return


def run_sync(force=False, provider=None, catch_up=False):
    provider = provider or AzureBlobProvider()
    if not force and not store.due_tenant_ids(catch_up=catch_up):
        return {"status": "not_due", "running": False, "results": []}
    owner = uuid.uuid4().hex
    run_id = store.claim_sync(owner, "forced" if force else "scheduled")
    if run_id is None:
        return {"status": "running", "running": True, "results": []}
    finished = threading.Event()
    renewer = threading.Thread(target=_renew_lease, args=(owner, finished), daemon=True)
    renewer.start()
    results = []
    success_count = failure_count = 0
    final_status = "success"
    try:
        tenant_ids = store.due_tenant_ids(force=force, catch_up=catch_up)
        for tenant_id in tenant_ids:
            tenant = store.sync_target(tenant_id)
            if not tenant:
                continue
            store.set_tenant_status(tenant_id, "running")
            try:
                metadata = _read_tenant_metadata(tenant, provider)
                store.record_tenant_success(tenant_id, metadata)
                results.append({"tenant_id": tenant_id, "name": tenant["name"], "status": "ok"})
                success_count += 1
            except Exception as error:
                # Adapter exceptions may contain connection strings or SAS
                # tokens. Never log or return exception text.
                outcome = "unreachable"
                try:
                    outcome = provider.result_for_error(error)
                except Exception:
                    pass
                status = outcome if outcome in {"authentication_failed", "not_found", "unreachable"} else "failed"
                store.record_tenant_failure(tenant_id, status)
                results.append({"tenant_id": tenant_id, "name": tenant["name"], "status": status})
                failure_count += 1
        if failure_count and success_count:
            final_status = "partial_failure"
        elif failure_count:
            final_status = "failed"
        return {"status": final_status, "running": False, "results": results}
    finally:
        finished.set()
        renewer.join(timeout=1)
        store.release_sync(owner, run_id, final_status, success_count, failure_count, len(results))


def scheduler_loop(stop_event=None, provider=None):
    stop_event = stop_event or threading.Event()
    catch_up = True
    while not stop_event.is_set():
        try:
            from services.session_cleanup import run_scheduled_cleanup
            run_scheduled_cleanup()
            run_sync(force=False, provider=provider, catch_up=catch_up)
        except Exception:
            # Scheduler recovery must be quiet: underlying provider/database
            # errors are not safe for logs and the next tick retries.
            pass
        catch_up = False
        stop_event.wait(SCHEDULER_POLL_SECONDS)


def start_scheduler():
    thread = threading.Thread(target=scheduler_loop, name="model-dashboard-sync", daemon=True)
    thread.start()
    return thread
