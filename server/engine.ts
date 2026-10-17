import { randomInt, randomUUID } from "node:crypto";
import { log } from "./ops/log.js";
import { RoomOutcomes } from "./history/outcomes.js";
import type { CustomBoard, CustomQuestion } from "../shared/boards.js";
import type { BoardSessionSummary } from "../shared/types.js";
import { gameById } from "../shared/catalog.js";
import type {
  HostAction,
  Input,
  Phase,
  Player,
  RoomView,
  Settings,
  Stroke,
  Submission,
} from "../shared/types.js";
import { botCreative, getPrompt, type Question } from "./content.js";
import { standaloneCues, standaloneStage } from "../shared/audio.js";
import type { AudioCue } from "../shared/audio.js";
import { safeText } from "./validation.js";
interface PrivatePlayer {
  public: Player;
  token: string;
  socketId: string | null;
}
interface Entry {
  id: string;
  playerId: string;
  input: Input;
  elapsed: number;
}
const BOT_NAMES = [
  "Maya",
  "Jordan",
  "Priya",
  "Mateo",
  "Alex",
  "Sam",
  "Noor",
  "Jamie",
  "Chris",
  "Imani",
  "Luca",
  "Sasha",
];
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const makeCode = () =>
  Array.from(
    { length: 5 },
    () => CODE_CHARS[randomInt(CODE_CHARS.length)],
  ).join("");
