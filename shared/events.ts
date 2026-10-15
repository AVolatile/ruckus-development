import { z } from "zod/v3";
import { GAME_IDS, type Settings } from "./types.js";
import type { CustomBoard } from "./boards.js";
import type { BrandSnapshot } from "./brand.js";
const segmentSettings = z
  .object({
    rounds: z.number().int().min(1).max(5).default(3),
    pace: z.enum(["quick", "normal", "relaxed"]).default("normal"),
    pack: z.string().max(80).default("mixed"),
  })
  .strict();
const common = {
  itemId: z.string().uuid(),
  enabled: z.boolean(),
  order: z.number().int().min(0).max(49),
  displayTitle: z.string().trim().max(100).default(""),
  hostNote: z.string().trim().max(500).default(""),
  transitionLabel: z.string().trim().max(100).default(""),
};
export const playlistItemSchema = z.discriminatedUnion("type", [
  z
    .object({
      ...common,
      type: z.literal("original"),
      gameSlug: z.enum(GAME_IDS),
      settings: segmentSettings,
    })
    .strict(),
  z
    .object({
      ...common,
      type: z.literal("studio_board"),
      boardId: z.string().uuid(),
      settings: z.object({}).strict().default({}),
    })
    .strict(),
]);
export const eventDefinitionSchema = z
  .object({
    title: z.string().trim().min(1, "Give your event a title.").max(100),
    subtitle: z.string().trim().max(160).nullable(),
    description: z.string().trim().max(1000).nullable(),
    brandKitId: z.string().uuid().nullable(),
    playlist: z
      .array(playlistItemSchema)
      .max(50)
      .superRefine((items, ctx) => {
        if (
          new Set(items.map((i) => i.itemId)).size !== items.length ||
          items.some((i, n) => i.order !== n)
        )
          ctx.addIssue({
            code: "custom",
            message: "Use unique playlist IDs and consecutive order.",
          });
      }),
    eventSettings: z
      .object({
        showEventIntro: z.boolean(),
        showIntermissionBetweenGames: z.boolean(),
        showFinalEventLeaderboard: z.boolean(),
        carryScoresAcrossGames: z.boolean(),
        allowLateJoin: z.boolean(),
        hostControlsProgression: z.literal(true),
        showRuckusAttribution: z.literal(true),
      })
      .strict(),
    presentationSettings: z
      .object({
        introMessage: z.string().trim().max(240),
        intermissionMessage: z.string().trim().max(240),
        finalMessage: z.string().trim().max(240),
      })
      .strict(),
  })
  .strict();
export type EventDefinition = z.infer<typeof eventDefinitionSchema>;
export type PlaylistItem = EventDefinition["playlist"][number];
export interface EventRecord {
  id: string;
  workspaceId: string;
  revisionId: string;
  revisionNumber: number;
  definition: EventDefinition;
  status: "draft" | "ready" | "archived";
  updatedAt: string;
}
export interface EventSummary {
  id: string;
  name: string;
  status: string;
  updatedAt: string;
}
export const eventWriteSchema = z
  .object({
    definition: eventDefinitionSchema,
    baseRevisionId: z.string().uuid().optional(),
  })
  .strict();
export function emptyEvent(title = "A good Ruckus"): EventDefinition {
  return {
    title,
    subtitle: null,
    description: null,
    brandKitId: null,
    playlist: [],
    eventSettings: {
      showEventIntro: true,
      showIntermissionBetweenGames: true,
      showFinalEventLeaderboard: true,
      carryScoresAcrossGames: true,
      allowLateJoin: true,
      hostControlsProgression: true,
      showRuckusAttribution: true,
    },
    presentationSettings: {
      introMessage: "One room. Your people. Let’s make a ruckus.",
      intermissionMessage: "Take a breath. The next good thing is coming.",
      finalMessage: "Good company. Excellent Ruckus.",
    },
  };
}
export interface FrozenSegment {
  itemId: string;
  title: string;
  transitionLabel: string;
  settings: Settings;
  board?: CustomBoard;
  boardId?: string;
  boardRevisionId?: string;
  contentVersion: string;
  prompts?: {
    title: string;
    options?: string[];
    answer?: number;
    explanation?: string;
    scene?: number;
  }[];
}
export interface LaunchSnapshot {
  id: string;
  eventId: string;
  eventRevisionId: string;
  workspaceId: string;
  launchedBy: string;
  definition: EventDefinition;
  brand: BrandSnapshot | null;
  segments: FrozenSegment[];
  assets: { logo: string | null; background: string | null };
}
export const EVENT_STATES = [
  "LOBBY",
  "EVENT_INTRO",
  "SEGMENT_INTRO",
  "GAME_ACTIVE",
  "GAME_RESULTS",
  "INTERMISSION",
  "EVENT_FINAL",
  "ENDED",
] as const;
export type EventState = (typeof EVENT_STATES)[number];
export type EventCue =
  | "LOBBY_ENTER"
  | "EVENT_START"
  | "EVENT_INTRO_ENTER"
  | "SEGMENT_INTRO_ENTER"
  | "QUESTION_OPEN"
  | "ANSWER_LOCKED"
  | "REVEAL_ENTER"
  | "GAME_RESULTS_ENTER"
  | "EVENT_LEADERBOARD_ENTER"
  | "INTERMISSION_ENTER"
  | "FINAL_RESULTS_ENTER"
  | "EVENT_END";
