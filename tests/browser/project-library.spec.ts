import { expect, test } from '@playwright/test'

test('shows an empty local project library on desktop', async ({ page }) => {
  await page.goto('/')

  await expect(
    page.getByRole('heading', { name: 'Projects', exact: true }),
  ).toBeVisible()
  await expect(page.getByText('No projects yet')).toBeVisible()
  await expect(page.getByRole('button', { name: 'New project' })).toBeVisible()
})

test('keeps the project library available with a desktop editor notice on compact viewports', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1000, height: 699 })
  await page.goto('/')

  await expect(page.getByRole('status')).toContainText('desktop editor')
  await expect(
    page.getByRole('heading', { name: 'Projects', exact: true }),
  ).toBeVisible()
})

test('imports a package into the local library and restores its offline editor state after refresh', async ({
  page,
}) => {
  await page.goto('/')

  await page.getByLabel('Import project package').setInputFiles({
    name: 'interview-cut.video-project.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(projectPackage())),
  })

  await expect(page.getByRole('link', { name: 'Interview cut' })).toBeVisible()
  await page.getByRole('link', { name: 'Interview cut' }).click()

  await expect(
    page.getByRole('heading', { name: 'Interview cut' }),
  ).toBeVisible()
  await expect(page.getByText('Media offline')).toBeVisible()

  await page.reload()

  await expect(
    page.getByRole('heading', { name: 'Interview cut' }),
  ).toBeVisible()
  await expect(page.getByText('Media offline')).toBeVisible()

  await page.goto('/projects/missing-local-project')
  await expect(
    page.getByRole('heading', { name: 'Project not found' }),
  ).toBeVisible()
  await expect(
    page.getByText('This project is not available in this browser profile.'),
  ).toBeVisible()
})

test('rejects an invalid project package without creating a project', async ({
  page,
}) => {
  await page.goto('/')

  await page.getByLabel('Import project package').setInputFiles({
    name: 'invalid.video-project.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{ not valid json }'),
  })

  await expect(page.getByRole('alert')).toContainText(
    'Choose a valid .video-project.json package.',
  )
  await expect(page.getByText('0 projects')).toBeVisible()

  const malformedDocumentPackage = projectPackage()
  malformedDocumentPackage.document.title = ''
  await page.getByLabel('Import project package').setInputFiles({
    name: 'malformed-document.video-project.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(malformedDocumentPackage)),
  })

  await expect(page.getByRole('alert')).toContainText(
    'Choose a valid .video-project.json package.',
  )
  await expect(page.getByText('0 projects')).toBeVisible()

  const newerPackage = projectPackage()
  newerPackage.document.schemaVersion = 2
  await page.getByLabel('Import project package').setInputFiles({
    name: 'newer.video-project.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(newerPackage)),
  })

  await expect(page.getByRole('alert')).toContainText(
    'This project was created by a newer version of Frameforge.',
  )
  await expect(page.getByText('0 projects')).toBeVisible()
})

function projectPackage() {
  return {
    format: 'frameforge-project-package',
    schemaVersion: 1,
    metadata: { exportedAt: '2026-07-17T00:00:00.000Z' },
    document: {
      format: 'frameforge-project',
      schemaVersion: 1,
      id: 'portable-project-id',
      title: 'Interview cut',
      revision: 4,
      settings: {
        width: 1080,
        height: 1920,
        frameRate: { numerator: 30, denominator: 1 },
        colorSpace: 'rec709',
        audioSampleRate: 48_000,
        audioChannels: 2,
      },
      assets: [
        {
          id: 'asset-1',
          name: 'interview.mp4',
          source: { identity: 'interview-source' },
          streams: [
            {
              id: 'video-stream-1',
              type: 'video',
              duration: { numerator: 30, denominator: 1 },
              codec: 'avc1.640028',
              width: 1920,
              height: 1080,
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
              timelineStart: { numerator: 0, denominator: 1 },
              sourceStart: { numerator: 0, denominator: 1 },
              duration: { numerator: 5, denominator: 1 },
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
        { id: 'audio-track-1', type: 'audio', clips: [] },
      ],
      linkGroups: [],
    },
  }
}
