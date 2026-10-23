import { closestCorners, pointerWithin, type CollisionDetection } from "@dnd-kit/core";

export type Priority = "low" | "medium" | "high";

export type Card = {
  id: string;
  title: string;
  details: string;
  priority: Priority | null;
  dueDate: string | null; // ISO date, YYYY-MM-DD
  labels: string[];
};

// Fields sent when editing a card (the API's snake_case names).
export type CardChanges = {
  title: string;
  details: string;
  priority: Priority | null;
  due_date: string | null;
  labels: string[];
};

// Today's local date as YYYY-MM-DD, comparable with ISO due dates.
export const today = () => new Date().toLocaleDateString("en-CA");

export const isOverdue = (card: Card, now = today()) =>
  card.dueDate !== null && card.dueDate < now;

// "design, ux,, " -> ["design", "ux"]
export const parseLabels = (text: string) =>
  text
    .split(",")
    .map((label) => label.trim())
    .filter(Boolean);

export type Column = {
  id: string;
  title: string;
  cardIds: string[];
};

export type BoardData = {
  columns: Column[];
  cards: Record<string, Card>;
};

const isColumnId = (columns: Column[], id: string) =>
  columns.some((column) => column.id === id);

const findColumnId = (columns: Column[], id: string) => {
  if (isColumnId(columns, id)) {
    return id;
  }
  return columns.find((column) => column.cardIds.includes(id))?.id;
};

export const moveCard = (
  columns: Column[],
  activeId: string,
  overId: string
): Column[] => {
  const activeColumnId = findColumnId(columns, activeId);
  const overColumnId = findColumnId(columns, overId);

  if (!activeColumnId || !overColumnId) {
    return columns;
  }

  const activeColumn = columns.find((column) => column.id === activeColumnId);
  const overColumn = columns.find((column) => column.id === overColumnId);

  if (!activeColumn || !overColumn) {
    return columns;
  }

  const isOverColumn = isColumnId(columns, overId);

  if (activeColumnId === overColumnId) {
    if (isOverColumn) {
      const nextCardIds = activeColumn.cardIds.filter(
        (cardId) => cardId !== activeId
      );
      nextCardIds.push(activeId);
      return columns.map((column) =>
        column.id === activeColumnId
          ? { ...column, cardIds: nextCardIds }
          : column
      );
    }

    const oldIndex = activeColumn.cardIds.indexOf(activeId);
    const newIndex = activeColumn.cardIds.indexOf(overId);

    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
      return columns;
    }

    const nextCardIds = [...activeColumn.cardIds];
    nextCardIds.splice(oldIndex, 1);
    nextCardIds.splice(newIndex, 0, activeId);

    return columns.map((column) =>
      column.id === activeColumnId
        ? { ...column, cardIds: nextCardIds }
        : column
    );
  }

  const activeIndex = activeColumn.cardIds.indexOf(activeId);
  if (activeIndex === -1) {
    return columns;
  }

  const nextActiveCardIds = [...activeColumn.cardIds];
  nextActiveCardIds.splice(activeIndex, 1);

  const nextOverCardIds = [...overColumn.cardIds];
  if (isOverColumn) {
    nextOverCardIds.push(activeId);
  } else {
    const overIndex = overColumn.cardIds.indexOf(overId);
    const insertIndex = overIndex === -1 ? nextOverCardIds.length : overIndex;
    nextOverCardIds.splice(insertIndex, 0, activeId);
  }

  return columns.map((column) => {
    if (column.id === activeColumnId) {
      return { ...column, cardIds: nextActiveCardIds };
    }
    if (column.id === overColumnId) {
      return { ...column, cardIds: nextOverCardIds };
    }
    return column;
  });
};

// Finds the column under the pointer first, then the closest card within it. Plain
// closestCorners compares against full-height column rects, so a drop on an empty
// column could land on the top cards of a neighbouring column.
export const columnFirstCollision =
  (columns: Column[]): CollisionDetection =>
  (args) => {
    const [hit] = pointerWithin({
      ...args,
      droppableContainers: args.droppableContainers.filter((c) =>
        isColumnId(columns, String(c.id))
      ),
    });
    const column = columns.find((c) => c.id === hit?.id);
    if (!column) {
      return closestCorners(args);
    }
    return closestCorners({
      ...args,
      droppableContainers: args.droppableContainers.filter(
        (c) => c.id === column.id || column.cardIds.includes(String(c.id))
      ),
    });
  };

export type BoardFilter = {
  text: string;
  priority: Priority | "";
  overdueOnly: boolean;
};

export const NO_FILTER: BoardFilter = { text: "", priority: "", overdueOnly: false };

export const isFilterActive = (filter: BoardFilter) =>
  filter.text.trim() !== "" || filter.priority !== "" || filter.overdueOnly;

// Keeps only matching cards in each column. Text matches title, details or a label.
export const filterBoard = (board: BoardData, filter: BoardFilter, now = today()): BoardData => {
  const text = filter.text.trim().toLowerCase();
  const matches = (card: Card) =>
    (!text ||
      [card.title, card.details, ...card.labels].some((value) =>
        value.toLowerCase().includes(text)
      )) &&
    (!filter.priority || card.priority === filter.priority) &&
    (!filter.overdueOnly || isOverdue(card, now));
  return {
    ...board,
    columns: board.columns.map((column) => ({
      ...column,
      cardIds: column.cardIds.filter((cardId) => matches(board.cards[cardId])),
    })),
  };
};
