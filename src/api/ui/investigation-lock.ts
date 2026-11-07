export class InvestigationBusyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvestigationBusyError";
  }
}

export class InvestigationLock {
  private readonly active = new Set<string>();

  constructor(private readonly maxConcurrent: number = 2) {
    if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1) {
      throw new Error("InvestigationLock maxConcurrent must be a positive integer.");
    }
  }

  async run<T>(key: string, task: () => Promise<T>): Promise<T> {
    if (this.active.has(key)) {
      throw new InvestigationBusyError(
        "An investigation is already running for this session. Do not retry in parallel."
      );
    }
    if (this.active.size >= this.maxConcurrent) {
      throw new InvestigationBusyError(
        "ContextGuard is busy with other investigations. Try again in a few minutes."
      );
    }
    this.active.add(key);
    try {
      return await task();
    } finally {
      this.active.delete(key);
    }
  }

  get inFlight(): number {
    return this.active.size;
  }
}
