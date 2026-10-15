import { boards, inspectLocalBoards } from "./localRepository";
import { estimatedMinutes, type CustomBoard } from "../../shared/boards";
import type { BoardRepository } from "./repository";
import type { BoardRecord } from "../../shared/cloud";
const record = (board: CustomBoard): BoardRecord => ({
  board,
  revisionId: board.updatedAt,
  revisionNumber: 1,
});
// Promise adapter preserves the original browser payload for migration and recovery.
export class LocalBoardRepository implements BoardRepository {
  inspect() {
    return inspectLocalBoards();
  }
  async list() {
    return {
      items: boards.list().map((board) => ({
        id: board.id,
        title: board.title,
        description: board.description,
        category: board.category,
        coverStyle: board.coverStyle,
        questionCount: board.questions.length,
        minutes: estimatedMinutes(board),
        createdAt: board.createdAt,
        updatedAt: board.updatedAt,
        revisionId: board.updatedAt,
      })),
      nextCursor: null,
    };
  }
  async get(id: string) {
    const board = boards.get(id);
    return board ? record(board) : undefined;
  }
  async create(board: CustomBoard) {
    boards.save(board);
    return record(boards.get(board.id)!);
  }
  async save(board: CustomBoard, baseRevisionId: string) {
    const current = boards.get(board.id);
    if (current && current.updatedAt !== baseRevisionId)
      throw new Error("This local board changed. Reload it before saving.");
    return this.create(board);
  }
  async delete(id: string) {
    boards.delete(id);
  }
  async duplicate(id: string) {
    return record(boards.duplicate(id));
  }
}
