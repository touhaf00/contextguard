import assert from "node:assert/strict";
import test from "node:test";

import {
  ContextGuardUiAccessErrorV2,
  ContextGuardUiAccessGateV2
} from "../dist/api/ui/access.js";

test(
  "UI access is disabled without server configuration",
  () => {
    const gate =
      new ContextGuardUiAccessGateV2({
        accessToken: "",
        principalId: ""
      });

    assert.throws(
      () =>
        gate.authenticate(
          "Bearer anything"
        ),
      error =>
        error instanceof
          ContextGuardUiAccessErrorV2 &&
        error.code ===
          "DISABLED"
    );
  }
);

test(
  "UI access requires bearer authentication",
  () => {
    const gate =
      new ContextGuardUiAccessGateV2({
        accessToken:
          "ui-secret",

        principalId:
          "operator-1"
      });

    assert.throws(
      () =>
        gate.authenticate(
          undefined
        ),
      error =>
        error instanceof
          ContextGuardUiAccessErrorV2 &&
        error.code ===
          "UNAUTHORIZED"
    );
  }
);

test(
  "UI access rejects wrong bearer credential",
  () => {
    const gate =
      new ContextGuardUiAccessGateV2({
        accessToken:
          "ui-secret",

        principalId:
          "operator-1"
      });

    assert.throws(
      () =>
        gate.authenticate(
          "Bearer wrong-secret"
        ),
      error =>
        error instanceof
          ContextGuardUiAccessErrorV2 &&
        error.code ===
          "UNAUTHORIZED"
    );
  }
);

test(
  "UI access resolves authenticated human principal",
  () => {
    const gate =
      new ContextGuardUiAccessGateV2({
        accessToken:
          "ui-secret",

        principalId:
          "operator-1",

        displayName:
          "ContextGuard Operator"
      });

    assert.deepEqual(
      gate.authenticate(
        "Bearer ui-secret"
      ),
      {
        principal_type:
          "HUMAN",

        principal_id:
          "operator-1",

        display_name:
          "ContextGuard Operator",

        authentication_method:
          "bearer_token"
      }
    );
  }
);
