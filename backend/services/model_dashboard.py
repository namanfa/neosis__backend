"""Model Dashboard metadata, history and IR-only edits."""
from decimal import Decimal, InvalidOperation

import sqlite3

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from services import model_dashboard_store as store
from services import model_dashboard_sync as sync

router = APIRouter(prefix="/api/model-dashboard", tags=["Model Dashboard"])
sync_router = APIRouter(prefix="/api/control-panel/sync", tags=["Control Panel Sync"])

EXPECTED_FILES = (
    ("sku_pt", "SKU", "{id}.pt", True),
    ("sku_onnx", "SKU", "{id}_nano.onnx", True),
    ("sku_class", "SKU", "{id}_class.txt", False),
    ("asset_pt", "Asset", "{id}_asset.pt", True),
    ("asset_onnx", "Asset", "{id}_asset_nano.onnx", True),
    ("asset_class", "Asset", "{id}_asset.txt", False),
    ("rack_pt", "Rack", "{id}_rack.pt", True),
    ("rack_onnx", "Rack", "{id}_rack_nano.onnx", True),
    ("obj_pt", "Object", "{id}_obj.pt", True),
    ("obj_onnx", "Object", "{id}_obj_nano.onnx", True),
)


def _user(request):
    user = getattr(request.state, "user", None)
    if not user:
        raise HTTPException(401, "Authentication required")
    return user


def _ir(request):
    user = _user(request)
    if user.get("role") != "IR":
        raise HTTPException(403, "IR team only")
    return user


def _summary_row(row):
    return {
        "id": row["id"], "company_id": row["company_id"], "name": row["display_name"],
        "tenant_id": row["tenant_id"], "tenant_name": row["tenant_name"],
        "tenant_type": row["tenant_type"], "tenant_status": row["tenant_status"],
        "tenant_last_sync_at": row["last_sync_at"], "flagged_count": row["flagged_count"],
        "hidden_file_count": row["hidden_file_count"], "hidden": row["hidden"],
        "has_storage_deleted": row["has_storage_deleted"], "hidden_by_ir": bool(row["hidden_by_ir"]),
        "tenant_deleted": bool(row["tenant_deleted"]),
    }


@router.get("")
def dashboard(request: Request, filter: str = "all", tenant_id: int = None, search: str = ""):
    _user(request)
    if filter not in {"all", "flagged", "deleted"}:
        raise HTTPException(400, "Unknown dashboard filter.")
    companies = store.companies(filter, tenant_id, search[:120])
    flagged_total = sum(row["flagged_count"] for row in store.companies("all"))
    return {"companies": [_summary_row(row) for row in companies], "flagged_count": flagged_total,
            "sync": store.sync_state()}


@router.get("/companies/{company_row_id}")
def company_detail(company_row_id: int, request: Request):
    _user(request)
    company = store.company_detail(company_row_id)
    if not company:
        raise HTTPException(404, "Company not found.")
    files_by_slot = {row["slot"]: row for row in company["files"]}
    files = []
    for slot, category, pattern, is_model in EXPECTED_FILES:
        row = files_by_slot.get(slot)
        if not row:
            files.append({"id": None, "slot": slot, "category": category,
                          "name": pattern.format(id=company["company_id"]), "absent": True,
                          "model": is_model, "versions": []})
            continue
        versions = store.file_history(row["id"])
        current = next((version for version in versions if version["version"] == row["current_version"]), None)
        has_gap = any(not version["remark"].strip() or (is_model and version["accuracy"] is None)
                      for version in versions)
        files.append({"id": row["id"], "slot": slot, "category": category, "name": row["blob_name"],
                      "absent": False, "model": is_model, "version": row["current_version"],
                      "last_modified": row["last_modified"], "remark": current["remark"] if current else "",
                      "accuracy": current["accuracy"] if current else None,
                      "flagged": slot in {"sku_pt", "sku_onnx"} and has_gap,
                      "removed_from_storage": bool(row["removed_from_storage"]),
                      "hidden_by_ir": bool(row["hidden_by_ir"]), "versions": versions})
    return {"id": company["id"], "company_id": company["company_id"],
            "name": company["display_name"], "tenant_id": company["tenant_id"],
            "tenant_name": company["tenant_name"], "tenant_type": company["tenant_type"],
            "tenant_status": company["tenant_status"], "tenant_last_sync_at": company["last_sync_at"],
            "tenant_deleted": bool(company["tenant_deleted"]), "hidden_by_ir": bool(company["hidden_by_ir"]),
            "files": files}


