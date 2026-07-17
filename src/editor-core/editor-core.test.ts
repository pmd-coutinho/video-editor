import { describe, expect, it } from 'vitest'

import {
  addTime,
  createTime,
  compareTime,
  DEFAULT_PROJECT_SETTINGS,
  EditorError,
  evaluateProject,
  formatTimecode,
  parseTimecode,
  projectDuration,
  assertProjectCanExport,
  timeFromMicroseconds,
  timeToMicroseconds,
  validateProject,
} from './index'
import type { AudioTrack, ProjectDocument, VideoTrack } from './index'
import { userMessageFor } from '../user-messages'

describe('exact time', () => {
  it('normalizes rational values and round-trips non-drop-frame timecode', () => {
    expect(createTime(12, -18)).toEqual({ numerator: -2, denominator: 3 })
    expect(formatTimecode(parseTimecode('01:02:03:04'))).toBe('01:02:03:04')
    expect(formatTimecode(parseTimecode('100:00:00:00'))).toBe('100:00:00:00')
  })

  it('converts WebCodecs microseconds without floating-point storage', () => {
    const time = timeFromMicroseconds(500_000)

    expect(time).toEqual(createTime(1, 2))
    expect(timeToMicroseconds(time)).toBe(500_000)
  })

  it('compares valid large rational values without intermediate overflow', () => {
    const maximum = Number.MAX_SAFE_INTEGER

    expect(
      compareTime(
        createTime(maximum, maximum - 1),
        createTime(maximum - 1, maximum),
      ),
    ).toBe(1)
    expect(
      addTime(
        createTime(maximum, maximum - 1),
        createTime(-maximum, maximum - 1),
      ),
    ).toEqual(createTime(0, 1))
  })
})

describe('project documents', () => {
  it('accepts a linked video and audio placement and derives its duration', () => {
    const project = createProject()

    expect(validateProject(project)).toBe(project)
    expect(project.settings.frameRate).toEqual(createTime(30, 1))
    expect(projectDuration(project)).toEqual(createTime(5, 1))
  })

  it('rejects empty timelines with a stable export error code', () => {
    const project = createProject()
    const emptyProject: ProjectDocument = {
      ...project,
      tracks: [
        { ...project.tracks[0]!, clips: [] },
        { ...project.tracks[1]!, clips: [] },
      ],
      linkGroups: [],
    }

    expect(() => assertProjectCanExport(emptyProject)).toThrowError(
      expect.objectContaining<Partial<EditorError>>({ code: 'EMPTY_TIMELINE' }),
    )
  })

  it('rejects same-track overlap', () => {
    const project = createProject()
    const videoTrack = project.tracks.find(isVideoTrack)!
    const overlappingClip = {
      ...videoTrack.clips[0]!,
      id: 'video-clip-2',
      linkGroupId: undefined,
      timelineStart: createTime(4, 1),
    }
    const invalidProject: ProjectDocument = {
      ...project,
      tracks: [
        { ...videoTrack, clips: [...videoTrack.clips, overlappingClip] },
        project.tracks[1]!,
      ],
    }

    expect(() => validateProject(invalidProject)).toThrowError(
      expect.objectContaining<Partial<EditorError>>({
        code: 'INVALID_PROJECT',
      }),
    )
  })

  it('rejects unstable clip ordering, negative placement, and subframe clips', () => {
    const project = createProject()
    const videoTrack = project.tracks.find(isVideoTrack)!
    const audioTrack = project.tracks.find(isAudioTrack)!
    const videoClip = videoTrack.clips[0]!

    const invalidProjects: ProjectDocument[] = [
      {
        ...project,
        tracks: [
          {
            ...videoTrack,
            clips: [
              videoClip,
              {
                ...videoClip,
                id: 'video-clip-0',
                linkGroupId: undefined,
                sourceStart: createTime(20, 1),
              },
            ],
          },
          audioTrack,
        ],
      },
      {
        ...project,
        tracks: [
          {
            ...videoTrack,
            clips: [{ ...videoClip, timelineStart: createTime(-1, 1) }],
          },
          audioTrack,
        ],
      },
      {
        ...project,
        tracks: [
          {
            ...videoTrack,
            clips: [{ ...videoClip, duration: createTime(1, 60) }],
          },
          audioTrack,
        ],
      },
    ]

    for (const invalidProject of invalidProjects) {
      expect(() => validateProject(invalidProject)).toThrowError(
        expect.objectContaining<Partial<EditorError>>({
          code: 'INVALID_PROJECT',
        }),
      )
    }
  })

  it('supports a video-only source and rejects a source range past its stream', () => {
    const project = createProject()
    const videoTrack = project.tracks.find(isVideoTrack)!
    const audioTrack = project.tracks.find(isAudioTrack)!
    const videoOnlyProject: ProjectDocument = {
      ...project,
      tracks: [
        {
          ...videoTrack,
          clips: videoTrack.clips.map((clip) => ({
            ...clip,
            linkGroupId: undefined,
          })),
        },
        { ...audioTrack, clips: [] },
      ],
      linkGroups: [],
    }

    expect(validateProject(videoOnlyProject)).toBe(videoOnlyProject)

    const outOfBoundsProject: ProjectDocument = {
      ...videoOnlyProject,
      tracks: [
        {
          ...videoTrack,
          clips: videoTrack.clips.map((clip) => ({
            ...clip,
            linkGroupId: undefined,
            sourceStart: createTime(59, 1),
          })),
        },
        { ...audioTrack, clips: [] },
      ],
    }

    expect(() => validateProject(outOfBoundsProject)).toThrowError(
      expect.objectContaining<Partial<EditorError>>({
        code: 'INVALID_PROJECT',
      }),
    )
  })

  it('allows multiple assets and maps malformed documents to a domain error', () => {
    const project = createProject()
    const multiAssetProject: ProjectDocument = {
      ...project,
      assets: [
        ...project.assets,
        {
          id: 'asset-2',
          name: 'alternate.mp4',
          source: { identity: 'source-2' },
          streams: [
            {
              id: 'video-stream-2',
              type: 'video',
              duration: createTime(60, 1),
              codec: 'avc1.640028',
              width: 1920,
              height: 1080,
            },
          ],
        },
      ],
    }

    expect(validateProject(multiAssetProject)).toBe(multiAssetProject)
    expect(() => validateProject({ ...project, title: null })).toThrowError(
      expect.objectContaining<Partial<EditorError>>({
        code: 'INVALID_PROJECT',
      }),
    )
  })

  it('requires every linked clip to belong to exactly one linked pair', () => {
    const project = createProject()
    const videoTrack = project.tracks.find(isVideoTrack)!
    const extraLinkedVideo = {
      ...videoTrack.clips[0]!,
      id: 'video-clip-2',
      timelineStart: createTime(5, 1),
      sourceStart: createTime(15, 1),
    }
    const invalidProject: ProjectDocument = {
      ...project,
      tracks: [
        { ...videoTrack, clips: [...videoTrack.clips, extraLinkedVideo] },
        project.tracks.find(isAudioTrack)!,
      ],
    }

    expect(() => validateProject(invalidProject)).toThrowError(
      expect.objectContaining<Partial<EditorError>>({
        code: 'INVALID_PROJECT',
      }),
    )
  })

  it('maps stable error codes to user messages outside the editor core', () => {
    expect(userMessageFor(new EditorError('EMPTY_TIMELINE'))).toBe(
      'Add media to the timeline before exporting.',
    )
  })
})

