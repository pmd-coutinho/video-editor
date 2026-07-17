import { EditorError } from './errors'
import {
  addTime,
  compareTime,
  isNormalizedTime,
  subtractTime,
  ZERO_TIME,
} from './time'
import { validateProject } from './project'
import type { AudioClip, ProjectDocument, VideoClip } from './project'
import type { ExactTime } from './time'

export interface VisualLayer {
  readonly clipId: string
  readonly assetId: string
  readonly streamId: string
  readonly sourceTime: ExactTime
  readonly position: VideoClip['visual']['position']
  readonly scale: number
  readonly rotation: number
  readonly opacity: number
  readonly fit: 'contain'
}

export interface AudioSegment {
  readonly clipId: string
  readonly assetId: string
  readonly streamId: string
  readonly sourceStart: ExactTime
  readonly sourceEnd: ExactTime
  readonly timelineEnd: ExactTime
  readonly gain: number
}

export interface TimelineEvaluation {
  readonly background: 'black'
  readonly visualLayers: readonly VisualLayer[]
  readonly audioSegments: readonly AudioSegment[]
}

export function evaluateProject(
  project: ProjectDocument,
  timelineTime: ExactTime,
): TimelineEvaluation {
  validateProject(project)
  if (
    !isNormalizedTime(timelineTime) ||
    compareTime(timelineTime, ZERO_TIME) < 0
  ) {
    throw new EditorError('INVALID_TIME', { timelineTime })
  }

  const visualLayers: VisualLayer[] = []
  const audioSegments: AudioSegment[] = []

  for (const track of project.tracks) {
    for (const clip of track.clips) {
      if (!isActiveAt(clip, timelineTime)) {
        continue
      }

      if (clip.type === 'video') {
        visualLayers.push(toVisualLayer(clip, timelineTime))
      } else {
        audioSegments.push(toAudioSegment(clip, timelineTime))
      }
    }
  }

  return { background: 'black', visualLayers, audioSegments }
}

function isActiveAt(
  clip: VideoClip | AudioClip,
  timelineTime: ExactTime,
): boolean {
  return (
    compareTime(timelineTime, clip.timelineStart) >= 0 &&
    compareTime(timelineTime, addTime(clip.timelineStart, clip.duration)) < 0
  )
}

function sourceTimeAt(
  clip: VideoClip | AudioClip,
  timelineTime: ExactTime,
): ExactTime {
  return addTime(
    clip.sourceStart,
    subtractTime(timelineTime, clip.timelineStart),
  )
}

function toVisualLayer(clip: VideoClip, timelineTime: ExactTime): VisualLayer {
  return {
    clipId: clip.id,
    assetId: clip.assetId,
    streamId: clip.streamId,
    sourceTime: sourceTimeAt(clip, timelineTime),
    ...clip.visual,
  }
}

function toAudioSegment(
  clip: AudioClip,
  timelineTime: ExactTime,
): AudioSegment {
  return {
    clipId: clip.id,
    assetId: clip.assetId,
    streamId: clip.streamId,
    sourceStart: sourceTimeAt(clip, timelineTime),
    sourceEnd: addTime(clip.sourceStart, clip.duration),
    timelineEnd: addTime(clip.timelineStart, clip.duration),
    gain: clip.gain,
  }
}
