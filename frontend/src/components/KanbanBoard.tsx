"use client";

import { useEffect, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { ChatSidebar } from "@/components/ChatSidebar";
import { KanbanColumn } from "@/components/KanbanColumn";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";
import * as api from "@/lib/api";
import { NameForm } from "@/components/BoardSwitcher";
import { ActivityPanel } from "@/components/ActivityPanel";
import { BoardStats } from "@/components/BoardStats";
import { BoardToolbar } from "@/components/BoardToolbar";
import {
  columnFirstCollision,
  filterBoard,
  isFilterActive,
  moveCard,
  NO_FILTER,
  type BoardData,
  type CardChanges,
} from "@/lib/kanban";

type KanbanBoardProps = {
  boardId: string;
  isChatOpen: boolean;
  onCloseChat: () => void;
};

// Mount with key={boardId}: switching boards then starts with fresh state and chat.
export const KanbanBoard = ({ boardId, isChatOpen, onCloseChat }: KanbanBoardProps) => {
  const [board, setBoard] = useState<BoardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [isAddingColumn, setIsAddingColumn] = useState(false);
  const [filter, setFilter] = useState(NO_FILTER);

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
      .getBoard(boardId)
      .then(setBoard)
      .catch(() => setError("Could not load the board. Try reloading the page."));
  }, [boardId]);

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
    save(api.moveCard(boardId, cardId, column.id, column.cardIds.indexOf(cardId)));
  };

  const handleRenameColumn = (columnId: string, title: string) =>
    save(api.renameColumn(boardId, columnId, title));

  const handleMoveColumn = (columnId: string, position: number) =>
    save(api.moveColumn(boardId, columnId, position));

  const handleDeleteColumn = (columnId: string) => save(api.deleteColumn(boardId, columnId));

  const handleAddColumn = (title: string) => {
    setIsAddingColumn(false);
    save(api.createColumn(boardId, title));
  };

  const handleAddCard = (columnId: string, title: string, details: string) =>
    save(api.createCard(boardId, columnId, title, details));

  const handleEditCard = (cardId: string, changes: CardChanges) =>
    save(api.updateCard(boardId, cardId, changes));

  const handleDeleteCard = (cardId: string) => save(api.deleteCard(boardId, cardId));

  const activeCard = activeCardId ? board.cards[activeCardId] : null;
  const isFiltering = isFilterActive(filter);
  const visible = filterBoard(board, filter);

  return (
    <>
      <main className="flex min-h-0 flex-1 flex-col gap-3 p-4">
        {error && (
          <p
            role="alert"
            className="rounded-xl border border-[var(--secondary-purple)] bg-white px-4 py-2 text-sm font-semibold text-[var(--secondary-purple)]"
          >
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <BoardToolbar
            filter={filter}
            onChange={setFilter}
            shown={visible.columns.reduce((sum, column) => sum + column.cardIds.length, 0)}
            total={Object.keys(board.cards).length}
          />
          <div className="flex items-center gap-3">
            <BoardStats board={board} />
            <ActivityPanel boardId={boardId} board={board} />
          </div>
        </div>

        {/* Positions in a filtered view are ambiguous, so dragging is off while filtering. */}
        <DndContext
          sensors={isFiltering ? [] : sensors}
          collisionDetection={columnFirstCollision(board.columns)}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <section className="flex min-h-0 flex-1 snap-x gap-3 overflow-x-auto pb-1">
            {visible.columns.map((column, index) => (
              <KanbanColumn
                key={column.id}
                column={column}
                cards={column.cardIds.map((cardId) => board.cards[cardId])}
                isEmpty={board.columns[index].cardIds.length === 0}
                index={index}
                columnCount={board.columns.length}
                onRename={handleRenameColumn}
                onMove={handleMoveColumn}
                onDelete={handleDeleteColumn}
                onAddCard={handleAddCard}
                onDeleteCard={handleDeleteCard}
                onEditCard={handleEditCard}
              />
            ))}
            <div className="w-[190px] shrink-0">
              {isAddingColumn ? (
                <div className="rounded-2xl border border-[var(--stroke)] bg-white p-3">
                  <NameForm label="New column title" submitLabel="Add" onSubmit={handleAddColumn} />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsAddingColumn(true)}
                  className="w-full rounded-2xl border border-dashed border-[var(--stroke)] px-3 py-3 text-xs font-semibold uppercase tracking-wide text-[var(--primary-blue)] transition hover:border-[var(--primary-blue)]"
                >
                  + Add column
                </button>
              )}
            </div>
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
        boardId={boardId}
        isOpen={isChatOpen}
        onClose={onCloseChat}
        onBoardChange={setBoard}
      />
    </>
  );
};
