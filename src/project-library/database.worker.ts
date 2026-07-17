import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
import type { Database } from '@sqlite.org/sqlite-wasm'
import { validateProject } from '../editor-core'
import type { ProjectDocument } from '../editor-core'
import type {
  ProjectCatalogEntry,
  ProjectLibraryErrorCode,
  ProjectLibraryRequest,
  ProjectLibraryResponse,
  ProjectPackage,
  StoragePersistence,
  StoredProject,
} from './protocol'

const SQL_SCHEMA_VERSION = 1

let database: Database | undefined
let startup: Promise<void> | undefined
let storagePersistence: StoragePersistence = 'best-effort'

self.onmessage = (event: MessageEvent<ProjectLibraryRequest>) => {
  void handleMessage(event.data)
}

async function handleMessage(request: ProjectLibraryRequest): Promise<void> {
  try {
    const result = await dispatch(request)
    respond({ id: request.id, type: 'result', result })
  } catch (error) {
    respond({ id: request.id, type: 'error', error: serializeError(error) })
  }
}

async function dispatch(request: ProjectLibraryRequest): Promise<unknown> {
  switch (request.type) {
    case 'initialize':
      storagePersistence = request.persistence
      await initialize()
      return { persistence: storagePersistence }
    case 'list-projects':
      await initialize()
      return listProjects()
    case 'import-project-package':
      await initialize()
      return importProjectPackage(request.packageText)
    case 'get-project':
      await initialize()
      return getProject(request.projectId)
  }
}

async function initialize(): Promise<void> {
  startup ??= initializeDatabase()
  return startup
}

async function initializeDatabase(): Promise<void> {
  try {
    const sqlite3 = await sqlite3InitModule()
    const sahPool = await sqlite3.installOpfsSAHPoolVfs({
      initialCapacity: 6,
    })
    database = new sahPool.OpfsSAHPoolDb('/frameforge-project-library.sqlite3')
    database.exec('PRAGMA foreign_keys = ON;')
    database.exec('PRAGMA journal_mode = DELETE;')
    database.exec('PRAGMA synchronous = FULL;')
    applyMigrations(database)

    if (database.selectValue('PRAGMA quick_check') !== 'ok') {
      throw new WorkerProjectLibraryError(
        'SQLITE_INTEGRITY_FAILED',
        'The local project library did not pass its integrity check.',
      )
    }
  } catch (error) {
    if (error instanceof WorkerProjectLibraryError) {
      throw error
    }
    throw new WorkerProjectLibraryError(
      'SQLITE_INITIALIZATION_FAILED',
      'The local project library could not be opened.',
    )
  }
}

function applyMigrations(db: Database): void {
  const version = Number(db.selectValue('PRAGMA user_version'))
  if (!Number.isSafeInteger(version) || version < 0) {
    throw new WorkerProjectLibraryError(
      'SQLITE_MIGRATION_FAILED',
      'The local project library has an invalid schema version.',
    )
  }
  if (version > SQL_SCHEMA_VERSION) {
    throw new WorkerProjectLibraryError(
      'SQLITE_MIGRATION_FAILED',
      'This browser has an older project library schema.',
    )
  }

  try {
    db.transaction(() => {
      if (version === 0) {
        db.exec(`
          CREATE TABLE projects (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            revision INTEGER NOT NULL,
            document_json TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          );
          CREATE TABLE project_checkpoints (
            project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            revision INTEGER NOT NULL,
            document_json TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            PRIMARY KEY (project_id, revision)
          );
          CREATE TABLE asset_capabilities (
            project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            asset_id TEXT NOT NULL,
            handle_key TEXT,
            PRIMARY KEY (project_id, asset_id)
          );
          CREATE INDEX projects_recently_updated ON projects(updated_at DESC);
          PRAGMA user_version = 1;
        `)
      }
    })
  } catch {
    throw new WorkerProjectLibraryError(
      'SQLITE_MIGRATION_FAILED',
      'The local project library could not be upgraded safely.',
    )
  }
}

function listProjects(): readonly ProjectCatalogEntry[] {
  const rows = requireDatabase().selectObjects(
    'SELECT id, title, revision, updated_at FROM projects ORDER BY updated_at DESC, id ASC',
  )
  return rows.map(toCatalogEntry)
}

function importProjectPackage(packageText: string): ProjectCatalogEntry {
  const importedDocument = parseProjectPackage(packageText)
  const id = crypto.randomUUID()
  const title = uniqueTitle(importedDocument.title)
  const document = validateProject({
    ...importedDocument,
    id,
    title,
    revision: 0,
  })
  const now = Date.now()
  const entry: ProjectCatalogEntry = {
    id,
    title,
    revision: document.revision,
    updatedAt: now,
  }
  const db = requireDatabase()

  try {
    db.transaction(() => {
      db.exec({
        sql: `
          INSERT INTO projects (id, title, revision, document_json, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `,
        bind: [
          entry.id,
          entry.title,
          entry.revision,
          JSON.stringify(document),
          now,
          now,
        ],
      })
      db.exec({
        sql: `
          INSERT INTO project_checkpoints (project_id, revision, document_json, created_at)
          VALUES (?, ?, ?, ?)
        `,
        bind: [entry.id, entry.revision, JSON.stringify(document), now],
      })
      for (const asset of document.assets) {
        db.exec({
          sql: `
            INSERT INTO asset_capabilities (project_id, asset_id, handle_key)
            VALUES (?, ?, NULL)
          `,
          bind: [entry.id, asset.id],
        })
      }
      db.exec({
        sql: `
          DELETE FROM project_checkpoints
          WHERE project_id = ?
            AND revision NOT IN (
              SELECT revision
              FROM project_checkpoints
              WHERE project_id = ?
              ORDER BY revision DESC
              LIMIT 10
            )
        `,
        bind: [entry.id, entry.id],
      })
    })
  } catch {
    throw new WorkerProjectLibraryError(
      'DATABASE_WRITE_FAILED',
      'The imported project could not be saved locally.',
    )
  }

  return entry
}

