import assert from "node:assert/strict";
import type { RoomView } from "../../shared/types.js";
import type { SessionSummary } from "../../shared/history.js";
export async function persistedRecap(
  origin: string,
  cookie: string,
  state: () => RoomView,
): Promise<SessionSummary> {
  const until = Date.now() + 15000;
  while (state().history?.status !== "saved") {
    assert.notEqual(
      state().history?.status,
      "failed",
      "History persistence failed",
    );
    if (Date.now() > until) throw Error("History commit timeout");
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  const h = state().history!,
    url = `${origin}/api/v1/workspaces/${h.workspaceId}/sessions/${h.sessionId}`;
  assert.equal((await fetch(url)).status, 401);
  const response = await fetch(url, { headers: { Cookie: cookie } });
  assert.equal(response.status, 200);
  const recap = (await response.json()) as SessionSummary;
  assert.equal(recap.roomCode, state().code);
  const runtime =
    state().event?.scores.map((p) => ({
      name: state().players.find((a) => a.id === p.playerId)!.name,
      score: p.points,
    })) ??
    [...state().players]
      .sort((a, b) => b.score - a.score)
      .map((p) => ({ name: p.name, score: p.score }));
  if (recap.participants.some((p) => p.finalRank !== null))
    for (const p of recap.participants) {
      const score = runtime.find((r) => r.name === p.name)?.score;
      assert.equal(p.finalScore, score ?? null);
    }
  const ranked = recap.participants
    .filter((p) => p.finalRank !== null)
    .sort((a, b) => a.finalOrder! - b.finalOrder!);
  if (ranked.length)
    assert.deepEqual(
      ranked.map((p) => p.name),
      runtime.map((p) => p.name),
    );
  const json = JSON.stringify(recap);
  assert.ok(
    !/PRIVATE creative|original creative answer|correctAnswer|hostToken|socketId/.test(
      json,
    ),
  );
  return recap;
}
