export interface FreshServerObservationV2 {
  observed_at: string;
}

export interface WorkerFreshnessSourcesV2 {
  branch?: FreshServerObservationV2;
  issues?: FreshServerObservationV2;
  files?: FreshServerObservationV2;
}

export function buildWorkerEvidenceFreshnessGuidanceV2(
  maxAgeSeconds: number | undefined,
  sources: WorkerFreshnessSourcesV2,
  requestTime: string
): string {
  const observations = [
    ["GitHub branch and commit", sources.branch?.observed_at],
    ["Open GitHub issue listing", sources.issues?.observed_at],
    ["Commit-pinned GitHub file contents and diff", sources.files?.observed_at]
  ].filter((entry): entry is [string, string] => typeof entry[1] === "string");

  return [
    "",
    "CRITICAL: EVIDENCE FRESHNESS AND HISTORICAL EVENTS",
    "ContextGuard server time when this assessment was dispatched: " + requestTime,
    "Maximum age of a decision-critical evidence observation: " +
      (maxAgeSeconds === undefined ? "policy not specified" : `${maxAgeSeconds} seconds`),
    "Server-verified provider read times (not Git commit dates):",
    ...observations.map(([source, time]) => `${source}: ${time}`),
    "",
    "For source_snapshot.observed_at, report WHEN THE EVIDENCE WAS ACTUALLY READ,",
    "not the date when the commit was authored, a CI run occurred, or a",
    "historical issue was created. Never invent or backdate a tool observation.",
    "When relying on the server-provided read above, use its exact observed_at",
    "for that SAME verified resource and SHA. Do not copy its time to another source.",
    "When relying on your own GitHub tool, use the time of that actual read.",
    "A past CI run is historical, but a fresh API read of its recorded result",
    "can be a new observation. A historical event timestamp is not the read time.",
    "If you only know a past event time and have no fresh observation,",
    "do not mark a decision-critical claim SUPPORTED; use UNKNOWN instead.",
    "",
    "Every evidence reference used by a REQUIRED SUPPORTED or CONTRADICTED",
    "claim must be within the policy freshness window at evidence assembly.",
    "Each source_snapshot.observed_at must be no later than assembled_at.",
    "Preserve real timestamps, and never manufacture freshness to obtain READY.",
    "This guidance does not grant permission to execute or change GitHub."
  ].join("\n");
}

export class WorkerEvidenceStaleErrorV2 extends Error {
  readonly code = "STALE_DECISION_CRITICAL_EVIDENCE";
  constructor(
    readonly evidenceId: string,
    readonly ageSeconds: number | undefined,
    readonly maxAgeSeconds: number | undefined
  ) {
    super(
      `Worker evidence ${evidenceId} is too old for a REQUIRED claim` +
      (ageSeconds === undefined ? "" : ` (${Math.round(ageSeconds)}s old`) +
      (ageSeconds === undefined || maxAgeSeconds === undefined
        ? "" : `; policy maximum ${maxAgeSeconds}s)`) +
      `. No ActionLock or GitHub write was created. ` +
      `A fresh observation is needed, not a changed security policy.`
    );
    this.name = "WorkerEvidenceStaleErrorV2";
  }
}

export function classifyWorkerStaleEvidenceV2(
  error: unknown,
  rawWorker: unknown,
  maxAgeSeconds: number | undefined
): WorkerEvidenceStaleErrorV2 | null {
  const message = error instanceof Error ? error.message : "";
  const match = message.match(/references stale decision-critical evidence: ([A-Za-z0-9_.-]+)\./);
  if (!match) return null;

  const evidenceId = match[1];
  let ageSeconds: number | undefined;
  if (rawWorker && typeof rawWorker === "object" && !Array.isArray(rawWorker)) {
    const output = rawWorker as Record<string, unknown>;
    const records = Array.isArray(output.evidence) ? output.evidence : [];
    const record = records.find(item => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return false;
      return (item as Record<string, unknown>).evidence_id === evidenceId;
    });
    if (record && typeof record === "object" && !Array.isArray(record)) {
      const snapshot = (record as Record<string, unknown>).source_snapshot;
      const assembledAt = output.assembled_at;
      if (
        snapshot && typeof snapshot === "object" && !Array.isArray(snapshot) &&
        typeof assembledAt === "string"
      ) {
        const observedAt = (snapshot as Record<string, unknown>).observed_at;
        if (typeof observedAt === "string") {
          const age = (Date.parse(assembledAt) - Date.parse(observedAt)) / 1000;
          if (Number.isFinite(age)) ageSeconds = age;
        }
      }
    }
  }
  return new WorkerEvidenceStaleErrorV2(evidenceId, ageSeconds, maxAgeSeconds);
}
