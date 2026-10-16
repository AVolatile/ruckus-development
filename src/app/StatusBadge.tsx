export type StatusTone =
  "saved" | "saving" | "unsaved" | "ready" | "draft" | "error" | "conflict";

/** Presentation only: callers supply their acknowledged state, never a timer. */
export function StatusBadge({
  children,
  tone,
}: {
  children: string;
  tone?: StatusTone;
}) {
  const state =
    tone ??
    (/conflict/i.test(children)
      ? "conflict"
      : /failed|error|paused/i.test(children)
        ? "error"
        : /unsaved|new /i.test(children)
          ? "unsaved"
          : /saving|loading|creating|importing/i.test(children)
            ? "saving"
            : /^ready/i.test(children)
              ? "ready"
              : /draft/i.test(children)
                ? "draft"
                : "saved");
  return (
    <span
      className="host-status"
      data-state={state}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <span key={state} className="host-status-mark" aria-hidden="true" />
      {children}
    </span>
  );
}
