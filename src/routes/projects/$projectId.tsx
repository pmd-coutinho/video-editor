import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Clapperboard, FolderOpen, WifiOff } from 'lucide-react'
import {
  currentStoragePersistence,
  ProjectLibraryError,
} from '../../project-library/client'
import type { StoredProject } from '../../project-library/protocol'
import { getProjectLibrary } from '../../project-library/runtime'
import { userMessageFor } from '../../user-messages'

export const Route = createFileRoute('/projects/$projectId')({
  component: ProjectEditor,
})

function ProjectEditor() {
  const { projectId } = Route.useParams()
  const [project, setProject] = useState<StoredProject | undefined>()
  const [error, setError] = useState<ProjectLibraryError | undefined>()

  useEffect(() => {
    let active = true
    const library = getProjectLibrary()
    void currentStoragePersistence()
      .then((storagePersistence) => library.initialize(storagePersistence))
      .then(() => library.getProject(projectId))
      .then((project) => {
        if (active) {
          setProject(project)
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setError(
            error instanceof ProjectLibraryError
              ? error
              : new ProjectLibraryError(
                  'SQLITE_INITIALIZATION_FAILED',
                  userMessageFor(error),
                ),
          )
        }
      })
    return () => {
      active = false
    }
  }, [projectId])

  if (error !== undefined) {
    return (
      <main className="editor-state" aria-labelledby="project-state-heading">
        <div className="editor-state-icon" aria-hidden="true">
          <FolderOpen size={28} />
        </div>
        <p className="eyebrow">Local project library</p>
        <h1 id="project-state-heading">
          {error.code === 'PROJECT_NOT_FOUND'
            ? 'Project not found'
            : 'Project unavailable'}
        </h1>
        <p>{userMessageFor(error)}</p>
        <a className="empty-action" href="/">
          Return to projects
        </a>
      </main>
    )
  }

  if (project === undefined) {
    return (
      <main className="editor-state" aria-live="polite">
        Loading local project...
      </main>
    )
  }

  return (
    <main className="editor-shell">
      <header className="editor-topbar">
        <a
          className="wordmark"
          href="/"
          aria-label="Frameforge project library"
        >
          <span className="wordmark-mark" aria-hidden="true">
            <Clapperboard size={18} strokeWidth={2.25} />
          </span>
          <span>Frameforge</span>
        </a>
        <span className="saved-state">Saved locally</span>
      </header>
      <section className="offline-editor" aria-labelledby="project-title">
        <p className="eyebrow">Offline editor state</p>
        <h1 id="project-title">{project.document.title}</h1>
        <div className="offline-media-state">
          <WifiOff size={22} aria-hidden="true" />
          <div>
            <strong>Media offline</strong>
            <p>
              {project.document.assets.map((asset) => asset.name).join(', ')}{' '}
              remains linked to its original location. Reconnect Media to
              preview it.
            </p>
          </div>
        </div>
      </section>
    </main>
  )
}
