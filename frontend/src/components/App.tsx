"use client";

import { useEffect, useState } from "react";
import { LoginForm } from "@/components/LoginForm";
import { Workspace } from "@/components/Workspace";

export const App = () => {
  // undefined while checking the session, null when signed out
  const [username, setUsername] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    fetch("/api/me").then(async (response) =>
      setUsername(response.ok ? (await response.json()).username : null)
    );
  }, []);

  const handleLogout = async () => {
    await fetch("/api/logout", { method: "POST" });
    setUsername(null);
  };

  if (username === undefined) {
    return null;
  }
  if (username === null) {
    return <LoginForm onLogin={setUsername} />;
  }
  return <Workspace username={username} onLogout={handleLogout} />;
};
