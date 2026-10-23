import { expect, type Page } from "@playwright/test";

// Cards and boards created by E2E tests start with this prefix and are deleted afterwards.
export const PREFIX = "E2E";
export const uniqueTitle = () => `${PREFIX} ${Date.now()}-${Math.round(Math.random() * 1e6)}`;

export const signIn = async (page: Page) => {
  await page.goto("/");
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: /^sign in$/i }).click();
  // The login page has the "Kanban Studio" heading too, so wait for a signed-in control.
  await expect(page.getByRole("button", { name: /account menu/i })).toBeVisible();
};

// API URL of the signed-in user's first board, which a fresh browser opens by default.
export const boardUrl = async (page: Page) => {
  const boards = await (await page.request.get("/api/boards")).json();
  return `/api/boards/${boards[0].id}`;
};

export const deleteE2ECards = async (page: Page) => {
  const url = await boardUrl(page);
  const board = await (await page.request.get(url)).json();
  for (const card of Object.values<{ id: string; title: string }>(board.cards)) {
    if (card.title.startsWith(PREFIX)) {
      await page.request.delete(`${url}/cards/${card.id}`);
    }
  }
};
