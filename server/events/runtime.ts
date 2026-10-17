import { randomUUID } from "node:crypto";
import { log } from "../ops/log.js";
import { Room } from "../engine.js";
import { buildSessionSummary, type RoomOutcomes } from "../history/outcomes.js";
import type {
  AudioStage,
  AudioState,
  AudioProfileId,
} from "../../shared/audio.js";
import type { HostAction, Input, RoomView } from "../../shared/types.js";
import {
  placementPoints,
  type LaunchSnapshot,
  type EventState,
  type EventCue,
  type EventCommand,
} from "../../shared/events.js";
export class EventRuntime {
  private room: Room;
  readonly hostToken: string;
  readonly createdAt = Date.now();
  changedAt = Date.now();
  state: EventState = "LOBBY";
  sequence = 0;
  segmentIndex = 0;
  private skipped = new Set<number>();
  private participants = new Set<string>();
  private scores = new Map<
    string,
    { playerId: string; points: number; segments: number }
  >();
  private cue: {
    name: EventCue;
    names: EventCue[];
    at: number;
    sequence: number;
  } = {
    name: "LOBBY_ENTER",
    names: ["LOBBY_ENTER"],
    at: Date.now(),
    sequence: 0,
  };
  private previousPhase = "lobby";
  private stopped = false;
  private problem?: { message: string; requestId: string };
  private endRecorded = false;
  private historyStartedAt = 0;
  private historyJoined = 0;
  private historyDemos = 0;
  private historyGames: { index: number; outcome: RoomOutcomes }[] = [];
  private frozenHistory: ReturnType<typeof buildSessionSummary> | undefined;
  historySummary() {
    if (this.frozenHistory !== undefined)
      return structuredClone(this.frozenHistory);
    const b = this.snapshot.brand;
    const summary = buildSessionSummary(
      this.room,
      {
        workspaceId: this.snapshot.workspaceId,
        hostUserId: this.snapshot.launchedBy,
        title: this.snapshot.definition.title,
        type: "event",
        source: {
          eventId: this.snapshot.eventId,
          eventRevisionId: this.snapshot.eventRevisionId,
        },
        brand: b
          ? {
              kitId: b.brandKitId,
              revisionId: b.revisionId,
              name: b.name,
              displayName: b.config.organizationDisplayName,
              primary: b.config.primaryColor,
              surface: b.config.surfaceColor,
              accent: b.config.accentColor,
            }
          : null,
      },
      {
        id: this.snapshot.id,
        startedAt: this.historyStartedAt,
        joined: this.historyJoined,
        demos: this.historyDemos,
        outcomes: [
          ...this.historyGames,
          { index: this.segmentIndex, outcome: this.room.outcomes },
        ],
        segments: this.snapshot.segments,
        scores:
          this.snapshot.definition.eventSettings.carryScoresAcrossGames &&
          [...this.historyGames.map((g) => g.outcome), this.room.outcomes].some(
            (o) => o.games.some((g) => g.scored && g.rounds > 0),
          )
            ? this.view().event!.scores
            : null,
        completed: this.state === "EVENT_FINAL",
      },
    );
    if (["EVENT_FINAL", "ENDED"].includes(this.state))
      this.frozenHistory = summary;
    return structuredClone(summary);
  }
  constructor(
    readonly code: string,
    readonly snapshot: LaunchSnapshot,
    readonly joinUrl: string,
    private onChange: () => void,
    private onEnd: (reason: string) => void = () => {},
  ) {
    this.snapshot = freeze(structuredClone(snapshot));
    this.room = this.makeRoom(0);
    this.hostToken = this.room.hostToken;
  }
  private makeRoom(index: number) {
    const s = this.snapshot.segments[index];
    return new Room(
      this.code,
      s.settings,
      this.joinUrl,
      () => this.observe(),
      s.board,
      s.prompts,
    );
  }
  get phase() {
    return this.state === "ENDED"
      ? "ended"
      : this.state === "LOBBY"
        ? "lobby"
        : this.state === "GAME_ACTIVE"
          ? this.room.phase
          : this.state === "EVENT_FINAL"
            ? "final"
            : this.state === "GAME_RESULTS"
              ? "final"
              : "intermission";
  }
  get players() {
    return this.room.players;
  }
  get hostSocket() {
    return this.room.hostSocket;
  }
  get lastHostSeen() {
    return this.room.lastHostSeen;
  }
  get settings() {
    return this.room.settings;
  }
  private publish() {
    this.changedAt = Date.now();
    this.onChange();
  }
  private emitCue(name: EventCue) {
    this.cue = {
      name,
      names: [name],
      at: Date.now(),
      sequence: this.cue.sequence + 1,
    };
  }
  private transition(state: EventState, cue: EventCue) {
    this.problem = undefined;
    this.state = state;
    this.sequence++;
    this.emitCue(cue);
    if (
      state === "EVENT_INTRO" ||
      (state === "SEGMENT_INTRO" && this.sequence === 1)
    )
      this.cue.names.unshift("EVENT_START");
    if (
      (state === "GAME_RESULTS" ||
        state === "INTERMISSION" ||
        (state === "EVENT_FINAL" &&
          this.snapshot.definition.eventSettings.showFinalEventLeaderboard)) &&
      this.snapshot.definition.eventSettings.carryScoresAcrossGames
    )
      this.cue.names.push("EVENT_LEADERBOARD_ENTER");
    if (state === "EVENT_FINAL" && !this.endRecorded) {
      this.endRecorded = true;
      this.onEnd("completed");
    }
    this.publish();
  }
  private observe() {
    if (this.stopped) return;
    if (this.state === "GAME_ACTIVE") {
      for (const id of this.room.eligible) this.participants.add(id);
      const phase = this.room.phase;
      if (phase !== this.previousPhase) {
        this.sequence++;
        if (phase === "active") this.emitCue("QUESTION_OPEN");
        else if (phase === "voting") this.emitCue("ANSWER_LOCKED");
        else if (phase === "results") {
          this.emitCue("REVEAL_ENTER");
          if (this.previousPhase !== "voting")
            this.cue.names.unshift("ANSWER_LOCKED");
        }
        this.previousPhase = phase;
      }
      if (phase === "final") {
        this.room.dispose();
        this.aggregate();
        this.transition("GAME_RESULTS", "GAME_RESULTS_ENTER");
        return;
      }
    }
    this.publish();
  }
  private aggregate() {
    if (!this.snapshot.definition.eventSettings.carryScoresAcrossGames) return;
    const board = this.snapshot.segments[this.segmentIndex].board;
    if (
      board &&
      board.questions.every(
        (q) => q.type === "poll" || q.scoreMode === "no-score",
      )
    )
      return;
    const rows = [...this.players.values()]
      .filter((p) => this.participants.has(p.public.id))
      .map((p) => ({ id: p.public.id, score: p.public.score }));
    for (const award of placementPoints(rows)) {
      const old = this.scores.get(award.playerId) ?? {
        ...award,
        points: 0,
        segments: 0,
      };
      this.scores.set(award.playerId, {
        playerId: award.playerId,
        points: old.points + award.points,
        segments: old.segments + 1,
      });
    }
  }
  private nextIndex() {
    let index = this.segmentIndex + 1;
    while (this.skipped.has(index)) index++;
    return index;
  }
  command(action: EventCommand, sequence: number) {
    if (sequence !== this.sequence)
      throw new Error("The event moved on. Use the current controls.");
    if (action === "end") {
      this.end("host-ended");
      return;
    }
    if (action === "skip-next") {
      if (
        !["GAME_RESULTS", "INTERMISSION", "SEGMENT_INTRO"].includes(this.state)
      )
        throw new Error("Skip upcoming games between segments.");
      const index = this.nextIndex();
      if (index >= this.snapshot.segments.length)
        throw new Error("There are no upcoming games to skip.");
      this.skipped.add(index);
      this.sequence++;
      this.publish();
      return;
    }
    if (action === "start") {
      if (this.state !== "LOBBY")
        throw new Error("This event has already started.");
      if (this.players.size < 2)
        throw new Error(
          "Two players make a party. Add guests or demo players.",
        );
      this.historyStartedAt = Date.now();
      if (this.snapshot.definition.eventSettings.showEventIntro)
        this.transition("EVENT_INTRO", "EVENT_INTRO_ENTER");
      else this.transition("SEGMENT_INTRO", "SEGMENT_INTRO_ENTER");
      return;
    }
    switch (this.state) {
      case "EVENT_INTRO":
        this.transition("SEGMENT_INTRO", "SEGMENT_INTRO_ENTER");
        break;
      case "SEGMENT_INTRO":
        this.state = "GAME_ACTIVE";
        this.sequence++;
        this.previousPhase = "lobby";
        this.room.action("start");
        break;
      case "GAME_RESULTS":
        if (this.nextIndex() >= this.snapshot.segments.length)
          this.transition("EVENT_FINAL", "FINAL_RESULTS_ENTER");
        else if (
          this.snapshot.definition.eventSettings.showIntermissionBetweenGames
        )
          this.transition("INTERMISSION", "INTERMISSION_ENTER");
        else this.openNext();
        break;
      case "INTERMISSION":
        this.openNext();
        break;
      default:
        throw new Error("Use the current game controls or wait for results.");
    }
  }
  private openNext() {
    const index = this.nextIndex();
    if (index >= this.snapshot.segments.length) {
      this.transition("EVENT_FINAL", "FINAL_RESULTS_ENTER");
      return;
    }
    const previous = this.room,
      players = previous.players;
    let next: Room;
    try {
      next = this.makeRoom(index);
    } catch {
      const requestId = randomUUID();
      this.problem = {
        message:
          "Couldn’t prepare the upcoming game. Retry Continue, skip that upcoming game, or end the event.",
        requestId,
      };
      this.sequence++;
      log("event.segment_initialization_failed", { requestId }, "error");
      this.publish();
      throw new Error(
        `Couldn’t prepare the next game. Reference ${requestId}.`,
      );
    }
    previous.dispose();
    this.historyGames.push({
      index: this.segmentIndex,
      outcome: previous.outcomes,
    });
    this.segmentIndex = index;
    this.room = next;
    this.room.players = players;
    this.room.hostSocket = previous.hostSocket;
    this.room.lastHostSeen = previous.lastHostSeen;
    this.room.locked = previous.locked;
    for (const p of players.values())
      Object.assign(p.public, {
        score: 0,
        streak: 0,
        submitted: false,
        voted: false,
        delta: 0,
        movement: 0,
        votes: 0,
        responseMs: [],
        majorityWins: 0,
        drawingPoints: 0,
      });
    this.participants.clear();
    this.previousPhase = "lobby";
    this.transition("SEGMENT_INTRO", "SEGMENT_INTRO_ENTER");
  }
  private end(reason: string) {
    if (this.state === "ENDED") return;
    this.room.outcomes.observe(this.room);
    this.room.dispose();
    this.transition("ENDED", "EVENT_END");
    if (!this.endRecorded) {
      this.endRecorded = true;
      this.onEnd(reason);
    }
  }
  action(action: HostAction) {
    if (action === "end") {
      this.end("host-unavailable");
      return;
    }
    if (action === "lock") {
      this.room.action("lock");
      return;
    }
    if (
      this.state !== "GAME_ACTIVE" ||
      !["next", "skip", "pause"].includes(action)
    )
      throw new Error("Use the event progression controls.");
    this.room.action(action);
  }
  join(name: string, avatar: number, socket: string) {
    if (["ENDED", "EVENT_FINAL"].includes(this.state))
      throw new Error(
        "This event has finished. Thanks for bringing the Ruckus.",
      );
    if (
      this.state !== "LOBBY" &&
      !this.snapshot.definition.eventSettings.allowLateJoin
    )
      throw new Error(
        "This event is underway. Join the next event with your host.",
      );
    const joined = this.room.join(name, avatar, socket);
    this.historyJoined++;
    return joined;
  }
  addBots(n: number) {
    if (this.state !== "LOBBY")
      throw new Error("Add demo players in the event lobby.");
    const before = this.players.size;
    this.room.addBots(n);
    this.historyJoined += this.players.size - before;
    this.historyDemos += this.players.size - before;
  }
  playerByToken(token: string) {
    return this.room.playerByToken(token);
  }
  resumePlayer(token: string, socket: string) {
    return this.room.resumePlayer(token, socket);
  }
  connectHost(socket: string) {
    this.room.connectHost(socket);
  }
  disconnect(socket: string) {
    this.room.disconnect(socket);
  }
  remove(id: string) {
    return this.room.remove(id);
  }
  reaction() {
    this.room.reaction();
  }
  submit(id: string, input: Input) {
    if (this.state !== "GAME_ACTIVE")
      throw new Error("Stay here. The host will start the next game.");
    this.room.submit(id, input);
  }
  dispose() {
    this.stopped = true;
    this.room.dispose();
  }
  view(playerId?: string): RoomView {
    const view = this.room.view(playerId),
      d = this.snapshot.definition,
      b = this.snapshot.brand;
    const active =
      this.state === "GAME_ACTIVE" || this.state === "GAME_RESULTS";
    const stage: AudioStage =
      this.state === "GAME_ACTIVE"
        ? view.audio!.stage
        : (
            {
              LOBBY: "lobby",
              EVENT_INTRO: "intro",
              SEGMENT_INTRO: "intro",
              GAME_RESULTS: this.snapshot.definition.eventSettings
                .carryScoresAcrossGames
                ? "leaderboard"
                : "results",
              INTERMISSION: "intermission",
              EVENT_FINAL: "finale",
              ENDED: "ended",
            } as const
          )[this.state];
    const upcoming = this.snapshot.segments[this.nextIndex()];
    const audio: AudioState = {
      ...view.audio!,
      roomId: this.snapshot.id,
      sequence: this.cue.sequence,
      names: this.cue.names,
      occurredAt: this.cue.at,
      phase: this.state === "GAME_ACTIVE" ? view.phase : this.state,
      phaseStartedAt:
        this.state === "GAME_ACTIVE" ? view.audio!.phaseStartedAt : this.cue.at,
      elapsedMs:
        this.state === "GAME_ACTIVE"
          ? view.audio!.elapsedMs
          : Date.now() - this.cue.at,
      remainingMs:
        this.state === "GAME_ACTIVE" ? view.audio!.remainingMs : null,
      paused: this.state === "GAME_ACTIVE" && view.paused,
      stage,
      nextProfile: upcoming
        ? ((upcoming.board
            ? upcoming.board.questions.every(
                (q) => q.type === "poll" || q.scoreMode === "no-score",
              )
              ? "studio-poll"
              : "studio"
            : upcoming.settings.playlist[0]) as AudioProfileId)
        : undefined,
    };
    return {
      ...view,
      audio,
      phase: this.phase,
      roundKey: `${this.segmentIndex}:${this.sequence}:${view.roundKey}`,
      deadline: this.state === "GAME_ACTIVE" ? view.deadline : null,
      eligible: this.state === "GAME_ACTIVE" && view.eligible,
      prompt: active ? view.prompt : null,
      submissions: active ? view.submissions : [],
      correct: active ? view.correct : [],
      counts: active ? view.counts : [],
      event: {
        title: d.title,
        subtitle: d.subtitle,
        ...(!playerId
          ? {
              workspaceId: this.snapshot.workspaceId,
              eventId: this.snapshot.eventId,
              problem: this.problem,
              hostNote: d.playlist.find(
                (p) =>
                  p.itemId === this.snapshot.segments[this.segmentIndex].itemId,
              )?.hostNote,
            }
          : {}),
        state: this.state,
        sequence: this.sequence,
        segmentIndex: this.segmentIndex,
        playlist: this.snapshot.segments.map((s, i) => ({
          itemId: s.itemId,
          title: s.title,
          transitionLabel: s.transitionLabel,
          skipped: this.skipped.has(i),
        })),
        scores: [...this.players.values()]
          .map(
            (p) =>
              this.scores.get(p.public.id) ?? {
                playerId: p.public.id,
                points: 0,
                segments: 0,
              },
          )
          .sort(
            (a, b) =>
              b.points - a.points || a.playerId.localeCompare(b.playerId),
          ),
        settings: d.eventSettings,
        presentation: d.presentationSettings,
        brand: b
          ? {
              displayName: b.config.organizationDisplayName,
              primary: b.config.primaryColor,
              surface: b.config.surfaceColor,
              accent: b.config.accentColor,
              footer: b.config.footerText,
              logo: this.snapshot.assets.logo,
              background: this.snapshot.assets.background,
            }
          : null,
        cue: this.cue,
      },
    };
  }
}

function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
