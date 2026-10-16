import {
  TRIVIA,
  BLUFFS,
  MAJORITY,
  PITCHES,
  DOODLES,
  SCENE_TITLES,
  getPrompt,
} from "../content.js";
import { CONTENT } from "../../shared/content/library.js";
import { GAME_IDS, type GameId } from "../../shared/types.js";
import {
  defaultPackId,
  emptyPack,
  validatePack,
  selectPackPrompts,
  type PackContent,
  type PackPrompt,
} from "../../shared/content-packs.js";
import { packHash } from "./hash.js";
const names: Record<GameId, string> = {
  hotwire: "General Knowledge",
  "room-temperature": "Read the Room",
  sellout: "Big Ideas, Small Products",
  "caption-this": "Office Oddities",
  "odd-one-in": "Curious Facts",
  "scribble-shift": "Drawing Outside the Lines",
};
const banks: Record<GameId, PackPrompt[]> = {
  hotwire: [
    ...TRIVIA,
    ...CONTENT.filter((q) => q.type === "multiple-choice").map((q) => ({
      title: q.prompt,
      options: q.answers,
      answer: q.correctAnswer ?? 0,
      explanation: q.explanation,
      pack: q.topic,
    })),
  ],
  "odd-one-in": BLUFFS,
  "room-temperature": [
    ...MAJORITY,
    ...CONTENT.filter((q) => q.type === "poll").map((q) => ({
      title: q.prompt,
      options: q.answers,
      pack: q.topic,
    })),
  ],
  sellout: PITCHES.map((title) => ({ title })),
  "scribble-shift": DOODLES.map((title) => ({ title })),
  "caption-this": SCENE_TITLES.map((title, scene) => ({ title, scene })),
};
export const builtInPacks = GAME_IDS.map((game) => ({
  id: defaultPackId(game),
  slug: `${game}-default`,
  document: validatePack({
    ...emptyPack(game, names[game]),
    shortDescription: `The original Ruckus ${names[game].toLowerCase()} bank, preserved in its original order.`,
    description:
      "Ruckus-authored launch content. Legacy topic selections retain their original filtering and wraparound behavior.",
    category: ["sellout", "caption-this", "scribble-shift"].includes(game)
      ? "creative"
      : "general",
    status: "ready",
    content: {
      gameType: game,
      items: banks[game].map((q, n) => ({ id: `original-${n + 1}`, ...q })),
    },
  }),
}));
// A small alternate drawn from existing authored facts, not newly generated trivia.
builtInPacks.push({
  id: "40000000-0000-4000-8000-000000000007",
  slug: "hotwire-food-for-thought",
  document: validatePack({
    ...emptyPack("hotwire", "Food for Thought"),
    shortDescription:
      "A small serving of food facts from the original Ruckus bank.",
    description:
      "A focused selection of existing Ruckus food questions, with their original answers and explanations.",
    category: "general",
    tags: ["food"],
    difficulty: "casual",
    status: "ready",
    content: {
      gameType: "hotwire",
      items: banks.hotwire
        .filter((q) => q.pack === "food")
        .map((q, n) => ({ id: `food-${n + 1}`, ...q })),
    },
  }),
});
export function validateBuiltIns() {
  return builtInPacks.map((p) => {
    validatePack(p.document);
    if (p.slug.endsWith("-default"))
      for (const topic of [
        "mixed",
        "work",
        "food",
        "travel",
        "weird",
        "internet",
        "screen",
        "nonexistent",
      ]) {
        for (let offset = 0; offset < 500; offset++) {
          const actual = selectPackPrompts(
            p.document.content as PackContent,
            5,
            topic,
            offset,
          );
          const expected = Array.from({ length: 5 }, (_, round) =>
            getPrompt(p.document.content.gameType, round, topic, offset),
          );
          if (
            JSON.stringify(actual) !==
            JSON.stringify(JSON.parse(JSON.stringify(expected)))
          ) {
            // Object key order is irrelevant to engine behavior.
            for (let n = 0; n < 5; n++)
              for (const key of [
                "title",
                "options",
                "answer",
                "explanation",
                "scene",
                "pack",
              ] as const)
                if (
                  JSON.stringify(actual[n][key]) !==
                  JSON.stringify(expected[n][key])
                )
                  throw new Error(
                    `Parity failed: ${p.slug} ${topic} ${offset} ${n} ${key}`,
                  );
          }
        }
      }
    return {
      slug: p.slug,
      items: p.document.content.items.length,
      hash: packHash(p.document),
    };
  });
}
