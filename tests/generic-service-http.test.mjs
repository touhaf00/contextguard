import assert from "node:assert/strict";
import test from "node:test";

import {
  GenericAuthorizationApiErrorV2
} from "../dist/api/v2/authorization.js";

import {
  GenericApprovalApiErrorV2
} from "../dist/api/v2/approval.js";

import {
  AuthorizationSessionStoreErrorV2
} from "../dist/api/v2/session-store.js";

import {
  GenericApprovalAccessGateV2
} from "../dist/api/v2/approval-access.js";

import {
  GenericAuthorizationServiceHttpV2
} from "../dist/api/v2/service-http.js";

import {
  GenericRuntimeAccessGateV2
} from "../dist/api/v2/runtime-access.js";

import {
  GenericAuthorizationServiceErrorV2
} from "../dist/api/v2/service.js";

import {
  GenericPreflightError
} from "../dist/core/preflight.js";

function gate() {
  return new GenericApprovalAccessGateV2({
    accessToken:
      "secret",

    principalId:
      "operator-1"
  });
}

function runtimeGate() {
  return new GenericRuntimeAccessGateV2({
    accessToken:
      "runtime-secret"
  });
}

test(
  "stateful authorization HTTP delegates to the authorization service",
  () => {
    const service = {
      authorize(body) {
        return {
          api_version:
            "2",

          request_id:
            "req-1",

          status:
            "STOPPED_UNKNOWN",

          next_step:
            "STOP",

          decision: {
            received:
              body
          },

          execution_configured:
            false,

          external_action_executed:
            false
        };
      },

      approve() {
        throw new Error(
          "unused"
        );
      }
    };

    const http =
      new GenericAuthorizationServiceHttpV2(
        service,
        gate(),
        runtimeGate()
      );

    const result =
      http.authorize(
        {
          hello:
            "world"
        },
        "Bearer runtime-secret"
      );

    assert.equal(
      result.status,
      200
    );

    assert.equal(
      result.body.request_id,
      "req-1"
    );
  }
);

test(
  "authorization validation errors become HTTP 400",
  () => {
    const service = {
      authorize() {
        throw new GenericAuthorizationApiErrorV2(
          "INVALID_BODY",
          "bad request"
        );
      },

      approve() {
        throw new Error(
          "unused"
        );
      }
    };

    const http =
      new GenericAuthorizationServiceHttpV2(
        service,
        gate(),
        runtimeGate()
      );

    const result =
      http.authorize(
        {},
        "Bearer runtime-secret"
      );

    assert.equal(
      result.status,
      400
    );

    assert.equal(
      result.body.error.code,
      "INVALID_BODY"
    );
  }
);

test(
  "approval HTTP authenticates principal outside the request body",
  () => {
    let receivedPrincipal;

    const service = {
      authorize() {
        throw new Error(
          "unused"
        );
      },

      approve(
        body,
        principal
      ) {
        receivedPrincipal =
          principal;

        return {
          api_version:
            "2",

          session_id:
            body.session_id,

          request_id:
            "req-1",

          status:
            "READY_FOR_PREFLIGHT",

          next_step:
            "RUN_PREFLIGHT",

          approval: {
            approval_id:
              "approval-1",

            decision:
              "APPROVED",

            decided_at:
              "2026-11-02T00:00:00.000Z"
          },

          execution_configured:
            false,

          external_action_executed:
            false
        };
      }
    };

    const http =
      new GenericAuthorizationServiceHttpV2(
        service,
        gate(),
        runtimeGate()
      );

    const result =
      http.approve(
        {
          session_id:
            "session-1",

          decision:
            "APPROVED"
        },
        "Bearer secret"
      );

    assert.equal(
      result.status,
      200
    );

    assert.equal(
      receivedPrincipal
        .principal_id,
      "operator-1"
    );

    assert.equal(
      receivedPrincipal
        .authentication_method,
      "bearer_token"
    );
  }
);

test(
  "approval HTTP rejects callers without the configured token",
  () => {
    let called =
      false;

    const service = {
      authorize() {
        throw new Error(
          "unused"
        );
      },

      approve() {
        called =
          true;

        throw new Error(
          "must not execute"
        );
      }
    };

    const http =
      new GenericAuthorizationServiceHttpV2(
        service,
        gate(),
        runtimeGate()
      );

    const result =
      http.approve(
        {
          session_id:
            "session-1",

          decision:
            "APPROVED"
        },
        undefined
      );

    assert.equal(
      result.status,
      401
    );

    assert.equal(
      called,
      false
    );
  }
);

