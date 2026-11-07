import assert from "node:assert/strict";
import test from "node:test";

import {
  contextGuardUiExecutionConfiguredV2,
  contextGuardUiExecutionGateV2
} from "../dist/api/ui/execution-gate.js";

test(
  "UI real execution is denied when server kill switch is disabled",
  () => {
    const result =
      contextGuardUiExecutionGateV2(
        false
      );

    assert.equal(
      result.allowed,
      false
    );

    assert.equal(
      result.status,
      403
    );

    assert.equal(
      result.body
        .error
        .code,
      "REAL_EXECUTION_DISABLED"
    );

    assert.equal(
      result.body
        .external_action_executed,
      false
    );
  }
);

test(
  "UI real execution may continue only when server kill switch is explicitly enabled",
  () => {
    const result =
      contextGuardUiExecutionGateV2(
        true
      );

    assert.deepEqual(
      result,
      {
        allowed:
          true
      }
    );
  }
);


test(
  "browser execution truth requires both executor and kill switch",
  () => {
    const cases = [
      {
        executorAvailable:
          false,
        killSwitchEnabled:
          false,
        expected:
          false
      },
      {
        executorAvailable:
          false,
        killSwitchEnabled:
          true,
        expected:
          false
      },
      {
        executorAvailable:
          true,
        killSwitchEnabled:
          false,
        expected:
          false
      },
      {
        executorAvailable:
          true,
        killSwitchEnabled:
          true,
        expected:
          true
      }
    ];

    for (
      const current
      of cases
    ) {
      assert.equal(
        contextGuardUiExecutionConfiguredV2(
          current.executorAvailable,
          current.killSwitchEnabled
        ),
        current.expected,
        `executor=${current.executorAvailable}, killSwitch=${current.killSwitchEnabled}`
      );
    }
  }
);
