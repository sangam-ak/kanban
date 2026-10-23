import { expect, test, type Page } from "@playwright/test";

const signIn = async (page: Page, password: string, username = "user") => {
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /^sign in$/i }).click();
};

const logOut = async (page: Page) => {
  await page.getByRole("button", { name: /account menu/i }).click();
  await page.getByRole("button", { name: /log out/i }).click();
};

const columns = (page: Page) => page.locator('[data-testid^="column-"]');

test("shows the login form first", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /^sign in$/i })).toBeVisible();
  await expect(columns(page)).toHaveCount(0);
});

test("rejects wrong credentials", async ({ page }) => {
  await page.goto("/");
  await signIn(page, "wrong");
  await expect(page.getByText(/invalid username or password/i)).toBeVisible();
  await expect(columns(page)).toHaveCount(0);
});

test("signs in, stays signed in on reload, and logs out", async ({ page }) => {
  await page.goto("/");
  await signIn(page, "password");
  await expect(columns(page)).toHaveCount(5);

  await page.reload();
  await expect(columns(page)).toHaveCount(5);

  await logOut(page);
  await expect(page.getByRole("button", { name: /^sign in$/i })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("button", { name: /^sign in$/i })).toBeVisible();
});

test("registers, changes password and deletes the account", async ({ page }) => {
  const username = `e2e_${Date.now()}`;
  await page.goto("/");
  await page.getByRole("button", { name: /create an account/i }).click();
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password", { exact: true }).fill("secret123");
  await page.getByLabel("Confirm password").fill("secret123");
  await page.getByRole("button", { name: /^create account$/i }).click();
  await expect(columns(page)).toHaveCount(5);
  await expect(page.getByRole("button", { name: /account menu/i })).toContainText(username);

  await logOut(page);
  await signIn(page, "secret123", username);
  await expect(columns(page)).toHaveCount(5);

  await page.getByRole("button", { name: /account menu/i }).click();
  await page.getByRole("button", { name: /account settings/i }).click();
  await page.getByLabel("Current password").fill("secret123");
  await page.getByLabel("New password").fill("newsecret1");
  await page.getByRole("button", { name: /change password/i }).click();
  await expect(page.getByText("Password changed")).toBeVisible();

  await page.getByLabel("Confirm with password").fill("newsecret1");
  await page.getByRole("button", { name: /delete account/i }).click();
  await expect(page.getByRole("button", { name: /^sign in$/i })).toBeVisible();

  await signIn(page, "newsecret1", username);
  await expect(page.getByText(/invalid username or password/i)).toBeVisible();
});