describe('timeline evaluator', () => {
  it('resolves linked visual and audio media at an exact timeline time', () => {
    const evaluation = evaluateProject(createProject(), createTime(2, 1))

    expect(evaluation.background).toBe('black')
    expect(evaluation.visualLayers).toMatchObject([
      { clipId: 'video-clip-1', sourceTime: createTime(12, 1) },
    ])
    expect(evaluation.audioSegments).toMatchObject([
      {
        clipId: 'audio-clip-1',
        sourceStart: createTime(12, 1),
        timelineEnd: createTime(5, 1),
        gain: 1,
      },
    ])
  })

  it('returns black and silence before a clip and at its half-open end', () => {
    const project = createProjectAt(createTime(2, 1))

    expect(evaluateProject(project, createTime(1, 1))).toEqual({
      background: 'black',
      visualLayers: [],
      audioSegments: [],
    })
    expect(evaluateProject(project, createTime(7, 1))).toEqual({
      background: 'black',
      visualLayers: [],
      audioSegments: [],
    })
  })
})

function createProject(): ProjectDocument {
  return {
    format: 'frameforge-project',
    schemaVersion: 1,
    id: 'project-1',
    title: 'First cut',
    revision: 0,
    settings: DEFAULT_PROJECT_SETTINGS,
    assets: [
      {
        id: 'asset-1',
        name: 'talking-head.mp4',
        source: { identity: 'source-1' },
        streams: [
          {
            id: 'video-stream-1',
            type: 'video',
            duration: createTime(60, 1),
            codec: 'avc1.640028',
            width: 1920,
            height: 1080,
          },
          {
            id: 'audio-stream-1',
            type: 'audio',
            duration: createTime(60, 1),
            codec: 'mp4a.40.2',
            sampleRate: 48_000,
            channels: 2,
          },
        ],
      },
    ],
    tracks: [
      {
        id: 'video-track-1',
        type: 'video',
        clips: [
          {
            id: 'video-clip-1',
            type: 'video',
            assetId: 'asset-1',
            streamId: 'video-stream-1',
            linkGroupId: 'link-group-1',
            timelineStart: createTime(0, 1),
            sourceStart: createTime(10, 1),
            duration: createTime(5, 1),
            visual: {
              position: { x: 0.5, y: 0.5 },
              scale: 1,
              rotation: 0,
              opacity: 1,
              fit: 'contain',
            },
          },
        ],
      },
      {
        id: 'audio-track-1',
        type: 'audio',
        clips: [
          {
            id: 'audio-clip-1',
            type: 'audio',
            assetId: 'asset-1',
            streamId: 'audio-stream-1',
            linkGroupId: 'link-group-1',
            timelineStart: createTime(0, 1),
            sourceStart: createTime(10, 1),
            duration: createTime(5, 1),
            gain: 1,
          },
        ],
      },
    ],
    linkGroups: [
      {
        id: 'link-group-1',
        clipIds: ['audio-clip-1', 'video-clip-1'],
      },
    ],
  }
}

function createProjectAt(
  timelineStart: ReturnType<typeof createTime>,
): ProjectDocument {
  const project = createProject()
  const videoTrack = project.tracks.find(isVideoTrack)!
  const audioTrack = project.tracks.find(isAudioTrack)!

  return {
    ...project,
    tracks: [
      {
        ...videoTrack,
        clips: videoTrack.clips.map((clip) => ({ ...clip, timelineStart })),
      },
      {
        ...audioTrack,
        clips: audioTrack.clips.map((clip) => ({ ...clip, timelineStart })),
      },
    ],
  }
}

function isVideoTrack(
  track: ProjectDocument['tracks'][number],
): track is VideoTrack {
  return track.type === 'video'
}

function isAudioTrack(
  track: ProjectDocument['tracks'][number],
): track is AudioTrack {
  return track.type === 'audio'
}
