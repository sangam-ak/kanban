import { useState, type FormEvent } from "react";
import { X } from "lucide-react";
import * as api from "@/lib/api";

type AccountSettingsProps = {
  username: string;
  onClose: () => void;
  onAccountDeleted: () => void;
};

const labelClass =
  "block text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]";
const inputClass =
  "mt-2 w-full rounded-xl border border-[var(--stroke)] px-3 py-2 text-sm font-medium normal-case tracking-normal text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]";

const errorMessage = (err: unknown) =>
  (err as api.ApiError).status === 400
    ? "Password is incorrect"
    : "New password must be at least 8 characters";

export const AccountSettings = ({ username, onClose, onAccountDeleted }: AccountSettingsProps) => {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordStatus, setPasswordStatus] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState("");

  const handleChangePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await api.changePassword(currentPassword, newPassword);
      setPasswordStatus("Password changed");
      setCurrentPassword("");
      setNewPassword("");
    } catch (err) {
      setPasswordStatus(errorMessage(err));
    }
  };

  const handleDelete = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await api.deleteAccount(deletePassword);
      onAccountDeleted();
    } catch (err) {
      setDeleteError(errorMessage(err));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--navy-dark)]/40 px-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-settings-title"
        className="w-full max-w-md space-y-6 rounded-[24px] border border-[var(--stroke)] bg-white p-6 shadow-[var(--shadow)]"
      >
        <div className="flex items-start justify-between">
          <div>
            <h2
              id="account-settings-title"
              className="font-display text-xl font-semibold text-[var(--navy-dark)]"
            >
              Account settings
            </h2>
            <p className="text-sm text-[var(--gray-text)]">Signed in as {username}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close account settings"
            className="rounded-full p-1 text-[var(--gray-text)] hover:text-[var(--navy-dark)]"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleChangePassword} className="space-y-3">
          <h3 className="text-sm font-semibold text-[var(--navy-dark)]">Change password</h3>
          <label className={labelClass}>
            Current password
            <input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              autoComplete="current-password"
              className={inputClass}
              required
            />
          </label>
          <label className={labelClass}>
            New password
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
              className={inputClass}
              required
            />
          </label>
          {passwordStatus && (
            <p role="status" className="text-sm font-semibold text-[var(--secondary-purple)]">
              {passwordStatus}
            </p>
          )}
          <button
            type="submit"
            className="rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110"
          >
            Change password
          </button>
        </form>

        <form onSubmit={handleDelete} className="space-y-3 border-t border-[var(--stroke)] pt-5">
          <h3 className="text-sm font-semibold text-[var(--navy-dark)]">Delete account</h3>
          <p className="text-xs text-[var(--gray-text)]">
            This permanently deletes your account and all your boards.
          </p>
          <label className={labelClass}>
            Confirm with password
            <input
              type="password"
              value={deletePassword}
              onChange={(event) => setDeletePassword(event.target.value)}
              autoComplete="current-password"
              className={inputClass}
              required
            />
          </label>
          {deleteError && (
            <p role="alert" className="text-sm font-semibold text-[var(--secondary-purple)]">
              {deleteError}
            </p>
          )}
          <button
            type="submit"
            className="rounded-full border border-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--secondary-purple)] transition hover:bg-[var(--secondary-purple)] hover:text-white"
          >
            Delete account
          </button>
        </form>
      </div>
    </div>
  );
};
