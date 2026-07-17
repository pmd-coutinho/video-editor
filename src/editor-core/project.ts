import { EditorError } from './errors'
import {
  addTime,
  compareTime,
  createTime,
  FRAME_DURATION,
  isNormalizedTime,
  ZERO_TIME,
} from './time'
import type { ExactTime } from './time'

export interface ProjectSettings {
  readonly width: 1080
  readonly height: 1920
  readonly frameRate: ExactTime
  readonly colorSpace: 'rec709'
  readonly audioSampleRate: 48_000
  readonly audioChannels: 2
}

export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = Object.freeze({
  width: 1080,
  height: 1920,
  frameRate: createTime(30, 1),
  colorSpace: 'rec709',
  audioSampleRate: 48_000,
  audioChannels: 2,
})

export interface VideoStream {
  readonly id: string
  readonly type: 'video'
  readonly duration: ExactTime
  readonly codec: string
  readonly width: number
  readonly height: number
}

export interface AudioStream {
  readonly id: string
  readonly type: 'audio'
  readonly duration: ExactTime
  readonly codec: string
  readonly sampleRate: number
  readonly channels: number
}

export type MediaStream = VideoStream | AudioStream

export interface MediaAsset {
  readonly id: string
  readonly name: string
  readonly source: { readonly identity: string }
  readonly streams: readonly MediaStream[]
}

interface ClipBase {
  readonly id: string
  readonly assetId: string
  readonly streamId: string
  readonly linkGroupId?: string
  readonly timelineStart: ExactTime
  readonly sourceStart: ExactTime
  readonly duration: ExactTime
}

export interface VideoClip extends ClipBase {
  readonly type: 'video'
  readonly visual: {
    readonly position: { readonly x: number; readonly y: number }
    readonly scale: number
    readonly rotation: number
    readonly opacity: number
    readonly fit: 'contain'
  }
}

export interface AudioClip extends ClipBase {
  readonly type: 'audio'
  readonly gain: number
}

export type Clip = VideoClip | AudioClip

export interface VideoTrack {
  readonly id: string
  readonly type: 'video'
  readonly clips: readonly VideoClip[]
}

export interface AudioTrack {
  readonly id: string
  readonly type: 'audio'
  readonly clips: readonly AudioClip[]
}

export type Track = VideoTrack | AudioTrack

export interface LinkGroup {
  readonly id: string
  readonly clipIds: readonly [string, string]
}

export interface ProjectDocument {
  readonly format: 'frameforge-project'
  readonly schemaVersion: 1
  readonly id: string
  readonly title: string
  readonly revision: number
  readonly settings: ProjectSettings
  readonly assets: readonly MediaAsset[]
  readonly tracks: readonly Track[]
  readonly linkGroups: readonly LinkGroup[]
}

export function validateProject(project: unknown): ProjectDocument {
  try {
    return validateProjectDocument(project as ProjectDocument)
  } catch (error) {
    if (error instanceof EditorError) {
      throw error
    }
    invalid('project', 'malformed-document')
  }
}

function validateProjectDocument(project: ProjectDocument): ProjectDocument {
  if (project.format !== 'frameforge-project' || project.schemaVersion !== 1) {
    invalid('project', 'unsupported-format')
  }

  assertId(project.id, 'project.id')
  if (project.title.trim() === '') {
    invalid('project.title', 'empty-title')
  }
  if (!Number.isSafeInteger(project.revision) || project.revision < 0) {
    invalid('project.revision', 'invalid-revision')
  }

  validateSettings(project.settings)
  assertSortedIds(project.assets, 'project.assets')

  const assets = new Map<string, MediaAsset>()
  const streams = new Map<string, MediaStream>()
  const streamIds = new Set<string>()
  for (const asset of project.assets) {
    assertId(asset.id, 'asset.id')
    assertNonEmpty(asset.name, `asset.${asset.id}.name`)
    assertNonEmpty(asset.source.identity, `asset.${asset.id}.source.identity`)
    if (assets.has(asset.id)) {
      invalid(`asset.${asset.id}`, 'duplicate-id')
    }
    assets.set(asset.id, asset)

    for (const stream of asset.streams) {
      assertId(stream.id, `asset.${asset.id}.stream.id`)
      if (streamIds.has(stream.id)) {
        invalid(`stream.${stream.id}`, 'duplicate-id')
      }
      validateStream(stream)
      streamIds.add(stream.id)
      streams.set(`${asset.id}:${stream.id}`, stream)
    }
  }

  if (
    project.tracks.length !== 2 ||
    project.tracks[0]?.type !== 'video' ||
    project.tracks[1]?.type !== 'audio'
  ) {
    invalid('project.tracks', 'video-then-audio-tracks-required')
  }

  const clips = new Map<string, Clip>()
  const trackIds = new Set<string>()
  for (const track of project.tracks) {
    assertId(track.id, 'track.id')
    if (trackIds.has(track.id)) {
      invalid(`track.${track.id}`, 'duplicate-id')
    }
    trackIds.add(track.id)
    validateTrack(track, assets, streams, clips)
  }

  assertSortedIds(project.linkGroups, 'project.linkGroups')
  for (const linkGroup of project.linkGroups) {
    validateLinkGroup(linkGroup, clips)
  }
  for (const clip of clips.values()) {
    if (
      clip.linkGroupId !== undefined &&
      !project.linkGroups.some((group) => group.id === clip.linkGroupId)
    ) {
      invalid(`clip.${clip.id}.linkGroupId`, 'missing-link-group')
    }
  }

  return project
}

