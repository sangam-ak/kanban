import { useState, type FormEvent } from "react";
import clsx from "clsx";
import { Check, ChevronDown, Pencil, Plus, Trash2 } from "lucide-react";
import type { BoardSummary } from "@/lib/api";

const inputClass =
  "min-w-0 flex-1 rounded-lg border border-[var(--stroke)] px-2 py-1.5 text-sm text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]";
const smallButtonClass =
  "rounded-lg bg-[var(--secondary-purple)] px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110";
const itemClass =
  "flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-[var(--navy-dark)] hover:bg-[var(--surface)]";

type NameFormProps = {
  label: string;
  submitLabel: string;
  initialName?: string;
  onSubmit: (name: string) => void;
};

// One-line name input used for creating and renaming boards.
export const NameForm = ({ label, submitLabel, initialName = "", onSubmit }: NameFormProps) => {
  const [name, setName] = useState(initialName);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (name.trim()) {
      onSubmit(name.trim());
      setName("");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        aria-label={label}
        placeholder={label}
        className={inputClass}
        autoFocus
      />
      <button type="submit" className={smallButtonClass}>
        {submitLabel}
      </button>
    </form>
  );
};

type BoardSwitcherProps = {
  boards: BoardSummary[];
  boardId: string;
  onSelect: (boardId: string) => void;
  onCreate: (name: string) => void;
  onRename: (name: string) => void;
  onDelete: () => void;
};

type Mode = "menu" | "create" | "rename" | "delete";

export const BoardSwitcher = ({
  boards,
  boardId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: BoardSwitcherProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("menu");
  const current = boards.find((board) => board.id === boardId)!;

  const close = () => {
    setIsOpen(false);
    setMode("menu");
  };

  // Runs a menu action and closes the menu.
  const act = (action: () => void) => {
    action();
    close();
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => (isOpen ? close() : setIsOpen(true))}
        aria-label="Switch board"
        aria-expanded={isOpen}
        className="flex max-w-[220px] items-center gap-1 text-xs font-semibold text-[var(--primary-blue)] sm:max-w-[320px]"
      >
        <span className="truncate">{current.name}</span>
        <ChevronDown size={14} className="shrink-0" />
      </button>
      {isOpen && (
        <div className="absolute left-0 z-40 mt-2 w-72 overflow-hidden rounded-xl border border-[var(--stroke)] bg-white py-1 shadow-[var(--shadow)]">
          <ul aria-label="Boards" className="max-h-64 overflow-y-auto">
            {boards.map((board) => (
              <li key={board.id}>
                <button
                  type="button"
                  className={clsx(itemClass, board.id === boardId && "text-[var(--primary-blue)]")}
                  aria-current={board.id === boardId}
                  onClick={() => act(() => onSelect(board.id))}
                >
                  <Check
                    size={14}
                    className={clsx("shrink-0", board.id !== boardId && "invisible")}
                  />
                  <span className="truncate">{board.name}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-1 border-t border-[var(--stroke)] pt-1">
            {mode === "menu" && (
              <>
                <button type="button" className={itemClass} onClick={() => setMode("create")}>
                  <Plus size={14} />
                  New board
                </button>
                <button type="button" className={itemClass} onClick={() => setMode("rename")}>
                  <Pencil size={14} />
                  Rename board
                </button>
                <button type="button" className={itemClass} onClick={() => setMode("delete")}>
                  <Trash2 size={14} />
                  Delete board
                </button>
              </>
            )}
            {mode === "create" && (
              <div className="p-3">
                <NameForm
                  label="New board name"
                  submitLabel="Create"
                  onSubmit={(name) => act(() => onCreate(name))}
                />
              </div>
            )}
            {mode === "rename" && (
              <div className="p-3">
                <NameForm
                  label="Board name"
                  submitLabel="Save"
                  initialName={current.name}
                  onSubmit={(name) => act(() => onRename(name))}
                />
              </div>
            )}
            {mode === "delete" && (
              <div className="space-y-2 p-3 text-xs text-[var(--navy-dark)]">
                <p>
                  Delete <strong>{current.name}</strong> and all its cards?
                </p>
                <div className="flex gap-2">
                  <button type="button" className={smallButtonClass} onClick={() => act(onDelete)}>
                    Delete
                  </button>
                  <button
                    type="button"
                    className="rounded-lg px-3 py-1.5 font-semibold text-[var(--gray-text)] hover:text-[var(--navy-dark)]"
                    onClick={() => setMode("menu")}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