export interface EventLiveView {
  title: string;
  subtitle: string | null;
  workspaceId?: string;
  eventId?: string;
  hostNote?: string;
  problem?: { message: string; requestId: string };
  state: EventState;
  sequence: number;
  segmentIndex: number;
  playlist: {
    itemId: string;
    title: string;
    transitionLabel: string;
    skipped: boolean;
  }[];
  scores: { playerId: string; points: number; segments: number }[];
  settings: EventDefinition["eventSettings"];
  presentation: EventDefinition["presentationSettings"];
  brand: {
    displayName: string;
    primary: string;
    surface: string;
    accent: string;
    footer: string | null;
    logo: string | null;
    background: string | null;
  } | null;
  cue: { name: EventCue; names: EventCue[]; at: number; sequence: number };
}
export type EventCommand = "start" | "advance" | "skip-next" | "end";
export const eventCommandSchema = z
  .object({
    action: z.enum(["start", "advance", "skip-next", "end"]),
    sequence: z.number().int().min(0),
  })
  .strict();
// Equal raw scores share points; UUID only orders the display, never breaks a scoring tie.
export function placementPoints(rows: { id: string; score: number }[]) {
  return rows.map((p) => ({
    playerId: p.id,
    points: rows.every((p) => p.score === 0)
      ? 0
      : rows.length === 1
        ? 1000
        : Math.round(
            (1000 *
              (rows.length -
                1 -
                rows.filter((q) => q.score > p.score).length)) /
              (rows.length - 1),
          ),
  }));
}
export const eventTemplateSpecs = [
  {
    id: "team-warmup",
    name: "Team Warmup",
    description: "Read the room, then test a little knowledge.",
    games: ["room-temperature", "hotwire"],
  },
  {
    id: "friday-wind-down",
    name: "Friday Wind Down",
    description: "Small opinions, big pitches, questionable captions.",
    games: ["room-temperature", "sellout", "caption-this"],
  },
  {
    id: "new-hire-mixer",
    name: "New Hire Mixer",
    description: "An easy first hello with opinions and drawings.",
    games: ["room-temperature", "scribble-shift"],
  },
  {
    id: "holiday-party",
    name: "Holiday Party",
    description:
      "Bring your people; add a Studio round for your own traditions.",
    games: ["room-temperature", "hotwire", "caption-this"],
  },
  {
    id: "company-trivia-night",
    name: "Company Trivia Night",
    description:
      "Fast facts and friendly suspicion. Add your own company questions.",
    games: ["hotwire", "odd-one-in"],
  },
  {
    id: "offsite-social",
    name: "Offsite Social",
    description:
      "A little of everything, from first opinions to final masterpieces.",
    games: ["room-temperature", "sellout", "odd-one-in", "scribble-shift"],
  },
] as const;
export function eventTemplate(id: string, uuid: () => string): EventDefinition {
  const spec = eventTemplateSpecs.find((t) => t.id === id);
  if (!spec) throw new Error("Choose an available starter.");
  return {
    ...emptyEvent(spec.name),
    description: spec.description,
    playlist: spec.games.map((gameSlug, order) => ({
      itemId: uuid(),
      type: "original" as const,
      gameSlug,
      order,
      enabled: true,
      displayTitle: "",
      hostNote: "",
      transitionLabel: "",
      settings: { rounds: 3, pace: "normal" as const, pack: "mixed" },
    })),
  };
}
