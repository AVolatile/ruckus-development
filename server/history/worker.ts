import { HistoryOutbox } from "./outbox.js";
import { failureCode, log } from "../ops/log.js";
export class HistoryWorker {
  private timer?: ReturnType<typeof setTimeout>;
  private active = new Set<Promise<void>>();
  private stopped = false;
  private ticking = false;
  private lastPrune = 0;
  constructor(
    private outbox: HistoryOutbox,
    private ready: () => Promise<boolean>,
    private notify: (id: string, status: "saved" | "failed") => void = () => {},
    private concurrency = 2,
    private pollMs = 1000,
  ) {}
  start() {
    this.stopped = false;
    this.schedule(0);
  }
  private report(id: string, status: "saved" | "failed") {
    try {
      this.notify(id, status);
    } catch {
      /* A stale presentation cannot change committed work. */
    }
  }
  private schedule(ms: number) {
    if (!this.stopped) {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => void this.tick(), ms);
      this.timer.unref();
    }
  }
  async tick() {
    if (this.ticking || this.stopped) return;
    this.ticking = true;
    try {
      if (!(await this.ready()) || this.stopped) return;
      while (!this.stopped && this.active.size < this.concurrency) {
        const job = await this.outbox.claim();
        if (!job) break;
        const task = (async () => {
          try {
            if (await this.outbox.materialize(job))
              this.report(job.id, "saved");
          } catch (error) {
            if (await this.outbox.fail(job, error))
              this.report(job.id, "failed");
          }
        })().catch((error) =>
          log(
            "history.worker_dependency_failed",
            { code: failureCode(error) },
            "error",
          ),
        );
        this.active.add(task);
        void task.finally(() => this.active.delete(task));
      }
      if (!this.stopped && Date.now() - this.lastPrune > 60000) {
        await this.outbox.prune();
        this.lastPrune = Date.now();
      }
    } catch (error) {
      log("history.worker_poll_failed", { code: failureCode(error) }, "warn");
    } finally {
      this.ticking = false;
      this.schedule(this.pollMs);
    }
  }
  async stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    // A claim already in flight may complete; wait for its task before closing the pool.
    while (this.ticking)
      await new Promise((resolve) => setTimeout(resolve, 10));
    await Promise.all(this.active);
    // Interrupted/forced exits leave a 60-second recoverable lease; never release a still-running transaction.
  }
}
