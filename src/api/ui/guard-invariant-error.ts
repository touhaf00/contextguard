export const GUARD_INVARIANT_ERROR_PREFIX = "Guard invariant violated:";

export const GUARD_INVARIANT_PUBLIC_MESSAGE =
  "The independent Guard returned a verification that failed ContextGuard's consistency checks. " +
  "No authorization was issued and nothing was written to GitHub. " +
  "Run the verification again; if it keeps happening, check the server log.";

export interface GuardInvariantHttpError {
  readonly status: 502;
  readonly message: string;
}

export function guardInvariantHttpError(
  error: unknown
): GuardInvariantHttpError | null {
  if (
    error instanceof Error &&
    error.message.startsWith(GUARD_INVARIANT_ERROR_PREFIX)
  ) {
    return {
      status: 502,
      message: GUARD_INVARIANT_PUBLIC_MESSAGE
    };
  }

  return null;
}

const AGENT_OUTPUT_PREFIX = /^AGENT_(WORKER|GUARD)_OUTPUT_INVALID:/;

export function agentOutputInvalidHttpError(
  error: unknown
): { readonly status: 502; readonly message: string } | null {
  if (!(error instanceof Error)) return null;
  const match = AGENT_OUTPUT_PREFIX.exec(error.message);
  if (!match) return null;
  const who = match[1] === "GUARD" ? "independent Guard" : "Worker";
  return {
    status: 502,
    message:
      `The Cominty ${who} did not return a structured answer, even after one format repair, so nothing could be verified. ` +
      "No authorization was issued and nothing was written to GitHub. " +
      "Run the verification again; if it keeps happening, check the server log."
  };
}

export const WORKER_INVARIANT_PUBLIC_MESSAGE =
  "The Cominty Worker returned an assessment that failed ContextGuard's consistency checks: it reported READY while a required claim was not supported. " +
  "No authorization was issued and nothing was written to GitHub. " +
  "Run the verification again; if it keeps happening, check the server log.";

const WORKER_INVARIANT_PREFIX = /^(WorkerAssessmentV2|Worker) invariant violated:/;

export function workerInvariantHttpError(
  error: unknown
): { readonly status: 502; readonly message: string } | null {
  if (
    error instanceof Error &&
    WORKER_INVARIANT_PREFIX.test(error.message)
  ) {
    return {
      status: 502,
      message: WORKER_INVARIANT_PUBLIC_MESSAGE
    };
  }
  return null;
}
