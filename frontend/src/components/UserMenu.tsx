import { useState } from "react";
import { ChevronDown, LogOut, Settings, UserRound } from "lucide-react";
import { AccountSettings } from "@/components/AccountSettings";

type UserMenuProps = {
  username: string;
  onLogout: () => void;
};

const itemClass =
  "flex w-full items-center gap-2 px-4 py-2 text-left text-xs font-semibold text-[var(--navy-dark)] hover:bg-[var(--surface)]";

export const UserMenu = ({ username, onLogout }: UserMenuProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Account menu"
        aria-expanded={isOpen}
        className="flex items-center gap-2 rounded-full border border-[var(--stroke)] px-3 py-2 text-xs font-semibold text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
      >
        <UserRound size={14} />
        <span className="hidden max-w-[120px] truncate sm:inline">{username}</span>
        <ChevronDown size={14} />
      </button>
      {isOpen && (
        <div className="absolute right-0 z-40 mt-2 w-48 overflow-hidden rounded-xl border border-[var(--stroke)] bg-white py-1 shadow-[var(--shadow)]">
          <button
            type="button"
            className={itemClass}
            onClick={() => {
              setIsOpen(false);
              setIsSettingsOpen(true);
            }}
          >
            <Settings size={14} />
            Account settings
          </button>
          <button type="button" className={itemClass} onClick={onLogout}>
            <LogOut size={14} />
            Log out
          </button>
        </div>
      )}
      {isSettingsOpen && (
        <AccountSettings
          username={username}
          onClose={() => setIsSettingsOpen(false)}
          onAccountDeleted={onLogout}
        />
      )}
    </div>
  );
};
