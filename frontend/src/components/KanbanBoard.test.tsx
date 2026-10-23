import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KanbanBoard } from "@/components/KanbanBoard";
import * as api from "@/lib/api";
import type { BoardData } from "@/lib/kanban";
import { boardData, makeCard } from "@/test/boardData";

vi.mock("@/lib/api");
const mockedApi = vi.mocked(api);

const board = (change: (draft: BoardData) => void = () => {}) => {
  const draft = structuredClone(boardData);
  change(draft);
  return draft;
};

const renderBoard = async () => {
  render(<KanbanBoard boardId="board-1" isChatOpen onCloseChat={() => {}} />);
  await screen.findAllByTestId(/column-/i);
};

const getFirstColumn = () => screen.getAllByTestId(/column-/i)[0];

describe("KanbanBoard", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedApi.getBoard.mockResolvedValue(board());
  });

  it("renders the board loaded from the API", async () => {
    await renderBoard();
    expect(mockedApi.getBoard).toHaveBeenCalledWith("board-1");
    expect(screen.getAllByTestId(/column-/i)).toHaveLength(5);
    expect(screen.getByText("Align roadmap themes")).toBeInTheDocument();
  });

  it("shows an error when the board cannot be loaded", async () => {
    mockedApi.getBoard.mockRejectedValue(new Error("down"));
    render(<KanbanBoard boardId="board-1" isChatOpen onCloseChat={() => {}} />);
    expect(await screen.findByText(/could not load the board/i)).toBeInTheDocument();
  });

  it("renames a column on blur", async () => {
    mockedApi.renameColumn.mockResolvedValue(
      board((b) => {
        b.columns[0].title = "New Name";
      })
    );
    await renderBoard();
    const input = within(getFirstColumn()).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "New Name");
    expect(mockedApi.renameColumn).not.toHaveBeenCalled();
    await userEvent.tab();
    expect(mockedApi.renameColumn).toHaveBeenCalledWith("board-1", "col-1", "New Name");
    expect(input).toHaveValue("New Name");
  });

  it("renames a column on Enter", async () => {
    mockedApi.renameColumn.mockResolvedValue(board());
    await renderBoard();
    const input = within(getFirstColumn()).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "Ideas{Enter}");
    expect(mockedApi.renameColumn).toHaveBeenCalledWith("board-1", "col-1", "Ideas");
  });

  it("restores an emptied column title without saving", async () => {
    await renderBoard();
    const input = within(getFirstColumn()).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.tab();
    expect(mockedApi.renameColumn).not.toHaveBeenCalled();
    expect(input).toHaveValue("Backlog");
  });

  it("adds a card", async () => {
    mockedApi.createCard.mockResolvedValue(
      board((b) => {
        b.cards["card-9"] = makeCard({ id: "card-9", title: "New card", details: "Notes" });
        b.columns[0].cardIds.push("card-9");
      })
    );
    await renderBoard();
    const column = getFirstColumn();
    await userEvent.click(within(column).getByRole("button", { name: /add a card/i }));
    await userEvent.type(within(column).getByPlaceholderText(/card title/i), "New card");
    await userEvent.type(within(column).getByPlaceholderText(/details/i), "Notes");
    await userEvent.click(within(column).getByRole("button", { name: /add card/i }));

    expect(mockedApi.createCard).toHaveBeenCalledWith("board-1", "col-1", "New card", "Notes");
    expect(await within(column).findByText("New card")).toBeInTheDocument();
  });

  it("deletes a card", async () => {
    mockedApi.deleteCard.mockResolvedValue(
      board((b) => {
        delete b.cards["card-1"];
        b.columns[0].cardIds = ["card-2"];
      })
    );
    await renderBoard();
    await userEvent.click(screen.getByRole("button", { name: /delete align roadmap themes/i }));

    expect(mockedApi.deleteCard).toHaveBeenCalledWith("board-1", "card-1");
    expect(screen.queryByText("Align roadmap themes")).not.toBeInTheDocument();
  });

  it("edits a card", async () => {
    mockedApi.updateCard.mockResolvedValue(
      board((b) => {
        b.cards["card-1"] = makeCard({ id: "card-1", title: "Updated title", details: "Updated details" });
      })
    );
    await renderBoard();
    const card = screen.getByTestId("card-card-1");
    await userEvent.click(
      within(card).getByRole("button", { name: /edit align roadmap themes/i })
    );

    const titleInput = within(card).getByLabelText("Card title");
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, "Updated title");
    const detailsInput = within(card).getByLabelText("Card details");
    await userEvent.clear(detailsInput);
    await userEvent.type(detailsInput, "Updated details");
    await userEvent.click(within(card).getByRole("button", { name: /save/i }));

    expect(mockedApi.updateCard).toHaveBeenCalledWith("board-1", "card-1", {
      title: "Updated title",
      details: "Updated details",
      priority: null,
      due_date: null,
      labels: [],
    });
    expect(await within(card).findByText("Updated title")).toBeInTheDocument();
    expect(within(card).getByText("Updated details")).toBeInTheDocument();
  });

  it("cancels editing a card without saving", async () => {
    await renderBoard();
    const card = screen.getByTestId("card-card-1");
    await userEvent.click(
      within(card).getByRole("button", { name: /edit align roadmap themes/i })
    );

    const titleInput = within(card).getByLabelText("Card title");
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, "Discarded");
    await userEvent.click(within(card).getByRole("button", { name: /cancel/i }));

    expect(mockedApi.updateCard).not.toHaveBeenCalled();
    expect(within(card).getByText("Align roadmap themes")).toBeInTheDocument();
  });

  it("shows an error when a change cannot be saved", async () => {
    mockedApi.deleteCard.mockRejectedValue(new Error("down"));
    await renderBoard();
    await userEvent.click(screen.getByRole("button", { name: /delete align roadmap themes/i }));
    expect(await screen.findByText(/could not save your change/i)).toBeInTheDocument();
  });

  it("updates the board when the assistant changes it", async () => {
    mockedApi.chat.mockResolvedValue({
      message: "Added a card.",
      board: board((b) => {
        b.cards["card-9"] = makeCard({ id: "card-9", title: "From the AI", details: "" });
        b.columns[3].cardIds.push("card-9");
      }),
    });
    await renderBoard();
    await userEvent.type(screen.getByLabelText("Message"), "Add a card to Review{Enter}");

    expect(await screen.findByText("From the AI")).toBeInTheDocument();
    expect(screen.getAllByTestId(/column-/i)[3]).toHaveTextContent("From the AI");
    expect(mockedApi.getBoard).toHaveBeenCalledTimes(1);
  });

  it("shows column renames made by the assistant", async () => {
    mockedApi.chat.mockResolvedValue({
      message: "Renamed.",
      board: board((b) => {
        b.columns[4].title = "Shipped";
      }),
    });
    await renderBoard();
    await userEvent.type(screen.getByLabelText("Message"), "Rename Done{Enter}");

    expect(await screen.findByDisplayValue("Shipped")).toBeInTheDocument();
  });

  describe("card details", () => {
    it("saves priority, due date and labels", async () => {
      mockedApi.updateCard.mockResolvedValue(
        board((b) => {
          b.cards["card-1"] = {
            ...b.cards["card-1"],
            priority: "high",
            dueDate: "2999-01-31",
            labels: ["design", "ux"],
          };
        })
      );
      await renderBoard();
      const card = screen.getByTestId("card-card-1");
      await userEvent.click(
        within(card).getByRole("button", { name: /edit align roadmap themes/i })
      );
      await userEvent.selectOptions(within(card).getByLabelText("Priority"), "high");
      await userEvent.type(within(card).getByLabelText("Due date"), "2999-01-31");
      await userEvent.type(within(card).getByLabelText("Labels"), "design, ux,");
      await userEvent.click(within(card).getByRole("button", { name: /save/i }));

      expect(mockedApi.updateCard).toHaveBeenCalledWith(
        "board-1",
        "card-1",
        expect.objectContaining({
          priority: "high",
          due_date: "2999-01-31",
          labels: ["design", "ux"],
        })
      );
      expect(await within(card).findByText("high")).toBeInTheDocument();
      expect(within(card).getByTestId("due-date")).toHaveTextContent("Due 2999-01-31");
      expect(within(card).getByText("design")).toBeInTheDocument();
    });

    it("prefills the edit form and can clear fields", async () => {
      mockedApi.getBoard.mockResolvedValue(
        board((b) => {
          b.cards["card-1"] = { ...b.cards["card-1"], priority: "low", labels: ["a"] };
        })
      );
      mockedApi.updateCard.mockResolvedValue(board());
      await renderBoard();
      const card = screen.getByTestId("card-card-1");
      await userEvent.click(
        within(card).getByRole("button", { name: /edit align roadmap themes/i })
      );
      expect(within(card).getByLabelText("Priority")).toHaveValue("low");
      expect(within(card).getByLabelText("Labels")).toHaveValue("a");
      await userEvent.selectOptions(within(card).getByLabelText("Priority"), "");
      await userEvent.clear(within(card).getByLabelText("Labels"));
      await userEvent.click(within(card).getByRole("button", { name: /save/i }));
      expect(mockedApi.updateCard).toHaveBeenCalledWith(
        "board-1",
        "card-1",
        expect.objectContaining({ priority: null, labels: [] })
      );
    });

    it("marks overdue cards", async () => {
      mockedApi.getBoard.mockResolvedValue(
        board((b) => {
          b.cards["card-1"] = { ...b.cards["card-1"], dueDate: "2000-01-01" };
        })
      );
      await renderBoard();
      const due = within(screen.getByTestId("card-card-1")).getByTestId("due-date");
      expect(due).toHaveTextContent("Overdue 2000-01-01");
      expect(due).toHaveClass("text-red-600");
    });
  });

  describe("columns", () => {
    it("adds a column", async () => {
      mockedApi.createColumn.mockResolvedValue(
        board((b) => {
          b.columns.push({ id: "col-6", title: "Blocked", cardIds: [] });
        })
      );
      await renderBoard();
      await userEvent.click(screen.getByRole("button", { name: /add column/i }));
      await userEvent.type(screen.getByLabelText("New column title"), "Blocked{Enter}");
      expect(mockedApi.createColumn).toHaveBeenCalledWith("board-1", "Blocked");
      expect(await screen.findAllByTestId(/column-/i)).toHaveLength(6);
      expect(screen.getByRole("button", { name: /add column/i })).toBeInTheDocument();
    });

    it("moves columns left and right", async () => {
      mockedApi.moveColumn.mockResolvedValue(board());
      await renderBoard();
      expect(screen.getByRole("button", { name: "Move Backlog left" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Move Done right" })).toBeDisabled();
      await userEvent.click(screen.getByRole("button", { name: "Move Backlog right" }));
      expect(mockedApi.moveColumn).toHaveBeenCalledWith("board-1", "col-1", 1);
      await userEvent.click(screen.getByRole("button", { name: "Move Done left" }));
      expect(mockedApi.moveColumn).toHaveBeenCalledWith("board-1", "col-5", 3);
    });

    it("offers delete only for empty columns", async () => {
      mockedApi.getBoard.mockResolvedValue(
        board((b) => {
          b.columns.push({ id: "col-6", title: "Blocked", cardIds: [] });
        })
      );
      mockedApi.deleteColumn.mockResolvedValue(board());
      await renderBoard();
      expect(screen.queryByRole("button", { name: "Delete Backlog" })).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Delete Blocked" }));
      expect(mockedApi.deleteColumn).toHaveBeenCalledWith("board-1", "col-6");
      expect(await screen.findAllByTestId(/column-/i)).toHaveLength(5);
    });
  });

  describe("filters", () => {
    const visibleCards = () => screen.queryAllByTestId(/^card-card-/);

    it("searches cards and clears the search", async () => {
      await renderBoard();
      await userEvent.type(screen.getByLabelText("Search cards"), "roadmap");
      expect(visibleCards()).toHaveLength(1);
      expect(screen.getByText(/showing 1 of 8 cards/i)).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: /clear filters/i }));
      expect(visibleCards()).toHaveLength(8);
      expect(screen.getByLabelText("Search cards")).toHaveValue("");
    });

    it("filters by priority and overdue", async () => {
      mockedApi.getBoard.mockResolvedValue(
        board((b) => {
          b.cards["card-2"] = { ...b.cards["card-2"], priority: "medium" };
          b.cards["card-7"] = { ...b.cards["card-7"], dueDate: "2000-01-01" };
        })
      );
      await renderBoard();
      await userEvent.selectOptions(screen.getByLabelText("Filter by priority"), "medium");
      expect(visibleCards().map((c) => c.dataset.testid)).toEqual(["card-card-2"]);
      await userEvent.selectOptions(screen.getByLabelText("Filter by priority"), "");
      await userEvent.click(screen.getByLabelText("Overdue only"));
      expect(visibleCards().map((c) => c.dataset.testid)).toEqual(["card-card-7"]);
    });

    it("keeps delete hidden for columns whose cards are filtered out", async () => {
      await renderBoard();
      await userEvent.type(screen.getByLabelText("Search cards"), "roadmap");
      expect(screen.queryByRole("button", { name: "Delete Discovery" })).not.toBeInTheDocument();
    });
  });

  describe("summary and activity", () => {
    const entry = (id: number, summary: string) => ({
      id,
      action: "card.update",
      summary,
      createdAt: "2026-10-23 09:30:00",
    });

    it("summarises the board", async () => {
      mockedApi.getBoard.mockResolvedValue(
        board((b) => {
          b.cards["card-1"] = { ...b.cards["card-1"], priority: "high", dueDate: "2000-01-01" };
          b.cards["card-2"] = { ...b.cards["card-2"], priority: "high" };
        })
      );
      await renderBoard();
      const summary = screen.getByLabelText("Board summary");
      expect(summary).toHaveTextContent("8cards");
      expect(summary).toHaveTextContent("1overdue");
      expect(summary).toHaveTextContent("2high priority");
    });

    it("shows recent activity and refreshes it after a change", async () => {
      mockedApi.getActivity.mockResolvedValueOnce([entry(1, 'Created board "My Board"')]);
      mockedApi.getActivity.mockResolvedValueOnce([
        entry(2, 'Deleted card "Align roadmap themes"'),
        entry(1, 'Created board "My Board"'),
      ]);
      mockedApi.deleteCard.mockResolvedValue(
        board((b) => {
          delete b.cards["card-1"];
          b.columns[0].cardIds = ["card-2"];
        })
      );
      await renderBoard();
      expect(mockedApi.getActivity).not.toHaveBeenCalled();
      await userEvent.click(screen.getByRole("button", { name: "Activity" }));
      const panel = screen.getByRole("region", { name: "Recent activity" });
      expect(await within(panel).findByText('Created board "My Board"')).toBeInTheDocument();
      expect(mockedApi.getActivity).toHaveBeenCalledWith("board-1");

      await userEvent.click(screen.getByRole("button", { name: /delete align roadmap themes/i }));
      expect(
        await within(panel).findByText('Deleted card "Align roadmap themes"')
      ).toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Activity" }));
      expect(screen.queryByRole("region", { name: "Recent activity" })).not.toBeInTheDocument();
    });

    it("shows empty and error states", async () => {
      mockedApi.getActivity.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error("down"));
      await renderBoard();
      await userEvent.click(screen.getByRole("button", { name: "Activity" }));
      expect(await screen.findByText("No changes yet.")).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Activity" }));
      await userEvent.click(screen.getByRole("button", { name: "Activity" }));
      expect(await screen.findByText(/could not load the activity/i)).toBeInTheDocument();
    });
  });
});
