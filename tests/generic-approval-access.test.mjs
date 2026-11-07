import assert from "node:assert/strict";
import test from "node:test";

import {
  GenericApprovalAccessErrorV2,
  GenericApprovalAccessGateV2
} from "../dist/api/v2/approval-access.js";

test(
  "approval access is disabled without server configuration",
  () => {
    const gate =
      new GenericApprovalAccessGateV2({
        accessToken:
          "",

        principalId:
          ""
      });

    assert.throws(
      () =>
        gate.authenticate(
          "Bearer anything"
        ),
      (error) =>
        error instanceof
          GenericApprovalAccessErrorV2 &&
        error.code ===
          "DISABLED"
    );
  }
);

test(
  "approval access requires a bearer token",
  () => {
    const gate =
      new GenericApprovalAccessGateV2({
        accessToken:
          "secret-token",

        principalId:
          "operator-1"
      });

    assert.throws(
      () =>
        gate.authenticate(
          undefined
        ),
      (error) =>
        error instanceof
          GenericApprovalAccessErrorV2 &&
        error.code ===
          "UNAUTHORIZED"
    );
  }
);

test(
  "approval access rejects the wrong bearer token",
  () => {
    const gate =
      new GenericApprovalAccessGateV2({
        accessToken:
          "secret-token",

        principalId:
          "operator-1"
      });

    assert.throws(
      () =>
        gate.authenticate(
          "Bearer wrong-token"
        ),
      (error) =>
        error instanceof
          GenericApprovalAccessErrorV2 &&
        error.code ===
          "UNAUTHORIZED"
    );
  }
);

test(
  "valid bearer token resolves the server-configured human principal",
  () => {
    const gate =
      new GenericApprovalAccessGateV2({
        accessToken:
          "secret-token",

        principalId:
          "operator-1",

        displayName:
          "Security Operator"
      });

    const principal =
      gate.authenticate(
        "Bearer secret-token"
      );

    assert.deepEqual(
      principal,
      {
        principal_type:
          "HUMAN",

        principal_id:
          "operator-1",

        display_name:
          "Security Operator",

        authentication_method:
          "bearer_token"
      }
    );
  }
);
