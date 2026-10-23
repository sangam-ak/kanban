import type { Card } from "@/lib/kanban";

type KanbanCardPreviewProps = {
  card: Card;
};

export const KanbanCardPreview = ({ card }: KanbanCardPreviewProps) => (
  <article className="min-w-0 break-words rounded-xl border border-[var(--primary-blue)]/40 bg-white p-3 shadow-[0_18px_32px_rgba(3,33,71,0.16)]">
    <h4 className="font-display text-sm font-semibold text-[var(--navy-dark)]">
      {card.title}
    </h4>
    {card.details && (
      <p className="mt-1 text-xs leading-5 text-[var(--gray-text)]">{card.details}</p>
    )}
  </article>
);
