import { EditorError } from './editor-core/errors'

export function userMessageFor(error: unknown): string {
  if (!(error instanceof EditorError)) {
    return 'The editor could not complete that operation.'
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
