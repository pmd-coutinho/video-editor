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