export function projectDuration(project: ProjectDocument): ExactTime {
  validateProject(project)

  let duration = ZERO_TIME
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      const end = addTime(clip.timelineStart, clip.duration)
      if (compareTime(end, duration) > 0) {
        duration = end
      }
    }
  }

  return duration
}

export function assertProjectCanExport(project: ProjectDocument): void {
  if (compareTime(projectDuration(project), ZERO_TIME) === 0) {
    throw new EditorError('EMPTY_TIMELINE')
  }
}

function validateSettings(settings: ProjectSettings): void {
  if (
    settings.width !== DEFAULT_PROJECT_SETTINGS.width ||
    settings.height !== DEFAULT_PROJECT_SETTINGS.height ||
    !isNormalizedTime(settings.frameRate) ||
    compareTime(settings.frameRate, DEFAULT_PROJECT_SETTINGS.frameRate) !== 0 ||
    settings.colorSpace !== DEFAULT_PROJECT_SETTINGS.colorSpace ||
    settings.audioSampleRate !== DEFAULT_PROJECT_SETTINGS.audioSampleRate ||
    settings.audioChannels !== DEFAULT_PROJECT_SETTINGS.audioChannels
  ) {
    invalid('project.settings', 'unsupported-project-settings')
  }
}

function validateStream(stream: MediaStream): void {
  assertNonEmpty(stream.codec, `stream.${stream.id}.codec`)
  assertNonNegativeTime(stream.duration, `stream.${stream.id}.duration`)

  if (stream.type === 'video') {
    if (
      !Number.isSafeInteger(stream.width) ||
      stream.width <= 0 ||
      !Number.isSafeInteger(stream.height) ||
      stream.height <= 0
    ) {
      invalid(`stream.${stream.id}`, 'invalid-video-dimensions')
    }
    return
  }

  if (
    !Number.isSafeInteger(stream.sampleRate) ||
    stream.sampleRate <= 0 ||
    !Number.isSafeInteger(stream.channels) ||
    stream.channels <= 0
  ) {
    invalid(`stream.${stream.id}`, 'invalid-audio-format')
  }
}

function validateTrack(
  track: Track,
  assets: ReadonlyMap<string, MediaAsset>,
  streams: ReadonlyMap<string, MediaStream>,
  clips: Map<string, Clip>,
): void {
  let previousClip: Clip | undefined
  for (const clip of track.clips) {
    if (clip.type !== track.type) {
      invalid(`track.${track.id}`, 'wrong-clip-type')
    }
    if (
      previousClip !== undefined &&
      compareClipOrder(previousClip, clip) >= 0
    ) {
      invalid(`track.${track.id}.clips`, 'unstable-clip-order')
    }
    if (clips.has(clip.id)) {
      invalid(`clip.${clip.id}`, 'duplicate-id')
    }
    validateClip(clip, assets, streams)
    if (
      previousClip !== undefined &&
      compareTime(
        addTime(previousClip.timelineStart, previousClip.duration),
        clip.timelineStart,
      ) > 0
    ) {
      invalid(`track.${track.id}.clips`, 'overlap')
    }
    clips.set(clip.id, clip)
    previousClip = clip
  }
}

