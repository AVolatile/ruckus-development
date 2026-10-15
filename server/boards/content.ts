import { createHash } from "node:crypto";
import { boardSchema, type CustomBoard } from "../../shared/boards.js";
export function parseDraft(value: unknown): CustomBoard {
  const board = boardSchema.parse(value);
  if (
    new Set(board.questions.map((q) => q.id)).size !== board.questions.length ||
    board.questions.some((q, i) => q.order !== i)
  )
    throw new Error("Questions must have unique IDs and consecutive order.");
  return board;
}
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, val]) => [key, stable(val)]),
    );
  return value;
}
export function contentHash(board: CustomBoard) {
  const content = {
    title: board.title,
    description: board.description,
    category: board.category,
    coverStyle: board.coverStyle,
    questions: board.questions,
    settings: board.settings,
    version: board.version,
  };
  return createHash("sha256")
    .update(JSON.stringify(stable(content)))
    .digest("hex");
}
