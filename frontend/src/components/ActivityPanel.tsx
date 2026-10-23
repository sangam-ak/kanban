import { useEffect, useState } from "react";
import { History } from "lucide-react";
import * as api from "@/lib/api";
import type { BoardData } from "@/lib/kanban";

type ActivityPanelProps = {
  boardId: string;
  // Changes whenever the board does, so an open panel refreshes.
  board: BoardData;
};

// SQLite stores UTC as "YYYY-MM-DD HH:MM:SS".
const formatTime = (createdAt: string) =>
  new Date(`${createdAt.replace(" ", "T")}Z`).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

export const ActivityPanel = ({ boardId, board }: ActivityPanelProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [entries, setEntries] = useState<api.ActivityEntry[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    api
      .getActivity(boardId)
      .then((list) => {
        setEntries(list);
        setError(false);
      })
      .catch(() => setError(true));
  }, [isOpen, boardId, board]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        className="flex items-center gap-1 rounded-lg border border-[var(--stroke)] bg-white px-2 py-1.5 text-xs font-semibold text-[var(--navy-dark)] hover:border-[var(--primary-blue)]"
      >
        <History size={14} />
        Activity
      </button>
      {isOpen && (
        <section
          aria-label="Recent activity"
          className="absolute right-0 z-30 mt-2 max-h-80 w-80 overflow-y-auto rounded-xl border border-[var(--stroke)] bg-white p-3 shadow-[var(--shadow)]"
        >
          {error && (
            <p role="alert" className="text-xs font-semibold text-[var(--secondary-purple)]">
              Could not load the activity.
            </p>
          )}
          {entries?.length === 0 && (
            <p className="text-xs text-[var(--gray-text)]">No changes yet.</p>
          )}
          <ol className="space-y-2">
            {entries?.map((entry) => (
              <li key={entry.id} className="text-xs">
                <p className="text-[var(--navy-dark)]">{entry.summary}</p>
                <time dateTime={entry.createdAt} className="text-[var(--gray-text)]">
                  {formatTime(entry.createdAt)}
                </time>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
};
