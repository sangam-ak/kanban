import { closestCorners, type ClientRect, type DroppableContainer } from "@dnd-kit/core";
import {
  columnFirstCollision,
  filterBoard,
  isFilterActive,
  isOverdue,
  NO_FILTER,
  moveCard,
  parseLabels,
  today,
  type Column,
} from "@/lib/kanban";
import { boardData, makeCard } from "@/test/boardData";

describe("moveCard", () => {
  const baseColumns: Column[] = [
    { id: "col-a", title: "A", cardIds: ["card-1", "card-2"] },
    { id: "col-b", title: "B", cardIds: ["card-3"] },
  ];

  it("reorders cards in the same column", () => {
    const result = moveCard(baseColumns, "card-2", "card-1");
    expect(result[0].cardIds).toEqual(["card-2", "card-1"]);
  });

  it("moves cards to another column", () => {
    const result = moveCard(baseColumns, "card-2", "card-3");
    expect(result[0].cardIds).toEqual(["card-1"]);
    expect(result[1].cardIds).toEqual(["card-2", "card-3"]);
  });

  it("drops cards to the end of a column", () => {
    const result = moveCard(baseColumns, "card-1", "col-b");
    expect(result[0].cardIds).toEqual(["card-2"]);
    expect(result[1].cardIds).toEqual(["card-3", "card-1"]);
  });
});

describe("columnFirstCollision", () => {
  const rect = (left: number, top: number, width: number, height: number): ClientRect => ({
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
  });
  const columns: Column[] = [
    { id: "col-a", title: "A", cardIds: ["card-1", "card-2"] },
    { id: "col-b", title: "B", cardIds: [] },
  ];
  const rects = new Map([
    ["col-a", rect(0, 0, 200, 1000)],
    ["card-1", rect(0, 0, 200, 100)],
    ["card-2", rect(0, 110, 200, 100)],
    ["col-b", rect(220, 0, 200, 1000)],
  ]);
  // Dragging near the top of the empty column B.
  const args = (x: number, y: number) =>
    ({
      active: { id: "card-x" },
      collisionRect: rect(x - 120, y - 50, 240, 100),
      droppableRects: rects,
      droppableContainers: [...rects.keys()].map((id) => ({ id }) as DroppableContainer),
      pointerCoordinates: { x, y },
    }) as unknown as Parameters<ReturnType<typeof columnFirstCollision>>[0];

  it("picks the empty column under the pointer where closestCorners picks a neighbour's card", () => {
    expect(columns[0].cardIds).toContain(closestCorners(args(320, 120))[0].id);
    expect(columnFirstCollision(columns)(args(320, 120))[0].id).toBe("col-b");
  });

  it("picks the closest card within the column under the pointer", () => {
    expect(columnFirstCollision(columns)(args(100, 160))[0].id).toBe("card-2");
  });

  it("falls back to closestCorners outside every column", () => {
    expect(columnFirstCollision(columns)(args(210, 1200))).toEqual(closestCorners(args(210, 1200)));
  });
});

describe("card fields", () => {
  it("formats today as an ISO date", () => {
    expect(today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("is overdue only with a due date before today", () => {
    const card = (dueDate: string | null) => makeCard({ id: "c", title: "T", details: "", dueDate });
    expect(isOverdue(card("2026-10-22"), "2026-10-23")).toBe(true);
    expect(isOverdue(card("2026-10-23"), "2026-10-23")).toBe(false);
    expect(isOverdue(card("2026-11-01"), "2026-10-23")).toBe(false);
    expect(isOverdue(card(null), "2026-10-23")).toBe(false);
  });

  it("parses comma separated labels", () => {
    expect(parseLabels(" design, ux,, ")).toEqual(["design", "ux"]);
    expect(parseLabels("")).toEqual([]);
  });
});

describe("filterBoard", () => {
  const board = structuredClone(boardData);
  board.cards["card-1"] = { ...board.cards["card-1"], priority: "high", dueDate: "2026-01-01" };
  board.cards["card-6"] = { ...board.cards["card-6"], labels: ["Frontend"], dueDate: "2027-01-01" };
  const visibleIds = (filter: Partial<typeof NO_FILTER>) =>
    filterBoard(board, { ...NO_FILTER, ...filter }, "2026-10-23").columns.flatMap((c) => c.cardIds);

  it("keeps every card without a filter", () => {
    expect(visibleIds({})).toHaveLength(8);
    expect(isFilterActive(NO_FILTER)).toBe(false);
    expect(isFilterActive({ ...NO_FILTER, text: "   " })).toBe(false);
  });

  it("matches title, details and labels case-insensitively", () => {
    expect(visibleIds({ text: "ROADMAP" })).toEqual(["card-1"]);
    expect(visibleIds({ text: "churn" })).toEqual(["card-2"]);
    expect(visibleIds({ text: "frontend" })).toEqual(["card-6"]);
    expect(visibleIds({ text: "nothing like this" })).toEqual([]);
  });

  it("filters by priority and overdue", () => {
    expect(visibleIds({ priority: "high" })).toEqual(["card-1"]);
    expect(visibleIds({ priority: "low" })).toEqual([]);
    expect(visibleIds({ overdueOnly: true })).toEqual(["card-1"]);
    expect(isFilterActive({ ...NO_FILTER, overdueOnly: true })).toBe(true);
  });

  it("combines filters and keeps every column", () => {
    const filtered = filterBoard(board, { text: "q", priority: "high", overdueOnly: false });
    expect(filtered.columns).toHaveLength(5);
    expect(filtered.columns.flatMap((c) => c.cardIds)).toEqual(["card-1"]);
    expect(filtered.cards).toBe(board.cards);
  });
});
