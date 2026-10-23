import { Search, X } from "lucide-react";
import { isFilterActive, NO_FILTER, type BoardFilter, type Priority } from "@/lib/kanban";

type BoardToolbarProps = {
  filter: BoardFilter;
  onChange: (filter: BoardFilter) => void;
  shown: number;
  total: number;
};

const controlClass =
  "rounded-lg border border-[var(--stroke)] bg-white px-2 py-1.5 text-xs text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]";

export const BoardToolbar = ({ filter, onChange, shown, total }: BoardToolbarProps) => {
  const active = isFilterActive(filter);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="relative min-w-[160px] flex-1 sm:max-w-xs">
        <Search
          size={14}
          className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[var(--gray-text)]"
        />
        <input
          type="search"
          value={filter.text}
          onChange={(event) => onChange({ ...filter, text: event.target.value })}
          placeholder="Search cards"
          aria-label="Search cards"
          className={`${controlClass} w-full pl-7`}
        />
      </label>
      <select
        value={filter.priority}
        onChange={(event) => onChange({ ...filter, priority: event.target.value as Priority | "" })}
        aria-label="Filter by priority"
        className={controlClass}
      >
        <option value="">All priorities</option>
        <option value="high">High</option>
        <option value="medium">Medium</option>
        <option value="low">Low</option>
      </select>
      <label className="flex items-center gap-1.5 text-xs font-semibold text-[var(--gray-text)]">
        <input
          type="checkbox"
          checked={filter.overdueOnly}
          onChange={(event) => onChange({ ...filter, overdueOnly: event.target.checked })}
          className="accent-[var(--secondary-purple)]"
        />
        Overdue only
      </label>
      {active && (
        <>
          <span className="text-xs text-[var(--gray-text)]" role="status">
            Showing {shown} of {total} cards; drag is off while filtering
          </span>
          <button
            type="button"
            onClick={() => onChange(NO_FILTER)}
            className="flex items-center gap-1 text-xs font-semibold text-[var(--primary-blue)] hover:underline"
          >
            <X size={12} />
            Clear filters
          </button>
        </>
      )}
    </div>
  );
};
