import assert from "node:assert/strict";
import test from "node:test";

import {
  LiveAccessError,
  LiveAccessGate
} from "../dist/lib/live-access.js";

function gate(
  options = {}
) {
  return new LiveAccessGate({
    accessToken:
      "secret-token",

    allowedRepositories: [
      "touhaf00/tp-cicd"
    ],

    maxRequests:
      3,

    windowMs:
      600_000,

    ...options
  });
}

test(
  "live access fails closed when security configuration is missing",
  () => {
    const access =
      new LiveAccessGate({
        accessToken: "",
        allowedRepositories: []
      });

    assert.throws(
      () =>
        access.authenticate(
          "Bearer anything"
        ),
      (error) =>
        error instanceof
          LiveAccessError &&
        error.code ===
          "DISABLED"
    );
  }
);

test(
  "live access rejects a missing bearer token",
  () => {
    const access =
      gate();

    assert.throws(
      () =>
        access.authenticate(
          undefined
        ),
      (error) =>
        error instanceof
          LiveAccessError &&
        error.code ===
          "UNAUTHORIZED"
    );
  }
);

test(
  "live access rejects an invalid bearer token",
  () => {
    const access =
      gate();

    assert.throws(
      () =>
        access.authenticate(
          "Bearer wrong-token"
        ),
      (error) =>
        error instanceof
          LiveAccessError &&
        error.code ===
          "UNAUTHORIZED"
    );
  }
);

test(
  "live access accepts the configured bearer token",
  () => {
    const access =
      gate();

    assert.doesNotThrow(
      () =>
        access.authenticate(
          "Bearer secret-token"
        )
    );
  }
);

test(
  "live access rejects an unlisted repository",
  () => {
    const access =
      gate();

    assert.throws(
      () =>
        access
          .assertRepositoryAllowed(
            "attacker/other-repo"
          ),
      (error) =>
        error instanceof
          LiveAccessError &&
        error.code ===
          "REPOSITORY_NOT_ALLOWED"
    );
  }
);

test(
  "live access allows the configured repository case-insensitively",
  () => {
    const access =
      gate();

    assert.doesNotThrow(
      () =>
        access
          .assertRepositoryAllowed(
            "TOUHAF00/TP-CICD"
          )
    );
  }
);

test(
  "live access blocks concurrent assessments",
  () => {
    const access =
      gate();

    access.begin(1_000);

    assert.throws(
      () =>
        access.begin(
          2_000
        ),
      (error) =>
        error instanceof
          LiveAccessError &&
        error.code ===
          "BUSY"
    );

    access.end();
  }
);

test(
  "live access enforces the request quota and resets after the window",
  () => {
    const access =
      gate({
        maxRequests: 2,
        windowMs: 100
      });

    access.begin(1_000);
    access.end();

    access.begin(1_050);
    access.end();

    assert.throws(
      () =>
        access.begin(
          1_060
        ),
      (error) =>
        error instanceof
          LiveAccessError &&
        error.code ===
          "RATE_LIMITED"
    );

    assert.doesNotThrow(
      () =>
        access.begin(
          1_151
        )
    );

    access.end();
  }
);
