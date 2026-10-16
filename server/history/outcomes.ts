import { createHash, randomUUID } from "node:crypto";
import type { Room } from "../engine.js";
import type { Player } from "../../shared/types.js";
import { gameById } from "../../shared/catalog.js";
import {
  sessionSummarySchema,
  type SessionSummary,
  type SessionSource,
  type SessionSegment,
} from "../../shared/history.js";
import type { FrozenSegment } from "../../shared/events.js";
const MAX_ATTENDEES = 300;
const seconds = (a: number, b: number) =>
  Math.max(0, Math.min(1_000_000, Math.round((b - a) / 1000)));
const iso = (n: number) => new Date(n).toISOString();
interface Attendance {
  player: Pick<Player, "id" | "name" | "avatar" | "bot" | "score">;
  joinedAt: number;
}
interface Outcome {
  id: string;
  score: number;
  submitted: number;
  correct: number;
  votesCast: number;
  votesReceived: number;
  roundsEligible: number;
}
export interface GameOutcome {
  index: number;
  startedAt: number;
  endedAt: number;
  completed: boolean;
  scored: boolean;
  rounds: number;
  results: Outcome[];
  order: string[];
  eligibleIds: Set<string>;
  submissions: number;
  votes: number;
}
/** Bounded, in-memory counters only. Never retains an input, token, prompt or socket. */
export class RoomOutcomes {
  runId = randomUUID();
  startedAt = 0;
  endedAt = 0;
  joined = 0;
  demos = 0;
  attendees = new Map<string, Attendance>();
  games: GameOutcome[] = [];
  private lastRound = "";
  private knownCurrent = new Set<string>();
  reset() {
    this.runId = randomUUID();
    this.startedAt = 0;
    this.endedAt = 0;
    this.joined = 0;
    this.demos = 0;
    this.attendees.clear();
    this.games = [];
    this.lastRound = "";
    this.knownCurrent.clear();
  }
  observe(room: Room) {
    const now = Date.now();
    // Retain a bounded roster. Total attendance stays accurate even after details fill up.
    for (const p of room.players.values()) {
      if (
        !this.knownCurrent.has(p.public.id) &&
        !this.attendees.has(p.public.id)
      ) {
        this.joined++;
        if (p.public.bot) this.demos++;
      }
      if (
        !this.attendees.has(p.public.id) &&
        this.attendees.size >= MAX_ATTENDEES
      ) {
        const retired = [...this.attendees.keys()].find(
          (id) => !room.players.has(id),
        );
        if (retired) this.attendees.delete(retired);
      }
      if (
        this.attendees.has(p.public.id) ||
        this.attendees.size < MAX_ATTENDEES
      )
        this.attendees.set(p.public.id, {
          player: {
            id: p.public.id,
            name: p.public.name,
            avatar: p.public.avatar,
            bot: p.public.bot,
            score: p.public.score,
          },
          joinedAt: this.attendees.get(p.public.id)?.joinedAt ?? now,
        });
    }
    this.knownCurrent = new Set(room.players.keys());
    if (room.phase === "intro" && !this.startedAt) this.startedAt = now;
    if (this.endedAt) return;
    let game = this.games.find((g) => g.index === room.gameIndex);
    if (room.phase === "active" && !game) {
      game = {
        index: room.gameIndex,
        startedAt: now,
        endedAt: now,
        completed: false,
        scored:
          !room.board ||
          room.board.questions.some(
            (q) => q.type !== "poll" && q.scoreMode !== "no-score",
          ),
        rounds: 0,
        results: [],
        order: [],
        eligibleIds: new Set(),
        submissions: 0,
        votes: 0,
      };
      this.games.push(game);
    }
    if (game && room.phase === "active")
      for (const id of room.eligible) {
        game.eligibleIds.add(id);
        if (
          !game.results.some((r) => r.id === id) &&
          game.results.length >= MAX_ATTENDEES
        ) {
          const retired = game.results.findIndex(
            (r) => !room.players.has(r.id),
          );
          if (retired >= 0) game.results.splice(retired, 1);
        }
        if (
          !game.results.some((r) => r.id === id) &&
          game.results.length < MAX_ATTENDEES &&
          this.attendees.has(id)
        )
          game.results.push({
            id,
            score: 0,
            submitted: 0,
            correct: 0,
            votesCast: 0,
            votesReceived: 0,
            roundsEligible: 0,
          });
      }
    const key = `${room.gameIndex}:${room.round}`;
    if (game && room.phase === "results" && key !== this.lastRound) {
      this.lastRound = key;
      game.rounds++;
      game.submissions += room.entries.size;
      game.votes += room.votes.size;
      for (const r of game.results) {
        if (room.eligible.has(r.id)) r.roundsEligible++;
        const entry = room.entries.get(r.id),
          p = room.players.get(r.id);
        if (entry) r.submitted++;
        const q = room.board?.questions[room.round];
        if (
          entry &&
          "choice" in entry.input &&
          room.correct.includes(entry.input.choice) &&
          (!q || (q.type !== "poll" && q.scoreMode !== "no-score"))
        )
          r.correct++;
        if (room.votes.has(r.id)) r.votesCast++;
        if (entry)
          r.votesReceived += [...room.votes.values()].filter(
            (id) => id === entry.id,
          ).length;
        r.score += p?.public.delta ?? 0;
      }
    }
    if (
      game &&
      ["intermission", "final", "ended"].includes(room.phase) &&
      !game.completed
    ) {
      game.order = [...room.players.values()]
        .sort((a, b) => b.public.score - a.public.score)
        .map((p) => p.public.id);
      game.endedAt = now;
      game.completed = room.phase !== "ended";
    }
    if (["final", "ended"].includes(room.phase)) this.endedAt = now;
  }
}
export interface SummaryContext {
  workspaceId: string;
  hostUserId: string;
  source: SessionSource;
  title: string;
  type: SessionSummary["type"];
  brand?: SessionSummary["brand"];
  segments?: FrozenSegment[];
}
export function buildSessionSummary(
  room: Room,
  context: SummaryContext,
  extra?: {
    id: string;
    startedAt: number;
    outcomes: { index: number; outcome: RoomOutcomes }[];
    joined: number;
    demos: number;
    segments: FrozenSegment[];
    scores: { playerId: string; points: number }[] | null;
    completed: boolean;
  },
): SessionSummary | null {
  const outcomes = extra?.outcomes.map((o) => o.outcome) ?? [room.outcomes],
    games = extra
      ? extra.outcomes
          .flatMap(({ index, outcome }) =>
            outcome.games.map((g) => ({ g, index })),
          )
          .filter(({ g }) => g.rounds > 0)
      : room.outcomes.games
          .map((g) => ({ g, index: g.index }))
          .filter(({ g }) => g.rounds > 0);
  if (!games.length) return null;
  const candidates = new Map<string, Attendance>();
  for (const o of outcomes)
    for (const [id, a] of o.attendees)
      candidates.set(id, {
        ...a,
        joinedAt: candidates.get(id)?.joinedAt ?? a.joinedAt,
      });
  const all = new Map(
    [...candidates]
      .sort(
        ([a], [b]) => Number(room.players.has(b)) - Number(room.players.has(a)),
      )
      .slice(0, MAX_ATTENDEES),
  );
  // Session salt produces repeatable local IDs without storing a reusable player ID.
  const sessionId = extra?.id ?? room.outcomes.runId;
  const mapping = new Map(
    [...all.keys()].map((id) => {
      const bytes = createHash("sha256")
        .update(sessionId + ":" + id)
        .digest();
      bytes[6] = (bytes[6] & 15) | 64;
      bytes[8] = (bytes[8] & 63) | 128;
      const hex = bytes.toString("hex").slice(0, 32);
      return [
        id,
        `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`,
      ];
    }),
  );
  const end = extra ? Date.now() : room.outcomes.endedAt || Date.now(),
    start = extra?.startedAt || outcomes[0].startedAt;
  const scored = extra
    ? extra.scores !== null
    : !room.board ||
      room.board.questions.some(
        (q) => q.type !== "poll" && q.scoreMode !== "no-score",
      );
  const leaderboard =
    extra?.scores ??
    [...room.players.values()]
      .map((p) => ({ playerId: p.public.id, points: p.public.score }))
      .sort((a, b) => b.points - a.points);
  const segments: SessionSegment[] = games.map(({ g, index }) => {
    const frozen = extra?.segments[index];
    const gameType =
      frozen?.settings.playlist[0] ?? room.settings.playlist[index];
    const ref = frozen?.contentPack ?? room.packReference(index);
    const source: SessionSource = frozen?.board
      ? { boardId: frozen.boardId, boardRevisionId: frozen.boardRevisionId }
      : !extra && room.board
        ? context.source
        : {
            gameType,
            ...(ref
              ? {
                  packId: ref.packId,
                  packRevisionId: ref.revisionId,
                  packName: ref.name,
                }
              : {}),
          };
    const ranked = [...g.results].sort((a, b) => b.score - a.score);
    const order = g.completed
      ? g.order
      : [...room.players.values()]
          .sort((a, b) => b.public.score - a.public.score)
          .map((p) => p.public.id);
    return {
      sequence: index,
      type: (extra ? frozen?.board : room.board) ? "studio" : "original",
      title: frozen?.title || room.board?.title || gameById(gameType).name,
      source,
      startedAt: iso(g.startedAt),
      endedAt: iso(g.completed ? g.endedAt : end),
      durationSeconds: seconds(g.startedAt, g.completed ? g.endedAt : end),
      completed: g.completed,
      scored: g.scored,
      rounds: g.rounds,
      participantCount: g.eligibleIds.size,
      submissions: g.submissions,
      votes: g.votes,
      results: ranked
        .filter((r) => mapping.has(r.id))
        .map((r) => ({
          participantId: mapping.get(r.id)!,
          score: g.scored ? r.score : null,
          rank:
            g.scored && order.includes(r.id) ? order.indexOf(r.id) + 1 : null,
          submitted: r.submitted,
          correct: r.correct,
          votesCast: r.votesCast,
          votesReceived: r.votesReceived,
          roundsEligible: r.roundsEligible,
        })),
    };
  });
  const completed = extra ? extra.completed : room.phase === "final";
  const participants = [...all].map(([id, a]) => {
    const rank = leaderboard.findIndex((p) => p.playerId === id),
      score = rank < 0 ? null : leaderboard[rank].points;
    const participated = games.filter(({ g }) => g.eligibleIds.has(id));
    return {
      id: mapping.get(id)!,
      name: a.player.name,
      avatar: a.player.avatar,
      demo: a.player.bot,
      joinedAt: iso(a.joinedAt),
      completed: completed && room.players.has(id) && participated.length > 0,
      finalScore: scored && rank >= 0 ? score : null,
      finalOrder: scored && rank >= 0 ? rank + 1 : null,
      finalRank:
        scored && rank >= 0
          ? extra
            ? leaderboard.findIndex((p) => p.points === score) + 1
            : rank + 1
          : null,
      segmentsParticipated: participated.length,
      segmentsCompleted: participated.filter(({ g }) => g.completed).length,
    };
  });
  const joined = extra?.joined ?? room.outcomes.joined;
  return sessionSummarySchema.parse({
    id: extra?.id ?? room.outcomes.runId,
    workspaceId: context.workspaceId,
    hostUserId: context.hostUserId,
    roomCode: room.code,
    type: context.type,
    title: context.title,
    source: context.source,
    brand: context.brand ?? null,
    startedAt: iso(start),
    endedAt: iso(end),
    durationSeconds: seconds(start, end),
    playerCountJoined: joined,
    playerCountCompleted: participants.filter((p) => p.completed).length,
    demoCount: extra?.demos ?? room.outcomes.demos,
    detailsOmitted: Math.max(0, joined - participants.length),
    status: completed ? "completed" : "ended_early",
    launchSnapshotVersion: 1,
    segments,
    participants,
  });
}
