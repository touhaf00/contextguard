import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalJson,
  sameSubject,
  snapshotMatchesSubject,
  validatePolicyDefinition,
  validateProposedAction,
  validateResourceSnapshot,
  validateSubjectRef
} from "../dist/core/contracts.js";

test(
  "accepts a GitHub subject without making Git a core concept",
  () => {
    const subject =
      validateSubjectRef({
        provider: "github",
        resource_type:
          "repository_target",
        resource_id:
          "touhaf00/tp-cicd",
        selector: {
          type: "tag",
          reference: "v1.1.0"
        }
      });

    assert.equal(
      subject.provider,
      "github"
    );

    assert.equal(
      subject.selector.reference,
      "v1.1.0"
    );
  }
);

test(
  "accepts a GitHub commit SHA as an opaque snapshot version",
  () => {
    const snapshot =
      validateResourceSnapshot({
        snapshot_id:
          "github-tp-cicd-v1.1.0",

        subject: {
          provider: "github",
          resource_type:
            "repository_target",
          resource_id:
            "touhaf00/tp-cicd",
          selector: {
            type: "tag",
            reference: "v1.1.0"
          }
        },

        version:
          "b182a69150a65b60217ef9758b1fd771f64e7d1a",

        observed_at:
          "2026-11-01T00:00:00.000Z"
      });

    assert.equal(
      snapshot.version,
      "b182a69150a65b60217ef9758b1fd771f64e7d1a"
    );
  }
);

test(
  "accepts a Stripe refund action",
  () => {
    const action =
      validateProposedAction({
        namespace: "stripe",
        action: "refund_payment",

        parameters: {
          payment_id: "pi_123",
          amount: 2500,
          currency: "EUR"
        }
      });

    assert.equal(
      action.parameters.amount,
      2500
    );
  }
);

test(
  "accepts a Salesforce update action",
  () => {
    const action =
      validateProposedAction({
        namespace: "salesforce",
        action:
          "update_opportunity_stage",

        parameters: {
          opportunity_id:
            "006ABC",
          stage:
            "Closed Won"
        }
      });

    assert.equal(
      action.namespace,
      "salesforce"
    );
  }
);

test(
  "accepts a Google Drive revision snapshot",
  () => {
    const snapshot =
      validateResourceSnapshot({
        snapshot_id:
          "drive-file-123-rev-184",

        subject: {
          provider:
            "google_drive",
          resource_type:
            "document",
          resource_id:
            "file-123"
        },

        version:
          "revision-184",

        observed_at:
          "2026-11-01T00:01:00Z",

        metadata: {
          mime_type:
            "application/vnd.google-apps.document"
        }
      });

    assert.equal(
      snapshot.version,
      "revision-184"
    );
  }
);

test(
  "accepts a generic policy with freshness and human approval",
  () => {
    const policy =
      validatePolicyDefinition({
        policy_id:
          "refund-safety",

        version:
          "1.0.0",

        name:
          "Refund safety",

        objective:
          "Authorize only sufficiently verified refunds.",

        decision_rules: [
          "The original payment must exist.",
          "The requested refund must not exceed the refundable amount."
        ],

        human_approval:
          "REQUIRED",

        preflight_required:
          true,

        freshness: {
          max_age_seconds: 60
        }
      });

    assert.equal(
      policy.freshness
        .max_age_seconds,
      60
    );
  }
);

test(
  "canonical JSON is stable across object key order",
  () => {
    assert.equal(
      canonicalJson({
        b: 2,
        a: {
          y: true,
          x: "value"
        }
      }),

      canonicalJson({
        a: {
          x: "value",
          y: true
        },
        b: 2
      })
    );
  }
);

test(
  "sameSubject includes selector identity",
  () => {
    const base = {
      provider: "github",
      resource_type:
        "repository_target",
      resource_id:
        "touhaf00/tp-cicd"
    };

    assert.equal(
      sameSubject(
        {
          ...base,
          selector: {
            type: "tag",
            reference: "v1.1.0"
          }
        },
        {
          ...base,
          selector: {
            reference: "v1.1.0",
            type: "tag"
          }
        }
      ),
      true
    );

    assert.equal(
      sameSubject(
        {
          ...base,
          selector: {
            type: "tag",
            reference: "v1.1.0"
          }
        },
        {
          ...base,
          selector: {
            type: "tag",
            reference: "v2.0.0"
          }
        }
      ),
      false
    );
  }
);

test(
  "snapshot must belong to the requested subject",
  () => {
    const snapshot = {
      snapshot_id:
        "crm-opportunity-v7",

      subject: {
        provider:
          "salesforce",
        resource_type:
          "opportunity",
        resource_id:
          "006ABC"
      },

      version:
        "7",

      observed_at:
        "2026-11-01T00:02:00Z"
    };

    assert.equal(
      snapshotMatchesSubject(
        snapshot,
        snapshot.subject
      ),
      true
    );

    assert.equal(
      snapshotMatchesSubject(
        snapshot,
        {
          ...snapshot.subject,
          resource_id:
            "006DIFFERENT"
        }
      ),
      false
    );
  }
);

test(
  "rejects non JSON-compatible action parameters",
  () => {
    assert.throws(
      () =>
        validateProposedAction({
          namespace:
            "payments",
          action:
            "refund",

          parameters: {
            amount:
              Number.NaN
          }
        }),
      /non-finite/
    );
  }
);

test(
  "rejects an invalid snapshot timestamp",
  () => {
    assert.throws(
      () =>
        validateResourceSnapshot({
          snapshot_id: "x",

          subject: {
            provider: "api",
            resource_type:
              "object",
            resource_id: "123"
          },

          version: "1",

          observed_at:
            "not-a-date"
        }),
      /valid timestamp/
    );
  }
);

test(
  "rejects a policy without decision rules",
  () => {
    assert.throws(
      () =>
        validatePolicyDefinition({
          policy_id: "empty",
          version: "1",
          name: "Empty",
          objective:
            "Invalid policy.",

          decision_rules: [],

          human_approval:
            "REQUIRED",

          preflight_required:
            true
        }),
      /at least one rule/
    );
  }
);
