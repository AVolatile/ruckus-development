import { test } from "node:test";
import assert from "node:assert/strict";
import {
  newBoard,
  validateBoard,
  boardIssues,
  questionSchema,
} from "../shared/boards.js";
import {
  ARCHIVED_TEMPLATES,
  CONTENT,
  TEMPLATES,
  TOPICS,
} from "../shared/content/library.js";
import {
  importJson,
  importCsv,
  parseCsv,
  CSV_TEMPLATE,
} from "../src/studio/transfer.js";
import { boards } from "../src/studio/localRepository.js";
import { Room } from "../server/engine.js";
import { DEFAULT_SETTINGS } from "../shared/catalog.js";
import {
  allowedOrigins,
  getPublicJoinUrl,
  publicAppOrigin,
} from "../server/config.js";
function board() {
  const b = newBoard();
  b.title = "A real test board";
  b.questions = [
    {
      ...b.questions[0],
      prompt: "Choose six",
      answers: ["One", "Two", "Three", "Four", "Five", "Six"],
      correctAnswer: 5,
      timer: 5,
      explanation: "Six is the final choice.",
    },
  ];
  return b;
}
test("all library questions and default starters have safe, valid, unique content", () => {
  assert.equal(CONTENT.length, 168);
  assert.equal(Object.keys(TOPICS).length, 21);
  assert.equal(TEMPLATES.length, 11);
  assert.equal(
    TEMPLATES.some((board) => board.id === "paper-moon-onboarding"),
    false,
  );
  ARCHIVED_TEMPLATES.forEach(validateBoard);
  assert.equal(new Set(CONTENT.map((q) => q.id)).size, CONTENT.length);
  assert.equal(new Set(CONTENT.map((q) => q.prompt)).size, CONTENT.length);
  CONTENT.forEach((q) => {
    assert.ok(questionSchema.safeParse(q).success);
    assert.equal(boardIssues({ ...board(), questions: [q] }).length, 0);
  });
  TEMPLATES.forEach(validateBoard);
});
test("JSON and CSV round trips reject incomplete, oversized, unsafe and ambiguous imports", () => {
  const b = board(),
    copy = importJson(JSON.stringify(b));
  assert.notEqual(copy.id, b.id);
  assert.notEqual(copy.questions[0].id, b.questions[0].id);
  assert.equal(copy.questions[0].correctAnswer, 5);
  assert.equal(importCsv(CSV_TEMPLATE).questions.length, 2);
  assert.deepEqual(parseCsv('a,b\n"a,b","a ""quote""\nand newline"'), [
    ["a", "b"],
    ["a,b", 'a "quote"\nand newline'],
  ]);
  assert.throws(() => importJson("{"), /valid JSON/);
  assert.throws(() => importJson(" ".repeat(300001)), /300/);
  assert.throws(
    () => importJson(JSON.stringify({ ...b, title: "<script>" })),
    /HTML/,
  );
  assert.throws(
    () =>
      importCsv(
        "question,answer_a,answer_b,answer_c,correct_answer\nGap,A,,C,C",
      ),
    /consecutively/,
  );
  assert.throws(
    () => importCsv("question,answer_a,answer_b,answer_b\nQ,A,B,C"),
    /unique/,
  );
  assert.throws(() => validateBoard(newBoard()), /title/);
  assert.throws(
    () =>
      validateBoard({
        ...b,
        questions: [{ ...b.questions[0], correctAnswer: null }],
      }),
    /correct/,
  );
  assert.throws(
    () =>
      validateBoard({
        ...b,
        questions: [{ ...b.questions[0], answers: ["Same", "same"] }],
      }),
    /different/,
  );
});
test("repository persists drafts, duplicates with new IDs, deletes, and preserves corrupt storage", () => {
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, v),
    },
  });
  const b = board();
  boards.save(b);
  assert.equal(boards.get(b.id)?.title, b.title);
  const copy = boards.duplicate(b.id);
  assert.notEqual(copy.questions[0].id, b.questions[0].id);
  assert.equal(boards.list().length, 2);
  boards.delete(copy.id);
  assert.equal(boards.list().length, 1);
  storage.set("ruckus-studio-v1", "invalid");
  assert.throws(() => boards.list(), /couldn’t be read/);
  assert.equal(storage.get("ruckus-studio-v1"), "invalid");
});
test("custom six-choice questions keep keys private, score server-side, time out, summarize and rematch", () => {
  const b = board();
  b.questions.push({
    ...b.questions[0],
    id: "second",
    order: 1,
    type: "poll",
    prompt: "An opinion",
    correctAnswer: null,
    scoreMode: "no-score",
  });
  const r = new Room(
    "ABCDE",
    {
      ...DEFAULT_SETTINGS,
      playlist: ["hotwire"],
      rounds: 1,
      autoAdvance: false,
    },
    "https://ruckus.example/join",
    () => {},
    validateBoard(b),
  );
  const a = r.join("Right", 0, "a"),
    c = r.join("Wrong", 1, "b"),
    d = r.join("Silent", 2, "c");
  r.action("start");
  r.advance();
  assert.equal(r.duration, 5000);
  const payload = JSON.stringify(r.view(a.id));
  assert.ok(!payload.includes("correctAnswer"));
  assert.ok(!payload.includes("Six is the final"));
  assert.deepEqual(r.view(a.id).correct, []);
  assert.equal(r.view().prompt?.options?.length, 6);
  assert.throws(() => r.submit(a.id, { choice: 6 }), /choice|answer/i);
  r.submit(a.id, { choice: 5 });
  r.submit(c.id, { choice: 0 });
  r.advance();
  assert.equal(r.phase, "results");
  assert.equal(r.players.get(a.id)?.public.score, 500);
  assert.equal(r.players.get(c.id)?.public.score, 0);
  assert.equal(r.view().prompt?.explanation, b.questions[0].explanation);
  assert.deepEqual(r.view().correct, [5]);
  r.advance();
  assert.equal(r.phase, "active");
  r.submit(a.id, { choice: 1 });
  r.submit(c.id, { choice: 2 });
  r.submit(d.id, { choice: 0 });
  assert.equal(r.phase, "results");
  assert.deepEqual(r.correct, []);
  r.advance();
  assert.equal(r.phase, "final");
  assert.equal(r.view().summary?.correctness, 33);
  assert.equal(r.view().summary?.questions[0].timedOut, 1);
  assert.ok(r.view().summary?.fastest);
  r.action("rematch");
  assert.equal(r.phase, "lobby");
  assert.equal(r.players.get(a.id)?.public.score, 0);
  r.dispose();
});
test("randomization retains correct text, reveal preferences, leaderboard policy and bot support", () => {
  const b = board();
  b.settings = {
    ...b.settings,
    randomizeAnswers: true,
    showCorrectAnswer: false,
    showExplanation: false,
    leaderboardFrequency: "final",
  };
  const r = new Room(
    "ABCDE",
    { ...DEFAULT_SETTINGS, playlist: ["hotwire"], autoAdvance: false },
    "https://ruckus.example/join",
    () => {},
    b,
  );
  r.addBots(8);
  r.action("start");
  r.advance();
  assert.equal(r.prompt?.options?.[r.prompt.answer!], "Six");
  assert.equal(r.view().showLeaderboard, false);
  r.advance();
  assert.deepEqual(r.view().correct, []);
  assert.equal(r.view().prompt?.explanation, undefined);
  r.advance();
  assert.equal(r.view().showLeaderboard, true);
  r.dispose();
});
test("public URLs and explicit CORS reject private or insecure production frontend origins", () => {
  const env = {
    NODE_ENV: "production",
    REALTIME_ONLY: "true",
    PUBLIC_APP_URL: "https://ruckus.netlify.app",
    CLIENT_ORIGIN: "https://ruckus.netlify.app",
    ALLOWED_ORIGINS: "https://preview.netlify.app,https://ruckus.netlify.app",
  };
  assert.equal(
    getPublicJoinUrl("ABCDE", { host: "backend.onrender.com" }, 4310, env),
    "https://ruckus.netlify.app/join?room=ABCDE",
  );
  assert.equal(allowedOrigins(env).length, 2);
  for (const value of [
    "http://ruckus.netlify.app",
    "https://localhost",
    "https://172.16.1.1",
    "https://10.0.0.1",
  ])
    assert.throws(
      () => publicAppOrigin({ ...env, PUBLIC_APP_URL: value }),
      /public HTTPS/,
    );
  assert.throws(
    () => publicAppOrigin({ ...env, PUBLIC_APP_URL: undefined }),
    /required/,
  );
});

