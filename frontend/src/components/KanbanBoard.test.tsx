import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KanbanBoard } from "@/components/KanbanBoard";
import * as api from "@/lib/api";
import type { BoardData } from "@/lib/kanban";
import { boardData } from "@/test/boardData";

vi.mock("@/lib/api");
const mockedApi = vi.mocked(api);

const board = (change: (draft: BoardData) => void = () => {}) => {
  const draft = structuredClone(boardData);
  change(draft);
  return draft;
};

const renderBoard = async () => {
  render(<KanbanBoard onLogout={() => {}} />);
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
    expect(screen.getAllByTestId(/column-/i)).toHaveLength(5);
    expect(screen.getByText("Align roadmap themes")).toBeInTheDocument();
  });

  it("shows an error when the board cannot be loaded", async () => {
    mockedApi.getBoard.mockRejectedValue(new Error("down"));
    render(<KanbanBoard onLogout={() => {}} />);
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
    expect(mockedApi.renameColumn).toHaveBeenCalledWith("col-1", "New Name");
    expect(input).toHaveValue("New Name");
  });

  it("renames a column on Enter", async () => {
    mockedApi.renameColumn.mockResolvedValue(board());
    await renderBoard();
    const input = within(getFirstColumn()).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "Ideas{Enter}");
    expect(mockedApi.renameColumn).toHaveBeenCalledWith("col-1", "Ideas");
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
        b.cards["card-9"] = { id: "card-9", title: "New card", details: "Notes" };
        b.columns[0].cardIds.push("card-9");
      })
    );
    await renderBoard();
    const column = getFirstColumn();
    await userEvent.click(within(column).getByRole("button", { name: /add a card/i }));
    await userEvent.type(within(column).getByPlaceholderText(/card title/i), "New card");
    await userEvent.type(within(column).getByPlaceholderText(/details/i), "Notes");
    await userEvent.click(within(column).getByRole("button", { name: /add card/i }));

    expect(mockedApi.createCard).toHaveBeenCalledWith("col-1", "New card", "Notes");
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

    expect(mockedApi.deleteCard).toHaveBeenCalledWith("card-1");
    expect(screen.queryByText("Align roadmap themes")).not.toBeInTheDocument();
  });

  it("edits a card", async () => {
    mockedApi.updateCard.mockResolvedValue(
      board((b) => {
        b.cards["card-1"] = { id: "card-1", title: "Updated title", details: "Updated details" };
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

    expect(mockedApi.updateCard).toHaveBeenCalledWith("card-1", "Updated title", "Updated details");
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
        b.cards["card-9"] = { id: "card-9", title: "From the AI", details: "" };
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
});
