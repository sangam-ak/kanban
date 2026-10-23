import * as api from "@/lib/api";
import { boardData } from "@/test/boardData";

const stubFetch = (status = 200) => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(boardData), { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

const json = (body: unknown) => ({
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

describe("api", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    ["listBoards", () => api.listBoards(), "/api/boards", { method: "GET" }],
    [
      "createBoard",
      () => api.createBoard("Roadmap"),
      "/api/boards",
      { method: "POST", ...json({ name: "Roadmap" }) },
    ],
    [
      "renameBoard",
      () => api.renameBoard("board-1", "Work"),
      "/api/boards/board-1",
      { method: "PATCH", ...json({ name: "Work" }) },
    ],
    ["deleteBoard", () => api.deleteBoard("board-1"), "/api/boards/board-1", { method: "DELETE" }],
    ["getBoard", () => api.getBoard("board-1"), "/api/boards/board-1", { method: "GET" }],
    [
      "getActivity",
      () => api.getActivity("board-1"),
      "/api/boards/board-1/activity",
      { method: "GET" },
    ],
    [
      "createColumn",
      () => api.createColumn("board-1", "Blocked"),
      "/api/boards/board-1/columns",
      { method: "POST", ...json({ title: "Blocked" }) },
    ],
    [
      "moveColumn",
      () => api.moveColumn("board-1", "col-2", 0),
      "/api/boards/board-1/columns/col-2/move",
      { method: "POST", ...json({ position: 0 }) },
    ],
    [
      "deleteColumn",
      () => api.deleteColumn("board-1", "col-2"),
      "/api/boards/board-1/columns/col-2",
      { method: "DELETE" },
    ],
    [
      "renameColumn",
      () => api.renameColumn("board-1", "col-1", "Ideas"),
      "/api/boards/board-1/columns/col-1",
      { method: "PATCH", ...json({ title: "Ideas" }) },
    ],
    [
      "createCard",
      () => api.createCard("board-1", "col-1", "T", "D"),
      "/api/boards/board-1/cards",
      { method: "POST", ...json({ column_id: "col-1", title: "T", details: "D" }) },
    ],
    [
      "updateCard",
      () => api.updateCard("board-1", "card-1", { title: "T", details: "D" }),
      "/api/boards/board-1/cards/card-1",
      { method: "PATCH", ...json({ title: "T", details: "D" }) },
    ],
    [
      "moveCard",
      () => api.moveCard("board-1", "card-1", "col-2", 3),
      "/api/boards/board-1/cards/card-1/move",
      { method: "POST", ...json({ column_id: "col-2", position: 3 }) },
    ],
    [
      "deleteCard",
      () => api.deleteCard("board-1", "card-1"),
      "/api/boards/board-1/cards/card-1",
      { method: "DELETE" },
    ],
    [
      "login",
      () => api.login("ann", "secret123"),
      "/api/login",
      { method: "POST", ...json({ username: "ann", password: "secret123" }) },
    ],
    [
      "register",
      () => api.register("ann", "secret123"),
      "/api/register",
      { method: "POST", ...json({ username: "ann", password: "secret123" }) },
    ],
    [
      "changePassword",
      () => api.changePassword("old", "newsecret1"),
      "/api/account/password",
      { method: "POST", ...json({ current_password: "old", new_password: "newsecret1" }) },
    ],
    [
      "deleteAccount",
      () => api.deleteAccount("secret123"),
      "/api/account",
      { method: "DELETE", ...json({ password: "secret123" }) },
    ],
  ])("%s calls the right endpoint and returns the response", async (_, call, url, init) => {
    const fetchMock = stubFetch();
    expect(await call()).toEqual(boardData);
    expect(fetchMock).toHaveBeenCalledWith(url, expect.objectContaining(init));
  });

  it("chat sends the message and history and returns the reply", async () => {
    const reply = { message: "Done", board: boardData };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(reply)));
    vi.stubGlobal("fetch", fetchMock);
    const history = [{ role: "user" as const, content: "Hi" }];
    expect(await api.chat("board-1", "Add a card", history)).toEqual(reply);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/boards/board-1/chat",
      expect.objectContaining({ method: "POST", ...json({ message: "Add a card", history }) })
    );
  });

  it("throws when the response is not ok", async () => {
    stubFetch(404);
    await expect(api.deleteCard("board-1", "card-999")).rejects.toThrow(/404/);
    await expect(api.deleteCard("board-1", "card-999")).rejects.toMatchObject({ status: 404 });
  });
});
