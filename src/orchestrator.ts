import {
  runGuard
} from "./agents/guard.js";

import {
  retryWorker,
  runWorker
} from "./agents/worker.js";

import {
  evaluateLockedResolution,
  evaluateTargetIntegrity
} from "./lib/target-integrity.js";

import type {
  FinalStatus,
  GuardReport,
  Mission,
  OrchestrationResult,
  TargetIntegrity,
  WorkerDecision,
  WorkerReport
} from "./types.js";

export const MAX_RETRIES = 2;

export const MAX_GUARD_VERIFICATION_RETRIES =
  1;

function actionableChecks(
  guardReport: GuardReport
): string[] {
  const requested =
    (guardReport.requested_checks ?? [])
      .map((item) => item.check)
      .filter(
        (check) =>
          check.trim().length > 0
      );

  if (requested.length > 0) {
    return [
      ...new Set(
        requested
      )
    ];
  }

  const fallbackChecks =
    (guardReport.findings ?? [])
      .map((finding) =>
        finding.required_check
      )
      .filter(
        (check): check is string =>
          typeof check === "string" &&
          check.trim().length > 0
      );

  return [
    ...new Set(
      fallbackChecks
    )
  ];
}

function requestedChecksSignature(
  guardReport: GuardReport
): string | null {
  const checks =
    actionableChecks(
      guardReport
    );

  if (checks.length === 0) {
    return null;
  }

  return checks
    .map((check) =>
      check
        .toLowerCase()
        .replace(
          /\s+/g,
          " "
        )
        .trim()
    )
    .sort()
    .join(" || ");
}

function finalStatus(
  workerDecision: WorkerDecision,
  guardReport: GuardReport
): FinalStatus {
  if (
    guardReport.verdict === "FAIL"
  ) {
    return "BLOCKED_VERIFICATION";
  }

  if (
    guardReport.verdict === "REVIEW"
  ) {
    return "STOPPED_REVIEW";
  }

  if (
    workerDecision === "READY"
  ) {
    return "AWAITING_HUMAN_APPROVAL";
  }

  if (
    workerDecision === "NOT_READY"
  ) {
    return "BLOCKED_NOT_READY";
  }

  return "STOPPED_UNKNOWN";
}

function blockedTargetResult(
  input: Mission,
  workerReport: WorkerReport,
  guardReport: GuardReport,
  targetIntegrity: TargetIntegrity,
  retryCount: number
): OrchestrationResult {
  return {
    repository:
      input.repository,

    target:
      input.target,

    target_integrity:
      targetIntegrity,

    worker:
      workerReport,

    guard:
      guardReport,

    retry_count:
      retryCount,

    max_retries:
      MAX_RETRIES,

    status:
      "BLOCKED_TARGET_INTEGRITY",

    external_action_executed:
      false,

    human_approval_required:
      false
  };
}

function verificationUnavailableResult(
  input: Mission,
  workerReport: WorkerReport,
  guardReport: GuardReport,
  lockedTargetIntegrity: TargetIntegrity,
  retryCount: number
): OrchestrationResult {
  return {
    repository:
      input.repository,

    target:
      input.target,

    /*
     * Important:
     *
     * The immutable target lock remains VERIFIED.
     * A temporary verifier failure does not erase it.
     */
    target_integrity:
      lockedTargetIntegrity,

    worker:
      workerReport,

    guard:
      guardReport,

    retry_count:
      retryCount,

    max_retries:
      MAX_RETRIES,

    status:
      "STOPPED_VERIFICATION_UNAVAILABLE",

    external_action_executed:
      false,

    human_approval_required:
      false
  };
}