function getProject(projectId: string): StoredProject {
  const row = requireDatabase().selectObject(
    `
      SELECT id, title, revision, updated_at, document_json
      FROM projects
      WHERE id = ?
    `,
    [projectId],
  )
  if (row === undefined) {
    throw new WorkerProjectLibraryError(
      'PROJECT_NOT_FOUND',
      'This project is not available in this browser profile.',
    )
  }

  const entry = toCatalogEntry(row)
  const documentText = row.document_json
  if (typeof documentText !== 'string') {
    throw new WorkerProjectLibraryError(
      'SQLITE_INTEGRITY_FAILED',
      'The local project document is damaged.',
    )
  }

  let parsedDocument: unknown
  try {
    parsedDocument = JSON.parse(documentText)
  } catch {
    throw new WorkerProjectLibraryError(
      'SQLITE_INTEGRITY_FAILED',
      'The local project document is invalid.',
    )
  }

  if (isNewerDocument(parsedDocument)) {
    throw new WorkerProjectLibraryError(
      'PROJECT_DOCUMENT_UNSUPPORTED',
      'This project was created by a newer version of Frameforge.',
    )
  }

  try {
    const document = validateProject(parsedDocument)
    if (document.id !== entry.id) {
      throw new WorkerProjectLibraryError(
        'SQLITE_INTEGRITY_FAILED',
        'The local project document does not match its catalog entry.',
      )
    }
    return {
      ...entry,
      title: document.title,
      revision: document.revision,
      document,
      persistence: storagePersistence,
    }
  } catch (error) {
    if (error instanceof WorkerProjectLibraryError) {
      throw error
    }
    throw new WorkerProjectLibraryError(
      'SQLITE_INTEGRITY_FAILED',
      'The local project document is invalid.',
    )
  }
}

function parseProjectPackage(packageText: string): ProjectDocument {
  let parsed: unknown
  try {
    parsed = JSON.parse(packageText)
  } catch {
    throw new WorkerProjectLibraryError(
      'PROJECT_PACKAGE_INVALID',
      'Choose a valid .video-project.json package.',
    )
  }

  if (!isProjectPackage(parsed)) {
    throw new WorkerProjectLibraryError(
      'PROJECT_PACKAGE_INVALID',
      'Choose a valid .video-project.json package.',
    )
  }
  if (parsed.schemaVersion > 1 || isNewerDocument(parsed.document)) {
    throw new WorkerProjectLibraryError(
      'PROJECT_DOCUMENT_UNSUPPORTED',
      'This project package was created by a newer version of Frameforge.',
    )
  }
  if (parsed.schemaVersion !== 1) {
    throw new WorkerProjectLibraryError(
      'PROJECT_PACKAGE_INVALID',
      'Choose a valid .video-project.json package.',
    )
  }

  try {
    return validateProject(parsed.document)
  } catch {
    throw new WorkerProjectLibraryError(
      'PROJECT_PACKAGE_INVALID',
      'Choose a valid .video-project.json package.',
    )
  }
}

function uniqueTitle(title: string): string {
  const titles = requireDatabase().selectValues(
    'SELECT title FROM projects WHERE title = ? OR title GLOB ?',
    [title, `${title} (*)`],
  )
  const existingTitles = new Set(
    titles.filter((value): value is string => typeof value === 'string'),
  )
  if (!existingTitles.has(title)) {
    return title
  }

  let suffix = 2
  while (existingTitles.has(`${title} (${suffix})`)) {
    suffix += 1
  }
  return `${title} (${suffix})`
}

function requireDatabase(): Database {
  if (database === undefined) {
    throw new WorkerProjectLibraryError(
      'SQLITE_INITIALIZATION_FAILED',
      'The local project library is not ready.',
    )
  }
  return database
}

function isProjectPackage(value: unknown): value is ProjectPackage {
  if (!isRecord(value) || value.format !== 'frameforge-project-package') {
    return false
  }
  return (
    typeof value.schemaVersion === 'number' &&
    isRecord(value.metadata) &&
    typeof value.metadata.exportedAt === 'string' &&
    'document' in value
  )
}

function isNewerDocument(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.schemaVersion === 'number' &&
    value.schemaVersion > 1
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function toCatalogEntry(row: Record<string, unknown>): ProjectCatalogEntry {
  if (
    typeof row.id !== 'string' ||
    typeof row.title !== 'string' ||
    typeof row.revision !== 'number' ||
    typeof row.updated_at !== 'number'
  ) {
    throw new WorkerProjectLibraryError(
      'SQLITE_INTEGRITY_FAILED',
      'The local project catalog is damaged.',
    )
  }
  return {
    id: row.id,
    title: row.title,
    revision: row.revision,
    updatedAt: row.updated_at,
  }
}

function respond(response: ProjectLibraryResponse): void {
  self.postMessage(response)
}

function serializeError(error: unknown): {
  code: ProjectLibraryErrorCode
  message: string
} {
  if (error instanceof WorkerProjectLibraryError) {
    return { code: error.code, message: error.message }
  }
  return {
    code: 'SQLITE_INITIALIZATION_FAILED',
    message: 'The local project library could not complete that operation.',
  }
}

class WorkerProjectLibraryError extends Error {
  constructor(
    readonly code: ProjectLibraryErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'WorkerProjectLibraryError'
  }
}
