import { describe, expect, it } from 'vitest'

import { createProjectLibraryClient, ProjectLibraryError } from './client'

describe('project library client', () => {
  it('exposes worker initialization and package import through its public API', async () => {
    const worker = new WorkerDouble((message) => {
      if (message.type === 'initialize') {
        worker.respond(message.id, {
          persistence: 'best-effort',
        })
      }
      if (message.type === 'import-project-package') {
        worker.respond(message.id, {
          id: 'local-project-1',
          title: 'Imported cut',
          revision: 0,
          updatedAt: 1_746_000_000_000,
        })
      }
    })
    const library = createProjectLibraryClient(worker)

    await expect(library.initialize()).resolves.toEqual({
      persistence: 'best-effort',
    })
    await expect(
      library.importProjectPackage('{"format":"test"}'),
    ).resolves.toEqual({
      id: 'local-project-1',
      title: 'Imported cut',
      revision: 0,
      updatedAt: 1_746_000_000_000,
    })
  })

  it('preserves typed worker failures at the public API boundary', async () => {
    const worker = new WorkerDouble((message) => {
      worker.reject(message.id, {
        code: 'PROJECT_PACKAGE_INVALID',
        message: 'The package is not valid JSON.',
      })
    })
    const library = createProjectLibraryClient(worker)

    await expect(library.importProjectPackage('not json')).rejects.toEqual(
      expect.objectContaining<Partial<ProjectLibraryError>>({
        code: 'PROJECT_PACKAGE_INVALID',
      }),
    )
  })
})

type RequestMessage = { readonly id: number; readonly type: string }

class WorkerDouble {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null

  constructor(private readonly onRequest: (message: RequestMessage) => void) {}

  postMessage(message: RequestMessage): void {
    this.onRequest(message)
  }

  terminate(): void {}

  respond(id: number, result: unknown): void {
    this.onmessage?.({ data: { type: 'result', id, result } } as MessageEvent)
  }

  reject(id: number, error: unknown): void {
    this.onmessage?.({ data: { type: 'error', id, error } } as MessageEvent)
  }
}
