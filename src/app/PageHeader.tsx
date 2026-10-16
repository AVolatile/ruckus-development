import type { ReactNode } from "react";

/** Restrained working-page hierarchy. Each expressive route chooses its own composition. */
export function PageHeader({
  eyebrow,
  title,
  children,
  actions,
  meta,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <header className="host-page-header">
      <div className="host-page-copy">
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {children && <div className="host-page-support">{children}</div>}
        {meta && <div className="host-page-meta">{meta}</div>}
      </div>
      {actions && <div className="host-page-actions">{actions}</div>}
    </header>
  );
}
