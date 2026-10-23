import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatSidebar } from "@/components/ChatSidebar";
import * as api from "@/lib/api";
import type { BoardData } from "@/lib/kanban";
import { boardData } from "@/test/boardData";

vi.mock("@/lib/api");
const mockedApi = vi.mocked(api);

const Harness = ({ onBoardChange }: { onBoardChange: (board: BoardData) => void }) => {
  const [isOpen, setIsOpen] = useState(true);
  return (
    <>
      {!isOpen && <button onClick={() => setIsOpen(true)}>Open assistant</button>}
      <ChatSidebar
        boardId="board-1"
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onBoardChange={onBoardChange}
      />
    </>
  );
};

const renderSidebar = () => {
  const onBoardChange = vi.fn();
  render(<Harness onBoardChange={onBoardChange} />);
  return onBoardChange;
};

const type = (text: string) => userEvent.type(screen.getByLabelText("Message"), text);

describe("ChatSidebar", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("shows a hint before any messages", () => {
    renderSidebar();
    expect(screen.getByText(/try/i)).toBeInTheDocument();
  });

  it("sends a message and shows the reply", async () => {
    mockedApi.chat.mockResolvedValue({ message: "Added it.", board: boardData });
    const onBoardChange = renderSidebar();
    await type("Add a card");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    expect(screen.getByTestId("chat-user")).toHaveTextContent("Add a card");
    expect(await screen.findByTestId("chat-assistant")).toHaveTextContent("Added it.");
    expect(mockedApi.chat).toHaveBeenCalledWith("board-1", "Add a card", []);
    expect(onBoardChange).toHaveBeenCalledWith(boardData);
    expect(screen.getByLabelText("Message")).toHaveValue("");
  });

  it("sends the conversation history with later messages", async () => {
    mockedApi.chat
      .mockResolvedValueOnce({ message: "First reply", board: boardData })
      .mockResolvedValueOnce({ message: "Second reply", board: boardData });
    renderSidebar();
    await type("First{Enter}");
    await screen.findByText("First reply");
    await type("Second{Enter}");
    await screen.findByText("Second reply");

    expect(mockedApi.chat).toHaveBeenLastCalledWith("board-1", "Second", [
      { role: "user", content: "First" },
      { role: "assistant", content: "First reply" },
    ]);
  });

  it("sends on Enter but not on Shift+Enter", async () => {
    mockedApi.chat.mockResolvedValue({ message: "ok", board: boardData });
    renderSidebar();
    await type("Line one{Shift>}{Enter}{/Shift}Line two");
    expect(mockedApi.chat).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Message")).toHaveValue("Line one\nLine two");
    await type("{Enter}");
    expect(mockedApi.chat).toHaveBeenCalledWith("board-1", "Line one\nLine two", []);
  });

  it("shows a loading state and disables sending while waiting", async () => {
    let resolve!: (value: api.ChatReply) => void;
    mockedApi.chat.mockReturnValue(new Promise((r) => (resolve = r)));
    renderSidebar();
    await type("Hello{Enter}");

    expect(screen.getByText(/thinking/i)).toBeInTheDocument();
    await type("Again");
    expect(screen.getByRole("button", { name: /send/i })).toBeDisabled();

    resolve({ message: "Hi", board: boardData });
    expect(await screen.findByText("Hi")).toBeInTheDocument();
    expect(screen.queryByText(/thinking/i)).not.toBeInTheDocument();
  });

  it("shows an error when the assistant fails", async () => {
    mockedApi.chat.mockRejectedValue(new Error("down"));
    const onBoardChange = renderSidebar();
    await type("Hello{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not respond/i);
    expect(onBoardChange).not.toHaveBeenCalled();
  });

  it("keeps the conversation when closed and reopened", async () => {
    mockedApi.chat.mockResolvedValue({ message: "Kept", board: boardData });
    renderSidebar();
    await type("Hello{Enter}");
    await screen.findByText("Kept");

    await userEvent.click(screen.getByRole("button", { name: /close assistant/i }));
    expect(screen.queryByText("Kept")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /open assistant/i }));
    expect(screen.getByText("Kept")).toBeInTheDocument();
  });
});
