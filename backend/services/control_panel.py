"""IR-only Control Panel API for IR members and blob tenants."""
import re
import sqlite3

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from services import auth_policy, auth_store, control_panel_store
from services.tenant_blob_provider import AzureBlobProvider, RESULTS

router = APIRouter(prefix="/api/control-panel", tags=["Control Panel"])
IR_MEMBER_DOMAINS = ("flick2know.com", "flick2know.in", "fieldassist.com", "fieldassist.in")
_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class MemberInput(BaseModel):
    email: object


class ConnectionInput(BaseModel):
    # Any avoids Pydantic including an invalid secret value in its 422 response.
    connection_string: object


class TenantInput(BaseModel):
    name: object
    type: object
    connection_string: object


class TenantUpdate(BaseModel):
    name: object = None
    type: object = None
    connection_string: object = None


def require_ir(request):
    user = getattr(request.state, "user", None)
    if not user:
        raise HTTPException(401, "Authentication required")
    if user.get("role") != "IR":
        raise HTTPException(403, "IR team only")
    return user


def _email(value):
    normalized = value.strip().casefold() if isinstance(value, str) else ""
    if not normalized or not _EMAIL.fullmatch(normalized):
        raise HTTPException(400, "Enter a valid email address.")
    if not auth_policy.email_is_allowed(normalized, IR_MEMBER_DOMAINS):
        raise HTTPException(400, "Only these domains are allowed: " + ", ".join(IR_MEMBER_DOMAINS) + ".")
    return normalized


def _connection_string(value):
    if not isinstance(value, str):
        raise HTTPException(400, "Enter a valid connection string.")
    normalized = value.strip()
    if not normalized or len(normalized) > 8192 or "\x00" in normalized:
        raise HTTPException(400, "Enter a valid connection string.")
    return normalized


def _tenant_name(value):
    name = value.strip() if isinstance(value, str) else ""
    if not name or len(name) > 60 or "\x00" in name:
        raise HTTPException(400, "Enter a tenant name of 1 to 60 characters.")
    return name


def _tenant_type(value):
    tenant_type = value.strip().casefold() if isinstance(value, str) else ""
    if tenant_type not in {"general", "brand"}:
        raise HTTPException(400, "Tenant type must be General or Brand.")
    return tenant_type


def _tenant_encryption_error(error):
    if "could not be decrypted" in str(error):
        return HTTPException(500, "Saved tenant credentials could not be decrypted. Check the encryption key configuration.")
    return HTTPException(503, "Tenant credential encryption is not configured.")


def _adapter(request):
    return getattr(request.app.state, "tenant_blob_provider", None) or AzureBlobProvider()


@router.get("/ir-members")
def list_members(request: Request):
    require_ir(request)
    return {"members": auth_store.list_ir_members()}


@router.post("/ir-members", status_code=201)
def add_member(payload: MemberInput, request: Request):
    require_ir(request)
    email = _email(payload.email)
    try:
        auth_store.add_ir_member(email)
    except sqlite3.IntegrityError:
        raise HTTPException(409, "This address is already an IR member.") from None
    return {"member": email}


@router.delete("/ir-members/{email}")
def delete_member(email: str, request: Request):
    require_ir(request)
    normalized = _email(email)
    try:
        control_panel_store.remove_ir_member(normalized)
    except control_panel_store.LastIrMember:
        raise HTTPException(409, "The last remaining IR member cannot be removed.") from None
    except control_panel_store.IrMemberNotFound:
        raise HTTPException(404, "IR member not found.") from None
    return {"removed": normalized}


@router.get("/tenants")
def list_tenants(request: Request):
    require_ir(request)
    return {"tenants": control_panel_store.list_tenants()}


@router.post("/tenants/test-connection")
def test_tenant_connection(payload: ConnectionInput, request: Request):
    user = require_ir(request)
    connection_string = _connection_string(payload.connection_string)
    try:
        fingerprint = control_panel_store.connection_fingerprint(connection_string)
    except RuntimeError as error:
        raise _tenant_encryption_error(error) from None
    try:
        result = _adapter(request).test_connection(connection_string)
    except Exception:
        # Provider exceptions can include the full connection URL or SAS token.
        result = "unreachable"
    if result not in RESULTS:
        result = "unreachable"
    control_panel_store.record_connection_test(user["email"], fingerprint, result)
    return {"result": result}


@router.post("/tenants", status_code=201)
def create_tenant(payload: TenantInput, request: Request):
    user = require_ir(request)
    name = _tenant_name(payload.name)
    tenant_type = _tenant_type(payload.type)
    connection_string = _connection_string(payload.connection_string)
    try:
        encrypted = control_panel_store.encrypt_connection(connection_string)
        fingerprint = control_panel_store.connection_fingerprint(connection_string)
        tenant = control_panel_store.create_tenant(
            name, tenant_type, encrypted, user["email"], fingerprint,
        )
    except control_panel_store.ConnectionTestRequired:
        raise HTTPException(409, "Test this connection successfully before saving the tenant.") from None
    except control_panel_store.TenantNameConflict:
        raise HTTPException(409, "A tenant with this name already exists.") from None
    except RuntimeError as error:
        raise _tenant_encryption_error(error) from None
    return tenant


@router.patch("/tenants/{tenant_id}")
def update_tenant(tenant_id: int, payload: TenantUpdate, request: Request):
    user = require_ir(request)
    fields = payload.model_fields_set
    name = _tenant_name(payload.name) if "name" in fields else None
    tenant_type = _tenant_type(payload.type) if "type" in fields else None
    encrypted = fingerprint = None
    if "connection_string" in fields and payload.connection_string not in (None, ""):
        connection_string = _connection_string(payload.connection_string)
        try:
            encrypted = control_panel_store.encrypt_connection(connection_string)
            fingerprint = control_panel_store.connection_fingerprint(connection_string)
        except RuntimeError as error:
            raise _tenant_encryption_error(error) from None
    if name is None and tenant_type is None and encrypted is None:
        raise HTTPException(400, "Make a change before saving.")
    try:
        return control_panel_store.update_tenant(
            tenant_id,
            name=name,
            tenant_type=tenant_type,
            encrypted_connection=encrypted,
            connection_email=user["email"] if encrypted is not None else None,
            fingerprint=fingerprint,
        )
    except control_panel_store.ConnectionTestRequired:
        raise HTTPException(409, "Test the replacement connection successfully before saving.") from None
    except control_panel_store.TenantNameConflict:
        raise HTTPException(409, "A tenant with this name already exists.") from None
    except control_panel_store.TenantNotFound:
        raise HTTPException(404, "Tenant not found.") from None


@router.delete("/tenants/{tenant_id}")
def delete_tenant(tenant_id: int, request: Request):
    require_ir(request)
    try:
        control_panel_store.delete_tenant(tenant_id)
    except control_panel_store.TenantNotFound:
        raise HTTPException(404, "Tenant not found.") from None
    return {"deleted": True}
