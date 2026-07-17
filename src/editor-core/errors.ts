export type EditorErrorCode =
  | 'EMPTY_TIMELINE'
  | 'INVALID_PROJECT'
  | 'INVALID_TIMECODE'
  | 'INVALID_TIME'
  | 'TIME_OVERFLOW'

export class EditorError extends Error {
  readonly code: EditorErrorCode
  readonly context: Readonly<Record<string, unknown>>

  constructor(
    code: EditorErrorCode,
    context: Readonly<Record<string, unknown>> = {},
  ) {
    super(code)
    this.name = 'EditorError'
    this.code = code
    this.context = context
  }
}
