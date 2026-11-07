import assert from "node:assert/strict";
import test from "node:test";

import {
  GenericRuntimeAccessErrorV2,
  GenericRuntimeAccessGateV2
} from "../dist/api/v2/runtime-access.js";

test(
  "trusted runtime access is disabled without server configuration",
  () => {
    const gate =
      new GenericRuntimeAccessGateV2({
        accessToken:
          ""
      });

    assert.throws(
      () =>
        gate.authenticate(
          "Bearer anything"
        ),
      (error) =>
        error instanceof
          GenericRuntimeAccessErrorV2 &&
        error.code ===
          "DISABLED"
    );
  }
);

test(
  "trusted runtime requires a bearer token",
  () => {
    const gate =
      new GenericRuntimeAccessGateV2({
        accessToken:
          "runtime-secret"
      });

    assert.throws(
      () =>
        gate.authenticate(
          undefined
        ),
      (error) =>
        error instanceof
          GenericRuntimeAccessErrorV2 &&
        error.code ===
          "UNAUTHORIZED"
    );
  }
);

test(
  "trusted runtime rejects the wrong bearer token",
  () => {
    const gate =
      new GenericRuntimeAccessGateV2({
        accessToken:
          "runtime-secret"
      });

    assert.throws(
      () =>
        gate.authenticate(
          "Bearer wrong"
        ),
      (error) =>
        error instanceof
          GenericRuntimeAccessErrorV2 &&
        error.code ===
          "UNAUTHORIZED"
    );
  }
);

test(
  "trusted runtime accepts the configured bearer token",
  () => {
    const gate =
      new GenericRuntimeAccessGateV2({
        accessToken:
          "runtime-secret"
      });

    assert.doesNotThrow(
      () =>
        gate.authenticate(
          "Bearer runtime-secret"
        )
    );
  }
);