async function runLockedGuardWithRecovery(
  input: Mission,
  workerReport: WorkerReport,
  lockedSha: string
) {
  let verificationRetryCount = 0;

  let guardReport =
    await runGuard(
      input,
      workerReport,
      lockedSha
    );

  while (true) {
    const lockedCheck =
      evaluateLockedResolution(
        input,
        guardReport.target_resolution,
        lockedSha,
        "GuardLockedTargetResolution"
      );

    if (
      lockedCheck.status !==
      "UNRESOLVED"
    ) {
      return {
        guardReport,
        lockedCheck,
        verificationRetryCount
      };
    }

    if (
      verificationRetryCount >=
      MAX_GUARD_VERIFICATION_RETRIES
    ) {
      return {
        guardReport,
        lockedCheck,
        verificationRetryCount
      };
    }

    verificationRetryCount++;

    console.log(
      `[policy] Guard verification retry ${verificationRetryCount}/${MAX_GUARD_VERIFICATION_RETRIES}`
    );

    guardReport =
      await runGuard(
        input,
        workerReport,
        lockedSha
      );
  }
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

  /*
   * INITIAL TRUST ESTABLISHMENT
   *
   * Before a lock exists, both independent
   * agents must resolve exactly the same
   * immutable target.
   */
  let guardReport =
    await runGuard(
      input,
      workerReport
    );

  let targetIntegrity =
    evaluateTargetIntegrity(
      input,
      workerReport.target_resolution,
      guardReport.target_resolution
    );

  if (
    targetIntegrity.status !==
    "VERIFIED"
  ) {
    console.log(
      `[policy] Target integrity blocked: ${targetIntegrity.status}`
    );

    return blockedTargetResult(
      input,
      workerReport,
      guardReport,
      targetIntegrity,
      retryCount
    );
  }

  const lockedSha =
    targetIntegrity.locked_sha;

  if (!lockedSha) {
    throw new Error(
      "Verified target integrity did not produce a locked SHA."
    );
  }

  console.log(
    `[policy] Target snapshot locked: ${lockedSha}`
  );

  /*
   * Preserve the original independently
   * established lock.
   *
   * A later verification outage must never
   * destroy this snapshot.
   */
  const lockedTargetIntegrity =
    targetIntegrity;

  while (
    guardReport.verdict === "REVIEW" &&
    retryCount < MAX_RETRIES
  ) {
    if (
      !guardReport.retry_recommended
    ) {
      console.log(
        "[policy] Guard did not recommend another Worker retry"
      );

      break;
    }

    const signature =
      requestedChecksSignature(
        guardReport
      );

    if (!signature) {
      console.log(
        "[policy] No targeted Worker checks were supplied"
      );

      break;
    }

    if (
      attemptedCheckSets.has(
        signature
      )
    ) {
      console.log(
        "[policy] Requested Worker checks were already attempted"
      );

      break;
    }

    attemptedCheckSets.add(
      signature
    );

    retryCount++;

    console.log(
      `[policy] Targeted Worker retry ${retryCount}/${MAX_RETRIES}`
    );

    workerReport =
      await retryWorker(
        initialWorker.threadId,
        guardReport,
        lockedSha,
        input.repository
      );

    /*
     * The Worker must always preserve the
     * application lock during evidence recovery.
     */
    const workerLockedCheck =
      evaluateLockedResolution(
        input,
        workerReport.target_resolution,
        lockedSha,
        "WorkerLockedTargetResolution"
      );

    if (
      workerLockedCheck.status !==
      "VERIFIED"
    ) {
      console.log(
        `[policy] Worker violated locked target integrity: ${workerLockedCheck.status}`
      );

      targetIntegrity =
        evaluateTargetIntegrity(
          input,
          workerReport.target_resolution,
          lockedTargetIntegrity.guard,
          lockedSha
        );

      return blockedTargetResult(
        input,
        workerReport,
        guardReport,
        targetIntegrity,
        retryCount
      );
    }

    /*
     * ContextGuard gets its own recovery budget.
     *
     * A verifier outage is NOT the same thing as
     * target drift and must not erase the lock.
     */
    const verification =
      await runLockedGuardWithRecovery(
        input,
        workerReport,
        lockedSha
      );

    guardReport =
      verification.guardReport;

    if (
      verification.lockedCheck.status ===
      "UNRESOLVED"
    ) {
      console.log(
        "[policy] Guard verification unavailable after locked-target retry"
      );

      return verificationUnavailableResult(
        input,
        workerReport,
        guardReport,
        lockedTargetIntegrity,
        retryCount
      );
    }

    /*
     * A concrete different target identity or
     * different SHA is a real integrity failure.
     */
    if (
      verification.lockedCheck.status !==
      "VERIFIED"
    ) {
      console.log(
        `[policy] Locked target integrity failed: ${verification.lockedCheck.status}`
      );

      targetIntegrity =
        evaluateTargetIntegrity(
          input,
          workerReport.target_resolution,
          guardReport.target_resolution,
          lockedSha
        );

      return blockedTargetResult(
        input,
        workerReport,
        guardReport,
        targetIntegrity,
        retryCount
      );
    }

    /*
     * Both current reports now explicitly match
     * the immutable application lock.
     */
    targetIntegrity =
      evaluateTargetIntegrity(
        input,
        workerReport.target_resolution,
        guardReport.target_resolution,
        lockedSha
      );

    if (
      targetIntegrity.status !==
      "VERIFIED"
    ) {
      console.log(
        `[policy] Locked target integrity failed: ${targetIntegrity.status}`
      );

      return blockedTargetResult(
        input,
        workerReport,
        guardReport,
        targetIntegrity,
        retryCount
      );
    }
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

    target_integrity:
      targetIntegrity,

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
