import { StatusBadge } from "../app/StatusBadge";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { Link, useNavigate } from "../workspaces/navigation";
import {
  BOARD_COLORS,
  boardIssues,
  newQuestion,
  questionIssues,
  TIMER_OPTIONS,
  type CustomBoard,
} from "../../shared/boards";
import { CONTENT, TOPICS } from "../../shared/content/library";
import { useCloudDraft } from "./useCloudDraft";
import { download } from "./transfer";
import { exportBoard } from "./transfer";
import { launchBoard } from "./launch";
import { useParty } from "../lib/party";
import { ErrorMessage } from "../components/Layout";
import { Icon, Tag } from "../components/Visuals";
import { QuestionEditor } from "../components/studio/QuestionEditor";
import { BoardPreview } from "../components/studio/BoardPreview";
export default function StudioEditor() {
  const { id } = useParams(),
    navigate = useNavigate(),
    party = useParty();
  const draft = useCloudDraft(id);
  const { board, setBoard, saved, error, setError } = draft;
  const [selected, setSelected] = useState(0),
    [tried, setTried] = useState(false),
    [busy, setBusy] = useState(false),
    [library, setLibrary] = useState(false),
    [topic, setTopic] = useState("all"),
    [search, setSearch] = useState("");
  if (draft.loading)
    return (
      <section className="page-hero">
        <p role="status">Loading your board…</p>
      </section>
    );
  if (!board)
    return (
      <section className="page-hero">
        <h1>That board isn’t available.</h1>
        <ErrorMessage message={error} />
        <Link to="/app/studio" className="button">
          Back to the library
        </Link>
      </section>
    );
  const current =
      board.questions[Math.min(selected, board.questions.length - 1)],
    issues = boardIssues(board),
    patch = (p: Partial<CustomBoard>) =>
      setBoard((b) => (b ? { ...b, ...p } : b));
  async function saveReturn() {
    try {
      await draft.flush();
      navigate("/app/studio/boards");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Save failed. Export a copy to keep your edits.",
      );
    }
  }
  function changeQuestions(qs: CustomBoard["questions"]) {
    patch({ questions: qs.map((q, order) => ({ ...q, order })) });
  }
  function add(
    question = newQuestion(board!.questions.length, board!.settings),
  ) {
    if (board!.questions.length >= 50) {
      setError(
        "This board has 50 questions. Duplicate it to make another edition.",
      );
      return;
    }
    changeQuestions([
      ...board!.questions,
      { ...question, id: crypto.randomUUID() },
    ]);
    setSelected(board!.questions.length);
    setLibrary(false);
  }
  function move(dir: number) {
    const target = selected + dir;
    if (target < 0 || target >= board!.questions.length) return;
    const qs = [...board!.questions];
    [qs[selected], qs[target]] = [qs[target], qs[selected]];
    changeQuestions(qs);
    setSelected(target);
  }
  const candidates = CONTENT.filter(
    (q) =>
      (topic === "all" || q.topic === topic) &&
      q.prompt.toLowerCase().includes(search.toLowerCase()),
  ).slice(0, 30);
  return (
    <div className="studio-editor-page">
      <header className="studio-editor-top">
        <div>
          <Link to="/app/studio/boards">← My boards</Link>
          <StatusBadge
            tone={draft.conflict ? "conflict" : error ? "error" : undefined}
          >
            {saved}
          </StatusBadge>
        </div>
        <div>
          <Link
            className="button small outline"
            to={`/app/studio/boards/${board.id}/preview`}
            onClick={(event) => {
              event.preventDefault();
              void draft
                .flush()
                .then((value) =>
                  navigate(`/app/studio/boards/${value.board.id}/preview`),
                )
                .catch((cause) =>
                  setError(
                    cause instanceof Error
                      ? cause.message
                      : "Couldn’t save before preview.",
                  ),
                );
            }}
          >
            Preview
          </Link>
          <button
            className="button small outline"
            onClick={() => void saveReturn()}
          >
            Save & return
          </button>
          <button
            className="button small"
            disabled={busy}
            onClick={async () => {
              setTried(true);
              if (issues.length) {
                setError(
                  `${issues.length} things to finish before the room opens. ${issues[0].message}`,
                );
                const index = Number(issues[0].path.split(".")[1]);
                if (Number.isFinite(index)) setSelected(index);
                return;
              }
              setBusy(true);
              try {
                const snapshot = await draft.flush();
                const reply = await launchBoard(
                  snapshot.board,
                  party.create,
                  false,
                  draft.repository.workspaceId,
                );
                if (reply.ok && reply.identity)
                  navigate(`/room/${reply.identity.code}/host`);
                else setError(reply.error ?? "The live stage is unavailable.");
              } catch (e) {
                setError(
                  e instanceof Error
                    ? e.message
                    : "Check the board before launching.",
                );
              }
              setBusy(false);
            }}
          >
            {busy ? "Opening your room…" : "Play this board"}{" "}
            <Icon name="arrow" />
          </button>
        </div>
      </header>
      <section className="studio-board-meta">
        <div>
          <Tag>RUCKUS STUDIO / THE CREATOR’S SEAT</Tag>
          <label htmlFor="board-title">Board title</label>
          <input
            id="board-title"
            className="board-title-input"
            maxLength={60}
            value={board.title}
            onChange={(e) => patch({ title: e.target.value })}
            placeholder="Name your particular kind of Ruckus"
            aria-invalid={tried && !board.title.trim()}
          />
          {tried && !board.title.trim() && (
            <p className="field-error">Give your board a title.</p>
          )}
          <label htmlFor="board-description">Description</label>
          <input
            id="board-description"
            maxLength={180}
            value={board.description}
            onChange={(e) => patch({ description: e.target.value })}
            placeholder="A little invitation to get competitive."
          />
        </div>
        <div className="board-cover-controls">
          <label>
            Category
            <input
              maxLength={50}
              value={board.category}
              onChange={(e) => patch({ category: e.target.value })}
            />
          </label>
          <fieldset>
            <legend>Your board color</legend>
            <div>
              {BOARD_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={`Choose board color ${color}`}
                  aria-pressed={board.coverStyle.color === color}
                  style={{
                    background: color,
                    color: color === "#2548f4" ? "#fffaf0" : "#191a24",
                  }}
                  onClick={() =>
                    patch({ coverStyle: { ...board.coverStyle, color } })
                  }
                >
                  {board.coverStyle.color === color ? "✓" : ""}
                </button>
              ))}
            </div>
          </fieldset>
          <label>
            Cover icon
            <select
              value={board.coverStyle.icon}
              onChange={(e) =>
                patch({
                  coverStyle: {
                    ...board.coverStyle,
                    icon: e.target.value as CustomBoard["coverStyle"]["icon"],
                  },
                })
              }
            >
              {["bolt", "eye", "bubble", "asterisk", "pencil", "trophy"].map(
                (i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ),
              )}
            </select>
          </label>
        </div>
      </section>
      <ErrorMessage message={error || party.error} />
      {draft.dirty && (draft.conflict || saved === "Save failed") && (
        <div className="cloud-save-recovery" role="alert">
          <p>
            {draft.conflict
              ? "This board changed elsewhere. Export your edits before loading the latest version."
              : "Your latest edits haven’t been confirmed by the server yet."}
          </p>
          <button
            className="button small outline"
            onClick={() =>
              download(
                "ruckus-unsaved-draft.json",
                JSON.stringify(board, null, 2),
                "application/json",
              )
            }
          >
            Export my current draft
          </button>
          {draft.conflict ? (
            <button
              className="button small outline"
              onClick={() => void draft.reloadLatest()}
            >
              Load latest and replace these edits
            </button>
          ) : (
            saved === "Save failed" && (
              <button
                className="button small"
                onClick={() => void draft.retry()}
              >
                Retry save
              </button>
            )
          )}
        </div>
      )}

      <div className="studio-workbench">
        <aside className="question-rail">
          <div>
            <span className="eyebrow">YOUR LINEUP</span>
            <b>
              {
                board.questions.filter((q) => questionIssues(q).length === 0)
                  .length
              }{" "}
              / {board.questions.length} ready
            </b>
          </div>
          <nav aria-label="Question navigator">
            {board.questions.map((q, i) => (
              <button
                className={i === selected ? "selected" : ""}
                key={q.id}
                aria-current={i === selected ? "step" : undefined}
                aria-label={`Question ${i + 1}: ${q.prompt || "Untitled"}`}
                onClick={() => setSelected(i)}
              >
                <span>{String(i + 1).padStart(2, "0")}</span>
                <b>{q.prompt || "Your next question"}</b>
                <i
                  aria-label={questionIssues(q).length ? "Incomplete" : "Ready"}
                >
                  {questionIssues(q).length ? "○" : "✓"}
                </i>
              </button>
            ))}
          </nav>
          <button
            className="button full small"
            disabled={board.questions.length >= 50}
            onClick={() => add()}
          >
            Add question +
          </button>
          <button
            className="button full outline small"
            onClick={() => setLibrary((v) => !v)}
            aria-expanded={library}
          >
            From the library ↗
          </button>
        </aside>
        <div className="studio-edit-column">
          {library && (
            <section className="content-picker">
              <h2>Borrow a good question.</h2>
              <label>
                Topic
                <select
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                >
                  <option value="all">All topics</option>
                  {Object.entries(TOPICS).map(([id, name]) => (
                    <option value={id} key={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Search questions
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Try snacks, music, maps…"
                />
              </label>
              <div>
                {candidates.map((q) => (
                  <button key={q.id} onClick={() => add(q)}>
                    <span>
                      {TOPICS[q.topic ?? "general"]} ·{" "}
                      {q.type === "poll" ? "POLL" : "TRIVIA"}
                    </span>
                    <b>{q.prompt}</b>
                    <small>Add to my board +</small>
                  </button>
                ))}
                {!candidates.length && (
                  <p>
                    No questions match. Try another topic or a shorter search.
                  </p>
                )}
              </div>
            </section>
          )}
          <div className="question-action-bar">
            <span>{board.questions.length} / 50 QUESTIONS</span>
            <div>
              <button
                disabled={selected === 0}
                aria-label="Move question up"
                onClick={() => move(-1)}
              >
                ↑
              </button>
              <button
                disabled={selected === board.questions.length - 1}
                aria-label="Move question down"
                onClick={() => move(1)}
              >
                ↓
              </button>
              <button
                disabled={board.questions.length >= 50}
                onClick={() => {
                  const qs = [...board.questions];
                  qs.splice(selected + 1, 0, {
                    ...structuredClone(current),
                    id: crypto.randomUUID(),
                  });
                  changeQuestions(qs);
                  setSelected(selected + 1);
                }}
              >
                Duplicate question
              </button>
              <button
                disabled={board.questions.length === 1}
                onClick={() => {
                  changeQuestions(
                    board.questions.filter((_, i) => i !== selected),
                  );
                  setSelected(Math.max(0, selected - 1));
                }}
              >
                Delete question
              </button>
            </div>
          </div>
          <QuestionEditor
            question={current}
            showErrors={tried}
            onChange={(q) =>
              changeQuestions(
                board.questions.map((old, i) => (i === selected ? q : old)),
              )
            }
          />
          <details className="board-settings">
            <summary>
              Board house rules <span>↗</span>
            </summary>
            <div>
              <label>
                Default timer for new questions
                <select
                  value={board.settings.defaultTimer}
                  onChange={(e) =>
                    patch({
                      settings: {
                        ...board.settings,
                        defaultTimer: Number(e.target.value),
                      },
                    })
                  }
                >
                  {TIMER_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n} seconds
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Default score mode
                <select
                  value={board.settings.scoreMode}
                  onChange={(e) =>
                    patch({
                      settings: {
                        ...board.settings,
                        scoreMode: e.target
                          .value as CustomBoard["settings"]["scoreMode"],
                      },
                    })
                  }
                >
                  <option value="casual">Casual · 500 correct</option>
                  <option value="quick-draw">Quick Draw · speed bonus</option>
                  <option value="no-score">Just play · no score</option>
                </select>
              </label>
              <label>
                Show standings
                <select
                  value={board.settings.leaderboardFrequency}
                  onChange={(e) =>
                    patch({
                      settings: {
                        ...board.settings,
                        leaderboardFrequency: e.target
                          .value as CustomBoard["settings"]["leaderboardFrequency"],
                      },
                    })
                  }
                >
                  <option value="each">After every question</option>
                  <option value="every-5">Every five questions</option>
                  <option value="final">Only at the finish</option>
                </select>
              </label>
              {[
                { key: "randomizeAnswers", label: "Shuffle answer order" },
                {
                  key: "showCorrectAnswer",
                  label: "Show the correct answer at reveal",
                },
                { key: "showExplanation", label: "Show explanations" },
              ].map((item) => (
                <label className="toggle-row" key={item.key}>
                  <span>{item.label}</span>
                  <input
                    type="checkbox"
                    checked={board.settings[item.key as "randomizeAnswers"]}
                    onChange={(e) =>
                      patch({
                        settings: {
                          ...board.settings,
                          [item.key]: e.target.checked,
                        },
                      })
                    }
                  />
                </label>
              ))}
            </div>
          </details>
          <div className="editor-transfer">
            <button
              className="button outline"
              onClick={() => {
                try {
                  exportBoard(board);
                  setError("");
                } catch (e) {
                  setTried(true);
                  setError(
                    e instanceof Error
                      ? e.message
                      : "Finish this board before export.",
                  );
                }
              }}
            >
              Export board ↗
            </button>
            <button
              className="button outline"
              onClick={async () => {
                try {
                  await draft.flush();
                  const copy = await draft.repository.duplicate(board.id);
                  navigate(`/app/studio/boards/${copy.board.id}`, {
                    state: { hostNotice: "Board duplicated and saved." },
                  });
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : "Couldn’t duplicate.",
                  );
                }
              }}
            >
              Duplicate board
            </button>
          </div>
        </div>
        <aside className="studio-live-preview">
          <span className="eyebrow">THE ROOM, AS YOU MAKE IT.</span>
          <BoardPreview board={board} question={current} />
          <span className="eyebrow">THE PHONE, TOO.</span>
          <BoardPreview
            board={board}
            question={current}
            phone
            key={current.id}
          />
          <p>
            Author preview. Players see your answer choices first and the reveal
            after the round.
          </p>
        </aside>
      </div>
    </div>
  );
}
