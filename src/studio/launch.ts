import { DEFAULT_SETTINGS } from "../../shared/catalog";
import { validateBoard, type CustomBoard } from "../../shared/boards";
import type { Reply, Settings } from "../../shared/types";
export async function launchBoard(
  board: CustomBoard,
  create: (
    settings: Settings,
    demo?: boolean,
    board?: CustomBoard,
    boardReference?: { workspaceId: string; boardId: string },
  ) => Promise<Reply>,
  demo = false,
  workspaceId?: string,
) {
  return create(
    { ...DEFAULT_SETTINGS, playlist: ["hotwire"], rounds: 1 },
    demo,
    workspaceId ? undefined : validateBoard(board),
    workspaceId ? { workspaceId, boardId: board.id } : undefined,
  );
}
