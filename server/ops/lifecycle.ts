export class Lifecycle {
  draining = false;
  stopping = false;
  constructor(draining = false) {
    this.draining = draining;
  }
  drain() {
    this.draining = true;
  }
  stop() {
    this.drain();
    if (this.stopping) return false;
    this.stopping = true;
    return true;
  }
  get acceptingRooms() {
    return !this.draining && !this.stopping;
  }
}
