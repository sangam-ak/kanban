import { expect, test, type Page } from "@playwright/test";
import { boardUrl, deleteE2ECards, signIn, uniqueTitle } from "./helpers";


const columns = (page: Page) => page.locator('[data-testid^="column-"]');
const assistant = (page: Page) => page.getByRole("complementary", { name: "AI assistant" });

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test.afterEach(async ({ page }) => {
  await deleteE2ECards(page);
});

test("board updates from the assistant's reply without a reload", async ({ page }) => {
  // Reply with the real board plus one extra card, without calling the AI.
  const title = uniqueTitle();
  await page.route("**/api/boards/*/chat", async (route) => {
    const board = await (await page.request.get(await boardUrl(page))).json();
    board.cards["card-99999"] = {
      id: "card-99999",
      title,
      details: "",
      priority: null,
      dueDate: null,
      labels: [],
    };
    board.columns[1].cardIds.push("card-99999");
    await route.fulfill({ json: { message: "Added the card.", board } });
  });

  const chat = assistant(page);
  await chat.getByLabel("Message").fill("Add a card");
  await chat.getByRole("button", { name: /send/i }).click();

  await expect(chat.getByTestId("chat-user")).toHaveText("Add a card");
  await expect(chat.getByTestId("chat-assistant")).toHaveText("Added the card.");
  await expect(columns(page).nth(1).getByText(title)).toBeVisible();
});

test("shows an error when the assistant fails", async ({ page }) => {
  await page.route("**/api/boards/*/chat", (route) => route.fulfill({ status: 500 }));
  const chat = assistant(page);
  await chat.getByLabel("Message").fill("Hello");
  await chat.getByLabel("Message").press("Enter");
  await expect(chat.getByText(/could not respond/i)).toBeVisible();
});

test("assistant can be closed and reopened", async ({ page }) => {
  await page.getByRole("button", { name: /close assistant/i }).click();
  await expect(assistant(page)).toHaveCount(0);
  await page.getByRole("button", { name: /open assistant/i }).click();
  await expect(assistant(page)).toBeVisible();
});

test("real AI creates a card that persists", async ({ page }) => {
  test.skip(!process.env.RUN_REAL_AI, "Set RUN_REAL_AI=1 to call the real model");
  const title = uniqueTitle();
  const chat = assistant(page);
  await chat.getByLabel("Message").fill(`Add a card titled "${title}" to the Backlog column.`);
  await chat.getByRole("button", { name: /send/i }).click();

  await expect(chat.getByTestId("chat-assistant")).toBeVisible({ timeout: 60_000 });
  await expect(columns(page).nth(0).getByText(title)).toBeVisible();
  await page.reload();
  await expect(columns(page).nth(0).getByText(title)).toBeVisible();
});
