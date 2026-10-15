import { z } from "zod/v3";
export const TIMER_OPTIONS = [5, 10, 15, 20, 30, 45, 60] as const;
export const BOARD_COLORS = [
  "#2548f4",
  "#ff7448",
  "#ffa9d2",
  "#c0ee7b",
  "#a9d9f6",
  "#b7aff8",
] as const;
export const SCORE_MODES = ["casual", "quick-draw", "no-score"] as const;
export const cleanText = (value: string) =>
  !/[<>]/.test(value) &&
  ![...value].some((c) => c.charCodeAt(0) < 32 && c !== "\n") &&
  !/\b(fuck|shit|bitch|asshole|porn|nazi)\b/i.test(value);
const text = (max: number) =>
  z
    .string()
    .max(max)
    .refine(
      cleanText,
      "Use work-friendly text without HTML or control characters.",
    );
export const questionSchema = z
  .object({
    id: z.string().min(1).max(80),
    type: z.enum(["multiple-choice", "true-false", "poll"]),
    prompt: text(180),
    answers: z.array(text(80)).min(2).max(6),
    correctAnswer: z.number().int().min(0).max(5).nullable(),
    timer: z.union(
      TIMER_OPTIONS.map((n) => z.literal(n)) as [
        z.ZodLiteral<5>,
        z.ZodLiteral<10>,
        ...z.ZodLiteral<number>[],
      ],
    ),
    scoreMode: z.enum(SCORE_MODES),
    explanation: text(300),
    order: z.number().int().min(0).max(49),
    topic: z.string().max(50).optional(),
    difficulty: z.enum(["easy", "medium", "hard"]).optional(),
  })
  .strict();
export const boardSchema = z
  .object({
    id: z.string().min(1).max(80),
    title: text(60),
    description: text(180),
    category: text(50),
    coverStyle: z
      .object({
        color: z.enum(BOARD_COLORS),
        icon: z.enum(["bolt", "eye", "bubble", "asterisk", "pencil", "trophy"]),
      })
      .strict(),
    questions: z.array(questionSchema).min(1).max(50),
    settings: z
      .object({
        defaultTimer: z
          .number()
          .refine((n) =>
            TIMER_OPTIONS.includes(n as (typeof TIMER_OPTIONS)[number]),
          ),
        scoreMode: z.enum(SCORE_MODES),
        randomizeAnswers: z.boolean(),
        showCorrectAnswer: z.boolean(),
        showExplanation: z.boolean(),
        leaderboardFrequency: z.enum(["each", "every-5", "final"]),
      })
      .strict(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    version: z.literal(1),
  })
  .strict();
export type CustomQuestion = z.infer<typeof questionSchema>;
export type CustomBoard = z.infer<typeof boardSchema>;
export interface BoardIssue {
  path: string;
  message: string;
}
export function questionIssues(q: CustomQuestion): BoardIssue[] {
  const parsed = questionSchema.safeParse(q);
  if (!parsed.success)
    return parsed.error.issues.map((i) => ({
      path: i.path.join("."),
      message: i.message,
    }));
  const issues: BoardIssue[] = [];
  if (!q.prompt.trim())
    issues.push({ path: "prompt", message: "Give this question a prompt." });
  q.answers.forEach((a, i) => {
    if (!a.trim())
      issues.push({
        path: `answers.${i}`,
        message: `Answer ${String.fromCharCode(65 + i)} needs some text.`,
      });
  });
  if (
    new Set(q.answers.map((a) => a.trim().toLowerCase())).size !==
    q.answers.length
  )
    issues.push({
      path: "answers",
      message: "Each answer needs to be different.",
    });
  if (
    q.type !== "poll" &&
    (q.correctAnswer === null || q.correctAnswer >= q.answers.length)
  )
    issues.push({
      path: "correctAnswer",
      message: "Choose exactly one correct answer.",
    });
  if (
    q.type === "poll" &&
    (q.correctAnswer !== null || q.scoreMode !== "no-score")
  )
    issues.push({
      path: "correctAnswer",
      message: "Polls have no correct answer or score.",
    });
  if (
    q.type === "true-false" &&
    (q.answers.length !== 2 ||
      q.answers[0] !== "True" ||
      q.answers[1] !== "False")
  )
    issues.push({
      path: "answers",
      message: "True / False questions use exactly True and False.",
    });
  return issues;
}
export function boardIssues(value: unknown): BoardIssue[] {
  const parsed = boardSchema.safeParse(value);
  if (!parsed.success)
    return parsed.error.issues.map((i) => ({
      path: i.path.join("."),
      message: i.message,
    }));
  const board = parsed.data;
  const issues: BoardIssue[] = [];
  if (!board.title.trim())
    issues.push({ path: "title", message: "Give your board a title." });
  const ids = new Set<string>();
  board.questions.forEach((q, i) => {
    if (ids.has(q.id))
      issues.push({
        path: `questions.${i}.id`,
        message: "Question IDs must be unique.",
      });
    ids.add(q.id);
    if (q.order !== i)
      issues.push({
        path: `questions.${i}.order`,
        message: "Questions must be in a consecutive order.",
      });
    questionIssues(q).forEach((issue) =>
      issues.push({
        path: `questions.${i}.${issue.path}`,
        message: issue.message,
      }),
    );
  });
  return issues;
}
export function validateBoard(value: unknown): CustomBoard {
  const issues = boardIssues(value);
  if (issues.length) throw new Error(issues[0].message);
  return boardSchema.parse(value);
}
export function newQuestion(
  order = 0,
  settings?: CustomBoard["settings"],
): CustomQuestion {
  return {
    id: crypto.randomUUID(),
    type: "multiple-choice",
    prompt: "",
    answers: ["", "", "", ""],
    correctAnswer: null,
    timer: (settings?.defaultTimer ?? 20) as CustomQuestion["timer"],
    scoreMode: settings?.scoreMode ?? "casual",
    explanation: "",
    order,
  };
}
export function newBoard(): CustomBoard {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title: "",
    description: "",
    category: "Your mix",
    coverStyle: { color: "#2548f4", icon: "bolt" },
    questions: [newQuestion()],
    settings: {
      defaultTimer: 20,
      scoreMode: "casual",
      randomizeAnswers: false,
      showCorrectAnswer: true,
      showExplanation: true,
      leaderboardFrequency: "each",
    },
    createdAt: now,
    updatedAt: now,
    version: 1,
  };
}
export function estimatedMinutes(board: CustomBoard) {
  return Math.max(
    1,
    Math.ceil(board.questions.reduce((sum, q) => sum + q.timer + 9, 5) / 60),
  );
}
