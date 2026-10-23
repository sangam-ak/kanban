import { execSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { boardUrl, deleteE2ECards, signIn, uniqueTitle } from "./helpers";

// These tests run against the real database. Each test works on its own "E2E" cards,
// which are deleted afterwards, so the user's board is left as it was.

const columns = (page: Page) => page.locator('[data-testid^="column-"]');
const cardByTitle = (page: Page, title: string) =>
  page.locator('[data-testid^="card-"]').filter({ hasText: title });

// Resolves once the board API call matching the URL fragment and method has completed.
const saved = (page: Page, urlPart: string, method: string) =>
  page.waitForResponse((r) => r.url().includes(urlPart) && r.request().method() === method);

const addCard = async (page: Page, columnIndex: number, title: string) => {
  const column = columns(page).nth(columnIndex);
  await column.getByRole("button", { name: /add a card/i }).click();
  await column.getByPlaceholder("Card title").fill(title);
  await column.getByPlaceholder("Details").fill("Added via e2e.");
  await column.getByRole("button", { name: /add card/i }).click();
  await expect(cardByTitle(page, title)).toBeVisible();
};

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test.afterEach(async ({ page }) => {
  await deleteE2ECards(page);
});

test("loads the kanban board", async ({ page }) => {
  await expect(columns(page)).toHaveCount(5);
});

test("added card persists after reload", async ({ page }) => {
  const title = uniqueTitle();
  await addCard(page, 0, title);
  await page.reload();
  await expect(columns(page).nth(0).getByText(title)).toBeVisible();
});

test("edited card persists after reload", async ({ page }) => {
  const title = uniqueTitle();
  const edited = `${title} edited`;
  await addCard(page, 0, title);
  // Find the card by id: while editing, its title is in an input, not text.
  const card = page.getByTestId((await cardByTitle(page, title).getAttribute("data-testid"))!);
  await card.getByRole("button", { name: /edit/i }).click();
  await card.getByLabel("Card title").fill(edited);
  await card.getByLabel("Card details").fill("New details.");
  await card.getByRole("button", { name: /save/i }).click();
  await expect(cardByTitle(page, edited)).toBeVisible();

  await page.reload();
  await expect(cardByTitle(page, edited).getByText("New details.")).toBeVisible();
});

test("deleted card stays deleted after reload", async ({ page }) => {
  const title = uniqueTitle();
  await addCard(page, 1, title);
  await cardByTitle(page, title).getByRole("button", { name: /delete/i }).click();
  await expect(cardByTitle(page, title)).toHaveCount(0);

  await page.reload();
  await expect(columns(page)).toHaveCount(5);
  await expect(cardByTitle(page, title)).toHaveCount(0);
});

test("renamed column persists after reload", async ({ page }) => {
  const input = columns(page).nth(4).getByLabel("Column title");
  const original = await input.inputValue();
  const renamed = uniqueTitle();

  const columnId = (await columns(page).nth(4).getAttribute("data-testid"))!.replace("column-", "");

  try {
    await input.fill(renamed);
    await Promise.all([saved(page, `/columns/${columnId}`, "PATCH"), input.press("Enter")]);
    await page.reload();
    await expect(columns(page).nth(4).getByLabel("Column title")).toHaveValue(renamed);
  } finally {
    await page.request.patch(`${await boardUrl(page)}/columns/${columnId}`, {
      data: { title: original },
    });
  }
});

test("dragged card persists in its new column after reload", async ({ page }) => {
  const title = uniqueTitle();
  await addCard(page, 0, title);
  const card = cardByTitle(page, title);
  const target = columns(page).nth(3);
  const cardBox = (await card.boundingBox())!;
  const targetBox = (await target.boundingBox())!;

  await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + 120, { steps: 12 });
  await Promise.all([saved(page, "/move", "POST"), page.mouse.up()]);
  await expect(target.getByText(title)).toBeVisible();

  await page.reload();
  await expect(columns(page).nth(3).getByText(title)).toBeVisible();
  await expect(columns(page).nth(0).getByText(title)).toHaveCount(0);
});

test("changes survive a container restart", async ({ page }) => {
  test.setTimeout(120_000);
  const title = uniqueTitle();
  await addCard(page, 2, title);

  execSync("docker restart pm");
  await expect
    .poll(async () => (await page.request.get("/api/health").catch(() => null))?.ok(), {
      timeout: 60_000,
    })
    .toBe(true);

  await page.reload();
  await expect(columns(page).nth(2).getByText(title)).toBeVisible();
});

test("search narrows the cards and clearing shows them all", async ({ page }) => {
  const title = uniqueTitle();
  await addCard(page, 0, title);
  const cards = page.locator('[data-testid^="card-"]');
  const total = await cards.count();

  await page.getByLabel("Search cards").fill(title);
  await expect(cards).toHaveCount(1);
  await expect(cardByTitle(page, title)).toBeVisible();

  await page.getByRole("button", { name: /clear filters/i }).click();
  await expect(cards).toHaveCount(total);
});

test("summary counts the cards and activity lists a new card", async ({ page }) => {
  const title = uniqueTitle();
  await addCard(page, 0, title);
  const total = await page.locator('[data-testid^="card-"]').count();
  await expect(page.getByLabel("Board summary")).toContainText(`${total}cards`);

  await page.getByRole("button", { name: "Activity", exact: true }).click();
  await expect(page.getByRole("region", { name: "Recent activity" })).toContainText(
    `Added card "${title}" to`
  );
});
