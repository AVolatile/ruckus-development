import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { boards } from "./repository";
import { BoardPreview } from "../components/studio/BoardPreview";
import { useParty } from "../lib/party";
import { launchBoard } from "./launch";
import { ErrorMessage } from "../components/Layout";
export default function StudioPreview() {
  const { id } = useParams(),
    navigate = useNavigate(),
    party = useParty(),
    [index, setIndex] = useState(0),
    [reveal, setReveal] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  let board;
  try {
    board = boards.get(id ?? "");
  } catch {
    return (
      <section className="page-hero">
        <h1>Library unavailable.</h1>
        <Link to="/app/studio">Return to Studio</Link>
      </section>
    );
  }
  if (!board)
    return (
      <section className="page-hero">
        <h1>That board isn’t here.</h1>
        <Link to="/app/studio" className="button">
          Return to Studio
        </Link>
      </section>
    );
  const question = board.questions[index];
  return (
    <section className="studio-preview-page">
      <div className="studio-preview-toolbar">
        <Link to={`/app/studio/boards/${id}`} className="button outline small">
          ← Back to editor
        </Link>
        <span>
          PREVIEW · QUESTION {index + 1} / {board.questions.length}
        </span>
        <button
          className="button small"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const reply = await launchBoard(board, party.create);
              if (reply.ok && reply.identity)
                navigate(`/room/${reply.identity.code}/host`);
              else setError(reply.error ?? "The live stage is unavailable.");
            } catch (e) {
              setError(
                e instanceof Error
                  ? e.message
                  : "Check this board before launching.",
              );
            }
            setBusy(false);
          }}
        >
          Play this board ↗
        </button>
      </div>
      <h1>{board.title || "Your question board"}</h1>
      <p className="preview-disclaimer">
        This is a local preview. No room, players, or points are created.
      </p>
      <ErrorMessage message={error} />
      <div className="studio-preview-pair">
        <div>
          <span className="eyebrow">CONFERENCE-ROOM SCREEN</span>
          <BoardPreview board={board} question={question} reveal={reveal} />
        </div>
        <div>
          <span className="eyebrow">PLAYER PHONE</span>
          <BoardPreview
            board={board}
            question={question}
            phone
            key={question.id}
          />
        </div>
      </div>
      <div className="preview-step-controls">
        <button
          className="button outline"
          disabled={index === 0}
          onClick={() => {
            setIndex((i) => i - 1);
            setReveal(false);
          }}
        >
          Previous question
        </button>
        <button className="button" onClick={() => setReveal((r) => !r)}>
          {reveal ? "Hide reveal" : "Preview reveal"}
        </button>
        <button
          className="button outline"
          disabled={index + 1 === board.questions.length}
          onClick={() => {
            setIndex((i) => i + 1);
            setReveal(false);
          }}
        >
          Next question
        </button>
      </div>
    </section>
  );
}
