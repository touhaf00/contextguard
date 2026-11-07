export const OUTBOUND_TIMEOUT_MS = 20_000;

export const OUTBOUND_LOG_TIMEOUT_MS = 60_000;

export function requestTimeoutSignal(timeoutMs: number = OUTBOUND_TIMEOUT_MS): AbortSignal {
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error("Outbound timeout must be a positive integer number of milliseconds.");
  }
  return AbortSignal.timeout(timeoutMs);
}
