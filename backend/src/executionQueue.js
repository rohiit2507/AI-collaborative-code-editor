const DEFAULT_MAX_PENDING = 20;

class ExecutionQueue {
  constructor({ maxPending = DEFAULT_MAX_PENDING, worker }) {
    this.maxPending = maxPending;
    this.worker = worker;
    this.pending = [];
    this.running = false;
  }

  get size() {
    return this.pending.length;
  }

  enqueue(job) {
    if (this.pending.length >= this.maxPending) {
      const error = new Error("Execution queue is full");
      error.code = "QUEUE_FULL";
      return Promise.reject(error);
    }

    return new Promise((resolve, reject) => {
      this.pending.push({ job, resolve, reject });
      this.processNext();
    });
  }

  async processNext() {
    if (this.running || this.pending.length === 0) {
      return;
    }

    this.running = true;
    const next = this.pending.shift();

    try {
      const result = await this.worker(next.job);
      next.resolve(result);
    } catch (error) {
      next.reject(error);
    } finally {
      this.running = false;
      this.processNext();
    }
  }
}

module.exports = ExecutionQueue;
