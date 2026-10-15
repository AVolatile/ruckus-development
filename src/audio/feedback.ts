import type { FeedbackKind } from "./types";
const listeners = new Set<(kind: FeedbackKind) => void>();
export function localAudioFeedback(kind: FeedbackKind) {
  for (const listener of listeners) listener(kind);
}
export function subscribeFeedback(listener: (kind: FeedbackKind) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