class CompanyNameInput(BaseModel):
    name: object


class VersionInput(BaseModel):
    remark: object = ""
    accuracy: object = None


def _accuracy(value):
    if value in (None, ""):
        return None
    try:
        number = Decimal(str(value))
    except (InvalidOperation, ValueError):
        raise HTTPException(400, "Enter an accuracy from 0 to 100 with up to 2 decimals.") from None
    if not number.is_finite() or number < 0 or number > 100 or max(0, -number.as_tuple().exponent) > 2:
        raise HTTPException(400, "Enter an accuracy from 0 to 100 with up to 2 decimals.")
    return float(number)


@router.patch("/companies/{company_row_id}/name")
def update_company_name(company_row_id: int, payload: CompanyNameInput, request: Request):
    _ir(request)
    company = store.company_detail(company_row_id)
    if not company:
        raise HTTPException(404, "Company not found.")
    name = payload.name.strip() if isinstance(payload.name, str) else ""
    if not name or len(name) > 60 or "\x00" in name:
        raise HTTPException(400, "Enter a company name of 1 to 60 characters.")
    if store.company_name_in_use(company["company_id"], name):
        raise HTTPException(409, "Another company already uses this name.")
    try:
        store.set_company_name(company["company_id"], name)
    except sqlite3.IntegrityError:
        raise HTTPException(409, "Another company already uses this name.") from None
    return {"company_id": company["company_id"], "name": name}


@router.patch("/files/{file_id}/versions/{version}")
def update_version(file_id: int, version: int, payload: VersionInput, request: Request):
    user = _ir(request)
    file_row = store.file_detail(file_id)
    if not file_row:
        raise HTTPException(404, "File not found.")
    remark = payload.remark.strip() if isinstance(payload.remark, str) else ""
    if len(remark) > 300 or "\x00" in remark:
        raise HTTPException(400, "Remark must be 300 characters or fewer.")
    existing = next((item for item in store.file_history(file_id) if item["version"] == version), None)
    if not existing:
        raise HTTPException(404, "Version not found.")
    if "remark" not in payload.model_fields_set:
        remark = existing["remark"]
    accuracy = _accuracy(payload.accuracy) if "accuracy" in payload.model_fields_set else existing["accuracy"]
    result, error = store.edit_version(file_id, version, remark=remark, accuracy=accuracy, editor=user["email"])
    if error == "not_found":
        raise HTTPException(404, "Version not found.")
    if error == "immutable":
        raise HTTPException(409, "Earlier version metadata can only be filled when it is empty.")
    if error == "missing_value":
        raise HTTPException(400, "Fill a missing remark or accuracy before saving this earlier version.")
    return result


@router.get("/files/{file_id}/history")
def version_history(file_id: int, request: Request):
    _user(request)
    if not store.file_detail(file_id):
        raise HTTPException(404, "File not found.")
    return {"versions": store.file_history(file_id)}


@router.post("/companies/{company_row_id}/hide")
def hide_company(company_row_id: int, request: Request):
    _ir(request)
    if not store.set_hidden("company", company_row_id, True):
        raise HTTPException(404, "Company not found.")
    return {"hidden": True}


@router.post("/companies/{company_row_id}/restore")
def restore_company(company_row_id: int, request: Request):
    _ir(request)
    if not store.set_hidden("company", company_row_id, False):
        raise HTTPException(404, "Company not found.")
    return {"restored": True}


@router.post("/files/{file_id}/hide")
def hide_file(file_id: int, request: Request):
    _ir(request)
    if not store.set_hidden("file", file_id, True):
        raise HTTPException(404, "File not found.")
    return {"hidden": True}


@router.post("/files/{file_id}/restore")
def restore_file(file_id: int, request: Request):
    _ir(request)
    if not store.set_hidden("file", file_id, False):
        raise HTTPException(404, "File not found.")
    return {"restored": True}


@sync_router.get("")
def sync_status(request: Request):
    _ir(request)
    return store.sync_state()


@sync_router.post("")
def force_sync(request: Request):
    _ir(request)
    result = sync.run_sync(force=True, provider=getattr(request.app.state, "tenant_blob_provider", None))
    if result["status"] == "running":
        raise HTTPException(409, "A sync is already running.")
    return result
