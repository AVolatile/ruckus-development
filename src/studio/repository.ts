import type { CustomBoard } from "../../shared/boards";
import type { BoardPage, BoardRecord, ImportResult } from "../../shared/cloud";
import { newBoard } from "../../shared/boards";
import { request, ApiClientError } from "../lib/api";
export interface BoardRepository {
  workspaceId?: string;
  list(cursor?: string): Promise<BoardPage>;
  get(id: string): Promise<BoardRecord | undefined>;
  create(board: CustomBoard, clientKey?: string): Promise<BoardRecord>;
  save(board: CustomBoard, baseRevisionId: string): Promise<BoardRecord>;
  delete(id: string): Promise<void>;
  duplicate(id: string): Promise<BoardRecord>;
}
export class CloudBoardRepository implements BoardRepository {
  constructor(readonly workspaceId?: string) {}
  get endpoint() {
    return this.workspaceId
      ? `/api/v1/workspaces/${this.workspaceId}/boards`
      : "/api/v1/boards";
  }
  copy(id: string, targetWorkspaceId: string) {
    return request<BoardRecord>(`${this.endpoint}/${id}/copy`, {
      method: "POST",
      body: JSON.stringify({ targetWorkspaceId }),
    });
  }
  list(cursor?: string) {
    return request<BoardPage>(
      `${this.endpoint}${cursor ? "?cursor=" + encodeURIComponent(cursor) : ""}`,
    );
  }
  async get(id: string) {
    try {
      return await request<BoardRecord>(
        `${this.endpoint}/${encodeURIComponent(id)}`,
      );
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 404)
        return undefined;
      throw error;
    }
  }
  create(board: CustomBoard, clientKey?: string) {
    return request<BoardRecord>(this.endpoint, {
      method: "POST",
      body: JSON.stringify({ board, clientKey }),
    });
  }
  save(board: CustomBoard, baseRevisionId: string) {
    return request<BoardRecord>(`${this.endpoint}/${board.id}`, {
      method: "PUT",
      body: JSON.stringify({ board, baseRevisionId }),
    });
  }
  delete(id: string) {
    return request<void>(`${this.endpoint}/${id}`, { method: "DELETE" });
  }
  async duplicate(id: string) {
    const source = await this.get(id);
    if (!source) throw new Error("This board is no longer in your library.");
    const board = copyBoard(source.board);
    board.title = `${board.title || "Untitled board"} (copy)`.slice(0, 60);
    return this.create(board, `duplicate:${board.id}`);
  }
  import(items: { key: string; board: unknown }[]) {
    return request<{ results: ImportResult[] }>(`${this.endpoint}/import`, {
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
