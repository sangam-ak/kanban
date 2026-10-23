// Demo board used by unit tests; mirrors the seed data in backend/app/db.py.
import type { BoardData, Card } from "@/lib/kanban";

// A card with no priority, due date or labels unless given.
export const makeCard = (card: Pick<Card, "id" | "title" | "details"> & Partial<Card>): Card => ({
  priority: null,
  dueDate: null,
  labels: [],
  ...card,
});

const cards = [
  makeCard({
    id: "card-1",
    title: "Align roadmap themes",
    details: "Draft quarterly themes with impact statements and metrics.",
  }),
  makeCard({
    id: "card-2",
    title: "Gather customer signals",
    details: "Review support tags, sales notes, and churn feedback.",
  }),
  makeCard({
    id: "card-3",
    title: "Prototype analytics view",
    details: "Sketch initial dashboard layout and key drill-downs.",
  }),
  makeCard({
    id: "card-4",
    title: "Refine status language",
    details: "Standardize column labels and tone across the board.",
  }),
  makeCard({
    id: "card-5",
    title: "Design card layout",
    details: "Add hierarchy and spacing for scanning dense lists.",
  }),
  makeCard({
    id: "card-6",
    title: "QA micro-interactions",
    details: "Verify hover, focus, and loading states.",
  }),
  makeCard({
    id: "card-7",
    title: "Ship marketing page",
    details: "Final copy approved and asset pack delivered.",
  }),
  makeCard({
    id: "card-8",
    title: "Close onboarding sprint",
    details: "Document release notes and share internally.",
  }),
];

export const boardData: BoardData = {
  columns: [
    { id: "col-1", title: "Backlog", cardIds: ["card-1", "card-2"] },
    { id: "col-2", title: "Discovery", cardIds: ["card-3"] },
    { id: "col-3", title: "In Progress", cardIds: ["card-4", "card-5"] },
    { id: "col-4", title: "Review", cardIds: ["card-6"] },
    { id: "col-5", title: "Done", cardIds: ["card-7", "card-8"] },
  ],
  cards: Object.fromEntries(cards.map((card) => [card.id, card])),
};
