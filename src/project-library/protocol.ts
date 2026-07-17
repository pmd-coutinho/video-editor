import type { ProjectDocument } from '../editor-core'

export type StoragePersistence = 'durable' | 'best-effort'

export type ProjectLibraryErrorCode =
  | 'DATABASE_WRITE_FAILED'
  | 'PROJECT_DOCUMENT_UNSUPPORTED'
  | 'PROJECT_NOT_FOUND'
  | 'PROJECT_PACKAGE_INVALID'
  | 'SQLITE_INITIALIZATION_FAILED'
  | 'SQLITE_INTEGRITY_FAILED'
  | 'SQLITE_MIGRATION_FAILED'
  | 'STORAGE_QUOTA_UNSAFE'
  | 'STORAGE_UNAVAILABLE'

export interface ProjectCatalogEntry {
  readonly id: string
  readonly title: string
  readonly revision: number
  readonly updatedAt: number
}

export interface StoredProject extends ProjectCatalogEntry {
  readonly document: ProjectDocument
  readonly persistence: StoragePersistence
}

export interface ProjectPackage {
  readonly format: 'frameforge-project-package'
  readonly schemaVersion: 1
  readonly document: ProjectDocument
  readonly metadata: {
    readonly exportedAt: string
  }
}

export type ProjectLibraryRequest =
  | {
      readonly id: number
      readonly type: 'initialize'
      readonly persistence: StoragePersistence
    }
  | { readonly id: number; readonly type: 'list-projects' }
  | {
      readonly id: number
      readonly type: 'import-project-package'
      readonly packageText: string
    }
  | {
      readonly id: number
      readonly type: 'get-project'
      readonly projectId: string
    }

export type ProjectLibraryResponse =
  | { readonly id: number; readonly type: 'result'; readonly result: unknown }
  | {
      readonly id: number
      readonly type: 'error'
      readonly error: {
        readonly code: ProjectLibraryErrorCode
        readonly message: string
      }
    }
