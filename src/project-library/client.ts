import type {
  ProjectCatalogEntry,
  ProjectLibraryErrorCode,
  ProjectLibraryRequest,
  ProjectLibraryResponse,
  StoragePersistence,
  StoredProject,
} from './protocol'

export type { ProjectLibraryErrorCode } from './protocol'

export class ProjectLibraryError extends Error {
  readonly code: ProjectLibraryErrorCode

  constructor(code: ProjectLibraryErrorCode, message: string) {
    super(message)
    this.name = 'ProjectLibraryError'
    this.code = code
  }
}

interface WorkerPort {
  onmessage: ((event: MessageEvent<ProjectLibraryResponse>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
  postMessage(message: ProjectLibraryRequest): void
  terminate(): void
}

interface PendingRequest {
  readonly resolve: (result: unknown) => void
  readonly reject: (error: ProjectLibraryError) => void
}

export class ProjectLibraryClient {
  private nextRequestId = 1
  private readonly pending = new Map<number, PendingRequest>()

  constructor(private readonly worker: WorkerPort) {
    worker.onmessage = (event) => this.handleResponse(event.data)
    worker.onerror = () => {
      this.rejectAll(
        new ProjectLibraryError(
          'SQLITE_INITIALIZATION_FAILED',
          'The local project library stopped unexpectedly.',
        ),
      )
    }
  }

  initialize(
    persistence: StoragePersistence = 'best-effort',
  ): Promise<{ readonly persistence: StoragePersistence }> {
    return this.request('initialize', { persistence })
  }

  listProjects(): Promise<readonly ProjectCatalogEntry[]> {
    return this.request('list-projects', {})
  }

  importProjectPackage(packageText: string): Promise<ProjectCatalogEntry> {
    return this.request('import-project-package', { packageText })
  }

  getProject(projectId: string): Promise<StoredProject> {
    return this.request('get-project', { projectId })
  }

  close(): void {
    this.worker.terminate()
    this.rejectAll(
      new ProjectLibraryError(
        'SQLITE_INITIALIZATION_FAILED',
        'The local project library was closed.',
      ),
    )
  }

  private request<T>(
    type: ProjectLibraryRequest['type'],
    payload: Omit<ProjectLibraryRequest, 'id' | 'type'>,
  ): Promise<T> {
    const id = this.nextRequestId
    this.nextRequestId += 1

    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (result) => resolve(result as T),
        reject,
      })
      this.worker.postMessage({ id, type, ...payload } as ProjectLibraryRequest)
    })
  }

  private handleResponse(response: ProjectLibraryResponse): void {
    const pending = this.pending.get(response.id)
    if (pending === undefined) {
      return
    }
    this.pending.delete(response.id)

    if (response.type === 'result') {
      pending.resolve(response.result)
      return
    }
    pending.reject(
      new ProjectLibraryError(response.error.code, response.error.message),
    )
  }

  private rejectAll(error: ProjectLibraryError): void {
    for (const pending of this.pending.values()) {
      pending.reject(error)
    }
    this.pending.clear()
  }
}

export function createProjectLibraryClient(
  worker: WorkerPort = new Worker(
    new URL('./database.worker.ts', import.meta.url),
    { type: 'module' },
  ),
): ProjectLibraryClient {
  return new ProjectLibraryClient(worker)
}

export async function requestStoragePersistence(): Promise<StoragePersistence> {
  const storage = requireStorageManager()
  const estimate = await storage.estimate()
  if (
    estimate.quota !== undefined &&
    estimate.usage !== undefined &&
    estimate.quota - estimate.usage < 5 * 1024 * 1024
  ) {
    throw new ProjectLibraryError(
      'STORAGE_QUOTA_UNSAFE',
      'There is not enough browser storage available to safely import a project.',
    )
  }

  return (await storage.persist()) ? 'durable' : 'best-effort'
}

export async function currentStoragePersistence(): Promise<StoragePersistence> {
  return (await requireStorageManager().persisted()) ? 'durable' : 'best-effort'
}

function requireStorageManager(): StorageManager {
  if (!('storage' in navigator) || navigator.storage === undefined) {
    throw new ProjectLibraryError(
      'STORAGE_UNAVAILABLE',
      'This browser cannot provide local project storage.',
    )
  }
  return navigator.storage
}
