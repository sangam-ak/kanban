import type { BoardData, CardChanges } from "@/lib/kanban";

export type ChatMessage = { role: "user" | "assistant"; content: string };
export type ChatReply = { message: string; board: BoardData };
export type User = { id: number; username: string };
export type BoardSummary = { id: string; name: string };

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

const request = async <T = BoardData>(url: string, method = "GET", body?: unknown) => {
  const response = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    throw new ApiError(`${method} ${url} failed with ${response.status}`, response.status);
  }
  return (await response.json()) as T;
};

export const login = (username: string, password: string) =>
  request<User>("/api/login", "POST", { username, password });

export const register = (username: string, password: string) =>
  request<User>("/api/register", "POST", { username, password });

export const changePassword = (currentPassword: string, newPassword: string) =>
  request("/api/account/password", "POST", {
    current_password: currentPassword,
    new_password: newPassword,
  });

export const deleteAccount = (password: string) =>
  request("/api/account", "DELETE", { password });

export const listBoards = () => request<BoardSummary[]>("/api/boards");

export const createBoard = (name: string) =>
  request<BoardSummary>("/api/boards", "POST", { name });

export const renameBoard = (boardId: string, name: string) =>
  request<BoardSummary>(`/api/boards/${boardId}`, "PATCH", { name });

// Returns the boards that remain.
export const deleteBoard = (boardId: string) =>
  request<BoardSummary[]>(`/api/boards/${boardId}`, "DELETE");

// Every board content route returns the full, updated board.
export const getBoard = (boardId: string) => request(`/api/boards/${boardId}`);

export const createColumn = (boardId: string, title: string) =>
  request(`/api/boards/${boardId}/columns`, "POST", { title });

export const renameColumn = (boardId: string, columnId: string, title: string) =>
  request(`/api/boards/${boardId}/columns/${columnId}`, "PATCH", { title });

export const moveColumn = (boardId: string, columnId: string, position: number) =>
  request(`/api/boards/${boardId}/columns/${columnId}/move`, "POST", { position });

// Only empty columns can be deleted (409 otherwise).
export const deleteColumn = (boardId: string, columnId: string) =>
  request(`/api/boards/${boardId}/columns/${columnId}`, "DELETE");

export const createCard = (boardId: string, columnId: string, title: string, details: string) =>
  request(`/api/boards/${boardId}/cards`, "POST", { column_id: columnId, title, details });

export const updateCard = (boardId: string, cardId: string, changes: Partial<CardChanges>) =>
  request(`/api/boards/${boardId}/cards/${cardId}`, "PATCH", changes);

export const moveCard = (boardId: string, cardId: string, columnId: string, position: number) =>
  request(`/api/boards/${boardId}/cards/${cardId}/move`, "POST", {
    column_id: columnId,
    position,
  });

export const deleteCard = (boardId: string, cardId: string) =>
  request(`/api/boards/${boardId}/cards/${cardId}`, "DELETE");

export const chat = (boardId: string, message: string, history: ChatMessage[]) =>
  request<ChatReply>(`/api/boards/${boardId}/chat`, "POST", { message, history });

export type ActivityEntry = { id: number; action: string; summary: string; createdAt: string };

// The latest 50 changes on a board, newest first.
export const getActivity = (boardId: string) =>
  request<ActivityEntry[]>(`/api/boards/${boardId}/activity`);
