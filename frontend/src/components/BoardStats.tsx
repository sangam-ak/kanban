import { isOverdue, type BoardData } from "@/lib/kanban";

// Board-wide counts; per-column counts are shown in each column header.
export const BoardStats = ({ board }: { board: BoardData }) => {
  const cards = Object.values(board.cards);
  const stats = [
    { label: "cards", value: cards.length },
    { label: "overdue", value: cards.filter((card) => isOverdue(card)).length },
    { label: "high priority", value: cards.filter((card) => card.priority === "high").length },
  ];
  return (
    <dl className="flex items-center gap-3 text-xs" aria-label="Board summary">
      {stats.map((stat) => (
        <div key={stat.label} className="flex items-baseline gap-1">
          <dd className="font-display text-sm font-semibold text-[var(--navy-dark)]">
            {stat.value}
          </dd>
          <dt className="text-[var(--gray-text)]">{stat.label}</dt>
        </div>
      ))}
    </dl>
  );
};
