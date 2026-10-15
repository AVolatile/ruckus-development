import { TOPICS } from "../shared/content/library.js";
import { z } from "zod/v3";
import { GAME_IDS } from "../shared/types.js";
export const settingsSchema = z.object({
  playlist: z.array(z.enum(GAME_IDS)).min(1).max(6),
  rounds: z.number().int().min(1).max(5),
  pace: z.enum(["quick", "normal", "relaxed"]),
  pack: z
    .string()
    .refine(
      (value) =>
        value === "mixed" || value === "work" || Object.hasOwn(TOPICS, value),
      "Choose a supported content pack.",
    ),
  lateJoins: z.boolean(),
  reactions: z.boolean(),
  autoAdvance: z.boolean(),
});
export const joinSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-HJ-NP-Z2-9]{5}$/, "Use the five-character room code."),
  name: z
    .string()
    .trim()
    .min(2, "Use at least 2 characters.")
    .max(18, "Keep your name to 18 characters.")
    .regex(
      /^[\p{L}\p{N} ._'-]+$/u,
      "Use letters, numbers, spaces, or a simple nickname.",
    ),
  avatar: z.number().int().min(0).max(19),
});
export const identitySchema = z.object({
  code: z.string().length(5),
  token: z.string().uuid(),
  role: z.enum(["host", "player"]),
});
const stroke = z.object({
  color: z.enum([
    "#191a24",
    "#2548f4",
    "#ff7448",
    "#c0ee7b",
    "#ffa9d2",
    "#ffffff",
  ]),
  width: z.number().min(1).max(15),
  points: z
    .array(z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]))
    .min(1)
    .max(800),
});
export const inputSchema = z.union([
  z.object({ choice: z.number().int().min(0).max(5) }),
  z.object({
    text: z
      .string()
      .trim()
      .min(2, "Give us at least two characters.")
      .max(160, "Keep it to 160 characters."),
  }),
  z.object({
    drawing: z
      .array(stroke)
      .min(1, "Draw something before sending.")
      .max(100)
      .refine(
        (strokes) =>
          strokes.reduce((sum, stroke) => sum + stroke.points.length, 0) <=
          2500,
        "That drawing is very detailed. Undo a few strokes before sending.",
      ),
  }),
  z.object({ vote: z.string().uuid() }),
]);
export const actionSchema = z.object({
  action: z.enum([
    "start",
    "next",
    "skip",
    "pause",
    "lock",
    "end",
    "rematch",
    "bots",
    "remove",
  ]),
  count: z.number().int().min(1).max(12).optional(),
  playerId: z.string().uuid().optional(),
});
// Deliberately modest protection, not a claim of comprehensive content moderation.
export function safeText(text: string) {
  return (
    !/\b(fuck|shit|bitch|asshole|porn|nazi)\b/i.test(text) &&
    !/[<>]/.test(text) &&
    ![...text].some((char) => char.charCodeAt(0) < 32)
  );
}
export class RateLimiter {
  private buckets = new Map<string, { count: number; reset: number }>();
  allow(key: string, limit: number, windowMs: number) {
    const now = Date.now();
    const b = this.buckets.get(key);
    if (!b || b.reset <= now) {
      this.buckets.set(key, { count: 1, reset: now + windowMs });
      return true;
    }
    b.count++;
    return b.count <= limit;
  }
  sweep() {
    for (const [key, b] of this.buckets)
      if (b.reset < Date.now()) this.buckets.delete(key);
  }
}
