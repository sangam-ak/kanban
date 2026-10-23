import { expect, test, type Page } from "@playwright/test";
import { PREFIX, signIn, uniqueTitle } from "./helpers";

const columns = (page: Page) => page.locator('[data-testid^="column-"]');
const switcher = (page: Page) => page.getByRole("button", { name: /switch board/i });

const chooseBoard = async (page: Page, name: string) => {
  await switcher(page).click();
  await page.getByRole("list", { name: "Boards" }).getByRole("button", { name }).click();
  await expect(switcher(page)).toHaveText(name);
};

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

// Deletes any boards a test left behind.
test.afterEach(async ({ page }) => {
  const boards = await (await page.request.get("/api/boards")).json();
  for (const board of boards as { id: string; name: string }[]) {
    if (board.name.startsWith(PREFIX)) {
      await page.request.delete(`/api/boards/${board.id}`);
    }
  }
});

test("creates, switches, renames and deletes a board", async ({ page }) => {
  const original = (await switcher(page).textContent())!;
  const name = uniqueTitle();
  const cardTitle = uniqueTitle();

  await switcher(page).click();
  await page.getByRole("button", { name: /new board/i }).click();
  await page.getByLabel("New board name").fill(name);
  await page.getByLabel("New board name").press("Enter");
  await expect(switcher(page)).toHaveText(name);
  await expect(columns(page)).toHaveCount(5);
  await expect(page.locator('[data-testid^="card-"]')).toHaveCount(0);

  const backlog = columns(page).first();
  await backlog.getByRole("button", { name: /add a card/i }).click();
  await backlog.getByPlaceholder("Card title").fill(cardTitle);
  await backlog.getByRole("button", { name: /add card/i }).click();
  await expect(backlog.getByText(cardTitle)).toBeVisible();

  await chooseBoard(page, original);
  await expect(page.getByText(cardTitle)).toHaveCount(0);

  // The selected board is remembered across reloads.
  await chooseBoard(page, name);
  await page.reload();
  await expect(switcher(page)).toHaveText(name);
  await expect(columns(page).first().getByText(cardTitle)).toBeVisible();

  const renamed = uniqueTitle();
  await switcher(page).click();
  await page.getByRole("button", { name: /rename board/i }).click();
  await page.getByLabel("Board name").fill(renamed);
  await page.getByLabel("Board name").press("Enter");
  await expect(switcher(page)).toHaveText(renamed);

  await switcher(page).click();
  await page.getByRole("button", { name: /delete board/i }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(switcher(page)).toHaveText(original);

  await switcher(page).click();
  await expect(page.getByRole("list", { name: "Boards" })).not.toContainText(renamed);
});

test("columns and card details persist", async ({ page }) => {
  // Work on a fresh board so the demo board is untouched.
  const board = await (
    await page.request.post("/api/boards", { data: { name: uniqueTitle() } })
  ).json();
  await page.evaluate((id) => localStorage.setItem("pm.boardId", id), board.id);
  await page.reload();
  await expect(columns(page)).toHaveCount(5);

  await page.getByRole("button", { name: /add column/i }).click();
  await page.getByLabel("New column title").fill("Blocked");
  await page.getByLabel("New column title").press("Enter");
  await expect(columns(page)).toHaveCount(6);
  await page.getByRole("button", { name: "Move Blocked left" }).click();
  await expect(columns(page).nth(4).getByLabel("Column title")).toHaveValue("Blocked");

  const blocked = columns(page).nth(4);
  const title = uniqueTitle();
  await blocked.getByRole("button", { name: /add a card/i }).click();
  await blocked.getByPlaceholder("Card title").fill(title);
  await blocked.getByRole("button", { name: /add card/i }).click();
  await blocked.getByRole("button", { name: `Edit ${title}`, exact: true }).click();
  await blocked.getByLabel("Priority").selectOption("high");
  await blocked.getByLabel("Due date").fill("2000-01-15");
  await blocked.getByLabel("Labels").fill("infra, urgent");
  await blocked.getByRole("button", { name: /save/i }).click();
  await expect(blocked.getByTestId("due-date")).toHaveText("Overdue 2000-01-15");

  await page.reload();
  const card = columns(page).nth(4).locator('[data-testid^="card-"]');
  await expect(card).toContainText("high");
  await expect(card.getByTestId("due-date")).toHaveText("Overdue 2000-01-15");
  await expect(card).toContainText("infra");
  await expect(card).toContainText("urgent");

  // A column can only be deleted once it is empty.
  await expect(page.getByRole("button", { name: "Delete Blocked" })).toHaveCount(0);
  await columns(page).nth(4).getByRole("button", { name: `Delete ${title}`, exact: true }).click();
  await page.getByRole("button", { name: "Delete Blocked" }).click();
  await expect(columns(page)).toHaveCount(5);
  await page.reload();
  await expect(columns(page)).toHaveCount(5);
});
