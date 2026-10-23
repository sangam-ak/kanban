import { useState, type FormEvent } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import { Pencil, Trash2 } from "lucide-react";
import type { Card } from "@/lib/kanban";

type KanbanCardProps = {
  card: Card;
  onDelete: (cardId: string) => void;
  onEdit: (cardId: string, title: string, details: string) => void;
};

export const KanbanCard = ({ card, onDelete, onEdit }: KanbanCardProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(card.title);
  const [details, setDetails] = useState(card.details);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const startEditing = () => {
    setTitle(card.title);
    setDetails(card.details);
    setIsEditing(true);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim()) {
      return;
    }
    onEdit(card.id, title.trim(), details.trim());
    setIsEditing(false);
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={clsx(
        "group relative rounded-xl border border-[var(--stroke)] bg-white p-3 shadow-[0_2px_6px_rgba(3,33,71,0.06)] hover:border-[var(--primary-blue)]/40",
        "transition-all duration-150",
        isDragging && "opacity-60 shadow-[0_18px_32px_rgba(3,33,71,0.16)]"
      )}
      {...(isEditing ? {} : { ...attributes, ...listeners })}
      data-testid={`card-${card.id}`}
    >
      {isEditing ? (
        <form onSubmit={handleSubmit} className="space-y-2">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            aria-label="Card title"
            className="w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm font-medium text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
            required
          />
          <textarea
            value={details}
            onChange={(event) => setDetails(event.target.value)}
            aria-label="Card details"
            rows={3}
            className="w-full resize-none rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--gray-text)] outline-none transition focus:border-[var(--primary-blue)]"
          />
          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="rounded-full border border-[var(--stroke)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1 break-words">
            <h4 className="font-display text-sm font-semibold text-[var(--navy-dark)]">
              {card.title}
            </h4>
            {card.details && (
              <p className="mt-1 text-xs leading-5 text-[var(--gray-text)]">{card.details}</p>
            )}
          </div>
          <div className="-mr-1 -mt-1 flex shrink-0 rounded-md bg-white transition [@media(hover:hover)]:absolute [@media(hover:hover)]:right-2 [@media(hover:hover)]:top-2 [@media(hover:hover)]:m-0 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100">
            <button
              type="button"
              onClick={startEditing}
              className="rounded-md p-1.5 text-[var(--gray-text)] transition hover:bg-[var(--surface)] hover:text-[var(--primary-blue)]"
              aria-label={`Edit ${card.title}`}
              title="Edit"
            >
              <Pencil size={14} />
            </button>
            <button
              type="button"
              onClick={() => onDelete(card.id)}
              className="rounded-md p-1.5 text-[var(--gray-text)] transition hover:bg-[var(--surface)] hover:text-[var(--secondary-purple)]"
              aria-label={`Delete ${card.title}`}
              title="Delete"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      )}
    </article>
  );
};
