import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/dm-sans";
import "./styles.css";
import { AppRoutes } from "./routing/AppRoutes";
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="room-recovery">
        <h1>The screen hit a snag.</h1>
        <p>
          Reload to try again. Saved boards stay in this browser; a live session
          can reconnect while its room is available.
        </p>
        <button className="button" onClick={() => window.location.reload()}>
          Reload the screen
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);
