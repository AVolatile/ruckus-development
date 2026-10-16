import { z } from "zod/v3";
import { GAME_IDS } from "./types.js";
const uuid = z.string().uuid();
const count = z.number().int().min(0).max(1_000_000);
const instant = z.string().datetime();
export const sourceSchema = z
  .object({
    eventId: uuid.optional(),
    eventRevisionId: uuid.optional(),
    boardId: uuid.optional(),
    boardRevisionId: uuid.optional(),
    packId: uuid.optional(),
    packRevisionId: uuid.optional(),
    packName: z.string().max(120).optional(),
    gameType: z.enum(GAME_IDS).optional(),
  })
  .strict();
const resultSchema = z
  .object({
    participantId: uuid,
    score: count.nullable(),
    rank: count.nullable(),
    submitted: count,
    correct: count,
    votesCast: count,
    votesReceived: count,
    roundsEligible: count,
  })
  .strict();
export const segmentSummarySchema = z
  .object({
    sequence: z.number().int().min(0).max(49),
    type: z.enum(["original", "studio"]),
    title: z.string().min(1).max(120),
    source: sourceSchema,
    startedAt: instant,
    endedAt: instant,
    durationSeconds: count,
    completed: z.boolean(),
    scored: z.boolean(),
    rounds: count,
    participantCount: count,
    submissions: count,
    votes: count,
    results: z.array(resultSchema).max(300),
  })
  .strict();
export const participantSchema = z
  .object({
    id: uuid,
    name: z.string().max(40),
    avatar: z.number().int().min(0).max(19),
    demo: z.boolean(),
    joinedAt: instant,
    completed: z.boolean(),
    finalScore: count.nullable(),
    finalRank: count.nullable(),
    finalOrder: z.number().int().min(1).max(30).nullable(),
    segmentsParticipated: count,
    segmentsCompleted: count,
  })
  .strict();
export const sessionSummarySchema = z
  .object({
    id: uuid,
    workspaceId: uuid,
    hostUserId: z.string().min(1).max(128),
    roomCode: z.string().max(8),
    type: z.enum(["original", "studio", "event"]),
    title: z.string().min(1).max(120),
    source: sourceSchema,
    brand: z
      .object({
        kitId: uuid,
        revisionId: uuid,
        name: z.string().max(100),
        displayName: z.string().max(100),
        primary: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
        surface: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
        accent: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
      })
      .strict()
      .nullable(),
    startedAt: instant,
    endedAt: instant,
    durationSeconds: count,
    playerCountJoined: count,
    playerCountCompleted: count,
    demoCount: count,
    detailsOmitted: count,
    status: z.enum(["completed", "ended_early"]),
    launchSnapshotVersion: z.literal(1),
    segments: z.array(segmentSummarySchema).min(1).max(50),
    participants: z.array(participantSchema).max(300),
  })
  .strict()
  .superRefine((s, ctx) => {
    const ids = new Set(s.participants.map((p) => p.id));
    if (
      ids.size !== s.participants.length ||
      s.playerCountJoined < s.participants.length ||
      s.demoCount > s.playerCountJoined ||
      s.playerCountCompleted !==
        s.participants.filter((p) => p.completed).length ||
      s.detailsOmitted !== s.playerCountJoined - s.participants.length ||
      s.participants.some(
        (p) =>
          (p.finalRank === null) !== (p.finalScore === null) ||
          p.finalRank === 0 ||
          p.segmentsCompleted > p.segmentsParticipated,
      ) ||
      s.segments.some(
        (seg, i) =>
          (i > 0 && seg.sequence <= s.segments[i - 1].sequence) ||
          new Set(seg.results.map((r) => r.participantId)).size !==
            seg.results.length ||
          seg.results.some(
            (r) =>
              !ids.has(r.participantId) ||
              r.rank === 0 ||
              (!seg.scored && (r.score !== null || r.rank !== null)),
          ),
      ) ||
      Date.parse(s.endedAt) < Date.parse(s.startedAt) ||
      s.segments.some(
        (seg) => Date.parse(seg.endedAt) < Date.parse(seg.startedAt),
      ) ||
      !s.segments.some((seg) => seg.rounds > 0)
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Session outcomes must be ordered, qualified and internally consistent.",
      });
  });
