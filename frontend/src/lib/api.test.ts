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
    ["getBoard", () => api.getBoard(), "/api/board", { method: "GET" }],
    [
      "renameColumn",
      () => api.renameColumn("col-1", "Ideas"),
      "/api/columns/col-1",
      { method: "PATCH", ...json({ title: "Ideas" }) },
    ],
    [
      "createCard",
      () => api.createCard("col-1", "T", "D"),
      "/api/cards",
      { method: "POST", ...json({ column_id: "col-1", title: "T", details: "D" }) },
    ],
    [
      "updateCard",
      () => api.updateCard("card-1", "T", "D"),
      "/api/cards/card-1",
      { method: "PATCH", ...json({ title: "T", details: "D" }) },
    ],
    [
      "moveCard",
      () => api.moveCard("card-1", "col-2", 3),
      "/api/cards/card-1/move",
      { method: "POST", ...json({ column_id: "col-2", position: 3 }) },
    ],
    ["deleteCard", () => api.deleteCard("card-1"), "/api/cards/card-1", { method: "DELETE" }],
  ])("%s calls the right endpoint and returns the board", async (_, call, url, init) => {
    const fetchMock = stubFetch();
    expect(await call()).toEqual(boardData);
    expect(fetchMock).toHaveBeenCalledWith(url, expect.objectContaining(init));
  });

  it("chat sends the message and history and returns the reply", async () => {
    const reply = { message: "Done", board: boardData };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(reply)));
    vi.stubGlobal("fetch", fetchMock);
    const history = [{ role: "user" as const, content: "Hi" }];
    expect(await api.chat("Add a card", history)).toEqual(reply);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/chat",
      expect.objectContaining({ method: "POST", ...json({ message: "Add a card", history }) })
    );
  });

  it("throws when the response is not ok", async () => {
    stubFetch(404);
    await expect(api.deleteCard("card-999")).rejects.toThrow(/404/);
  });
});
