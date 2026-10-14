import { boardSchema, newBoard, type CustomBoard } from "../../shared/boards";
const KEY = "ruckus-studio-v1";
export interface BoardRepository {
  list(): CustomBoard[];
  get(id: string): CustomBoard | undefined;
  save(board: CustomBoard): void;
  delete(id: string): void;
  duplicate(id: string): CustomBoard;
}
export const boards: BoardRepository = {
  list() {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error(
        "Your saved library couldn’t be read. Export a backup before clearing browser data.",
      );
    }
    const parsed = boardSchema.array().safeParse(data);
    if (!parsed.success)
      throw new Error(
        "The saved library has an unsupported format. Your data has been preserved.",
      );
    return parsed.data.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },
  get(id) {
    return this.list().find((b) => b.id === id);
  },
  save(board) {
    const parsed = boardSchema.parse({
      ...board,
      updatedAt: new Date().toISOString(),
    });
    const all = this.list();
    const other = all.filter((b) => b.id !== board.id);
    if (other.length >= 100)
      throw new Error(
        "Your library has 100 boards. Export and remove one before adding another.",
      );
    try {
      localStorage.setItem(KEY, JSON.stringify([...other, parsed]));
    } catch {
      throw new Error(
        "Your browser couldn’t save this board. Free some storage or export a backup.",
      );
    }
  },
  delete(id) {
    localStorage.setItem(
      KEY,
      JSON.stringify(this.list().filter((b) => b.id !== id)),
    );
  },
  duplicate(id) {
    const source = this.get(id);
    if (!source) throw new Error("This board is no longer in your library.");
    const now = new Date().toISOString();
    const copy = {
      ...structuredClone(source),
      id: crypto.randomUUID(),
      title: `${source.title || "Untitled board"} (copy)`.slice(0, 60),
      createdAt: now,
      updatedAt: now,
      questions: source.questions.map((q) => ({
        ...q,
        id: crypto.randomUUID(),
      })),
    };
    this.save(copy);
    return copy;
  },
};

// A single authoring entry point for Studio and dashboard starters.
export function createLocalBoard(source?: CustomBoard): CustomBoard {
  const now = new Date().toISOString();
  const board = source
    ? {
        ...structuredClone(source),
        id: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
        questions: source.questions.map((question) => ({
          ...question,
          id: crypto.randomUUID(),
        })),
      }
    : newBoard();
  boards.save(board);
  return board;
}
