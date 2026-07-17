# ADR 0002: SQLite Project Library Ownership

## Status

Accepted

## Context

Project documents must survive reloads in the local browser profile without
making React state, media handles, or disposable artifacts competing sources of
editorial truth. SQLite requires synchronous OPFS access and must not block the
application UI while it performs durable writes or migrations.

## Decision

One application-owned module worker owns the single SQLite connection. It uses
the official `@sqlite.org/sqlite-wasm` ES module directly, installs the
`opfs-sahpool` VFS with its default six-file pool, and does not use SQLite's
deprecated Worker1 API. The worker enables foreign keys, rollback journaling,
and `synchronous=FULL`; it runs ordered transactional migrations followed by
`quick_check` before accepting requests.

Schema version is stored in `PRAGMA user_version`. The first schema contains
`projects`, `project_checkpoints`, and `asset_capabilities`. Project imports
validate a portable package and its document before one transaction creates a
new local project identity, catalog projection, offline asset-capability rows,
and checkpoint.

The versioned project document JSON is canonical for the project title and all
editorial content. `projects.title`, revision, and update time are transactional
catalog projections for listing only. They may be rebuilt from a validated
canonical document. Asset capability rows only reference opaque browser-handle
keys; media files and handles are never stored in the document or SQLite.

## Consequences

The UI communicates with persistence through an application-owned typed worker
protocol. Browser storage persistence is requested before the first import; a
denial is visible as best-effort storage, while unsafe quota and write failures
remain typed errors. A project opened without an asset capability is a normal
offline-media state rather than a damaged project.
