import { expect, test } from "@playwright/test";

const signIn = async (page: import("@playwright/test").Page, password: string) => {
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
};

test("shows the login form first", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(0);
});

test("rejects wrong credentials", async ({ page }) => {
  await page.goto("/");
  await signIn(page, "wrong");
  await expect(page.getByText(/invalid username or password/i)).toBeVisible();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(0);
});

test("signs in, stays signed in on reload, and logs out", async ({ page }) => {
  await page.goto("/");
  await signIn(page, "password");
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);

  await page.reload();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);

  await page.getByRole("button", { name: /log out/i }).click();
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
});