test(
  "unknown sessions become HTTP 404",
  () => {
    const service = {
      authorize() {
        throw new Error(
          "unused"
        );
      },

      approve() {
        throw new AuthorizationSessionStoreErrorV2(
          "NOT_FOUND",
          "session not found"
        );
      }
    };

    const http =
      new GenericAuthorizationServiceHttpV2(
        service,
        gate(),
        runtimeGate()
      );

    const result =
      http.approve(
        {
          session_id:
            "missing",

          decision:
            "APPROVED"
        },
        "Bearer secret"
      );

    assert.equal(
      result.status,
      404
    );

    assert.equal(
      result.body.error.code,
      "NOT_FOUND"
    );
  }
);

test(
  "duplicate human decisions become HTTP 409",
  () => {
    const service = {
      authorize() {
        throw new Error(
          "unused"
        );
      },

      approve() {
        throw new GenericApprovalApiErrorV2(
          "ALREADY_DECIDED",
          "already decided"
        );
      }
    };

    const http =
      new GenericAuthorizationServiceHttpV2(
        service,
        gate(),
        runtimeGate()
      );

    const result =
      http.approve(
        {
          session_id:
            "session-1",

          decision:
            "APPROVED"
        },
        "Bearer secret"
      );

    assert.equal(
      result.status,
      409
    );

    assert.equal(
      result.body.external_action_executed,
      false
    );
  }
);

test(
  "authorization HTTP rejects an untrusted caller before evaluating its pipeline",
  () => {
    let called =
      false;

    const service = {
      authorize() {
        called =
          true;

        throw new Error(
          "must not run"
        );
      },

      approve() {
        throw new Error(
          "unused"
        );
      },

      async preflight() {
        throw new Error(
          "unused"
        );
      }
    };

    const http =
      new GenericAuthorizationServiceHttpV2(
        service,
        gate(),
        runtimeGate()
      );

    const result =
      http.authorize(
        {
          guard_verification: {
            verdict:
              "PASS"
          }
        },
        undefined
      );

    assert.equal(
      result.status,
      401
    );

    assert.equal(
      called,
      false
    );
  }
);

test(
  "preflight HTTP delegates only after trusted runtime authentication",
  async () => {
    let called =
      false;

    const service = {
      authorize() {
        throw new Error(
          "unused"
        );
      },

      approve() {
        throw new Error(
          "unused"
        );
      },

      async preflight(
        body
      ) {
        called =
          true;

        return {
          api_version:
            "2",

          session_id:
            body.session_id,

          request_id:
            "req-1",

          status:
            "AUTHORIZED_FOR_EXECUTOR",

          next_step:
            "TRUSTED_EXECUTOR",

          preflight: {
            status:
              "PRE_EXECUTION_VERIFIED"
          },

          execution_configured:
            false,

          external_action_executed:
            false
        };
      }
    };

    const http =
      new GenericAuthorizationServiceHttpV2(
        service,
        gate(),
        runtimeGate()
      );

    const result =
      await http.preflight(
        {
          session_id:
            "session-1"
        },
        "Bearer runtime-secret"
      );

    assert.equal(
      result.status,
      200
    );

    assert.equal(
      called,
      true
    );

    assert.equal(
      result.body.status,
      "AUTHORIZED_FOR_EXECUTOR"
    );

    assert.equal(
      result.body.external_action_executed,
      false
    );
  }
);

test(
  "preflight HTTP rejects callers without trusted runtime credentials",
  async () => {
    let called =
      false;

    const service = {
      authorize() {
        throw new Error(
          "unused"
        );
      },

      approve() {
        throw new Error(
          "unused"
        );
      },

      async preflight() {
        called =
          true;

        throw new Error(
          "must not run"
        );
      }
    };

    const http =
      new GenericAuthorizationServiceHttpV2(
        service,
        gate(),
        runtimeGate()
      );

    const result =
      await http.preflight(
        {
          session_id:
            "session-1"
        },
        undefined
      );

    assert.equal(
      result.status,
      401
    );

    assert.equal(
      called,
      false
    );
  }
);