export class Room {
  readonly outcomes = new RoomOutcomes();
  readonly hostToken = randomUUID();
  readonly audioRoomId = randomUUID();
  readonly createdAt = Date.now();
  phase: Phase = "lobby";
  players = new Map<string, PrivatePlayer>();
  hostSocket: string | null = null;
  locked = false;
  gameIndex = 0;
  round = 0;
  prompt: Question | null = null;
  deadline: number | null = null;
  duration = 0;
  paused = false;
  remaining = 0;
  counts: number[] = [];
  correct: number[] = [];
  entries = new Map<string, Entry>();
  votes = new Map<string, string>();
  eligible = new Set<string>();
  stats = { answers: 0, reactions: 0, rounds: 0 };
  changedAt = Date.now();
  lastHostSeen = Date.now();
  private timeout: ReturnType<typeof setTimeout> | null = null;
  private botTimers: ReturnType<typeof setTimeout>[] = [];
  private roundSequence = 0;
  private audioSequence = 0;
  private phaseStartedAt = Date.now();
  private phasePausedMs = 0;
  private pauseStartedAt: number | null = null;
  private audioCues: AudioCue[] = ["LOBBY_ENTER"];
  private offset = randomInt(500);
  private ranks = new Map<string, number>();
  private boardQuestion: CustomQuestion | null = null;
  private history: BoardSessionSummary["questions"] = [];
  private fastest: BoardSessionSummary["fastest"] = null;
  constructor(
    readonly code: string,
    readonly settings: Settings,
    readonly joinUrl: string,
    private onChange: () => void,
    readonly board?: CustomBoard,
    private readonly frozenPrompts?: Question[],
    private readonly frozenLineup?: {
      prompts: Question[];
      reference: import("../shared/content-packs.js").PackReference;
    }[],
  ) {
    if (board) this.board = structuredClone(board);
    if (frozenPrompts) this.frozenPrompts = structuredClone(frozenPrompts);
    if (frozenLineup) this.frozenLineup = structuredClone(frozenLineup);
  }
  packReference(index: number) {
    return this.frozenLineup?.[index]?.reference;
  }
  private publish() {
    try {
      this.outcomes.observe(this);
    } catch {
      log(
        "session.capture_failed",
        { sessionId: this.outcomes.runId },
        "error",
      );
    }
    this.changedAt = Date.now();
    this.onChange();
  }
  playerByToken(token: string) {
    return [...this.players.values()].find((p) => p.token === token);
  }
  join(name: string, avatar: number, socketId: string) {
    if (this.phase === "ended")
      throw new Error("This room has ended. Ask the host for a new code.");
    if (this.locked)
      throw new Error("The room is locked. Ask your host to unlock it.");
    if (this.players.size >= 30)
      throw new Error("This party is full: 30 players.");
    if (this.phase !== "lobby" && !this.settings.lateJoins)
      throw new Error("The game has started. Join the next session.");
    if (!safeText(name)) throw new Error("Choose a workplace-friendly name.");
    if (
      [...this.players.values()].some(
        (p) => p.public.name.toLowerCase() === name.toLowerCase(),
      )
    )
      throw new Error("That name is taken. Add a nickname or initial.");
    const id = randomUUID(),
      token = randomUUID();
    this.players.set(id, {
      token,
      socketId,
      public: {
        id,
        name,
        avatar,
        score: 0,
        streak: 0,
        connected: true,
        bot: false,
        submitted: false,
        voted: false,
        delta: 0,
        movement: 0,
        votes: 0,
        responseMs: [],
        majorityWins: 0,
        drawingPoints: 0,
      },
    });
    this.publish();
    return { id, token };
  }
  addBots(count: number) {
    if (this.phase !== "lobby")
      throw new Error("Add demo players in the lobby.");
    for (let i = 0; i < count && this.players.size < 30; i++) {
      const index = [...this.players.values()].filter(
        (p) => p.public.bot,
      ).length;
      let name = BOT_NAMES[index % BOT_NAMES.length];
      if (index >= BOT_NAMES.length)
        name += ` ${Math.floor(index / BOT_NAMES.length) + 1}`;
      while ([...this.players.values()].some((p) => p.public.name === name))
        name += "·";
      const id = randomUUID();
      this.players.set(id, {
        token: randomUUID(),
        socketId: null,
        public: {
          id,
          name,
          avatar: (index * 3 + 1) % 20,
          score: 0,
          streak: 0,
          connected: true,
          bot: true,
          submitted: false,
          voted: false,
          delta: 0,
          movement: 0,
          votes: 0,
          responseMs: [],
          majorityWins: 0,
          drawingPoints: 0,
        },
      });
    }
    this.publish();
  }
  connectHost(socketId: string) {
    this.hostSocket = socketId;
    this.lastHostSeen = Date.now();
    this.publish();
  }
  disconnect(socketId: string) {
    if (this.hostSocket === socketId) {
      this.hostSocket = null;
      this.lastHostSeen = Date.now();
    }
    for (const p of this.players.values())
      if (p.socketId === socketId) {
        p.socketId = null;
        p.public.connected = false;
      }
    this.publish();
  }
  resumePlayer(token: string, socketId: string) {
    const p = this.playerByToken(token);
    if (!p)
      throw new Error(
        "Your player session is no longer available. Join again.",
      );
    p.socketId = socketId;
    p.public.connected = true;
    this.publish();
    return p.public.id;
  }
  view(playerId?: string): RoomView {
    const reveal =
      this.phase === "results" ||
      this.phase === "final" ||
      this.phase === "intermission";
    const submissions: Submission[] =
      this.phase === "voting" || reveal
        ? [...this.entries.values()]
            .filter((e) => "text" in e.input || "drawing" in e.input)
            .map((e) => ({
              id: e.id,
              text: "text" in e.input ? e.input.text : undefined,
              drawing: "drawing" in e.input ? e.input.drawing : undefined,
              votes: reveal
                ? [...this.votes.values()].filter((v) => v === e.id).length
                : 0,
              author: reveal ? e.playerId : undefined,
            }))
        : [];
    const prompt = this.prompt
      ? {
          title: this.prompt.title,
          options: this.prompt.options,
          scene: this.prompt.scene,
          explanation:
            reveal && (this.board?.settings.showExplanation ?? true)
              ? this.prompt.explanation
              : undefined,
          questionType: this.boardQuestion?.type,
          scoreMode: this.boardQuestion?.scoreMode,
        }
      : null;
    const now = Date.now();
    return {
      audio: {
        roomId: this.audioRoomId,
        sequence: this.audioSequence,
        names: this.audioCues,
        occurredAt: this.phaseStartedAt,
        phase: this.phase,
        phaseStartedAt: this.phaseStartedAt,
        elapsedMs: Math.max(
          0,
          (this.pauseStartedAt ?? now) -
            this.phaseStartedAt -
            this.phasePausedMs,
        ),
        remainingMs: this.deadline
          ? this.paused
            ? this.remaining
            : Math.max(0, this.deadline - now)
          : null,
        paused: this.paused,
        profile: this.board
          ? this.boardQuestion?.type === "poll" ||
            this.boardQuestion?.scoreMode === "no-score" ||
            !this.board.questions.some(
              (q) => q.type !== "poll" && q.scoreMode !== "no-score",
            )
            ? "studio-poll"
            : "studio"
          : this.settings.playlist[this.gameIndex],
        nextProfile: this.settings.playlist[this.gameIndex + 1],
        stage: standaloneStage[this.phase],
      },
      board: this.board
        ? {
            title: this.board.title,
            description: this.board.description,
            color: this.board.coverStyle.color,
            questionCount: this.board.questions.length,
            scoring: this.board.questions.some(
              (q) => q.type !== "poll" && q.scoreMode !== "no-score",
            ),
            leaderboardFrequency: this.board.settings.leaderboardFrequency,
          }
        : undefined,
      summary:
        this.board && this.phase === "final"
          ? this.sessionSummary()
          : undefined,
      showLeaderboard:
        !this.board ||
        this.phase === "final" ||
        this.board.settings.leaderboardFrequency === "each" ||
        (this.board.settings.leaderboardFrequency === "every-5" &&
          (this.round + 1) % 5 === 0),
      code: this.code,
      phase: this.phase,
      settings: this.settings,
      locked: this.locked,
      players: [...this.players.values()].map((p) => p.public),
      hostConnected: !!this.hostSocket,
      gameIndex: this.gameIndex,
      round: this.round,
      prompt,
      deadline: this.paused ? Date.now() + this.remaining : this.deadline,
      duration: this.duration,
      paused: this.paused,
      submissions,
      counts: reveal ? this.counts : [],
      correct:
        reveal && (this.board?.settings.showCorrectAnswer ?? true)
          ? this.correct
          : [],
      joinUrl: this.joinUrl,
      serverTime: Date.now(),
      createdAt: this.createdAt,
      stats: this.stats,
      you: playerId,
      ownSubmission: playerId ? this.entries.has(playerId) : false,
      ownEntryId: playerId ? this.entries.get(playerId)?.id : undefined,
      ownVote: playerId ? this.votes.has(playerId) : false,
      roundKey: `${this.roundSequence}:${this.phase}`,
      eligible: playerId ? this.eligible.has(playerId) : true,
    };
  }
  private clearTimers() {
    if (this.timeout) clearTimeout(this.timeout);
    this.timeout = null;
    this.botTimers.forEach(clearTimeout);
    this.botTimers = [];
  }
  dispose() {
    this.clearTimers();
  }
  private setPhase(phase: Phase, ms: number) {
    this.clearTimers();
    this.audioCues = standaloneCues(
      phase,
      this.phase,
      this.gameIndex === 0 && phase === "intro" && this.phase === "lobby",
    );
    this.audioSequence++;
    this.phaseStartedAt = Date.now();
    this.phasePausedMs = 0;
    this.pauseStartedAt = null;
    this.phase = phase;
    this.paused = false;
    this.duration = ms;
    this.deadline = ms ? Date.now() + ms : null;
    if (ms) this.timeout = setTimeout(() => this.advance(), ms);
    this.scheduleBots();
    this.publish();
  }
  action(action: HostAction) {
    if (action === "lock") {
      this.locked = !this.locked;
      this.publish();
      return;
    }
    if (action === "end") {
      this.setPhase("ended", 0);
      return;
    }
    if (action === "rematch") {
      if (this.phase !== "final")
        throw new Error("Finish the session before starting a rematch.");
      this.outcomes.reset();
      for (const p of this.players.values())
        Object.assign(p.public, {
          score: 0,
          streak: 0,
          delta: 0,
          movement: 0,
          votes: 0,
          responseMs: [],
          majorityWins: 0,
          drawingPoints: 0,
          submitted: false,
          voted: false,
        });
      this.gameIndex = 0;
      this.round = 0;
      this.offset += 3;
      this.history = [];
      this.fastest = null;
      this.boardQuestion = null;
      this.prompt = null;
      this.entries.clear();
      this.votes.clear();
      this.eligible.clear();
      this.stats = { answers: 0, reactions: 0, rounds: 0 };
      this.setPhase("lobby", 0);
      return;
    }
    if (action === "pause") {
      if (!this.deadline)
        throw new Error("There is no running timer to pause.");
      if (!this.paused) {
        this.remaining = Math.max(1, this.deadline - Date.now());
        this.clearTimers();
        this.paused = true;
        this.pauseStartedAt = Date.now();
      } else {
        this.phasePausedMs += Date.now() - (this.pauseStartedAt ?? Date.now());
        this.pauseStartedAt = null;
        this.paused = false;
        this.deadline = Date.now() + this.remaining;
        this.timeout = setTimeout(() => this.advance(), this.remaining);
        this.scheduleBots();
      }
      this.publish();
      return;
    }
    if (this.paused) throw new Error("Resume the timer before advancing.");
    if (action === "start") {
      if (this.phase !== "lobby")
        throw new Error("This session has already started.");
      if (this.players.size < 2)
        throw new Error("Add at least two players, or invite the demo crew.");
      this.setPhase("intro", 5000);
      return;
    }
    if (action === "next" || action === "skip") {
      if (
        this.phase === "lobby" ||
        this.phase === "final" ||
        this.phase === "ended"
      )
        throw new Error("There is no round to advance.");
      this.advance();
    }
  }
  private roundDuration() {
    if (this.board) return (this.boardQuestion?.timer ?? 20) * 1000;
    const category = gameById(this.settings.playlist[this.gameIndex]).category;
    const base = category === "creative" ? 45000 : 15000;
    return Math.round(
      base *
        (this.settings.pace === "quick"
          ? 0.65
          : this.settings.pace === "relaxed"
            ? 1.5
            : 1),
    );
  }
  private startRound() {
    this.roundSequence++;
    this.entries.clear();
    this.votes.clear();
    this.counts = [];
    this.correct = [];
    this.eligible = new Set(
      [...this.players.values()]
        .filter((p) => p.public.connected)
        .map((p) => p.public.id),
    );
    for (const p of this.players.values()) {
      p.public.submitted = false;
      p.public.voted = false;
      p.public.delta = 0;
      p.public.movement = 0;
    }
    if (this.board) {
      const source = this.board.questions[this.round];
      const choices = source.answers.map((text, index) => ({ text, index }));
      if (this.board.settings.randomizeAnswers && source.type !== "true-false")
        for (let i = choices.length - 1; i > 0; i--) {
          const j = randomInt(i + 1);
          [choices[i], choices[j]] = [choices[j], choices[i]];
        }
      this.boardQuestion = {
        ...source,
        answers: choices.map((a) => a.text),
        correctAnswer:
          source.correctAnswer === null
            ? null
            : choices.findIndex((a) => a.index === source.correctAnswer),
      };
      this.prompt = {
        title: source.prompt,
        options: this.boardQuestion.answers,
        answer: this.boardQuestion.correctAnswer ?? undefined,
        explanation: source.explanation,
      };
    } else
      this.prompt = (this.frozenLineup?.[this.gameIndex]?.prompts ??
        this.frozenPrompts)?.[this.round]
        ? structuredClone(
            (this.frozenLineup?.[this.gameIndex]?.prompts ??
              this.frozenPrompts)![this.round],
          )
        : getPrompt(
            this.settings.playlist[this.gameIndex],
            this.round,
            this.settings.pack,
            this.offset,
          );
    this.setPhase("active", this.roundDuration());
  }
  advance() {
    if (this.paused || this.phase === "ended") return;
    switch (this.phase) {
      case "intro":
        this.startRound();
        break;
      case "active":
        if (
          gameById(this.settings.playlist[this.gameIndex]).category ===
            "creative" &&
          this.entries.size >= 2
        )
          this.setPhase(
            "voting",
            this.settings.pace === "quick" ? 12000 : 20000,
          );
        else this.closeRound();
        break;
      case "voting":
        this.closeRound();
        break;
      case "results":
        if (
          this.round + 1 <
          (this.board?.questions.length ?? this.settings.rounds)
        ) {
          this.round++;
          this.startRound();
        } else if (this.gameIndex + 1 < this.settings.playlist.length)
          this.setPhase("intermission", this.settings.autoAdvance ? 10000 : 0);
        else this.setPhase("final", 0);
        break;
      case "intermission":
        this.gameIndex++;
        this.round = 0;
        this.setPhase("intro", 5000);
        break;
    }
  }
  submit(playerId: string, input: Input) {
    const p = this.players.get(playerId);
    if (!p) throw new Error("Your player session is unavailable.");
    if (this.paused) throw new Error("The host paused play. Hang tight.");
    if (!this.deadline || Date.now() > this.deadline)
      throw new Error("Time’s up. Your answer didn’t make this round.");
    if (!this.eligible.has(playerId))
      throw new Error("You’re in! You can play from the next round.");
    const game = this.settings.playlist[this.gameIndex];
    if (this.phase === "voting") {
      if (!("vote" in input))
        throw new Error("Choose a submission to vote for.");
      if (this.votes.has(playerId))
        throw new Error("Your vote is already locked in.");
      const e = [...this.entries.values()].find((e) => e.id === input.vote);
      if (!e) throw new Error("That submission is no longer available.");
      if (e.playerId === playerId)
        throw new Error(
          "Give someone else the spotlight. You can’t vote for yourself.",
        );
      this.votes.set(playerId, input.vote);
      p.public.voted = true;
      this.publish();
      return;
    }
    if (this.phase !== "active")
      throw new Error("Submissions are closed for this round.");
    if (this.entries.has(playerId))
      throw new Error("Your answer is already locked in.");
    if (gameById(game).category !== "creative") {
      if (!("choice" in input)) throw new Error("Tap one of the answers.");
      if (input.choice >= (this.prompt?.options?.length ?? 4))
        throw new Error("That answer is not part of this question.");
    } else if (game === "scribble-shift") {
      if (!("drawing" in input)) throw new Error("Send your drawing to enter.");
    } else {
      if (!("text" in input))
        throw new Error("Write your submission to enter.");
      if (!safeText(input.text))
        throw new Error(
          "Keep it workplace-friendly, on one line and without markup.",
        );
    }
    const elapsed = Math.max(0, this.duration - (this.deadline - Date.now()));
    this.entries.set(playerId, { id: randomUUID(), playerId, input, elapsed });
    p.public.submitted = true;
    this.stats.answers++;
    p.public.responseMs.push(elapsed);
    this.publish();
    if (this.board && [...this.eligible].every((id) => this.entries.has(id)))
      this.closeRound();
  }
  private closeRound() {
    const game = this.settings.playlist[this.gameIndex];
    this.ranks = new Map(
      [...this.players.values()]
        .sort((a, b) => b.public.score - a.public.score)
        .map((p, i) => [p.public.id, i]),
    );
    this.counts = Array(this.prompt?.options?.length ?? 4).fill(0);
    for (const e of this.entries.values())
      if ("choice" in e.input) this.counts[e.input.choice]++;
    if (!this.board && game === "room-temperature") {
      const max = Math.max(...this.counts);
      this.correct =
        max > 0 ? this.counts.flatMap((n, i) => (n === max ? [i] : [])) : [];
    } else if (this.prompt?.answer !== undefined)
      this.correct = [this.prompt.answer];
    for (const p of this.players.values()) {
      const e = this.entries.get(p.public.id);
      let delta = 0;
      if (e && "choice" in e.input && this.correct.includes(e.input.choice)) {
        delta = this.boardQuestion
          ? this.boardQuestion.type === "poll" ||
            this.boardQuestion.scoreMode === "no-score"
            ? 0
            : this.boardQuestion.scoreMode === "casual"
              ? 500
              : 500 +
                Math.round(500 * Math.max(0, 1 - e.elapsed / this.duration))
          : game === "hotwire"
            ? 500 + Math.round(500 * Math.max(0, 1 - e.elapsed / this.duration))
            : game === "room-temperature"
              ? 600
              : 700;
        p.public.streak++;
        if (game === "room-temperature") p.public.majorityWins++;
      } else if (e && ("text" in e.input || "drawing" in e.input)) {
        const votes = [...this.votes.values()].filter((v) => v === e.id).length;
        delta = votes * 300;
        p.public.votes += votes;
        if (game === "scribble-shift") p.public.drawingPoints += delta;
      } else p.public.streak = 0;
      p.public.delta = delta;
      p.public.score += delta;
    }
    [...this.players.values()]
      .sort((a, b) => b.public.score - a.public.score)
      .forEach(
        (p, i) => (p.public.movement = (this.ranks.get(p.public.id) ?? i) - i),
      );
    if (this.boardQuestion) {
      const scored = this.boardQuestion.type !== "poll";
      const correct = [...this.entries.values()].filter(
        (e) => "choice" in e.input && this.correct.includes(e.input.choice),
      ).length;
      this.history.push({
        number: this.round + 1,
        prompt: this.boardQuestion.prompt,
        respondents: this.entries.size,
        correct,
        timedOut: this.eligible.size - this.entries.size,
        scored,
      });
      for (const e of this.entries.values())
        if (!this.fastest || e.elapsed < this.fastest.ms)
          this.fastest = {
            name: this.players.get(e.playerId)?.public.name ?? "Former player",
            ms: e.elapsed,
          };
    }
    this.stats.rounds++;
    this.setPhase("results", this.settings.autoAdvance ? 9000 : 0);
  }
  private sessionSummary(): BoardSessionSummary {
    const scored = this.history.filter((q) => q.scored);
    const attempts = scored.reduce((n, q) => n + q.respondents + q.timedOut, 0);
    const hardest = [...scored].sort(
      (a, b) =>
        a.correct / Math.max(1, a.respondents + a.timedOut) -
        b.correct / Math.max(1, b.respondents + b.timedOut),
    )[0];
    return {
      questions: this.history,
      correctness: attempts
        ? Math.round(
            (scored.reduce((n, q) => n + q.correct, 0) / attempts) * 100,
          )
        : null,
      hardestQuestion: hardest?.number ?? null,
      fastest: this.fastest,
    };
  }
  remove(id: string) {
    const p = this.players.get(id);
    if (!p) throw new Error("That player has already left.");
    this.players.delete(id);
    this.eligible.delete(id);
    const e = this.entries.get(id);
    this.entries.delete(id);
    this.votes.delete(id);
    if (e)
      for (const [v, target] of this.votes)
        if (target === e.id) this.votes.delete(v);
    this.publish();
    return p.socketId;
  }
  reaction() {
    if (!this.settings.reactions)
      throw new Error("Reactions are turned off in this room.");
    if (this.phase === "ended") throw new Error("This room has ended.");
    this.stats.reactions++;
    this.publish();
  }
  private scheduleBots() {
    if (this.phase !== "active" && this.phase !== "voting") return;
    const phase = this.phase;
    const ms = Math.max(500, (this.deadline ?? Date.now() + 5000) - Date.now());
    for (const [index, p] of [...this.players.values()].entries()) {
      if (
        !p.public.bot ||
        !this.eligible.has(p.public.id) ||
        (phase === "active"
          ? this.entries.has(p.public.id)
          : this.votes.has(p.public.id))
      )
        continue;
      const delay = Math.min(
        ms - 50,
        700 + randomInt(Math.max(1, Math.floor(ms * 0.72))),
      );
      this.botTimers.push(
        setTimeout(() => {
          if (this.phase !== phase || this.paused) return;
          try {
            if (phase === "voting") {
              const candidates = [...this.entries.values()].filter(
                (e) => e.playerId !== p.public.id,
              );
              if (candidates.length)
                this.submit(p.public.id, {
                  vote: candidates[randomInt(candidates.length)].id,
                });
            } else {
              const game = this.settings.playlist[this.gameIndex];
              if (game === "sellout")
                this.submit(p.public.id, {
                  text: botCreative("sellout", this.prompt!, index),
                });
              else if (game === "caption-this")
                this.submit(p.public.id, {
                  text: botCreative("caption-this", this.prompt!, index),
                });
              else if (game === "scribble-shift")
                this.submit(p.public.id, {
                  drawing: botDrawing(index + this.round, this.prompt?.title),
                });
              else
                this.submit(p.public.id, {
                  choice: this.boardQuestion
                    ? this.boardQuestion.correctAnswer !== null &&
                      Math.random() < 0.65
                      ? this.boardQuestion.correctAnswer
                      : randomInt(this.boardQuestion.answers.length)
                    : game === "room-temperature"
                      ? randomInt(4)
                      : Math.random() < 0.65
                        ? (this.prompt?.answer ?? 0)
                        : randomInt(4),
                });
            }
          } catch {
            /* A phase can expire between scheduling and execution. */
          }
        }, delay),
      );
    }
  }
}
export function botDrawing(seed: number, prompt = "cats"): Stroke[] {
  const color = ["#2548f4", "#ff7448", "#191a24", "#ffa9d2"][seed % 4];
  const stroke = (
    points: [number, number][],
    width = 5,
    ink = color,
  ): Stroke => ({ color: ink, width, points });
  const circle = (
    cx: number,
    cy: number,
    rx: number,
    ry = rx,
  ): [number, number][] =>
    Array.from({ length: 41 }, (_, i) => [
      cx + Math.cos((i * Math.PI) / 20) * rx,
      cy + Math.sin((i * Math.PI) / 20) * ry,
    ]);
  const face = [
    stroke(
      [
        [0.42, 0.41],
        [0.425, 0.415],
      ],
      7,
      "#191a24",
    ),
    stroke(
      [
        [0.57, 0.41],
        [0.575, 0.415],
      ],
      7,
      "#191a24",
    ),
    stroke(
      [
        [0.42, 0.55],
        [0.5, 0.6],
        [0.6, 0.54],
      ],
      4,
    ),
  ];
  let drawing: Stroke[];
  if (/coffee/i.test(prompt)) {
    drawing = [
      stroke([
        [0.27, 0.3],
        [0.27, 0.75],
        [0.68, 0.75],
        [0.68, 0.3],
        [0.27, 0.3],
      ]),
      stroke(circle(0.73, 0.5, 0.14, 0.16)),
      stroke([
        [0.68, 0.78],
        [0.21, 0.78],
      ]),
      stroke(
        [
          [0.34, 0.22],
          [0.31, 0.16],
          [0.37, 0.1],
        ],
        3,
      ),
      stroke(
        [
          [0.56, 0.22],
          [0.6, 0.16],
          [0.54, 0.1],
        ],
        3,
      ),
      ...face,
      stroke(
        [
          [0.35, 0.38],
          [0.48, 0.38],
          [0.48, 0.46],
          [0.35, 0.46],
          [0.35, 0.38],
          [0.61, 0.38],
          [0.61, 0.46],
          [0.5, 0.46],
          [0.5, 0.38],
        ],
        4,
      ),
    ];
  } else if (/chair|stapler/i.test(prompt)) {
    drawing = [
      stroke([
        [0.34, 0.16],
        [0.67, 0.16],
        [0.7, 0.55],
        [0.31, 0.55],
        [0.34, 0.16],
      ]),
      stroke([
        [0.27, 0.57],
        [0.73, 0.57],
        [0.73, 0.65],
        [0.27, 0.65],
        [0.27, 0.57],
      ]),
      stroke([
        [0.5, 0.65],
        [0.5, 0.84],
        [0.28, 0.88],
        [0.72, 0.88],
      ]),
      stroke(circle(0.27, 0.9, 0.04)),
      stroke(circle(0.72, 0.9, 0.04)),
      stroke([
        [0.25, 0.37],
        [0.2, 0.37],
        [0.2, 0.55],
        [0.27, 0.55],
      ]),
      stroke([
        [0.73, 0.55],
        [0.79, 0.55],
        [0.79, 0.37],
        [0.74, 0.37],
      ]),
      stroke(
        [
          [0.39, 0.21],
          [0.48, 0.34],
          [0.41, 0.34],
          [0.55, 0.49],
        ],
        4,
      ),
    ];
  } else if (/robot|printer/i.test(prompt)) {
    drawing = [
      stroke([
        [0.26, 0.28],
        [0.75, 0.28],
        [0.75, 0.68],
        [0.26, 0.68],
        [0.26, 0.28],
      ]),
      stroke([
        [0.37, 0.29],
        [0.37, 0.12],
        [0.65, 0.12],
        [0.65, 0.29],
      ]),
      stroke([
        [0.33, 0.56],
        [0.67, 0.56],
        [0.67, 0.83],
        [0.33, 0.83],
        [0.33, 0.56],
      ]),
      stroke(
        [
          [0.39, 0.63],
          [0.59, 0.63],
        ],
        3,
      ),
      stroke(
        [
          [0.39, 0.69],
          [0.61, 0.69],
        ],
        3,
      ),
      stroke(circle(0.36, 0.4, 0.025)),
      stroke(circle(0.65, 0.4, 0.025)),
      stroke([
        [0.27, 0.44],
        [0.13, 0.5],
        [0.1, 0.4],
      ]),
      stroke([
        [0.74, 0.44],
        [0.87, 0.37],
        [0.88, 0.47],
      ]),
    ];
  } else if (/pigeon|duck/i.test(prompt)) {
    drawing = [
      stroke(circle(0.54, 0.4, 0.15, 0.19)),
      stroke([
        [0.67, 0.34],
        [0.82, 0.43],
        [0.68, 0.46],
      ]),
      stroke([
        [0.41, 0.52],
        [0.19, 0.67],
        [0.34, 0.79],
        [0.64, 0.77],
        [0.71, 0.59],
        [0.64, 0.53],
      ]),
      stroke(
        [
          [0.31, 0.67],
          [0.47, 0.64],
          [0.55, 0.73],
          [0.31, 0.67],
        ],
        4,
      ),
      stroke([
        [0.42, 0.79],
        [0.42, 0.93],
        [0.34, 0.93],
      ]),
      stroke([
        [0.6, 0.77],
        [0.6, 0.93],
        [0.68, 0.93],
      ]),
      stroke(circle(0.58, 0.37, 0.025), 6, "#191a24"),
    ];
  } else if (/plant|cactus/i.test(prompt)) {
    drawing = [
      stroke([
        [0.39, 0.82],
        [0.36, 0.97],
        [0.65, 0.97],
        [0.69, 0.82],
        [0.39, 0.82],
      ]),
      stroke([
        [0.46, 0.82],
        [0.46, 0.25],
        [0.52, 0.18],
        [0.59, 0.26],
        [0.59, 0.82],
      ]),
      stroke([
        [0.45, 0.56],
        [0.28, 0.56],
        [0.28, 0.35],
        [0.22, 0.35],
        [0.22, 0.63],
        [0.46, 0.63],
      ]),
      stroke([
        [0.6, 0.47],
        [0.74, 0.47],
        [0.74, 0.32],
        [0.8, 0.32],
        [0.8, 0.56],
        [0.6, 0.56],
      ]),
      ...face,
    ];
  } else {
    drawing = [
      stroke(circle(0.5, 0.45, 0.23)),
      stroke([
        [0.33, 0.24],
        [0.29, 0.11],
        [0.45, 0.23],
      ]),
      stroke([
        [0.55, 0.23],
        [0.72, 0.11],
        [0.67, 0.27],
      ]),
      ...face,
      stroke([
        [0.36, 0.67],
        [0.3, 0.87],
        [0.7, 0.87],
        [0.65, 0.67],
      ]),
      stroke(
        [
          [0.3, 0.75],
          [0.18, 0.68],
          [0.12, 0.48],
        ],
        4,
      ),
    ];
  }
  if (seed % 3 === 0)
    drawing.push(
      stroke(
        [
          [0.36, 0.2],
          [0.37, 0.08],
          [0.46, 0.16],
          [0.5, 0.06],
          [0.56, 0.16],
          [0.65, 0.08],
          [0.65, 0.2],
        ],
        3,
        "#ff7448",
      ),
    );
  // Deterministic wobble and tilt give each demo player a distinct hand.
  const tilt = ((seed % 5) - 2) * 0.035;
  return drawing.map((s, i) => ({
    ...s,
    width: s.width + (seed % 2),
    points: s.points.map(([x, y], j) => {
      const wobble = Math.sin(j * 1.7 + seed + i) * (seed % 3) * 0.004;
      return [
        Math.min(0.99, Math.max(0.01, x + tilt * (y - 0.5) + wobble)),
        Math.min(0.99, Math.max(0.01, y + wobble)),
      ] as [number, number];
    }),
  }));
}
