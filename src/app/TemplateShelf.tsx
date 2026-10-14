import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { estimatedMinutes } from "../../shared/boards";
import { TEMPLATES } from "../../shared/content/library";
import { createLocalBoard } from "../studio/repository";
import { Icon } from "../components/Visuals";
import { ErrorMessage } from "../components/Layout";
export default function TemplateShelf() {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  return (
    <section className="section studio-templates">
      <div className="section-heading">
        <div>
          <span className="eyebrow">SKIP THE BLANK PAGE</span>
          <h2>A head start.</h2>
        </div>
        <Link to="/app/studio" className="button outline">
          All starters ↗
        </Link>
      </div>
      <ErrorMessage message={error} />
      <div className="template-grid">
        {TEMPLATES.slice(0, 3).map((template) => (
          <article key={template.id}>
            <span
              className="template-icon"
              style={{ background: template.coverStyle.color }}
            >
              <Icon name={template.coverStyle.icon} />
            </span>
            <h3>{template.title}</h3>
            <p>{template.description}</p>
            <span>
              {template.questions.length} questions · ~
              {estimatedMinutes(template)} min
            </span>
            <div>
              <button
                className="button outline small"
                onClick={() => {
                  try {
                    const copy = createLocalBoard(template);
                    navigate(`/app/studio/boards/${copy.id}`);
                  } catch (cause) {
                    setError(
                      cause instanceof Error
                        ? cause.message
                        : "This starter couldn’t be saved. Try again in Studio.",
                    );
                  }
                }}
              >
                Make it mine <Icon name="arrow" />
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
