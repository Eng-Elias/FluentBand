import { test, expect } from "@playwright/test";

// Smoke tests — no real LLM key required (pages render, nav works).
// Run: npx playwright install chromium && npx playwright test

test("home renders and nav links work", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "FluentBand" })).toBeVisible();
  await page.getByRole("link", { name: "Settings" }).first().click();
  await expect(page).toHaveURL(/\/settings/);
  await expect(page.getByText("LLM Providers")).toBeVisible();
});

test("all module pages render", async ({ page }) => {
  for (const path of ["/today", "/vocab", "/speaking", "/writing", "/reading", "/listening", "/library", "/errors", "/progress", "/mock-test", "/diagnostic", "/settings/backup"]) {
    await page.goto(path);
    await expect(page.locator("h1").first()).toBeVisible();
  }
});

test("healthz responds", async ({ request }) => {
  const res = await request.get("/api/healthz");
  expect(res.ok()).toBeTruthy();
  expect((await res.json()).ok).toBe(true);
});