export type SessionSummary = z.infer<typeof sessionSummarySchema>;
export type SessionSegment = z.infer<typeof segmentSummarySchema>;
export type SessionParticipant = z.infer<typeof participantSchema>;
export type SessionSource = z.infer<typeof sourceSchema>;
export type SessionListItem = Omit<
  SessionSummary,
  "segments" | "participants" | "hostUserId"
> & { segmentCount: number };
export type SessionRecap = Omit<SessionSummary, "hostUserId"> & {
  segmentCount: number;
};
export interface SessionPage {
  items: SessionListItem[];
  nextCursor: string | null;
}
export const historyQuerySchema = z
  .object({
    range: z.enum(["7", "30", "90", "all"]).default("30"),
    type: z.enum(["original", "studio", "event"]).optional(),
    game: z.enum(GAME_IDS).optional(),
    eventId: uuid.optional(),
    from: z.string().date().optional(),
    to: z.string().date().optional(),
    limit: z.coerce.number().int().min(1).max(50).default(30),
    cursor: z.string().max(512).optional(),
  })
  .strict()
  .superRefine((q, ctx) => {
    if (q.from && q.to && q.from > q.to)
      ctx.addIssue({
        code: "custom",
        message: "Choose an end date on or after the start date.",
      });
  });
export type HistoryQuery = z.infer<typeof historyQuerySchema>;
export function historyDates(
  q: Pick<HistoryQuery, "range" | "from" | "to">,
  now = new Date(),
) {
  const end = q.to ? new Date(`${q.to}T00:00:00.000Z`) : new Date(now);
  if (q.to) end.setUTCDate(end.getUTCDate() + 1);
  const start = q.from
    ? new Date(`${q.from}T00:00:00.000Z`)
    : q.range === "all"
      ? null
      : new Date(
          Date.UTC(
            end.getUTCFullYear(),
            end.getUTCMonth(),
            end.getUTCDate() - Number(q.range) + (q.to ? 0 : 1),
          ),
        );
  return { start, end };
}
export interface AnalyticsSummary {
  sessions: number;
  attendances: number;
  demoAttendances: number;
  completed: number;
  totalSeconds: number;
  averageAttendance: number;
  averageSeconds: number;
  activity: { date: string; sessions: number; attendances: number }[];
  types: { type: string; sessions: number }[];
  games: { id: string; title: string; plays: number }[];
  packs: { id: string; title: string; plays: number }[];
  events: { id: string; title: string; plays: number }[];
  bucket: "day" | "month";
}
export function recapCsv(s: Omit<SessionSummary, "hostUserId">) {
  const cell = (v: unknown) =>
    `"${String(v ?? "")
      .replace(/^[\s]*[=+@-]/, "'$&")
      .replaceAll('"', '""')}"`;
  const rows: unknown[][] = [
    [
      "session_id",
      "title",
      "type",
      "status",
      "started_at",
      "duration_seconds",
      "attendances",
      "event_revision",
      "board_revision",
      "demo_attendances",
    ],
    [
      s.id,
      s.title,
      s.type,
      s.status,
      s.startedAt,
      s.durationSeconds,
      s.playerCountJoined,
      s.source.eventRevisionId,
      s.source.boardRevisionId,
      s.demoCount,
    ],
    [],
    ["rank", "display_name", "demo", "score", "completed"],
    ...s.participants.map((p) => [
      p.finalRank,
      p.name,
      p.demo,
      p.finalScore,
      p.completed,
    ]),
    [],
    [
      "sequence",
      "title",
      "rounds",
      "participants",
      "duration_seconds",
      "completed",
      "game",
      "board_revision",
      "pack_revision",
    ],
    ...s.segments.map((g) => [
      g.sequence + 1,
      g.title,
      g.rounds,
      g.participantCount,
      g.durationSeconds,
      g.completed,
      g.source.gameType,
      g.source.boardRevisionId,
      g.source.packRevisionId,
    ]),
  ];
  return rows.map((row) => row.map(cell).join(",")).join("\r\n");
}
