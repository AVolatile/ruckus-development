import { useCallback, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CONTENT, TEMPLATES, TOPICS } from "../../shared/content/library";
import { estimatedMinutes, type CustomBoard } from "../../shared/boards";
import { Avatar, Icon, Tag } from "../components/Visuals";
import { ErrorMessage } from "../components/Layout";
import { copyBoard } from "./repository";
import { useBoardLibrary } from "./useBoardLibrary";
import type { BoardSummary } from "../../shared/cloud";
import {
  download,
  CSV_TEMPLATE,
  exportBoard,
  importCsv,
  importJson,
} from "./transfer";
import { useParty } from "../lib/party";
import { launchBoard } from "./launch";
import { useDialog } from "../lib/useDialog";
export default function StudioLibrary() {
  const library = useBoardLibrary();
  const { items, repository } = library;
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(""),
    [pendingDelete, setPendingDelete] = useState<BoardSummary | null>(null),
    [filter, setFilter] = useState("all");
  const file = useRef<HTMLInputElement>(null),
    navigate = useNavigate(),
    party = useParty();
  const dismissDelete = useCallback(() => setPendingDelete(null), []);
  useDialog(!!pendingDelete, dismissDelete);
  async function run(fn: () => void | Promise<unknown>) {
    try {
      await fn();
      await library.reload();
      setError("");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "That action didn’t finish. Try again.",
      );
    }
  }
  async function create(source?: CustomBoard) {
    setBusy("creating");
    try {
      const board = copyBoard(source);
      const record = await repository.create(board, `create:${board.id}`);
      navigate(`/app/studio/boards/${record.board.id}`);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Couldn’t create your board.",
      );
    } finally {
      setBusy("");
    }
  }
  async function play(board: CustomBoard | BoardSummary, demo = false) {
    setBusy(board.id);
    try {
      const snapshot =
        "questions" in board ? board : (await repository.get(board.id))?.board;
      if (!snapshot)
        throw new Error("This board is no longer in your account.");
      const reply = await launchBoard(snapshot, party.create, demo);
      if (reply.ok && reply.identity)
        navigate(`/room/${reply.identity.code}/host`);
      else setError(reply.error ?? "The live stage is unavailable.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Check your board before launching.",
      );
    }
    setBusy("");
  }
  const visible =
    filter === "all"
      ? TEMPLATES
      : TEMPLATES.filter((t) => t.questions.some((q) => q.topic === filter));
  return (
    <>
      <section className="studio-hero">
        <div>
          <Tag>RUCKUS STUDIO / YOU SET THE QUESTIONS.</Tag>
          <h1>
            Your team knows
            <br />
            <span>weird things.</span>
            <br />
            Make a game of it.
          </h1>
          <p>
            A question board, a room code, and an entirely new reason to get
            competitive. Build your own. Or start with one of ours.
          </p>
          <div className="hero-actions">
            <button
              className="button"
              disabled={!!busy}
              onClick={() => void create()}
            >
              Create question board <Icon name="arrow" />
            </button>
            <button
              className="button outline"
              onClick={() => file.current?.click()}
            >
              Import question board
            </button>
          </div>
          <p className="studio-storage-note">
            Saved to your Ruckus account. Open your boards on any device.
          </p>
        </div>
        <div className="studio-hero-art">
          <Avatar id={5} size={170} />
          <div>
            <b>A</b>
            <span>
              What’s your team’s
              <br />
              secret specialist subject?
            </span>
            <Icon name="check" />
          </div>
          <div>
            <b>B</b>
            <span>Time to find out.</span>
          </div>
        </div>
      </section>
      <section className="section studio-library">
        <div className="section-heading">
          <div>
            <span className="eyebrow">YOUR QUESTIONS. YOUR HOUSE RULES.</span>
            <h2>My boards.</h2>
          </div>
          <div className="studio-library-tools">
            <button
              onClick={() =>
                download("ruckus-board-template.csv", CSV_TEMPLATE, "text/csv")
              }
            >
              Download CSV template ↗
            </button>
            <Link to="/app/originals">Explore the Originals ↗</Link>
          </div>
        </div>
        <ErrorMessage message={error || library.error || party.error} />
        <input
          ref={file}
          type="file"
          accept=".json,.csv,application/json,text/csv"
          hidden
          aria-label="Import board file"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            try {
              if (f.size > 300000)
                throw new Error("Keep imports under 300 KB.");
              const text = await f.text();
              const board = f.name.toLowerCase().endsWith(".csv")
                ? importCsv(text)
                : importJson(text);
              const record = await repository.create(board, `file:${board.id}`);
              setError("");
              navigate(`/app/studio/boards/${record.board.id}`);
            } catch (e) {
              setError(
                e instanceof Error
                  ? e.message
                  : "That file could not be imported.",
              );
            }
            e.target.value = "";
          }}
        />
        {library.loading && <p role="status">Loading your boards…</p>}
        {library.error && (
          <button
            className="button outline"
            onClick={() => void library.reload()}
          >
            Try loading again
          </button>
        )}
        {items.length ? (
          <div className="board-grid">
            {items.map((board) => (
              <article className="board-card" key={board.id}>
                <Link
                  className="board-cover"
                  to={`/app/studio/boards/${board.id}`}
                  style={{
                    background: board.coverStyle.color,
                    color:
                      board.coverStyle.color === "#2548f4"
                        ? "#fffaf0"
                        : "#191a24",
                  }}
                >
                  <Icon name={board.coverStyle.icon} />
                  <span>{board.category}</span>
                  <h3>{board.title || "Untitled board"}</h3>
                </Link>
                <div className="board-card-details">
                  <span>
                    {board.questionCount} questions · ~{board.minutes} min
                  </span>
                  <small>
                    Edited{" "}
                    {new Date(board.updatedAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </small>
                  <div>
                    <button
                      disabled={!!busy}
                      className="button small"
                      onClick={() => void play(board)}
                    >
                      {busy === board.id ? "Opening…" : "Play this board"}
                      <Icon name="arrow" />
                    </button>
                    <Link
                      className="button small outline"
                      to={`/app/studio/boards/${board.id}`}
                    >
                      Edit
                    </Link>
                  </div>
                  <div className="board-minor-actions">
                    <button
                      onClick={() =>
                        run(() => {
                          return repository.duplicate(board.id);
                        })
                      }
                    >
                      Duplicate board
                    </button>
                    <button
                      onClick={() =>
                        run(async () => {
                          const record = await repository.get(board.id);
                          if (!record)
                            throw new Error(
                              "That board is no longer available.",
                            );
                          exportBoard(record.board);
                        })
                      }
                    >
                      Export
                    </button>
                    <button onClick={() => setPendingDelete(board)}>
                      Delete
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          !library.loading &&
          !library.error && (
            <div className="studio-empty">
              <Avatar id={2} size={95} />
              <div>
                <h3>A blank board. Big potential.</h3>
                <p>
                  Create your first question board, or make a starter your own.
                </p>
                <button
                  className="button"
                  disabled={!!busy}
                  onClick={() => void create()}
                >
                  Build your first board <Icon name="arrow" />
                </button>
              </div>
            </div>
          )
        )}
        {library.cursor && (
          <button
            className="button outline"
            disabled={library.loading}
            onClick={() => void library.loadMore()}
          >
            Load more boards
          </button>
        )}
      </section>
      <section className="section studio-templates">
        <div className="section-heading">
          <div>
            <span className="eyebrow">SKIP THE BLANK PAGE.</span>
            <h2>
              Start with a<br />
              little inspiration.
            </h2>
          </div>
          <p>
            {CONTENT.length} library questions. {Object.keys(TOPICS).length}{" "}
            topics.
            <br />
            Every starter is yours to change.
          </p>
        </div>
        <div className="filter-tabs" role="group" aria-label="Starter topic">
          {[
            ["all", "All starters"],
            ["food", "Food"],
            ["office", "Office chaos"],
            ["weird", "Weird"],
            ["travel", "Travel"],
            ["brain", "Brain break"],
          ].map(([id, label]) => (
            <button
              key={id}
              aria-pressed={filter === id}
              className={filter === id ? "active" : ""}
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="discovery-tools">
          <label>
            Question topic
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="all">All topics</option>
              {Object.entries(TOPICS).map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <button
            className="button outline"
            disabled={!visible.length}
            onClick={() =>
              void create(visible[Math.floor(Math.random() * visible.length)])
            }
          >
            Surprise me <Icon name="asterisk" />
          </button>
        </div>
        {!visible.length && (
          <div className="studio-empty">
            <p>
              No starter board uses this topic yet. Create a board and add
              questions from the library.
            </p>
            <button
              className="button"
              disabled={!!busy}
              onClick={() => void create()}
            >
              Build with this topic
            </button>
          </div>
        )}
        <div className="template-grid">
          {visible.map((t) => (
            <article key={t.id}>
              <span
                className="template-icon"
                style={{
                  background: t.coverStyle.color,
                  color:
                    t.coverStyle.color === "#2548f4" ? "#fffaf0" : "#191a24",
                }}
              >
                <Icon name={t.coverStyle.icon} />
              </span>
              <h3>{t.title}</h3>
              <p>{t.description}</p>
              <span>
                {t.questions.length} questions · ~{estimatedMinutes(t)} min
              </span>
              <div>
                <button
                  disabled={!!busy}
                  onClick={() => void create(t)}
                  className="button outline small"
                >
                  Make it mine <Icon name="arrow" />
                </button>
                <button
                  disabled={!!busy}
                  onClick={() => void play(t, true)}
                  className="studio-demo-link"
                >
                  Demo it ↗
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
      {pendingDelete && (
        <div className="modal-backdrop">
          <section
            className="confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-title"
          >
            <h2 id="delete-title">Retire this board?</h2>
            <p>
              “{pendingDelete.title || "Untitled board"}” will leave this
              account’s library. Export a backup first if you want to keep it.
            </p>
            <button
              className="button danger"
              autoFocus
              onClick={() => {
                void run(() => repository.delete(pendingDelete.id));
                setPendingDelete(null);
              }}
            >
              Delete board
            </button>
            <button
              className="button outline"
              onClick={() => setPendingDelete(null)}
            >
              Keep it
            </button>
          </section>
        </div>
      )}
    </>
  );
}
