import type { BoardData } from "@/lib/kanban";

export type ChatMessage = { role: "user" | "assistant"; content: string };
export type ChatReply = { message: string; board: BoardData };

const request = async <T = BoardData>(url: string, method = "GET", body?: unknown) => {
  const response = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`${method} ${url} failed with ${response.status}`);
  }
  return (await response.json()) as T;
};

// Every board route returns the full, updated board.
export const getBoard = () => request("/api/board");

export const renameColumn = (columnId: string, title: string) =>
  request(`/api/columns/${columnId}`, "PATCH", { title });

export const createCard = (columnId: string, title: string, details: string) =>
  request("/api/cards", "POST", { column_id: columnId, title, details });

export const updateCard = (cardId: string, title: string, details: string) =>
  request(`/api/cards/${cardId}`, "PATCH", { title, details });

export const moveCard = (cardId: string, columnId: string, position: number) =>
  request(`/api/cards/${cardId}/move`, "POST", { column_id: columnId, position });

export const deleteCard = (cardId: string) => request(`/api/cards/${cardId}`, "DELETE");

export const chat = (message: string, history: ChatMessage[]) =>
  request<ChatReply>("/api/chat", "POST", { message, history });
