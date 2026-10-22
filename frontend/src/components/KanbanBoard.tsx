"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
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
    <div className={clsx("relative overflow-hidden", isChatOpen && "sm:pr-[380px]")}>
      <div className="pointer-events-none absolute left-0 top-0 h-[420px] w-[420px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(32,157,215,0.25)_0%,_rgba(32,157,215,0.05)_55%,_transparent_70%)]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[520px] w-[520px] translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(117,57,145,0.18)_0%,_rgba(117,57,145,0.05)_55%,_transparent_75%)]" />

      <main className="relative mx-auto flex min-h-screen max-w-[1500px] flex-col gap-10 px-6 pb-16 pt-12">
        <header className="flex flex-col gap-6 rounded-[32px] border border-[var(--stroke)] bg-white/80 p-8 shadow-[var(--shadow)] backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
                Single Board Kanban
              </p>
              <h1 className="mt-3 font-display text-4xl font-semibold text-[var(--navy-dark)]">
                Kanban Studio
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--gray-text)]">
                Keep momentum visible. Rename columns, drag cards between stages,
                and capture quick notes without getting buried in settings.
              </p>
            </div>
            <div className="flex items-start gap-4">
              <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
                  Focus
                </p>
                <p className="mt-2 text-lg font-semibold text-[var(--primary-blue)]">
                  One board. Five columns. Zero clutter.
                </p>
              </div>
              <button
                type="button"
                onClick={onLogout}
                className="rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
              >
                Log out
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            {board.columns.map((column) => (
              <div
                key={column.id}
                className="flex items-center gap-2 rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--navy-dark)]"
              >
                <span className="h-2 w-2 rounded-full bg-[var(--accent-yellow)]" />
                {column.title}
              </div>
            ))}
          </div>
        </header>

        {error && (
          <p
            role="alert"
            className="rounded-2xl border border-[var(--secondary-purple)] bg-white px-5 py-3 text-sm font-semibold text-[var(--secondary-purple)]"
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
          <section className="grid auto-cols-[minmax(240px,1fr)] grid-flow-col gap-6 overflow-x-auto pb-2">
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
              <div className="w-[260px]">
                <KanbanCardPreview card={activeCard} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </main>
      <ChatSidebar isOpen={isChatOpen} onOpenChange={setIsChatOpen} onBoardChange={setBoard} />
    </div>
  );
};
