import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import clsx from "clsx";
import { SendHorizontal, Sparkles, X } from "lucide-react";
import * as api from "@/lib/api";
import type { BoardData } from "@/lib/kanban";

type ChatSidebarProps = {
  boardId: string;
  isOpen: boolean;
  onClose: () => void;
  onBoardChange: (board: BoardData) => void;
};

// Stays mounted while closed so the conversation is kept.
export const ChatSidebar = ({ boardId, isOpen, onClose, onBoardChange }: ChatSidebarProps) => {
  const [messages, setMessages] = useState<api.ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, isSending]);

  const send = async () => {
    const message = input.trim();
    if (!message || isSending) {
      return;
    }
    const history = messages;
    setMessages([...history, { role: "user", content: message }]);
    setInput("");
    setError(null);
    setIsSending(true);
    try {
      const reply = await api.chat(boardId, message, history);
      setMessages((prev) => [...prev, { role: "assistant", content: reply.message }]);
      onBoardChange(reply.board);
    } catch {
      setError("The assistant could not respond. Please try again.");
    } finally {
      setIsSending(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    send();
  };

  // Enter sends; Shift+Enter adds a new line.
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <aside
      aria-label="AI assistant"
      className="fixed inset-y-0 right-0 z-20 flex w-full flex-col border-l border-[var(--stroke)] bg-white shadow-[var(--shadow)] sm:w-[320px] 2xl:w-[380px]"
    >
      <header className="flex items-center justify-between gap-4 border-b border-[var(--stroke)] px-5 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--secondary-purple)] text-white">
            <Sparkles size={18} />
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-base font-semibold leading-tight text-[var(--navy-dark)]">
              AI Assistant
            </h2>
            <p className="truncate text-xs text-[var(--gray-text)]">
              Ask me to add, edit or move cards.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1.5 text-[var(--gray-text)] transition hover:bg-[var(--surface)] hover:text-[var(--navy-dark)]"
          aria-label="Close assistant"
          title="Close"
        >
          <X size={18} />
        </button>
      </header>

      <div ref={listRef} className="flex flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">
        {messages.length === 0 && (
          <p className="rounded-2xl border border-dashed border-[var(--stroke)] px-4 py-6 text-center text-sm text-[var(--gray-text)]">
            Try &ldquo;Add a card to Backlog for the launch checklist&rdquo; or &ldquo;Move
            the design card to Review&rdquo;.
          </p>
        )}
        {messages.map((message, index) => (
          <div
            key={index}
            data-testid={`chat-${message.role}`}
            className={clsx(
              "max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-6",
              message.role === "user"
                ? "self-end bg-[var(--primary-blue)] text-white"
                : "self-start bg-[var(--surface)] text-[var(--navy-dark)]"
            )}
          >
            {message.content}
          </div>
        ))}
        {isSending && (
          <div className="self-start rounded-2xl bg-[var(--surface)] px-4 py-3 text-sm text-[var(--gray-text)]">
            <span className="animate-pulse">Thinking...</span>
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm font-semibold text-[var(--secondary-purple)]">
            {error}
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="border-t border-[var(--stroke)] p-4">
        <div className="flex items-end gap-2 rounded-xl border border-[var(--stroke)] bg-white p-2 transition focus-within:border-[var(--primary-blue)]">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message the assistant"
            aria-label="Message"
            rows={2}
            className="flex-1 resize-none bg-transparent px-1 text-sm text-[var(--navy-dark)] outline-none"
          />
          <button
            type="submit"
            disabled={isSending || !input.trim()}
            className="rounded-lg bg-[var(--secondary-purple)] p-2 text-white transition hover:brightness-110 disabled:opacity-50"
            aria-label="Send"
            title="Send"
          >
            <SendHorizontal size={16} />
          </button>
        </div>
      </form>
    </aside>
  );
};
