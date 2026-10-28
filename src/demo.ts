import {
  MAX_RETRIES
} from "./orchestrator.js";

import type {
  OrchestrationResult
} from "./types.js";

export type DemoScenario =
  | "review"
  | "ready_pass"
  | "not_ready_pass"
  | "unknown_pass"
  | "verification_fail";

const baseDemo: OrchestrationResult = {
  repository:
    "touhaf00/tp-cicd",

  target: {
    type: "tag",
    reference: "v1.1.0"
  },

  worker: {
    decision: "UNKNOWN",
    confidence: 0.55,

    summary:
      "The target tag and successful CI runs were verified, but some decision-critical evidence remained unavailable during the investigation."
  },

  guard: {
    verdict: "REVIEW",
    evidence_coverage: 0.6,
    claim_accuracy: 0.9,
    risk: "MEDIUM",
    allowed_to_act: false,
    retry_recommended: true,

    findings: [
      {
        id: "F1",
        type: "SEMANTIC_MISMATCH",
        severity: "HIGH",
        claim_id: null,

        description:
          "The job name suggests a deployment, but the verified implementation only prints a success message. A successful job is therefore not evidence that a real deployment occurred.",

        verified_evidence: [],

        required_check:
          "Verify a real deployment mechanism and resulting deployment evidence before treating the job as proof of deployment."
      }
    ],

    requested_checks: [
      {
        finding_id: "F1",
        check:
          "Verify the deployment mechanism and resulting deployment evidence."
      }
    ],

    summary:
      "The Worker assessment is internally consistent, but additional focused verification is required before an external action may proceed."
  },

  retry_count: 1,
  max_retries: MAX_RETRIES,

  status:
    "STOPPED_REVIEW",

  external_action_executed:
    false,

  human_approval_required:
    false
};

export function buildDemoResult(
  scenario: DemoScenario
): OrchestrationResult {
  if (scenario === "ready_pass") {
    return {
      ...baseDemo,

      worker: {
        decision: "READY",
        confidence: 0.94,

        summary:
          "The requested target is supported by sufficient verified release evidence. No material release blocker was identified."
      },

      guard: {
        verdict: "PASS",
        evidence_coverage: 0.95,
        claim_accuracy: 0.97,
        risk: "LOW",
        findings: [],
        requested_checks: [],
        allowed_to_act: true,
        retry_recommended: false,

        summary:
          "The Worker's READY assessment is sufficiently supported by independent verification."
      },

      retry_count: 0,

      status:
        "AWAITING_HUMAN_APPROVAL",

      human_approval_required:
        true
    };
  }

  if (scenario === "not_ready_pass") {
    return {
      ...baseDemo,

      worker: {
        decision: "NOT_READY",
        confidence: 0.95,

        summary:
          "A material release blocker was verified. The repository should not proceed to release."
      },

      guard: {
        verdict: "PASS",
        evidence_coverage: 0.96,
        claim_accuracy: 0.98,
        risk: "LOW",
        findings: [],
        requested_checks: [],
        allowed_to_act: true,
        retry_recommended: false,

        summary:
          "ContextGuard independently verified that the Worker's NOT_READY decision is correctly supported."
      },

      retry_count: 0,

      status:
        "BLOCKED_NOT_READY",

      human_approval_required:
        false
    };
  }

  if (scenario === "unknown_pass") {
    return {
      ...baseDemo,

      worker: {
        decision: "UNKNOWN",
        confidence: 0.8,

        summary:
          "The available evidence is genuinely insufficient to conclude READY or NOT_READY."
      },

      guard: {
        verdict: "PASS",
        evidence_coverage: 0.78,
        claim_accuracy: 0.96,
        risk: "MEDIUM",
        findings: [],
        requested_checks: [],
        allowed_to_act: true,
        retry_recommended: false,

        summary:
          "ContextGuard verified that UNKNOWN is the correct evidence-based conclusion. Uncertainty is preserved rather than forced."
      },

      retry_count: 0,

      status:
        "STOPPED_UNKNOWN",

      human_approval_required:
        false
    };
  }

  if (scenario === "verification_fail") {
    return {
      ...baseDemo,

      worker: {
        decision: "READY",
        confidence: 0.91,

        summary:
          "The Worker concluded that the repository is ready for release."
      },

      guard: {
        verdict: "FAIL",
        evidence_coverage: 0.9,
        claim_accuracy: 0.45,
        risk: "HIGH",
        allowed_to_act: false,
        retry_recommended: false,

        findings: [
          {
            id: "F1",
            type: "CONTRADICTION",
            severity: "CRITICAL",
            claim_id: "C1",

            description:
              "Independent repository evidence directly contradicts a decision-critical Worker claim.",

            verified_evidence: [],
            required_check: null
          }
        ],

        requested_checks: [],

        summary:
          "A decision-critical contradiction makes the Worker assessment unsafe to trust."
      },

      retry_count: 0,

      status:
        "BLOCKED_VERIFICATION",

      human_approval_required:
        false
    };
  }

  return baseDemo;
}
