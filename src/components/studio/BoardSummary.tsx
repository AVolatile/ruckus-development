import type { RoomView } from "../../../shared/types";
import { download } from "../../studio/transfer";
export function BoardSummary({ room }: { room: RoomView }) {
  if (!room.summary) return null;
  const s = room.summary;
  return (
    <section className="board-summary">
      <h2>The room, by the numbers.</h2>
      <div>
        <span>
          <b>{room.players.length}</b> players
        </span>
        <span>
          <b>{s.questions.length}</b> questions
        </span>
        {s.correctness !== null && (
          <span>
            <b>{s.correctness}%</b> correct
          </span>
        )}
        {s.hardestQuestion !== null && (
          <span>
            Hardest question <b>#{s.hardestQuestion}</b>
          </span>
        )}
        {s.fastest && (
          <span>
            Fastest response{" "}
            <b>
              {s.fastest.name} · {(s.fastest.ms / 1000).toFixed(1)}s
            </b>
          </span>
        )}
      </div>
      <button
        className="button light-outline"
        onClick={() => {
          const quote = (v: unknown) =>
            `"${String(v)
              .replaceAll('"', '""')
              .replace(/^[=+@-]/, "'")}"`;
          const rows = [
            ["display_name", "score"],
            ...room.players.map((p) => [p.name, p.score]),
            [],
            ["question", "respondents", "correct", "timed_out"],
            ...s.questions.map((q) => [
              q.number,
              q.respondents,
              q.correct,
              q.timedOut,
            ]),
          ];
          download(
            `ruckus-${room.code}-summary.csv`,
            rows.map((row) => row.map(quote).join(",")).join("\n"),
            "text/csv",
          );
        }}
      >
        Export session summary ↗
      </button>
      <p>
        Display names and aggregate game results only. Your host workspace keeps
        a recap after a qualified session; creative submissions are not
        retained.
      </p>
    </section>
  );
}
