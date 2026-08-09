import { test, expect } from '@playwright/test';

test.describe('Catalog & Enrollment Flows', () => {
  test('students can browse the catalog and view section impacts', async ({ page }) => {
    await page.goto('/catalog');

    // Wait for the catalog to load its data
    await expect(page.getByRole('heading', { name: 'Course Catalog' })).toBeVisible();

    // Click on the first available course row in the table
    const firstCourseRow = page.locator('tbody tr').first();
    await firstCourseRow.waitFor();
    await firstCourseRow.click();

    // Verify the Course Detail Drawer appears on the right side
    const drawer = page.locator('text=Eligibility').first();
    await expect(drawer).toBeVisible();

    // Verify domain intelligence badges are visible
    await expect(page.locator('text=Prerequisites')).toBeVisible();
    await expect(page.locator('text=Registration window open')).toBeVisible();
  });

  test('students can view their schedule grid on profile', async ({ page }) => {
    await page.goto('/profile');

    // Wait for the profile to load
    await expect(page.getByRole('heading', { name: 'Current schedule' })).toBeVisible();

    // Verify the weekly calendar schedule grid renders correctly
    // It should have Monday-Friday columns
    await expect(page.getByText('Mon', { exact: true })).toBeVisible();
    await expect(page.getByText('Fri', { exact: true })).toBeVisible();

    // It should have hours visible on the left side
    await expect(page.getByText('8 AM')).toBeVisible();
    await expect(page.getByText('12 PM')).toBeVisible();
  });
});
