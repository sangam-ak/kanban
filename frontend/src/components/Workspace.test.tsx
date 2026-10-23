import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BOARD_STORAGE_KEY, Workspace } from "@/components/Workspace";
import * as api from "@/lib/api";
import type { BoardData } from "@/lib/kanban";
import { boardData, makeCard } from "@/test/boardData";

vi.mock("@/lib/api");
const mockedApi = vi.mocked(api);

const boards = [
  { id: "board-1", name: "My Board" },
  { id: "board-2", name: "Roadmap" },
];

// board-2 has a single card so the two boards are easy to tell apart.
const roadmap: BoardData = {
  columns: [{ id: "col-9", title: "Ideas", cardIds: ["card-9"] }],
  cards: { "card-9": makeCard({ id: "card-9", title: "Roadmap card", details: "" }) },
};

const renderWorkspace = async () => {
  render(<Workspace username="user" onLogout={() => {}} />);
  await screen.findAllByTestId(/column-/i);
};

const switcher = () => screen.getByRole("button", { name: /switch board/i });

const openMenu = () => userEvent.click(switcher());

describe("Workspace", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
    mockedApi.listBoards.mockResolvedValue(boards);
    mockedApi.getBoard.mockImplementation(async (id) =>
      structuredClone(id === "board-2" ? roadmap : boardData)
    );
  });

  it("shows the first board by default", async () => {
    await renderWorkspace();
    expect(switcher()).toHaveTextContent("My Board");
    expect(mockedApi.getBoard).toHaveBeenCalledWith("board-1");
  });

  it("opens the remembered board", async () => {
    localStorage.setItem(BOARD_STORAGE_KEY, "board-2");
    await renderWorkspace();
    expect(switcher()).toHaveTextContent("Roadmap");
    expect(screen.getByText("Roadmap card")).toBeInTheDocument();
  });

  it("falls back to the first board when the remembered one is gone", async () => {
    localStorage.setItem(BOARD_STORAGE_KEY, "board-99");
    await renderWorkspace();
    expect(switcher()).toHaveTextContent("My Board");
  });

  it("switches boards, remembers the choice and resets the chat", async () => {
    mockedApi.chat.mockResolvedValue({ message: "Hello there", board: boardData });
    await renderWorkspace();
    await userEvent.type(screen.getByLabelText("Message"), "Hi{Enter}");
    expect(await screen.findByText("Hello there")).toBeInTheDocument();

    await openMenu();
    const list = screen.getByRole("list", { name: "Boards" });
    await userEvent.click(within(list).getByRole("button", { name: "Roadmap" }));

    expect(await screen.findByText("Roadmap card")).toBeInTheDocument();
    expect(switcher()).toHaveTextContent("Roadmap");
    expect(localStorage.getItem(BOARD_STORAGE_KEY)).toBe("board-2");
    expect(screen.queryByText("Hello there")).not.toBeInTheDocument();
  });

  it("creates a board and switches to it", async () => {
    mockedApi.createBoard.mockResolvedValue({ id: "board-3", name: "Launch" });
    await renderWorkspace();
    await openMenu();
    await userEvent.click(screen.getByRole("button", { name: /new board/i }));
    await userEvent.type(screen.getByLabelText("New board name"), "  Launch {Enter}");

    expect(mockedApi.createBoard).toHaveBeenCalledWith("Launch");
    expect(switcher()).toHaveTextContent("Launch");
    expect(mockedApi.getBoard).toHaveBeenLastCalledWith("board-3");
  });

  it("ignores a blank new board name", async () => {
    await renderWorkspace();
    await openMenu();
    await userEvent.click(screen.getByRole("button", { name: /new board/i }));
    await userEvent.type(screen.getByLabelText("New board name"), "   {Enter}");
    expect(mockedApi.createBoard).not.toHaveBeenCalled();
  });

  it("renames the current board", async () => {
    mockedApi.renameBoard.mockResolvedValue({ id: "board-1", name: "Work" });
    await renderWorkspace();
    await openMenu();
    await userEvent.click(screen.getByRole("button", { name: /rename board/i }));
    const input = screen.getByLabelText("Board name");
    expect(input).toHaveValue("My Board");
    await userEvent.clear(input);
    await userEvent.type(input, "Work{Enter}");

    expect(mockedApi.renameBoard).toHaveBeenCalledWith("board-1", "Work");
    expect(switcher()).toHaveTextContent("Work");
  });

  it("asks before deleting and can cancel", async () => {
    await renderWorkspace();
    await openMenu();
    await userEvent.click(screen.getByRole("button", { name: /delete board/i }));
    expect(screen.getByText(/and all its cards/i)).toHaveTextContent("Delete My Board");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(mockedApi.deleteBoard).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /new board/i })).toBeInTheDocument();
  });

  it("deletes the current board and opens the next one", async () => {
    mockedApi.deleteBoard.mockResolvedValue([boards[1]]);
    await renderWorkspace();
    await openMenu();
    await userEvent.click(screen.getByRole("button", { name: /delete board/i }));
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(mockedApi.deleteBoard).toHaveBeenCalledWith("board-1");
    expect(await screen.findByText("Roadmap card")).toBeInTheDocument();
    expect(switcher()).toHaveTextContent("Roadmap");
  });

  it("shows an empty state without boards and creates one from it", async () => {
    mockedApi.listBoards.mockResolvedValue([]);
    mockedApi.createBoard.mockResolvedValue({ id: "board-3", name: "First" });
    render(<Workspace username="user" onLogout={() => {}} />);

    expect(await screen.findByText("No boards yet")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /switch board/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /open assistant/i })).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("New board name"), "First");
    await userEvent.click(screen.getByRole("button", { name: /create board/i }));

    expect(await screen.findAllByTestId(/column-/i)).toHaveLength(5);
    expect(screen.queryByText("No boards yet")).not.toBeInTheDocument();
  });

  it("shows an error when the boards cannot be loaded", async () => {
    mockedApi.listBoards.mockRejectedValue(new Error("down"));
    render(<Workspace username="user" onLogout={() => {}} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not load your boards/i);
  });

  it("shows an error when a board change fails", async () => {
    mockedApi.renameBoard.mockRejectedValue(new Error("down"));
    await renderWorkspace();
    await openMenu();
    await userEvent.click(screen.getByRole("button", { name: /rename board/i }));
    await userEvent.type(screen.getByLabelText("Board name"), "!{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not save your change/i);
    expect(switcher()).toHaveTextContent("My Board");
  });

  it("closes and reopens the assistant", async () => {
    await renderWorkspace();
    await userEvent.click(screen.getByRole("button", { name: /close assistant/i }));
    expect(screen.queryByLabelText("Message")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /open assistant/i }));
    expect(screen.getByLabelText("Message")).toBeInTheDocument();
  });

  it("closes the board menu when the switcher is clicked again", async () => {
    await renderWorkspace();
    await openMenu();
    expect(screen.getByRole("list", { name: "Boards" })).toBeInTheDocument();
    await openMenu();
    expect(screen.queryByRole("list", { name: "Boards" })).not.toBeInTheDocument();
  });
});
