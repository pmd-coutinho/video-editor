import { EditorError } from './editor-core/errors'
import { ProjectLibraryError } from './project-library/client'

export function userMessageFor(error: unknown): string {
  if (!(error instanceof EditorError)) {
    if (!(error instanceof ProjectLibraryError)) {
      return 'The editor could not complete that operation.'
    }

    switch (error.code) {
      case 'DATABASE_WRITE_FAILED':
        return 'The project could not be saved locally. Check browser storage and try again.'
      case 'PROJECT_DOCUMENT_UNSUPPORTED':
        return 'This project was created by a newer version of Frameforge.'
      case 'PROJECT_NOT_FOUND':
        return 'This project is not available in this browser profile.'
      case 'PROJECT_PACKAGE_INVALID':
        return 'Choose a valid .video-project.json package.'
      case 'SQLITE_INITIALIZATION_FAILED':
        return 'The local project library could not be opened.'
      case 'SQLITE_INTEGRITY_FAILED':
        return 'The local project library needs recovery before it can be used.'
      case 'SQLITE_MIGRATION_FAILED':
        return 'The local project library could not be upgraded safely.'
      case 'STORAGE_QUOTA_UNSAFE':
        return 'There is not enough browser storage available to safely import a project.'
      case 'STORAGE_UNAVAILABLE':
        return 'This browser cannot provide local project storage.'
    }
  }

  switch (error.code) {
    case 'EMPTY_TIMELINE':
      return 'Add media to the timeline before exporting.'
    case 'INVALID_PROJECT':
      return 'This project contains an invalid edit.'
    case 'INVALID_TIMECODE':
      return 'Enter timecode as HH:MM:SS:FF at 30 frames per second.'
    case 'INVALID_TIME':
      return 'Enter a valid exact time value.'
    case 'TIME_OVERFLOW':
      return 'That edit exceeds the supported timeline range.'
  }
}
