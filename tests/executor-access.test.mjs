import assert from "node:assert/strict";
import test from "node:test";

import {
  GenericExecutorAccessErrorV2,
  GenericExecutorAccessGateV2
} from "../dist/api/v2/executor-access.js";

function expectCode(
  fn,
  code
) {
  assert.throws(
    fn,
    error =>
      error instanceof
        GenericExecutorAccessErrorV2 &&
      error.code ===
        code
  );
}

test(
  "executor access is disabled without server credential",
  () => {
    const gate =
      new GenericExecutorAccessGateV2({
        accessToken:
          ""
      });

    expectCode(
      () =>
        gate.authenticate(
          "Bearer anything"
        ),
      "DISABLED"
    );
  }
);

test(
  "executor access requires bearer credential",
  () => {
    const gate =
      new GenericExecutorAccessGateV2({
        accessToken:
          "executor-secret"
      });

    expectCode(
      () =>
        gate.authenticate(
          undefined
        ),
      "UNAUTHORIZED"
    );
  }
);

test(
  "executor access rejects wrong bearer credential",
  () => {
    const gate =
      new GenericExecutorAccessGateV2({
        accessToken:
          "executor-secret"
      });

    expectCode(
      () =>
        gate.authenticate(
          "Bearer runtime-secret"
        ),
      "UNAUTHORIZED"
    );
  }
);

test(
  "executor access accepts only configured executor credential",
  () => {
    const gate =
      new GenericExecutorAccessGateV2({
        accessToken:
          "executor-secret"
      });

    assert.doesNotThrow(
      () =>
        gate.authenticate(
          "Bearer executor-secret"
        )
    );
  }
);
