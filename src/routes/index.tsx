import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import {
  Clapperboard,
  FolderOpen,
  Keyboard,
  Monitor,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Upload,
} from 'lucide-react'
import type {
  ProjectCatalogEntry,
  StoragePersistence,
} from '../project-library/protocol'
import {
  currentStoragePersistence,
  requestStoragePersistence,
} from '../project-library/client'
import { getProjectLibrary } from '../project-library/runtime'
import { userMessageFor } from '../user-messages'

export const Route = createFileRoute('/')({ component: ProjectLibrary })

function ProjectLibrary() {
  const [projects, setProjects] = useState<readonly ProjectCatalogEntry[]>([])
  const [persistence, setPersistence] =
    useState<StoragePersistence>('best-effort')
  const [error, setError] = useState<string | undefined>()

  useEffect(() => {
    let active = true
    const library = getProjectLibrary()
    void currentStoragePersistence()
      .then((storagePersistence) => library.initialize(storagePersistence))
      .then(async (initialization) => {
        const projects = await library.listProjects()
        if (active) {
          setPersistence(initialization.persistence)
          setProjects(projects)
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setError(userMessageFor(error))
        }
      })
    return () => {
      active = false
    }
  }, [])

  async function importProject(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file === undefined) {
      return
    }

    try {
      setError(undefined)
      const library = getProjectLibrary()
      const storagePersistence = await requestStoragePersistence()
      const initialization = await library.initialize(storagePersistence)
      const project = await library.importProjectPackage(await file.text())
      setPersistence(initialization.persistence)
      setProjects((projects) => [project, ...projects])
    } catch (error) {
      setError(userMessageFor(error))
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
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
        <div className="topbar-actions">
          <button
            className="icon-button"
            type="button"
            aria-label="Keyboard shortcuts"
          >
            <Keyboard size={17} />
          </button>
          <button className="icon-button" type="button" aria-label="Settings">
            <Settings2 size={17} />
          </button>
          <span className="profile-chip" aria-label="Local profile">
            PC
          </span>
        </div>
      </header>

      <div className="workspace">
        <aside className="sidebar" aria-label="Project library navigation">
          <div className="sidebar-label">Library</div>
          <a className="nav-link nav-link-current" href="/" aria-current="page">
            <FolderOpen size={17} />
            Projects
          </a>
          <div className="sidebar-footnote">
            <Sparkles size={15} />
            Projects stay in this browser.
          </div>
        </aside>

        <section className="library" aria-labelledby="projects-heading">
          <div className="compact-notice" role="status">
            <Monitor size={18} aria-hidden="true" />
            <div>
              <strong>Made for the desktop editor.</strong>
              <span> Your project library is still available here.</span>
            </div>
          </div>

          <div className="library-heading">
            <div>
              <p className="eyebrow">Local workspace</p>
              <h1 id="projects-heading">Projects</h1>
              <p className="subtitle">
                Start something new or return to a recent cut.
              </p>
            </div>
            <div className="library-actions">
              <label className="import-project-button">
                <Upload size={17} strokeWidth={2.5} />
                Import project package
                <input
                  className="sr-only"
                  type="file"
                  accept=".video-project.json,application/json"
                  aria-label="Import project package"
                  onChange={importProject}
                />
              </label>
              <button className="new-project-button" type="button">
                <Plus size={18} strokeWidth={2.5} />
                New project
              </button>
            </div>
          </div>

          <div className="library-tools">
            <label className="search-field">
              <Search size={17} aria-hidden="true" />
              <span className="sr-only">Search projects</span>
              <input type="search" placeholder="Search projects" />
            </label>
            <span className="project-count">
              {projects.length} {projects.length === 1 ? 'project' : 'projects'}
            </span>
          </div>

          {error === undefined ? null : (
            <p className="library-error" role="alert">
              {error}
            </p>
          )}
          {persistence === 'best-effort' && projects.length > 0 ? (
            <p className="storage-warning" role="status">
              Browser storage is best-effort. Export a project package backup
              regularly.
            </p>
          ) : null}
          {projects.length === 0 ? (
            <section
              className="empty-library"
              aria-label="Empty project library"
            >
              <div className="empty-icon" aria-hidden="true">
                <Clapperboard size={27} strokeWidth={1.75} />
              </div>
              <p className="eyebrow">Your local library</p>
              <h2>No projects yet</h2>
              <p>
                Create a project to begin shaping a story, one frame at a time.
              </p>
              <button className="empty-action" type="button">
                <Plus size={17} strokeWidth={2.5} />
                Create your first project
              </button>
            </section>
          ) : (
            <section className="project-list" aria-label="Recent projects">
              {projects.map((project) => (
                <a
                  className="project-card"
                  href={`/projects/${project.id}`}
                  key={project.id}
                >
                  <Clapperboard size={20} aria-hidden="true" />
                  <span>{project.title}</span>
                  <small>Saved locally</small>
                </a>
              ))}
            </section>
          )}
        </section>
      </div>
    </main>
  )
}
