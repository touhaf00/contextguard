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

export type FindingSeverity =
  | "LOW"
  | "MEDIUM"
  | "HIGH"
  | "CRITICAL";

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

  [key: string]: unknown;
}

export interface RequestedCheck {
  finding_id: string;
  check: string;
}

export interface GuardFinding {
  id: string;
  type: string;
  severity: FindingSeverity;
  claim_id?: string | null;
  description: string;
  verified_evidence?: unknown[];
  required_check?: string | null;
}

export interface GuardReport {
  verdict: GuardVerdict;
  evidence_coverage: number;
  claim_accuracy: number;
  risk: RiskLevel;
  findings?: GuardFinding[];
  requested_checks?: RequestedCheck[];
  allowed_to_act: boolean;
  retry_recommended: boolean;
  summary: string;

  target_resolution: TargetResolution;

  [key: string]: unknown;
}

export type FinalStatus =
  | "AWAITING_HUMAN_APPROVAL"
  | "BLOCKED_TARGET_INTEGRITY"
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
