import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import clsx from "clsx";
import * as api from "@/lib/api";
import type { BoardData } from "@/lib/kanban";

type ChatSidebarProps = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onBoardChange: (board: BoardData) => void;
};

// Stays mounted while closed so the conversation is kept.
export const ChatSidebar = ({ isOpen, onOpenChange, onBoardChange }: ChatSidebarProps) => {
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
      const reply = await api.chat(message, history);
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
    return (
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        className="fixed bottom-6 right-6 z-20 rounded-full bg-[var(--secondary-purple)] px-5 py-3 text-xs font-semibold uppercase tracking-wide text-white shadow-[var(--shadow)] transition hover:brightness-110"
      >
        Open assistant
      </button>
    );
  }

  return (
    <aside
      aria-label="AI assistant"
      className="fixed inset-y-0 right-0 z-20 flex w-full flex-col border-l border-[var(--stroke)] bg-white/95 shadow-[var(--shadow)] backdrop-blur sm:w-[380px]"
    >
      <header className="flex items-start justify-between gap-4 border-b border-[var(--stroke)] px-6 py-5">
        <div>
          <div className="h-2 w-10 rounded-full bg-[var(--accent-yellow)]" />
          <h2 className="mt-3 font-display text-xl font-semibold text-[var(--navy-dark)]">
            AI Assistant
          </h2>
          <p className="mt-1 text-xs text-[var(--gray-text)]">
            Ask about your board, or ask me to add, edit or move cards.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="rounded-full border border-[var(--stroke)] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
          aria-label="Close assistant"
        >
          Close
        </button>
      </header>

      <div ref={listRef} className="flex flex-1 flex-col gap-3 overflow-y-auto px-6 py-5">
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

      <form onSubmit={handleSubmit} className="border-t border-[var(--stroke)] px-6 py-4">
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message the assistant"
          aria-label="Message"
          rows={3}
          className="w-full resize-none rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
        />
        <button
          type="submit"
          disabled={isSending || !input.trim()}
          className="mt-3 w-full rounded-full bg-[var(--secondary-purple)] px-4 py-3 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110 disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </aside>
  );
};
