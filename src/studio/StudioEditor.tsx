import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  BOARD_COLORS,
  boardIssues,
  newBoard,
  newQuestion,
  questionIssues,
  TIMER_OPTIONS,
  type CustomBoard,
} from "../../shared/boards";
import { CONTENT, TOPICS } from "../../shared/content/library";
import { boards } from "./repository";
import { exportBoard } from "./transfer";
import { launchBoard } from "./launch";
import { useParty } from "../lib/party";
import { ErrorMessage } from "../components/Layout";
import { Icon, Tag } from "../components/Visuals";
import { QuestionEditor } from "../components/studio/QuestionEditor";
import { BoardPreview } from "../components/studio/BoardPreview";
function initial(id?: string) {
  try {
    return {
      board: !id || id === "new" ? newBoard() : boards.get(id),
      error: "",
    };
  } catch (e) {
    return {
      board: undefined,
      error: e instanceof Error ? e.message : "Couldn’t load this board.",
    };
  }
}
export default function StudioEditor() {
  const { id } = useParams(),
    navigate = useNavigate(),
    party = useParty();
  const [start] = useState(() => initial(id)),
    [board, setBoard] = useState(start.board),
    [selected, setSelected] = useState(0),
    [saved, setSaved] = useState("Saved in this browser"),
    [error, setError] = useState(start.error),
    [tried, setTried] = useState(false),
    [busy, setBusy] = useState(false),
    [library, setLibrary] = useState(false),
    [topic, setTopic] = useState("all"),
    [search, setSearch] = useState("");
  const latest = useRef(board);
  latest.current = board;
  useEffect(() => {
    const flush = () => {
      if (latest.current) {
        try {
          boards.save(latest.current);
        } catch {
          /* The editor already presents failed-save feedback. */
        }
      }
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);
  useEffect(() => {
    if (!board) return;
    setSaved("Saving…");
    const timeout = setTimeout(() => {
      try {
        boards.save(board);
        setSaved("Saved in this browser");
        if (!id || id === "new")
          navigate(`/app/studio/boards/${board.id}`, { replace: true });
      } catch (e) {
        setSaved("Save failed");
        setError(
          e instanceof Error
            ? e.message
            : "Couldn’t autosave. Export a backup.",
        );
      }
    }, 550);
    return () => clearTimeout(timeout);
  }, [board, id, navigate]);
  useEffect(() => {
    if (id && id !== "new" && board?.id !== id) {
      try {
        setBoard(boards.get(id));
        setSelected(0);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn’t load this board.");
      }
    }
  }, [id, board?.id]);
  if (!board)
    return (
      <section className="page-hero">
        <h1>
          That board isn’t
          <br />
          in this browser.
        </h1>
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
  function saveReturn() {
    try {
      boards.save(board!);
      navigate("/app/studio/boards");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Save failed. Export a backup.",
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
          <span
            role="status"
            className={saved === "Save failed" ? "field-error" : ""}
          >
            {saved}
          </span>
        </div>
        <div>
          <Link
            className="button small outline"
            to={`/app/studio/boards/${board.id}/preview`}
            onClick={(event) => {
              try {
                boards.save(board);
              } catch (e) {
                event.preventDefault();
                setError(
                  e instanceof Error
                    ? e.message
                    : "Couldn’t save this preview.",
                );
              }
            }}
          >
            Preview
          </Link>
          <button className="button small outline" onClick={saveReturn}>
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
                boards.save(board);
                const reply = await launchBoard(board, party.create);
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
              onClick={() => {
                try {
                  boards.save(board);
                  const copy = boards.duplicate(board.id);
                  navigate(`/app/studio/boards/${copy.id}`);
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
