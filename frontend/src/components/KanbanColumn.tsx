import { useState } from "react";
import clsx from "clsx";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Card, Column } from "@/lib/kanban";
import { KanbanCard } from "@/components/KanbanCard";
import { NewCardForm } from "@/components/NewCardForm";

type KanbanColumnProps = {
  column: Column;
  cards: Card[];
  onRename: (columnId: string, title: string) => void;
  onAddCard: (columnId: string, title: string, details: string) => void;
  onDeleteCard: (cardId: string) => void;
  onEditCard: (cardId: string, title: string, details: string) => void;
};

export const KanbanColumn = ({
  column,
  cards,
  onRename,
  onAddCard,
  onDeleteCard,
  onEditCard,
}: KanbanColumnProps) => {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const [title, setTitle] = useState(column.title);
  const [savedTitle, setSavedTitle] = useState(column.title);

  // Pick up title changes made elsewhere (e.g. by the AI).
  if (column.title !== savedTitle) {
    setSavedTitle(column.title);
    setTitle(column.title);
  }

  const commitTitle = () => {
    const trimmed = title.trim();
    if (!trimmed) {
      setTitle(column.title);
    } else if (trimmed !== column.title) {
      onRename(column.id, trimmed);
    }
  };

  return (
    <section
      ref={setNodeRef}
      className={clsx(
        "flex min-w-[85%] flex-1 snap-start flex-col sm:min-w-[190px] rounded-2xl border border-[var(--stroke)] bg-[var(--surface-strong)] shadow-[0_8px_24px_rgba(3,33,71,0.06)] transition",
        isOver && "ring-2 ring-[var(--accent-yellow)]"
      )}
      data-testid={`column-${column.id}`}
    >
      <div className="flex items-center gap-2 border-t-4 border-[var(--accent-yellow)] rounded-t-2xl px-3 pb-2 pt-3">
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={commitTitle}
          onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
          className="min-w-0 flex-1 rounded-md bg-transparent px-1 font-display text-base font-semibold text-[var(--navy-dark)] outline-none transition hover:bg-[var(--surface)] focus:bg-[var(--surface)]"
          aria-label="Column title"
        />
        <span
          className="rounded-full bg-[var(--surface)] px-2 py-0.5 text-xs font-semibold text-[var(--gray-text)]"
          aria-label={`${cards.length} ${cards.length === 1 ? "card" : "cards"}`}
        >
          {cards.length}
        </span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 py-1">
        <SortableContext items={column.cardIds} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <KanbanCard
              key={card.id}
              card={card}
              onDelete={onDeleteCard}
              onEdit={onEditCard}
            />
          ))}
        </SortableContext>
        {cards.length === 0 && (
          <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-[var(--stroke)] px-3 py-6 text-center text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
            Drop a card here
          </div>
        )}
      </div>
      <NewCardForm
        onAdd={(title, details) => onAddCard(column.id, title, details)}
      />
    </section>
  );
};
