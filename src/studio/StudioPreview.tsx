import { useWorkspace } from "../workspaces/WorkspaceContext";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Link, useNavigate } from "../workspaces/navigation";
import { useBoardRepository } from "./RepositoryProvider";
import type { CustomBoard } from "../../shared/boards";
import { BoardPreview } from "../components/studio/BoardPreview";
import { useParty } from "../lib/party";
import { launchBoard } from "./launch";
import { ErrorMessage } from "../components/Layout";
export default function StudioPreview() {
  const { can } = useWorkspace();
  const { id } = useParams(),
    navigate = useNavigate(),
    party = useParty(),
    [index, setIndex] = useState(0),
    [reveal, setReveal] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const repository = useBoardRepository();
  const [board, setBoard] = useState<CustomBoard>(),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    void repository
      .get(id ?? "")
      .then((value) => {
        if (active) setBoard(value?.board);
      })
      .catch((cause) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Couldn’t load your board.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, repository]);
  if (loading)
    return (
      <section className="page-hero">
        <p role="status">Loading board preview…</p>
      </section>
    );
  if (!board)
    return (
      <section className="page-hero">
        <h1>That board isn’t available.</h1>
        <ErrorMessage message={error} />
        <Link to="/app/studio" className="button">
          Return to Studio
        </Link>
      </section>
    );
  const question = board.questions[index];
  return (
    <section className="studio-preview-page">
      <div className="studio-preview-toolbar">
        <Link
          to={can("boards.update") ? `/app/studio/boards/${id}` : "/app/studio"}
          className="button outline small"
        >
          {can("boards.update") ? "← Back to editor" : "← Shared library"}
        </Link>
        <span>
          PREVIEW · QUESTION {index + 1} / {board.questions.length}
        </span>
        {can("boards.launch") && (
          <button
            className="button small"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const snapshot = await repository.get(board.id);
                if (!snapshot)
                  throw new Error(
                    "That board is no longer available in this workspace.",
                  );
                const reply = await launchBoard(
                  snapshot.board,
                  party.create,
                  false,
                  repository.workspaceId,
                );
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
        )}
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
