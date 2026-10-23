import { useState, type FormEvent } from "react";
import * as api from "@/lib/api";

type LoginFormProps = {
  onLogin: (username: string) => void;
};

const labelClass =
  "block text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]";
const inputClass =
  "mt-2 w-full rounded-xl border border-[var(--stroke)] px-3 py-2 text-sm font-medium normal-case tracking-normal text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]";

const registerError = (status: number) =>
  status === 409
    ? "That username is taken"
    : "Username must be 3-32 letters, numbers, - or _; password at least 8 characters";

export const LoginForm = ({ onLogin }: LoginFormProps) => {
  const [isRegistering, setIsRegistering] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");

  const switchMode = () => {
    setIsRegistering(!isRegistering);
    setError("");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isRegistering && password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    try {
      const user = isRegistering
        ? await api.register(username, password)
        : await api.login(username, password);
      onLogin(user.username);
    } catch (err) {
      const status = (err as api.ApiError).status;
      setError(isRegistering ? registerError(status) : "Invalid username or password");
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-5 rounded-[32px] border border-[var(--stroke)] bg-white p-8 shadow-[var(--shadow)]"
      >
        <div>
          <div className="h-2 w-10 rounded-full bg-[var(--accent-yellow)]" />
          <h1 className="mt-4 font-display text-3xl font-semibold text-[var(--navy-dark)]">
            Kanban Studio
          </h1>
          <p className="mt-2 text-sm text-[var(--gray-text)]">
            {isRegistering ? "Create an account to get your own boards." : "Sign in to see your boards."}
          </p>
        </div>
        <label className={labelClass}>
          Username
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            className={inputClass}
            required
          />
        </label>
        <label className={labelClass}>
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={isRegistering ? "new-password" : "current-password"}
            className={inputClass}
            required
          />
        </label>
        {isRegistering && (
          <label className={labelClass}>
            Confirm password
            <input
              type="password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              autoComplete="new-password"
              className={inputClass}
              required
            />
          </label>
        )}
        {error && (
          <p role="alert" className="text-sm font-semibold text-[var(--secondary-purple)]">
            {error}
          </p>
        )}
        <button
          type="submit"
          className="w-full rounded-full bg-[var(--secondary-purple)] px-4 py-3 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110"
        >
          {isRegistering ? "Create account" : "Sign in"}
        </button>
        <button
          type="button"
          onClick={switchMode}
          className="w-full text-xs font-semibold text-[var(--primary-blue)] hover:underline"
        >
          {isRegistering ? "Have an account? Sign in" : "New here? Create an account"}
        </button>
      </form>
    </main>
  );
};
