import { AFTER_HOURS_BOARD } from "./after-hours.js";
import { KNOWLEDGE } from "./knowledge.js";
import type { CustomBoard, CustomQuestion } from "../boards.js";
import { TOPICS } from "./topics.js";
export { TOPICS } from "./topics.js";
export const CONTENT: CustomQuestion[] = Object.entries(KNOWLEDGE).flatMap(
  ([topic, rows]) =>
    rows.map((row, index) => {
      const [prompt, ...parts] = row.split("|");
      const [a, b, c, d, key, explanation] = parts;
      const poll = key === "-";
      const shift = (index + topic.length) % 4;
      const answers = [a, b, c, d].map((_, i) => [a, b, c, d][(i + shift) % 4]);
      return {
        id: `${topic}-${index + 1}`,
        type: poll ? "poll" : "multiple-choice",
        prompt,
        answers,
        correctAnswer: poll ? null : (Number(key) - shift + 4) % 4,
        timer: 20,
        scoreMode: poll ? "no-score" : "casual",
        explanation,
        order: 0,
        topic,
        difficulty: index % 3 === 0 ? "medium" : "easy",
      };
    }),
);
const now = "2026-10-14T12:00:00.000Z";
function template(
  id: string,
  title: string,
  description: string,
  topics: string[],
  color: CustomBoard["coverStyle"]["color"],
  count = 10,
): CustomBoard {
  let pool = CONTENT.filter((q) => topics.includes(q.topic ?? ""));
  if (topics.length > 1)
    pool = [...pool].sort((a, b) =>
      a.id.split("-").at(-1)!.localeCompare(b.id.split("-").at(-1)!),
    );
  return {
    id,
    title,
    description,
    category: topics.length === 1 ? TOPICS[topics[0]] : "Mixed signals",
    coverStyle: { color, icon: "asterisk" },
    questions: pool.slice(0, count).map((q, order) => ({ ...q, order })),
    settings: {
      defaultTimer: 20,
      scoreMode: "casual",
      randomizeAnswers: true,
      showCorrectAnswer: true,
      showExplanation: true,
      leaderboardFrequency: "each",
    },
    createdAt: now,
    updatedAt: now,
    version: 1,
  };
}
export const TEMPLATES: CustomBoard[] = [
  AFTER_HOURS_BOARD,
  template(
    "friday-random",
    "Friday Random",
    "Close the tabs. Give the room a ten-question detour.",
    ["general", "food", "music", "animals"],
    "#2548f4",
  ),
  template(
    "weird-but-true",
    "Weird but True",
    "The oddly useful things you didn’t know you knew.",
    ["weird"],
    "#b7aff8",
    8,
  ),
  template(
    "food-fight",
    "Food Fight",
    "Strong snack opinions meet a little culinary knowledge.",
    ["food", "this-or-that"],
    "#ff7448",
  ),
  template(
    "around-the-world",
    "Around the World",
    "A departure lounge for your brain. No passport needed.",
    ["travel", "geography"],
    "#a9d9f6",
  ),
  template(
    "screen-time",
    "Screen Time",
    "Film language, familiar characters, and shared screen energy.",
    ["screen", "pop-culture"],
    "#ffa9d2",
  ),
  template(
    "office-chaos",
    "Office Chaos",
    "The calendar has opinions. So does the room.",
    ["office", "would-you-rather"],
    "#c0ee7b",
  ),
  template(
    "brain-break",
    "Brain Break",
    "Small puzzles. Large quantities of unnecessary confidence.",
    ["brain"],
    "#b7aff8",
    8,
  ),
  template(
    "big-mix",
    "The Big Mix",
    "A broad twenty-question party for every kind of curious.",
    ["general", "science", "animals", "music", "travel"],
    "#2548f4",
    20,
  ),
  template(
    "team-trivia",
    "Team Trivia",
    "A friendly mixed board to personalize for your people.",
    ["general", "everyday", "tech"],
    "#c0ee7b",
  ),
  template(
    "new-hire-mixer",
    "New Hire Mixer",
    "Low-pressure polls and simple questions for a new room.",
    ["office", "this-or-that"],
    "#ffa9d2",
  ),
];
const fictional = template(
  "paper-moon-onboarding",
  "Paper Moon Co. — First Friday",
  "An explicitly fictional company example. Adapt it for your own team.",
  ["office"],
  "#a9d9f6",
  5,
);
fictional.questions = [
  {
    prompt: "At fictional Paper Moon Co., our Friday ritual is called what?",
    answers: [
      "The Five-Minute Ruckus",
      "Spreadsheet Sunrise",
      "The Silent Hour",
      "Mandatory Fun Committee",
    ],
    correctAnswer: 0,
    explanation:
      "Fictional company fact: the Five-Minute Ruckus closes the week.",
  },
  {
    prompt: "Our fictional meeting rule: every invite must include what?",
    answers: [
      "A purpose and an end time",
      "A slide deck",
      "A snack ranking",
      "A theme song",
    ],
    correctAnswer: 0,
    explanation:
      "Fictional policy: a clear purpose and end time respect everyone’s time.",
  },
  {
    prompt: "Which imaginary product does Paper Moon Co. make?",
    answers: [
      "Desk lamps for night owls",
      "Moon rockets",
      "Financial advice",
      "Medical devices",
    ],
    correctAnswer: 0,
    explanation:
      "Fictional product: desk lamps for night owls. No real employer content.",
  },
  {
    prompt: "Your fictional welcome kit gets one extra item. Pick it.",
    answers: [
      "Excellent notebook",
      "Tiny office plant",
      "Snack voucher",
      "Spectacularly impractical mug",
    ],
    correctAnswer: null,
    explanation: "Welcome-kit preferences are a poll, with no correct answer.",
  },
  {
    prompt:
      "The fictional help channel is called “Ask a Human.” True or false?",
    answers: ["True", "False"],
    correctAnswer: 0,
    explanation:
      "Fictional company fact: Ask a Human is the place for friendly help.",
  },
].map((q, order) => ({
  id: `paper-moon-${order + 1}`,
  type: order === 3 ? "poll" : order === 4 ? "true-false" : "multiple-choice",
  timer: 20,
  scoreMode: order === 3 ? "no-score" : "casual",
  order,
  ...q,
}));
// Preserved for future content migration and historical demos; never listed in production.
export const ARCHIVED_TEMPLATES: CustomBoard[] = [fictional];