function validateClip(
  clip: Clip,
  assets: ReadonlyMap<string, MediaAsset>,
  streams: ReadonlyMap<string, MediaStream>,
): void {
  assertId(clip.id, 'clip.id')
  if (!assets.has(clip.assetId)) {
    invalid(`clip.${clip.id}.assetId`, 'missing-asset')
  }
  const stream = streams.get(`${clip.assetId}:${clip.streamId}`)
  if (stream === undefined || stream.type !== clip.type) {
    invalid(`clip.${clip.id}.streamId`, 'missing-or-wrong-stream')
  }

  assertNonNegativeTime(clip.timelineStart, `clip.${clip.id}.timelineStart`)
  assertNonNegativeTime(clip.sourceStart, `clip.${clip.id}.sourceStart`)
  if (
    !isNormalizedTime(clip.duration) ||
    compareTime(clip.duration, FRAME_DURATION) < 0
  ) {
    invalid(`clip.${clip.id}.duration`, 'shorter-than-one-frame')
  }
  if (
    compareTime(addTime(clip.sourceStart, clip.duration), stream.duration) > 0
  ) {
    invalid(`clip.${clip.id}`, 'source-range-outside-stream')
  }

  if (clip.type === 'video') {
    validateVisualProperties(clip)
  } else if (!Number.isFinite(clip.gain) || clip.gain < 0) {
    invalid(`clip.${clip.id}.gain`, 'invalid-linear-gain')
  }
}

function validateVisualProperties(clip: VideoClip): void {
  const { position, scale, rotation, opacity, fit } = clip.visual
  if (
    !Number.isFinite(position.x) ||
    position.x < 0 ||
    position.x > 1 ||
    !Number.isFinite(position.y) ||
    position.y < 0 ||
    position.y > 1 ||
    !Number.isFinite(scale) ||
    scale <= 0 ||
    !Number.isFinite(rotation) ||
    !Number.isFinite(opacity) ||
    opacity < 0 ||
    opacity > 1 ||
    fit !== 'contain'
  ) {
    invalid(`clip.${clip.id}.visual`, 'invalid-contain-fit-properties')
  }
}

function validateLinkGroup(
  linkGroup: LinkGroup,
  clips: ReadonlyMap<string, Clip>,
): void {
  assertId(linkGroup.id, 'linkGroup.id')
  if (linkGroup.clipIds.length !== 2) {
    invalid(`linkGroup.${linkGroup.id}.clipIds`, 'linked-pair-required')
  }
  const [firstId, secondId] = linkGroup.clipIds
  if (compareIds(firstId, secondId) >= 0) {
    invalid(`linkGroup.${linkGroup.id}.clipIds`, 'unstable-clip-order')
  }
  const first = clips.get(firstId)
  const second = clips.get(secondId)
  if (
    first === undefined ||
    second === undefined ||
    first.type === second.type
  ) {
    invalid(`linkGroup.${linkGroup.id}`, 'linked-video-and-audio-required')
  }
  if (
    first.linkGroupId !== linkGroup.id ||
    second.linkGroupId !== linkGroup.id
  ) {
    invalid(`linkGroup.${linkGroup.id}`, 'clip-link-mismatch')
  }
  if (
    first.assetId !== second.assetId ||
    compareTime(first.timelineStart, second.timelineStart) !== 0 ||
    compareTime(first.sourceStart, second.sourceStart) !== 0 ||
    compareTime(first.duration, second.duration) !== 0
  ) {
    invalid(`linkGroup.${linkGroup.id}`, 'linked-clips-not-atomic')
  }
  const linkedClipIds = [...clips.values()]
    .filter((clip) => clip.linkGroupId === linkGroup.id)
    .map((clip) => clip.id)
    .sort(compareIds)
  if (
    linkedClipIds.length !== 2 ||
    linkedClipIds[0] !== firstId ||
    linkedClipIds[1] !== secondId
  ) {
    invalid(`linkGroup.${linkGroup.id}`, 'clip-link-membership-mismatch')
  }
}

function assertSortedIds<T extends { readonly id: string }>(
  items: readonly T[],
  path: string,
): void {
  for (let index = 1; index < items.length; index += 1) {
    if (compareIds(items[index - 1]!.id, items[index]!.id) >= 0) {
      invalid(path, 'unstable-id-order')
    }
  }
}

function compareClipOrder(left: Clip, right: Clip): number {
  const timeComparison = compareTime(left.timelineStart, right.timelineStart)
  if (timeComparison !== 0) {
    return timeComparison
  }
  return compareIds(left.id, right.id)
}

function compareIds(left: string, right: string): number {
  if (left < right) {
    return -1
  }
  if (left > right) {
    return 1
  }
  return 0
}

function assertNonNegativeTime(
  time: unknown,
  path: string,
): asserts time is ExactTime {
  if (!isNormalizedTime(time) || compareTime(time, ZERO_TIME) < 0) {
    invalid(path, 'invalid-exact-time')
  }
}

function assertId(value: string, path: string): void {
  assertNonEmpty(value, path)
}

function assertNonEmpty(value: string, path: string): void {
  if (value.trim() === '') {
    invalid(path, 'empty-value')
  }
}

function invalid(path: string, reason: string): never {
  throw new EditorError('INVALID_PROJECT', { path, reason })
}
