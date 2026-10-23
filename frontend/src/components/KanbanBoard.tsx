"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { LogOut, Sparkles, SquareKanban } from "lucide-react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { ChatSidebar } from "@/components/ChatSidebar";
import { KanbanColumn } from "@/components/KanbanColumn";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";
import * as api from "@/lib/api";
import { moveCard, type BoardData } from "@/lib/kanban";

type KanbanBoardProps = {
  onLogout: () => void;
};

export const KanbanBoard = ({ onLogout }: KanbanBoardProps) => {
  const [board, setBoard] = useState<BoardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  // Open by default except on phone-sized screens, where it would cover the board.
  const [isChatOpen, setIsChatOpen] = useState(
    () => window.matchMedia("(min-width: 640px)").matches
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  // Applies the board returned by the API; on failure the user is asked to reload.
  const save = async (request: Promise<BoardData>) => {
    try {
      setBoard(await request);
      setError(null);
    } catch {
      setError("Could not save your change. Reload the page to see the latest board.");
    }
  };

  useEffect(() => {
    api
      .getBoard()
      .then(setBoard)
      .catch(() => setError("Could not load the board. Try reloading the page."));
  }, []);

  if (!board) {
    return error ? (
      <p role="alert" className="p-12 text-sm font-semibold text-[var(--secondary-purple)]">
        {error}
      </p>
    ) : null;
  }

  const handleDragStart = (event: DragStartEvent) => {
    setActiveCardId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCardId(null);

    if (!over || active.id === over.id) {
      return;
    }

    // Move locally first so the drop feels instant, then persist the new position.
    const cardId = active.id as string;
    const columns = moveCard(board.columns, cardId, over.id as string);
    const column = columns.find((c) => c.cardIds.includes(cardId))!;
    setBoard({ ...board, columns });
    save(api.moveCard(cardId, column.id, column.cardIds.indexOf(cardId)));
  };

  const handleRenameColumn = (columnId: string, title: string) =>
    save(api.renameColumn(columnId, title));

  const handleAddCard = (columnId: string, title: string, details: string) =>
    save(api.createCard(columnId, title, details));

  const handleEditCard = (cardId: string, title: string, details: string) =>
    save(api.updateCard(cardId, title, details));

  const handleDeleteCard = (cardId: string) => save(api.deleteCard(cardId));

  const activeCard = activeCardId ? board.cards[activeCardId] : null;

  return (
    <div className={clsx("flex h-dvh flex-col", isChatOpen && "sm:pr-[320px] 2xl:pr-[380px]")}>
      <header className="flex items-center justify-between gap-4 border-b border-[var(--stroke)] bg-white px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--navy-dark)] text-[var(--accent-yellow)]">
            <SquareKanban size={20} />
          </span>
          <div className="min-w-0">
            <h1 className="font-display text-xl font-semibold leading-tight text-[var(--navy-dark)]">
              Kanban Studio
            </h1>
            <p className="truncate text-xs text-[var(--gray-text)]">
              {Object.keys(board.cards).length} cards across {board.columns.length} columns
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!isChatOpen && (
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
          <button
            type="button"
            onClick={onLogout}
            aria-label="Log out"
            className="flex items-center gap-2 rounded-full border border-[var(--stroke)] px-3 py-2 text-xs font-semibold text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
          >
            <LogOut size={14} />
            <span className="hidden sm:inline">Log out</span>
          </button>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col gap-3 p-4">
        {error && (
          <p
            role="alert"
            className="rounded-xl border border-[var(--secondary-purple)] bg-white px-4 py-2 text-sm font-semibold text-[var(--secondary-purple)]"
          >
            {error}
          </p>
        )}

        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <section className="flex min-h-0 flex-1 snap-x gap-3 overflow-x-auto pb-1">
            {board.columns.map((column) => (
              <KanbanColumn
                key={column.id}
                column={column}
                cards={column.cardIds.map((cardId) => board.cards[cardId])}
                onRename={handleRenameColumn}
                onAddCard={handleAddCard}
                onDeleteCard={handleDeleteCard}
                onEditCard={handleEditCard}
              />
            ))}
          </section>
          <DragOverlay>
            {activeCard ? (
              <div className="w-[240px]">
                <KanbanCardPreview card={activeCard} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </main>
      <ChatSidebar
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        onBoardChange={setBoard}
      />
    </div>
  );
};
