import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateTargetIntegrity,
  validateTargetResolution
} from "../dist/lib/target-integrity.js";

const SHA_A =
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

const SHA_B =
  "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function mission(
  target = {
    type: "branch",
    reference: "main"
  }
) {
  return {
    repository:
      "example/project",

    target,

    mission:
      "Verify the requested target.",

    constraints: {
      read_only: true
    }
  };
}

function resolved(
  overrides = {}
) {
  return {
    status:
      "RESOLVED",

    requested_type:
      "branch",

    requested_reference:
      "main",

    resolved_sha:
      SHA_A,

    ...overrides
  };
}

test(
  "accepts a valid full SHA resolution",
  () => {
    const result =
      validateTargetResolution(
        resolved()
      );

    assert.equal(
      result.resolved_sha,
      SHA_A
    );
  }
);

test(
  "normalizes resolved SHA to lowercase",
  () => {
    const result =
      validateTargetResolution(
        resolved({
          resolved_sha:
            SHA_A.toUpperCase()
        })
      );

    assert.equal(
      result.resolved_sha,
      SHA_A
    );
  }
);

test(
  "rejects a short SHA",
  () => {
    assert.throws(
      () =>
        validateTargetResolution(
          resolved({
            resolved_sha:
              "abcdef1"
          })
        ),
      /40-character/
    );
  }
);

test(
  "rejects RESOLVED without SHA",
  () => {
    const value =
      resolved();

    delete value.resolved_sha;

    assert.throws(
      () =>
        validateTargetResolution(
          value
        ),
      /resolved_sha/
    );
  }
);

test(
  "accepts UNRESOLVED with reason",
  () => {
    const result =
      validateTargetResolution({
        status:
          "UNRESOLVED",

        requested_type:
          "branch",

        requested_reference:
          "main",

        reason:
          "The repository target could not be resolved."
      });

    assert.equal(
      result.status,
      "UNRESOLVED"
    );
  }
);

test(
  "rejects UNRESOLVED that still supplies a SHA",
  () => {
    assert.throws(
      () =>
        validateTargetResolution({
          status:
            "UNRESOLVED",

          requested_type:
            "branch",

          requested_reference:
            "main",

          resolved_sha:
            SHA_A,

          reason:
            "Conflicting state."
        }),
      /must be absent/
    );
  }
);

test(
  "verifies consensus on the exact SHA",
  () => {
    const integrity =
      evaluateTargetIntegrity(
        mission(),
        resolved(),
        resolved()
      );

    assert.equal(
      integrity.status,
      "VERIFIED"
    );

    assert.equal(
      integrity.locked_sha,
      SHA_A
    );
  }
);

test(
  "blocks when Worker and Guard resolve different SHAs",
  () => {
    const integrity =
      evaluateTargetIntegrity(
        mission(),
        resolved(),
        resolved({
          resolved_sha:
            SHA_B
        })
      );

    assert.equal(
      integrity.status,
      "SHA_MISMATCH"
    );

    assert.equal(
      integrity.locked_sha,
      undefined
    );
  }
);

test(
  "blocks when either agent cannot resolve the target",
  () => {
    const integrity =
      evaluateTargetIntegrity(
        mission(),
        resolved(),
        {
          status:
            "UNRESOLVED",

          requested_type:
            "branch",

          requested_reference:
            "main",

          reason:
            "GitHub evidence unavailable."
        }
      );

    assert.equal(
      integrity.status,
      "UNRESOLVED"
    );
  }
);

test(
  "blocks if an agent silently changes the requested ref",
  () => {
    const integrity =
      evaluateTargetIntegrity(
        mission(),
        resolved({
          requested_reference:
            "develop"
        }),
        resolved()
      );

    assert.equal(
      integrity.status,
      "REQUEST_MISMATCH"
    );
  }
);

test(
  "supports current_state without a reference",
  () => {
    const integrity =
      evaluateTargetIntegrity(
        mission({
          type:
            "current_state"
        }),
        {
          status:
            "RESOLVED",

          requested_type:
            "current_state",

          resolved_sha:
            SHA_A
        },
        {
          status:
            "RESOLVED",

          requested_type:
            "current_state",

          resolved_sha:
            SHA_A
        }
      );

    assert.equal(
      integrity.status,
      "VERIFIED"
    );
  }
);

test(
  "rejects coordinated drift after a SHA was locked",
  () => {
    const integrity =
      evaluateTargetIntegrity(
        mission(),
        resolved({
          resolved_sha:
            SHA_B
        }),
        resolved({
          resolved_sha:
            SHA_B
        }),
        SHA_A
      );

    assert.equal(
      integrity.status,
      "SHA_MISMATCH"
    );

    assert.equal(
      integrity.locked_sha,
      undefined
    );
  }
);
