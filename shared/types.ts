import type { CustomBoard } from "./boards.js";
export const GAME_IDS = [
  "hotwire",
  "room-temperature",
  "sellout",
  "caption-this",
  "odd-one-in",
  "scribble-shift",
] as const;
export type GameId = (typeof GAME_IDS)[number];
export type Phase =
  | "lobby"
  | "intro"
  | "active"
  | "voting"
  | "results"
  | "intermission"
  | "final"
  | "ended";
export interface GameInfo {
  id: GameId;
  name: string;
  short: string;
  description: string;
  rule: string;
  color: string;
  icon: string;
  category: "trivia" | "voting" | "creative";
  energy: string;
  minutes: number;
}
export interface Settings {
  playlist: GameId[];
  rounds: number;
  pace: "quick" | "normal" | "relaxed";
  pack: string;
  lateJoins: boolean;
  reactions: boolean;
  autoAdvance: boolean;
}
export interface Player {
  id: string;
  name: string;
  avatar: number;
  score: number;
  streak: number;
  connected: boolean;
  bot: boolean;
  submitted: boolean;
  voted: boolean;
  delta: number;
  movement: number;
  votes: number;
  responseMs: number[];
  majorityWins: number;
  drawingPoints: number;
}
export interface Stroke {
  color: string;
  width: number;
  points: [number, number][];
}
export interface Submission {
  id: string;
  text?: string;
  drawing?: Stroke[];
  votes: number;
  author?: string;
}
export interface BoardSessionSummary {
  questions: {
    number: number;
    prompt: string;
    respondents: number;
    correct: number;
    timedOut: number;
    scored: boolean;
  }[];
  correctness: number | null;
  hardestQuestion: number | null;
  fastest: { name: string; ms: number } | null;
}
export interface Prompt {
  title: string;
  options?: string[];
  scene?: number;
  explanation?: string;
  questionType?: "multiple-choice" | "true-false" | "poll";
  scoreMode?: "casual" | "quick-draw" | "no-score";
}
export interface RoomView {
  history?: {
    status: "saving" | "saved" | "failed";
    sessionId: string;
    workspaceId: string;
  };
  audio?: import("./audio.js").AudioState;
  event?: import("./events.js").EventLiveView;
  board?: {
    title: string;
    description: string;
    color: string;
    questionCount: number;
    scoring: boolean;
    leaderboardFrequency: string;
  };
  summary?: BoardSessionSummary;
  showLeaderboard?: boolean;
  code: string;
  phase: Phase;
  settings: Settings;
  locked: boolean;
  players: Player[];
  hostConnected: boolean;
  gameIndex: number;
  round: number;
  prompt: Prompt | null;
  deadline: number | null;
  duration: number;
  paused: boolean;
  submissions: Submission[];
  counts: number[];
  correct: number[];
  joinUrl: string;
  serverTime: number;
  createdAt: number;
  stats: { answers: number; reactions: number; rounds: number };
  you?: string;
  ownSubmission?: boolean;
  ownEntryId?: string;
  ownVote?: boolean;
  eligible: boolean;
  roundKey: string;
}
export type Input =
  | { choice: number }
  | { text: string }
  | { drawing: Stroke[] }
  | { vote: string };
export type HostAction =
  | "start"
  | "next"
  | "skip"
  | "pause"
  | "lock"
  | "end"
  | "rematch"
  | "bots"
  | "remove";
export interface Identity {
  code: string;
  token: string;
  role: "host" | "player";
}
export interface Reply {
  ok: boolean;
  error?: string;
  identity?: Identity;
  state?: RoomView;
}
export interface ClientEvents {
  "event:action": (
    data: { action: import("./events.js").EventCommand; sequence: number },
    ack: (reply: Reply) => void,
  ) => void;
  "room:create": (
    data: {
      settings: Settings;
      demo?: boolean;
      contentReference?: {
        workspaceId: string;
        selections: Partial<Record<GameId, string>>;
      };
      board?: CustomBoard;
      boardReference?: { workspaceId: string; boardId: string };
    },
    ack: (reply: Reply) => void,
  ) => void;
  "room:join": (
    data: { code: string; name: string; avatar: number },
    ack: (reply: Reply) => void,
  ) => void;
  "room:resume": (data: Identity, ack: (reply: Reply) => void) => void;
  "host:action": (
    data: {
      action: HostAction;
      count?: number;
      playerId?: string;
      expectedKey?: string;
    },
    ack: (reply: Reply) => void,
  ) => void;
  "player:input": (
    data: { input: Input; roundKey: string },
    ack: (reply: Reply) => void,
  ) => void;
  "player:reaction": (
    data: { emoji: string },
    ack: (reply: Reply) => void,
  ) => void;
}
export interface ServerEvents {
  "room:state": (state: RoomView) => void;
  "room:removed": (message: string) => void;
  "room:reaction": (data: { id: string; emoji: string; name: string }) => void;
}
