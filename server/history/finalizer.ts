import type { SessionSummary } from "../../shared/history.js";
export interface HistoryPersistence {
  status: "saving" | "pending" | "saved" | "failed";
  sessionId: string;
  workspaceId: string;
}
type Task = {
  summary: SessionSummary;
  update: (state: HistoryPersistence) => void;
  done: () => void;
};
/** Bounded pre-handoff retries. Production writes durable outbox entries, not recaps. */
export class SessionFinalizer {
  private queue: Task[] = [];
  private running = 0;
  private pending = new Set<Promise<void>>();
  constructor(
    private write: (summary: SessionSummary) => Promise<unknown>,
    private retryDelays = [250, 1000, 3000],
    private log: (data: object) => void = (data) =>
      console.error(JSON.stringify(data)),
    private successStatus: "saved" | "pending" = "saved",
  ) {}
  private report(data: object) {
    try {
      this.log(data);
    } catch {
      /* Logging cannot reject gameplay-side work. */
    }
  }
  submit(summary: SessionSummary, update: Task["update"]): Promise<void> {
    const send = (status: HistoryPersistence["status"]) => {
      try {
        update({
          status,
          sessionId: summary.id,
          workspaceId: summary.workspaceId,
        });
      } catch {
        /* Presentation cannot affect finalization. */
      }
    };
    if (this.queue.length >= 128) {
      send("failed");
      this.report({
        event: "session.persistence_capacity",
        sessionId: summary.id,
      });
      return Promise.resolve();
    }
    send("saving");
    let done!: () => void;
    const promise = new Promise<void>((resolve) => {
      done = resolve;
    });
    this.pending.add(promise);
    const snapshot = structuredClone(summary);
    this.queue.push({
      summary: snapshot,
      update: (state) => send(state.status),
      done: () => {
        this.pending.delete(promise);
        done();
      },
    });
    this.pump();
    return promise;
  }
  private pump() {
    while (this.running < 4 && this.queue.length) {
      const task = this.queue.shift()!;
      this.running++;
      void this.run(task).finally(() => {
        this.running--;
        task.done();
        this.pump();
      });
    }
  }
  private async run(task: Task) {
    for (let attempt = 0; attempt <= this.retryDelays.length; attempt++) {
      try {
        await this.write(task.summary);
        task.update({
          status: this.successStatus,
          sessionId: task.summary.id,
          workspaceId: task.summary.workspaceId,
        });
        return;
      } catch {
        this.report({
          event: "session.persistence_failed",
          sessionId: task.summary.id,
          attempt: attempt + 1,
        });
        if (attempt < this.retryDelays.length)
          await new Promise((resolve) =>
            setTimeout(resolve, this.retryDelays[attempt]),
          );
      }
    }
    task.update({
      status: "failed",
      sessionId: task.summary.id,
      workspaceId: task.summary.workspaceId,
    });
  }
  async drain() {
    await Promise.all(this.pending);
  }
}