test(
  "unconfigured preflight dependencies become HTTP 503",
  async () => {
    const service = {
      authorize() {
        throw new Error(
          "unused"
        );
      },

      approve() {
        throw new Error(
          "unused"
        );
      },

      async preflight() {
        throw new GenericAuthorizationServiceErrorV2(
          "PREFLIGHT_NOT_CONFIGURED",
          "preflight not configured"
        );
      }
    };

    const http =
      new GenericAuthorizationServiceHttpV2(
        service,
        gate(),
        runtimeGate()
      );

    const result =
      await http.preflight(
        {
          session_id:
            "session-1"
        },
        "Bearer runtime-secret"
      );

    assert.equal(
      result.status,
      503
    );

    assert.equal(
      result.body.error.code,
      "PREFLIGHT_NOT_CONFIGURED"
    );

    assert.equal(
      result.body.external_action_executed,
      false
    );
  }
);

test(
  "preflight integrity drift becomes HTTP 409",
  async () => {
    const service = {
      authorize() {
        throw new Error(
          "unused"
        );
      },

      approve() {
        throw new Error(
          "unused"
        );
      },

      async preflight() {
        throw new GenericPreflightError(
          "SNAPSHOT_CHANGED",
          "resource changed"
        );
      }
    };

    const http =
      new GenericAuthorizationServiceHttpV2(
        service,
        gate(),
        runtimeGate()
      );

    const result =
      await http.preflight(
        {
          session_id:
            "session-1"
        },
        "Bearer runtime-secret"
      );

    assert.equal(
      result.status,
      409
    );

    assert.equal(
      result.body.error.code,
      "SNAPSHOT_CHANGED"
    );
  }
);

test(
  "execution context HTTP is restricted to trusted runtime callers",
  () => {
    let called =
      false;

    const service = {
      authorize() {
        throw new Error(
          "unused"
        );
      },

      approve() {
        throw new Error(
          "unused"
        );
      },

      async preflight() {
        throw new Error(
          "unused"
        );
      }
    };

    const contextApi = {
      update() {
        called =
          true;

        return {
          api_version:
            "2",

          session_id:
            "session-1",

          request_id:
            "request-1",

          status:
            "TRUSTED_EXECUTION_CONTEXT_UPDATED",

          execution_configured:
            false,

          external_action_executed:
            false
        };
      }
    };

    const http =
      new GenericAuthorizationServiceHttpV2(
        service,
        gate(),
        runtimeGate(),
        contextApi
      );

    const result =
      http.executionContext(
        {
          session_id:
            "session-1"
        },
        undefined
      );

    assert.equal(
      result.status,
      401
    );

    assert.equal(
      called,
      false
    );
  }
);

test(
  "execution context HTTP delegates after trusted runtime authentication",
  () => {
    let received;

    const service = {
      authorize() {
        throw new Error(
          "unused"
        );
      },

      approve() {
        throw new Error(
          "unused"
        );
      },

      async preflight() {
        throw new Error(
          "unused"
        );
      }
    };

    const contextApi = {
      update(
        body
      ) {
        received =
          body;

        return {
          api_version:
            "2",

          session_id:
            body.session_id,

          request_id:
            "request-1",

          status:
            "TRUSTED_EXECUTION_CONTEXT_UPDATED",

          execution_configured:
            false,

          external_action_executed:
            false
        };
      }
    };

    const http =
      new GenericAuthorizationServiceHttpV2(
        service,
        gate(),
        runtimeGate(),
        contextApi
      );

    const result =
      http.executionContext(
        {
          session_id:
            "session-1",

          proposed_action: {},
          policy: {},
          runtime: {}
        },
        "Bearer runtime-secret"
      );

    assert.equal(
      result.status,
      200
    );

    assert.equal(
      received.session_id,
      "session-1"
    );

    assert.equal(
      result.body.status,
      "TRUSTED_EXECUTION_CONTEXT_UPDATED"
    );

    assert.equal(
      result.body.external_action_executed,
      false
    );
  }
);

test(
  "execution context HTTP fails closed when updater is not configured",
  () => {
    const service = {
      authorize() {
        throw new Error(
          "unused"
        );
      },

      approve() {
        throw new Error(
          "unused"
        );
      },

      async preflight() {
        throw new Error(
          "unused"
        );
      }
    };

    const http =
      new GenericAuthorizationServiceHttpV2(
        service,
        gate(),
        runtimeGate()
      );

    const result =
      http.executionContext(
        {
          session_id:
            "session-1"
        },
        "Bearer runtime-secret"
      );

    assert.equal(
      result.status,
      503
    );

    assert.equal(
      result.body.error.code,
      "EXECUTION_CONTEXT_NOT_CONFIGURED"
    );
  }
);
