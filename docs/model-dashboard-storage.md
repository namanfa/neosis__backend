# Model Dashboard storage and sync

The Model Dashboard uses the same SQLite database selected by `AUTH_DB_PATH` as authentication and tenant configuration. In deployment this is the persistent `/data/auth.sqlite3` volume. Back up this database: blob listings contain only current names and last-modified values, so version history, manual accuracy, remarks, company names and hide state cannot be reconstructed after database loss.

## Schema

- `model_companies`: one row per `(tenant_id, company_id)`, including IR hide state.
- `model_company_names`: shared display name keyed by raw company id.
- `model_files`: one row per tracked slot per tenant/company, with blob name, observed last-modified, current version, storage-deleted state and IR hide state.
- `model_file_versions`: immutable sync snapshots with version, last-modified, manually entered remark and accuracy. IR edits update only the allowed missing/current fields; editor email and edit time are retained without an audit UI.
- `model_sync_runs`: overall scheduled/forced run status and counts.
- `model_sync_leases`: SQLite-backed cross-worker lease for the single active scheduler or forced run.

The `tenants` table remains owned by the Control Panel migration. Deleting a tenant clears its encrypted connection and marks the tenant deleted; its company, file and version rows remain available in Deleted. Re-adding a deleted tenant under the same name revives its tombstone and keeps its model history. A tenant with a new name is a distinct source.

## Blob matching

The sync reads blob names and last-modified metadata only. It tracks `{id}.pt`, `{id}_nano.onnx`, `{id}_asset.pt`, `{id}_asset_nano.onnx`, `{id}_rack.pt`, `{id}_rack_nano.onnx`, `{id}_obj.pt`, `{id}_obj_nano.onnx`, `{id}_class.txt` and `{id}_asset.txt`. Suffixes are matched longest-first; unmatched names are ignored.

Suffix-shaped company ids are inherently ambiguous. For example, `acme_asset.pt` could mean SKU model for company `acme_asset` or Asset model for company `acme`; longest-suffix matching resolves it as Asset for `acme`. Likewise `acme_rack.pt` and `acme_obj.pt` resolve to Rack and Object for `acme`. To represent a company whose id ends with one of those suffixes, the blob naming convention needs an additional discriminator; this phase does not invent one.

The first observed file is V0. A later sync creates one new version when last-modified differs from the stored observation. Multiple upstream changes between observations collapse to one version. Missing files retain their versions and are marked removed from storage; if they return, the next observed change creates a version and clears that state.

## Tenant precedence

For a company id present in both a Brand tenant and a General tenant, the Brand row is the visible live row. Missing files in that selected Brand tenant are rendered as “Not present”; the General tenant is not used as fallback. If multiple active Brand tenants contain the same company id, the lowest tenant id wins deterministically; the PRD does not define this case.

## Scheduler and backups

Each worker starts a lightweight scheduler loop. A persistent lease allows only one worker to perform a run at a time, including forced sync, and a heartbeat renews the lease. At startup, the loop immediately checks for tenants with no successful sync or a last successful sync at least 24 hours old, then checks once a minute. Tenant failures do not discard the last successful data and do not stop other tenants from syncing.

Back up `/data/auth.sqlite3` through the deployment’s persistent-volume backup process. Losing that file loses the model history and IR-entered fields even if the blobs remain available.
