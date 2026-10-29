# Typocket

Typocket is the reading, editing and organizing surface for a local Markdown tree inside DSH. The filesystem is the source of truth; the interface is a view over it.

## Product boundary

- The product is local-first. It is not a cloud notebook, team workspace or publishing service.
- Do not add public sharing, guest links, share scopes, cloud publishing or an Agent access token UI. Legacy backend routes may remain for compatibility, but they are not product surfaces.
- Export is the delivery path: Markdown source, self-contained HTML, or print / PDF. Do not turn export into a share system.
- Agents read and write the same local files as the user. Do not add permission or token setup for local agents; `READER_URL` and `READER_TOKEN` are not required for local work.

## Knowledge base files

- The content root is `DOCS_ROOT` (the DSH plugin may use `DSH_READER_DATA_DIR`). Defaults: macOS `~/Library/Application Support/Reader/知识库`; Windows `%APPDATA%/Reader/知识库`; Linux `${XDG_DATA_HOME:-~/.local/share}/Reader/知识库`.
- A top-level folder is a library; nested folders are categories; `.md` files are documents. PDF and HTML files are read-only previews.
- `.reader/` at the content root is internal state: `state.sqlite`, versions, assets, runtime and operation logs. Do not edit it by hand.
- Images are stored under `.reader/assets/` and referenced from Markdown. Moving or deleting an asset directly can break a document.
- Document identity, revisions, page metadata and history are tracked by the service. Renames and moves should go through the app or API so stable IDs and old-path aliases stay intact.

## Editing rules

- Read the current file before writing. Preserve frontmatter, heading levels, table formatting, code fences, custom blocks and line endings.
- Make the smallest diff that solves the task. Do not reformat or normalize the whole document.
- Do not rewrite IDs, metadata, caches, generated files or `.reader/` state.
- Do not delete assets, folders or documents unless the user explicitly asked; use the app's trash flow when available.
- If concurrent edits are possible, re-read on conflict. Never force-overwrite the other version.
- When the local service is running, prefer its HTTP API so revision checks, history and `Agent 改动` keep working. Direct filesystem writes bypass them.
- Key API shapes: `GET /api/tree`, `GET /api/doc?path=...`, `PUT /api/doc` with the `revision` returned by the read, `GET /api/metadata`, `PUT /api/metadata`, `GET /api/search`, `POST /api/asset`.
- After structural changes, rescan through the app or restart the service. Do not hand-edit the index to fake a rescan.

## Development constraints

- Use isolated test data for development and verification. Never modify user content or deploy to an existing service as a side effect.
- Keep public documentation focused on installation, usage and contributor guidance. Personal deployment notes and agent handoff logs belong outside the repository.
- Do not use the middle-dot separator in product copy.
- Do not add horizontal application dividers. Use spacing, grouping, restrained background contrast and typography. User-authored document rules and content tables are not application chrome.
- Do not add permanent explanatory copy to compensate for unclear controls. State necessary errors and outcomes concisely.
- Improve editing capabilities directly. Do not add a document-wide source-mode switch as a workaround for unsupported rich content. Preserve user data while implementing actual support.
- Verify nested controls with real editing, save, reopen and narrow-viewport flows. A component existing or a build passing does not establish usability.
- Library switching and full library management have distinct jobs; keep both. Drafts are an initial default library, not a reserved or undeletable system object.
- Floating surfaces follow `docs/design/SURFACES.md`. Reuse its levels rather than inventing per-component borders and shadows.

## Current design phase

- Adds no feature proposals. Reduce visual and interaction complexity across existing screens.
- Keep low-frequency recovery tools behind More, with no cross-task tabs.
- Use restrained density and consistent functional icons, while preserving the Typocket brand icon.

## Verification

- Run `npm run typecheck`, `npm run check`, `npm run build` and `npm run regression`.
- Use temporary content roots for browser or service checks.
- Test real edit, save, reopen and narrow-viewport flows; a passing build is not usability proof.
