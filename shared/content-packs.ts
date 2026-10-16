import { z } from "zod/v3";
import { GAME_IDS, type GameId } from "./types.js";
export const CATEGORIES = [
  "general",
  "workplace",
  "entertainment",
  "sports",
  "music",
  "movies_tv",
  "internet_culture",
  "seasonal",
  "holiday",
  "icebreaker",
  "creative",
  "custom",
] as const;
export const SEASONS = [
  "evergreen",
  "spring",
  "summer",
  "fall",
  "winter",
  "halloween",
  "holiday",
  "new_year",
] as const;
export const DIFFICULTIES = ["casual", "mixed", "challenging"] as const;
// Reject markup, malformed Unicode, bidi overrides and non-printing controls.
const isPlainText = (value: string) =>
  !/[<>]/u.test(value) &&
  Array.from(value).every((char) => {
    const code = char.codePointAt(0)!;
    return (
      (code >= 32 || code === 9 || code === 10 || code === 13) &&
      code !== 127 &&
      !(code >= 0xd800 && code <= 0xdfff) &&
      !(code >= 0x202a && code <= 0x202e) &&
      !(code >= 0x2066 && code <= 0x2069)
    );
  });
const text = (max: number) =>
  z
    .string()
    .max(max)
    .refine(
      isPlainText,
      "Use plain text without markup, malformed Unicode or control characters.",
    );
const item = {
  id: z
    .string()
    .min(1)
    .max(100)
    .refine(isPlainText, "Use a plain-text item ID."),
  title: text(500),
  pack: text(80).optional(),
};
const choices = z.array(text(200)).min(2).max(6);
const quiz = {
  ...item,
  options: choices,
  answer: z.number().int().min(0).max(5),
  explanation: text(1000).optional(),
};
export const packContentSchema = z
  .discriminatedUnion("gameType", [
    z
      .object({
        gameType: z.literal("hotwire"),
        items: z.array(z.object(quiz).strict()).max(500),
      })
      .strict(),
    z
      .object({
        gameType: z.literal("odd-one-in"),
        items: z.array(z.object(quiz).strict()).max(500),
      })
      .strict(),
    z
      .object({
        gameType: z.literal("room-temperature"),
        items: z
          .array(z.object({ ...item, options: choices }).strict())
          .max(500),
      })
      .strict(),
    z
      .object({
        gameType: z.literal("caption-this"),
        items: z
          .array(
            z
              .object({ ...item, scene: z.number().int().min(0).max(14) })
              .strict(),
          )
          .max(500),
      })
      .strict(),
    z
      .object({
        gameType: z.literal("sellout"),
        items: z.array(z.object(item).strict()).max(500),
      })
      .strict(),
    z
      .object({
        gameType: z.literal("scribble-shift"),
        items: z.array(z.object(item).strict()).max(500),
      })
      .strict(),
  ])
  .superRefine((c, ctx) => {
    if (new Set(c.items.map((i) => i.id)).size !== c.items.length)
      ctx.addIssue({
        code: "custom",
        path: ["items"],
        message: "Give every item a unique ID.",
      });
  });
export const packDocumentSchema = z
  .object({
    schemaVersion: z.literal(1),
    name: text(100).refine((s) => !!s.trim(), "Give your pack a name."),
    shortDescription: text(240),
    description: text(2000),
    category: z.enum(CATEGORIES),
    season: z.enum(SEASONS),
    difficulty: z.enum(DIFFICULTIES),
    locale: z.literal("en"),
    tags: z
      .array(text(40).refine((s) => !!s.trim(), "Tags cannot be empty."))
      .max(12),
    status: z.enum(["draft", "ready"]),
    content: packContentSchema,
  })
  .strict();
