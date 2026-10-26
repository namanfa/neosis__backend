# Accuracy Report

## Temporary storage and cleanup registration

The report reuses the owner-bound `tool_sessions` table and the existing session directory. The idempotent auth-store migration adds `tool_sessions.session_type TEXT NOT NULL DEFAULT 'tool'`; Accuracy Report sessions use `session_type='accuracy_report'`. Their directory also contains `accuracy_report/cleanup-tag.json`. Phase 5 cleanup can locate the report sessions by either marker and remove their uploads and preview data at the same 24-hour retention point as other temporary sessions. Generated document bytes used during Google upload live in an OS temporary directory and are removed in a `finally` block. The generated Google Doc belongs to the user in Drive and is not deleted by Neosis cleanup.

The current deployment README cleanup example uses a 2,880-minute (48-hour) age. The Accuracy Report PRD requires 24 hours. Phase 5 must change the cleanup policy to 1,440 minutes and remove the corresponding `tool_sessions` ownership row when it deletes a session directory. The Phase 4 marker is in place; Phase 4 does not install a cleanup scheduler.

## Workbook and image rules

Excel input is `.xlsx`, at most 20 MiB. Images are JPEG, PNG or WebP; BMP is not accepted. Defaults are at most 200 image uploads, 15 MiB per file, 512 MiB aggregate, resize maximum 1,600 pixels on the longest edge and JPEG quality 82. Environment variables are `ACCURACY_REPORT_MAX_IMAGES`, `ACCURACY_REPORT_MAX_IMAGE_BYTES`, `ACCURACY_REPORT_MAX_UPLOAD_BYTES`, `ACCURACY_REPORT_MAX_IMAGE_DIMENSION`, and `ACCURACY_REPORT_JPEG_QUALITY`. Values are clamped to conservative ranges in code. Originals remain in the owned session; EXIF correction and compression happen into a temporary generation directory.

For Format 2, row 1 contains column headers and the first data row is row 2. Images match `image_{row_number}` independent of extension. A repeated row number is skipped as a duplicate. Natural numeric order is used for Format 1. Invalid JSON or invalid SKU records are flagged and are never evaluated as code. A valid empty JSON list remains a valid zero-detection row. Neosis computes only the specified sums of Detected and Available (the latter is initially copied from Detected); it does not calculate Accuracy, Incorrect or Missing.

## Google document creation and privacy

The existing Google OAuth client and callback are reused. At Generate, a popup requests OpenID identity plus the narrow `drive.file` scope. A PKCE-bound OAuth state is stored in the existing short-lived OAuth transaction table. The callback confirms the Google account matches the signed-in Neosis user, then sends the access token to the opener with same-origin `postMessage`. The token is not stored in SQLite, cookies, logs, report files, or a long-lived browser store; the frontend uses it for the one generation request. Downloading the current DOCX requires a fresh request-time consent and exports the live Doc so user edits are reflected.

Neosis builds a DOCX with standard-library ZIP/XML support and uploads it through Drive's resumable `files.create` flow with the Google Docs MIME type. Drive imports Microsoft Word documents into Google Docs. Since converted Google Docs have a 50 MB import limit, the report generator re-compresses images if needed to keep the DOCX under a 45 MiB guardrail. The request uses the authenticated user's token and sets `ignoreDefaultVisibility=true`; Neosis never hosts images at public URLs or creates a sharing permission. This avoids the public-image-fetch approach, which is unsuitable for field photos containing store addresses.

The DOCX download exports the live document so it includes user edits. Drive's direct `files.export` response has a 10 MB limit; the download route instead uses Drive's long-running `files.download` operation for larger exports. The user gives a fresh request-time consent for the download and the token is discarded after that request.

Google Workspace documentation confirms that DOCX is an importable source for Google Docs, `drive.file` is a non-sensitive per-file scope that can create files, and Drive's resumable uploads and long-running download operations support large media and exports. See [Drive upload and import formats](https://developers.google.com/workspace/drive/api/guides/manage-uploads), [Drive import formats and API limits](https://developers.google.com/workspace/drive/api/guides/limits), [Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth), [Drive long-running downloads](https://developers.google.com/workspace/drive/api/guides/long-running-operations), and [Google Drive file size limits](https://support.google.com/drive/answer/37603?hl=en).

The Google Cloud project must have the Drive API enabled and `drive.file` declared in its consent-screen configuration. The same redirect URI already configured for Neosis sign-in is used for the incremental consent round trip.

## Routes

- `POST /api/accuracy-report/sessions` creates an owned, tagged temporary session.
- `POST /api/accuracy-report/sessions/{id}/workbook` stores and inspects an `.xlsx` file.
- `GET /api/accuracy-report/sessions/{id}/worksheets` returns actual worksheet names and headers.
- `POST /api/accuracy-report/sessions/{id}/images` validates and stores image uploads.
- `POST /api/accuracy-report/sessions/{id}/validate` maps files, parses predictions, and returns the pre-generation summary.
- `GET /api/accuracy-report/sessions/{id}/images/{key}` serves an authenticated owner's preview image only.
- `GET /api/accuracy-report/google/authorize?session_id=...` begins incremental Google consent.
- `POST /api/accuracy-report/sessions/{id}/generate` streams progress and creates the user's Google Doc.
- `POST /api/accuracy-report/sessions/{id}/download` exports the current Doc as DOCX using a request-time access token.