test("an active room takes an isolated custom board snapshot", () => {
  const b = board();
  const r = new Room(
    "ABCDE",
    { ...DEFAULT_SETTINGS, playlist: ["hotwire"], autoAdvance: false },
    "https://ruckus.example/join",
    () => {},
    b,
  );
  b.questions[0].correctAnswer = 0;
  b.questions[0].answers[5] = "Tampered";
  r.addBots(4);
  r.action("start");
  r.advance();
  assert.equal(r.prompt?.answer, 5);
  assert.equal(r.prompt?.options?.[5], "Six");
  r.dispose();
});

test("After Hours is a complete default board with preserved keys and a playable 29-question lifecycle", () => {
  const starter = TEMPLATES.find((b) => b.id === "after-hours-hot-takes");
  assert.ok(starter);
  const custom = validateBoard(starter);
  assert.equal(custom.questions.length, 29);
  assert.equal(custom.questions[0].correctAnswer, 2);
  assert.equal(custom.questions[1].correctAnswer, 1);
  assert.equal(custom.questions[28].correctAnswer, 2);
  assert.equal(custom.questions[28].difficulty, "hard");
  assert.ok(custom.description.includes("tongue-in-cheek"));
  assert.ok(!CONTENT.some((q) => q.id.startsWith("after-hours-")));
  const room = new Room(
    "ABCDE",
    { ...DEFAULT_SETTINGS, playlist: ["hotwire"], autoAdvance: false },
    "https://ruckus.example/join",
    () => {},
    custom,
  );
  try {
    const right = room.join("Punchline expert", 5, "right");
    const wrong = room.join("Friendly argument", 1, "wrong");
    room.action("start");
    room.advance();
    for (const q of custom.questions) {
      assert.equal(room.phase, "active");
      assert.equal(room.prompt?.title, q.prompt);
      const key = room.prompt!.answer!;
      assert.equal(room.prompt!.options![key], q.answers[q.correctAnswer!]);
      assert.equal(room.view(right.id).prompt?.explanation, undefined);
      assert.ok(!JSON.stringify(room.view(right.id)).includes("correctAnswer"));
      room.submit(right.id, { choice: key });
      room.submit(wrong.id, { choice: (key + 1) % q.answers.length });
      assert.equal(room.phase, "results");
      assert.equal(room.view().prompt?.explanation, q.explanation);
      room.advance();
    }
    assert.equal(room.phase, "final");
    assert.equal(room.players.get(right.id)?.public.score, 14500);
    assert.equal(room.players.get(wrong.id)?.public.score, 0);
    assert.equal(room.view().summary?.questions.length, 29);
  } finally {
    room.dispose();
  }
});
