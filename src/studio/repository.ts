import type { CustomBoard } from "../../shared/boards";
import type { BoardPage, BoardRecord, ImportResult } from "../../shared/cloud";
import { newBoard } from "../../shared/boards";
import { request, ApiClientError } from "../lib/api";
export interface BoardRepository {
  list(cursor?: string): Promise<BoardPage>;
  get(id: string): Promise<BoardRecord | undefined>;
  create(board: CustomBoard, clientKey?: string): Promise<BoardRecord>;
  save(board: CustomBoard, baseRevisionId: string): Promise<BoardRecord>;
  delete(id: string): Promise<void>;
  duplicate(id: string): Promise<BoardRecord>;
}
export class CloudBoardRepository implements BoardRepository {
  list(cursor?: string) {
    return request<BoardPage>(
      `/api/v1/boards${cursor ? "?cursor=" + encodeURIComponent(cursor) : ""}`,
    );
  }
  async get(id: string) {
    try {
      return await request<BoardRecord>(
        `/api/v1/boards/${encodeURIComponent(id)}`,
      );
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 404)
        return undefined;
      throw error;
    }
  }
  create(board: CustomBoard, clientKey?: string) {
    return request<BoardRecord>("/api/v1/boards", {
      method: "POST",
      body: JSON.stringify({ board, clientKey }),
    });
  }
  save(board: CustomBoard, baseRevisionId: string) {
    return request<BoardRecord>(`/api/v1/boards/${board.id}`, {
      method: "PUT",
      body: JSON.stringify({ board, baseRevisionId }),
    });
  }
  delete(id: string) {
    return request<void>(`/api/v1/boards/${id}`, { method: "DELETE" });
  }
  async duplicate(id: string) {
    const source = await this.get(id);
    if (!source) throw new Error("This board is no longer in your library.");
    const board = copyBoard(source.board);
    board.title = `${board.title || "Untitled board"} (copy)`.slice(0, 60);
    return this.create(board, `duplicate:${board.id}`);
  }
  import(items: { key: string; board: unknown }[]) {
    return request<{ results: ImportResult[] }>("/api/v1/boards/import", {
      method: "POST",
      body: JSON.stringify({ boards: items }),
    });
  }
}
export function copyBoard(source?: CustomBoard): CustomBoard {
  const now = new Date().toISOString();
  return source
    ? {
        ...structuredClone(source),
        id: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
        questions: source.questions.map((q) => ({
          ...q,
          id: crypto.randomUUID(),
        })),
      }
    : newBoard();
}
