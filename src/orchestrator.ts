import {
  runGuard
} from "./agents/guard.js";

import {
  retryWorker,
  runWorker
} from "./agents/worker.js";

import type {
  FinalStatus,
  GuardReport,
  Mission,
  OrchestrationResult,
  WorkerDecision
} from "./types.js";

export const MAX_RETRIES = 2;

function actionableChecks(
  guardReport: GuardReport
): string[] {
  const requested =
    (guardReport.requested_checks ?? [])
      .map((item) => item.check);

  const findingChecks =
    (guardReport.findings ?? [])
      .map((finding) =>
        finding.required_check
      )
      .filter(
        (check): check is string =>
          typeof check === "string" &&
          check.trim().length > 0
      );

  return [...new Set([
    ...requested,
    ...findingChecks
  ])];
}

function requestedChecksSignature(
  guardReport: GuardReport
): string | null {
  const checks =
    actionableChecks(guardReport);

  if (checks.length === 0) {
    return null;
  }

  return checks
    .map((check) =>
      check
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim()
    )
    .sort()
    .join(" || ");
}

function finalStatus(
  workerDecision: WorkerDecision,
  guardReport: GuardReport
): FinalStatus {
  if (guardReport.verdict === "FAIL") {
    return "BLOCKED_VERIFICATION";
  }

  if (guardReport.verdict === "REVIEW") {
    return "STOPPED_REVIEW";
  }

  if (workerDecision === "READY") {
    return "AWAITING_HUMAN_APPROVAL";
  }

  if (workerDecision === "NOT_READY") {
    return "BLOCKED_NOT_READY";
  }

  return "STOPPED_UNKNOWN";
}

export async function orchestrate(
  input: Mission
): Promise<OrchestrationResult> {
  const attemptedCheckSets =
    new Set<string>();

  let retryCount = 0;

  const initialWorker =
    await runWorker(input);

  let workerReport =
    initialWorker.report;

  let guardReport =
    await runGuard(
      input,
      workerReport
    );

  while (
    guardReport.verdict === "REVIEW" &&
    retryCount < MAX_RETRIES
  ) {
    const signature =
      requestedChecksSignature(
        guardReport
      );

    if (!signature) {
      console.log(
        "[policy] No targeted checks were supplied"
      );
      break;
    }

    if (
      attemptedCheckSets.has(signature)
    ) {
      console.log(
        "[policy] Requested checks were already attempted"
      );
      break;
    }

    attemptedCheckSets.add(signature);
    retryCount++;

    console.log(
      `[policy] Targeted retry ${retryCount}/${MAX_RETRIES}`
    );

    workerReport =
      await retryWorker(
        initialWorker.threadId,
        guardReport
      );

    guardReport =
      await runGuard(
        input,
        workerReport
      );
  }

  const status =
    finalStatus(
      workerReport.decision,
      guardReport
    );

  return {
    repository:
      input.repository,

    target:
      input.target,

    worker:
      workerReport,

    guard:
      guardReport,

    retry_count:
      retryCount,

    max_retries:
      MAX_RETRIES,

    status,

    external_action_executed:
      false,

    human_approval_required:
      status ===
      "AWAITING_HUMAN_APPROVAL"
  };
}
