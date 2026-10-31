export const TARGET_TYPES = [
  "release",
  "tag",
  "branch",
  "commit",
  "current_state"
] as const;

export type TargetType = (typeof TARGET_TYPES)[number];

export type TargetResolutionStatus =
  | "RESOLVED"
  | "UNRESOLVED";

export interface TargetResolution {
  status: TargetResolutionStatus;

  requested_type: TargetType;
  requested_reference?: string;

  resolved_sha?: string;
  reason?: string;
}

export type TargetIntegrityStatus =
  | "VERIFIED"
  | "UNRESOLVED"
  | "REQUEST_MISMATCH"
  | "SHA_MISMATCH";

export interface TargetIntegrity {
  status: TargetIntegrityStatus;

  worker: TargetResolution;
  guard: TargetResolution;

  locked_sha?: string;
  reason?: string;
}

export type WorkerDecision =
  | "READY"
  | "NOT_READY"
  | "UNKNOWN";

export type GuardVerdict =
  | "PASS"
  | "REVIEW"
  | "FAIL";

export type RiskLevel =
  | "LOW"
  | "MEDIUM"
  | "HIGH"
  | "CRITICAL";

export const FINDING_TYPES = [
  "MISSING_EVIDENCE",
  "UNSUPPORTED_CLAIM",
  "CONTRADICTION",
  "FABRICATED_EVIDENCE",
  "REASONING_ERROR",
  "TARGET_MISMATCH"
] as const;

export type FindingType =
  (typeof FINDING_TYPES)[number];

export type FindingSeverity =
  | "LOW"
  | "MEDIUM"
  | "HIGH"
  | "CRITICAL";

export const EVIDENCE_LEVELS = [
  "CONFIGURED",
  "EXECUTED",
  "SUCCESS",
  "OUTPUT_OBSERVED",
  "SEMANTIC_EFFECT"
] as const;

export type EvidenceLevel =
  (typeof EVIDENCE_LEVELS)[number];

export const EVIDENCE_SOURCE_TYPES = [
  "FILE",
  "DIRECTORY",
  "COMMIT",
  "BRANCH",
  "TAG",
  "RELEASE",
  "WORKFLOW",
  "WORKFLOW_RUN",
  "JOB",
  "STEP",
  "LOG",
  "CHECK",
  "PULL_REQUEST",
  "ISSUE",
  "CONFIGURATION",
  "OTHER"
] as const;

export type EvidenceSourceType =
  (typeof EVIDENCE_SOURCE_TYPES)[number];

export const CLAIM_CRITICALITIES = [
  "REQUIRED",
  "SUPPORTING"
] as const;

export type ClaimCriticality =
  (typeof CLAIM_CRITICALITIES)[number];

export const CLAIM_STATUSES = [
  "SUPPORTED",
  "UNSUPPORTED",
  "CONTRADICTED",
  "UNKNOWN"
] as const;

export type ClaimStatus =
  (typeof CLAIM_STATUSES)[number];

export interface EvidenceRecord {
  evidence_id: string;
  source_type: EvidenceSourceType;

  repository: string;
  target_sha: string;

  locator: string;
  observation: string;

  level: EvidenceLevel;

  content_hash?: string;
  observed_at?: string;
}

export interface WorkerClaim {
  claim_id: string;
  statement: string;

  criticality: ClaimCriticality;
  status: ClaimStatus;

  evidence_refs: string[];
}

export interface Mission {
  repository: string;

  target: {
    type: TargetType;
    reference?: string;
  };

  mission: string;

  constraints: {
    read_only: true;
  };
}

export interface WorkerReport {
  decision: WorkerDecision;
  confidence: number;
  summary: string;

  target_resolution: TargetResolution;

  claims?: WorkerClaim[];
  evidence?: EvidenceRecord[];

  [key: string]: unknown;
}

export interface RequestedCheck {
  finding_id: string;
  check: string;
}

export interface GuardFinding {
  id: string;
  type: FindingType;
  severity: FindingSeverity;
  claim_id?: string | null;
  description: string;
  verified_evidence?: string[];
  required_check?: string | null;
}

export interface GuardReport {
  verdict: GuardVerdict;
  evidence_coverage: number;
  claim_accuracy: number;
  risk: RiskLevel;
  findings?: GuardFinding[];
  requested_checks?: RequestedCheck[];

  verified_claims?: string[];
  unverified_claims?: string[];
  contradicted_claims?: string[];

  worker_decision_supported: boolean;
  allowed_to_act: boolean;
  retry_recommended: boolean;
  summary: string;

  target_resolution: TargetResolution;

  [key: string]: unknown;
}

export type FinalStatus =
  | "AWAITING_HUMAN_APPROVAL"
  | "BLOCKED_TARGET_INTEGRITY"
  | "STOPPED_VERIFICATION_UNAVAILABLE"
  | "BLOCKED_NOT_READY"
  | "BLOCKED_VERIFICATION"
  | "STOPPED_UNKNOWN"
  | "STOPPED_REVIEW";

export interface OrchestrationResult {
  repository: string;
  target: Mission["target"];

  target_integrity: TargetIntegrity;

  worker: WorkerReport;
  guard: GuardReport;
  retry_count: number;
  max_retries: number;
  status: FinalStatus;
  external_action_executed: false;
  human_approval_required: boolean;
}
