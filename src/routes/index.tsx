import { createFileRoute } from '@tanstack/react-router'
import {
  Clapperboard,
  FolderOpen,
  Keyboard,
  Monitor,
  Plus,
  Search,
  Settings2,
  Sparkles,
} from 'lucide-react'

export const Route = createFileRoute('/')({ component: ProjectLibrary })

function ProjectLibrary() {
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
            <button className="new-project-button" type="button">
              <Plus size={18} strokeWidth={2.5} />
              New project
            </button>
          </div>

          <div className="library-tools">
            <label className="search-field">
              <Search size={17} aria-hidden="true" />
              <span className="sr-only">Search projects</span>
              <input type="search" placeholder="Search projects" />
            </label>
            <span className="project-count">0 projects</span>
          </div>

          <section className="empty-library" aria-label="Empty project library">
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
        </section>
      </div>
    </main>
  )
}
