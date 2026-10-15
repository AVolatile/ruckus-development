import { z } from "zod/v3";
import { boardSchema, type CustomBoard } from "./boards.js";

export const boardWriteSchema = z
  .object({
    board: boardSchema,
    baseRevisionId: z.string().uuid().optional(),
    clientKey: z.string().min(1).max(180).optional(),
  })
  .strict();
export const importBatchSchema = z
  .object({
    boards: z
      .array(
        z
          .object({ key: z.string().min(1).max(180), board: z.unknown() })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict();
export interface BoardRecord {
  board: CustomBoard;
  revisionId: string;
  revisionNumber: number;
}
export interface BoardSummary {
  id: string;
  title: string;
  description: string;
  category: string;
  coverStyle: CustomBoard["coverStyle"];
  questionCount: number;
  minutes: number;
  createdAt: string;
  updatedAt: string;
  revisionId: string;
}
export interface BoardPage {
  items: BoardSummary[];
  nextCursor: string | null;
}
export interface ImportResult {
  key: string;
  id?: string;
  code?: string;
  message?: string;
}
export interface HostUser {
  id: string;
  email: string;
  name: string;
}
