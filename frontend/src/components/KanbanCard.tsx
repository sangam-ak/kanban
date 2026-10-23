import { useState, type FormEvent } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import { CalendarDays, Pencil, Trash2 } from "lucide-react";
import {
  isOverdue,
  parseLabels,
  type Card,
  type CardChanges,
  type Priority,
} from "@/lib/kanban";

type KanbanCardProps = {
  card: Card;
  onDelete: (cardId: string) => void;
  onEdit: (cardId: string, changes: CardChanges) => void;
};

const fieldClass =
  "w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]";

const priorityClass: Record<Priority, string> = {
  high: "bg-[var(--secondary-purple)] text-white",
  medium: "bg-[var(--accent-yellow)] text-[var(--navy-dark)]",
  low: "bg-[var(--surface)] text-[var(--gray-text)]",
};

// Priority badge, due date and labels; renders nothing for a card without them.
export const CardMeta = ({ card }: { card: Card }) => {
  if (!card.priority && !card.dueDate && card.labels.length === 0) {
    return null;
  }
  const overdue = isOverdue(card);
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] font-semibold">
      {card.priority && (
        <span className={clsx("rounded-full px-2 py-0.5 uppercase", priorityClass[card.priority])}>
          {card.priority}
        </span>
      )}
      {card.dueDate && (
        <span
          className={clsx(
            "flex items-center gap-1",
            overdue ? "text-red-600" : "text-[var(--gray-text)]"
          )}
          data-testid="due-date"
        >
          <CalendarDays size={12} />
          {overdue ? `Overdue ${card.dueDate}` : `Due ${card.dueDate}`}
        </span>
      )}
      {card.labels.map((label) => (
        <span
          key={label}
          className="rounded-full border border-[var(--primary-blue)]/30 px-2 py-0.5 text-[var(--primary-blue)]"
        >
          {label}
        </span>
      ))}
    </div>
  );
};

export const KanbanCard = ({ card, onDelete, onEdit }: KanbanCardProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(card.title);
  const [details, setDetails] = useState(card.details);
  const [priority, setPriority] = useState(card.priority ?? "");
  const [dueDate, setDueDate] = useState(card.dueDate ?? "");
  const [labels, setLabels] = useState(card.labels.join(", "));

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const startEditing = () => {
    setTitle(card.title);
    setDetails(card.details);
    setPriority(card.priority ?? "");
    setDueDate(card.dueDate ?? "");
    setLabels(card.labels.join(", "));
    setIsEditing(true);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim()) {
      return;
    }
    onEdit(card.id, {
      title: title.trim(),
      details: details.trim(),
      priority: (priority || null) as Priority | null,
      due_date: dueDate || null,
      labels: parseLabels(labels),
    });
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
            className={clsx(fieldClass, "font-medium")}
            required
          />
          <textarea
            value={details}
            onChange={(event) => setDetails(event.target.value)}
            aria-label="Card details"
            rows={3}
            className={clsx(fieldClass, "resize-none text-[var(--gray-text)]")}
          />
          <div className="flex gap-2">
            <select
              value={priority}
              onChange={(event) => setPriority(event.target.value)}
              aria-label="Priority"
              className={fieldClass}
            >
              <option value="">No priority</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
            <input
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
              aria-label="Due date"
              className={fieldClass}
            />
          </div>
          <input
            value={labels}
            onChange={(event) => setLabels(event.target.value)}
            aria-label="Labels"
            placeholder="Labels, comma separated"
            className={fieldClass}
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
            <CardMeta card={card} />
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