export type PackContent = z.infer<typeof packContentSchema>;
export type PackDocument = z.infer<typeof packDocumentSchema>;
export function copyPackName(name: string): string {
  const suffix = " (copy)";
  let prefix = name.slice(0, 100 - suffix.length);
  const last = prefix.charCodeAt(prefix.length - 1);
  // Truncation must not split an emoji's UTF-16 surrogate pair.
  if (last >= 0xd800 && last <= 0xdbff) prefix = prefix.slice(0, -1);
  return prefix + suffix;
}
export type PackPrompt = {
  title: string;
  options?: string[];
  answer?: number;
  explanation?: string;
  scene?: number;
  pack?: string;
};
export function packIssues(d: PackDocument): string[] {
  const issues: string[] = [];
  if (!d.content.items.length)
    issues.push("Add at least one item before marking this pack ready.");
  d.content.items.forEach((i, n) => {
    if (!i.title.trim()) issues.push(`Item ${n + 1}: write a prompt.`);
    if ("options" in i && Array.isArray(i.options)) {
      if (i.options.some((s) => !s.trim()))
        issues.push(`Item ${n + 1}: complete every choice.`);
      if (
        new Set(i.options.map((s) => s.trim().toLocaleLowerCase("en"))).size !==
        i.options.length
      )
        issues.push(`Item ${n + 1}: choices must be distinct.`);
      if (
        "answer" in i &&
        typeof i.answer === "number" &&
        i.answer >= i.options.length
      )
        issues.push(`Item ${n + 1}: choose an available correct answer.`);
    }
  });
  return issues;
}
export function validatePack(value: unknown): PackDocument {
  const d = packDocumentSchema.parse(value);
  const issues = packIssues(d);
  if (d.status === "ready" && issues.length) throw new Error(issues.join(" "));
  return d;
}
export function selectPackPrompts(
  content: PackContent,
  rounds: number,
  topic = "mixed",
  offset = 0,
): PackPrompt[] {
  const filtered = content.items.filter((i) => i.pack === topic),
    pool = filtered.length ? filtered : content.items;
  if (!pool.length) throw new Error("This pack has no playable items.");
  return Array.from({ length: rounds }, (_, n) => {
    const { id: _id, ...prompt } = pool[(n + offset) % pool.length];
    void _id;
    return structuredClone(prompt);
  });
}
// Permanent identities: never derive these from catalog order.
const DEFAULT_PACK_IDS: Record<GameId, string> = {
  hotwire: "40000000-0000-4000-8000-000000000001",
  "room-temperature": "40000000-0000-4000-8000-000000000002",
  sellout: "40000000-0000-4000-8000-000000000003",
  "caption-this": "40000000-0000-4000-8000-000000000004",
  "odd-one-in": "40000000-0000-4000-8000-000000000005",
  "scribble-shift": "40000000-0000-4000-8000-000000000006",
};
export const defaultPackId = (game: GameId) => DEFAULT_PACK_IDS[game];
export interface PackReference {
  packId: string;
  revisionId: string;
  revisionNumber: number;
  schemaVersion: 1;
  name: string;
  gameType: GameId;
}
export interface PackSummary {
  id: string;
  workspaceId: string | null;
  ownerType: "ruckus" | "workspace";
  gameType: GameId;
  name: string;
  shortDescription: string;
  category: (typeof CATEGORIES)[number];
  season: (typeof SEASONS)[number];
  difficulty: (typeof DIFFICULTIES)[number];
  status: "draft" | "ready" | "archived";
  itemCount: number;
  updatedAt: string;
}
export interface PackRecord extends PackSummary {
  revisionId: string;
  revisionNumber: number;
  document: PackDocument;
  provenance: "ruckus_original" | "workspace_authored" | "copied";
}
export const packExportSchema = z
  .object({
    format: z.literal("ruckus-content-pack"),
    schemaVersion: z.literal(1),
    document: packDocumentSchema,
  })
  .strict();
export const packExport = (document: PackDocument) => ({
  format: "ruckus-content-pack" as const,
  schemaVersion: 1 as const,
  document,
});
export function emptyPack(gameType: GameId, name: string): PackDocument {
  return {
    schemaVersion: 1,
    name,
    shortDescription: "",
    description: "",
    category: "custom",
    season: "evergreen",
    difficulty: "mixed",
    locale: "en",
    tags: [],
    status: "draft",
    content: { gameType, items: [] } as PackContent,
  };
}
export const packFiltersSchema = z
  .object({
    q: z.string().trim().max(100).optional(),
    game: z.enum(GAME_IDS).optional(),
    category: z.enum(CATEGORIES).optional(),
    season: z.enum(SEASONS).optional(),
    difficulty: z.enum(DIFFICULTIES).optional(),
    source: z.enum(["ruckus", "workspace"]).optional(),
    status: z.enum(["draft", "ready"]).optional(),
    cursor: z.string().max(512).optional(),
  })
  .strict();
