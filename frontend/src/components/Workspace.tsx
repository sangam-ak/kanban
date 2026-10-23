"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { Sparkles, SquareKanban } from "lucide-react";
import { BoardSwitcher, NameForm } from "@/components/BoardSwitcher";
import { KanbanBoard } from "@/components/KanbanBoard";
import { UserMenu } from "@/components/UserMenu";
import * as api from "@/lib/api";

// The selected board is remembered per browser.
export const BOARD_STORAGE_KEY = "pm.boardId";

type WorkspaceProps = {
  username: string;
  onLogout: () => void;
};

export const Workspace = ({ username, onLogout }: WorkspaceProps) => {
  const [boards, setBoards] = useState<api.BoardSummary[] | null>(null);
  const [boardId, setBoardId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Open by default except on phone-sized screens, where it would cover the board.
  const [isChatOpen, setIsChatOpen] = useState(
    () => window.matchMedia("(min-width: 640px)").matches
  );

  const select = (id: string | null) => {
    setBoardId(id);
    if (id) {
      localStorage.setItem(BOARD_STORAGE_KEY, id);
    }
  };

  useEffect(() => {
    api
      .listBoards()
      .then((list) => {
        const remembered = localStorage.getItem(BOARD_STORAGE_KEY);
        setBoards(list);
        setBoardId((list.find((b) => b.id === remembered) ?? list[0])?.id ?? null);
      })
      .catch(() => setError("Could not load your boards. Try reloading the page."));
  }, []);

  const run = async (action: () => Promise<void>) => {
    try {
      await action();
      setError(null);
    } catch {
      setError("Could not save your change. Reload the page to see the latest boards.");
    }
  };

  const handleCreate = (name: string) =>
    run(async () => {
      const created = await api.createBoard(name);
      setBoards((prev) => [...(prev ?? []), created]);
      select(created.id);
    });

  const handleRename = (name: string) =>
    run(async () => {
      const renamed = await api.renameBoard(boardId!, name);
      setBoards((prev) => prev!.map((b) => (b.id === renamed.id ? renamed : b)));
    });

  const handleDelete = () =>
    run(async () => {
      const remaining = await api.deleteBoard(boardId!);
      setBoards(remaining);
      select(remaining[0]?.id ?? null);
    });

  const showChat = isChatOpen && boardId !== null;

  return (
    <div className={clsx("flex h-dvh flex-col", showChat && "sm:pr-[320px] 2xl:pr-[380px]")}>
      <header className="flex items-center justify-between gap-4 border-b border-[var(--stroke)] bg-white px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--navy-dark)] text-[var(--accent-yellow)]">
            <SquareKanban size={20} />
          </span>
          <div className="min-w-0">
            <h1 className="font-display text-xl font-semibold leading-tight text-[var(--navy-dark)]">
              Kanban Studio
            </h1>
            {boards && boardId && (
              <BoardSwitcher
                boards={boards}
                boardId={boardId}
                onSelect={select}
                onCreate={handleCreate}
                onRename={handleRename}
                onDelete={handleDelete}
              />
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {boardId && !isChatOpen && (
            <button
              type="button"
              onClick={() => setIsChatOpen(true)}
              aria-label="Open assistant"
              className="flex items-center gap-2 rounded-full bg-[var(--secondary-purple)] px-3 py-2 text-xs font-semibold text-white transition hover:brightness-110"
            >
              <Sparkles size={14} />
              <span className="hidden sm:inline">Open assistant</span>
            </button>
          )}
          <UserMenu username={username} onLogout={onLogout} />
        </div>
      </header>

      {error && (
        <p
          role="alert"
          className="mx-4 mt-4 rounded-xl border border-[var(--secondary-purple)] bg-white px-4 py-2 text-sm font-semibold text-[var(--secondary-purple)]"
        >
          {error}
        </p>
      )}

      {boardId && (
        <KanbanBoard
          key={boardId}
          boardId={boardId}
          isChatOpen={isChatOpen}
          onCloseChat={() => setIsChatOpen(false)}
        />
      )}

      {boards?.length === 0 && (
        <main className="flex flex-1 items-center justify-center p-6">
          <div className="w-full max-w-sm space-y-4 rounded-[24px] border border-[var(--stroke)] bg-white p-6 shadow-[var(--shadow)]">
            <div>
              <h2 className="font-display text-xl font-semibold text-[var(--navy-dark)]">
                No boards yet
              </h2>
              <p className="text-sm text-[var(--gray-text)]">Create a board to start planning.</p>
            </div>
            <NameForm label="New board name" submitLabel="Create board" onSubmit={handleCreate} />
          </div>
        </main>
      )}
    </div>
  );
};
