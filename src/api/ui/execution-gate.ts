export interface ContextGuardUiExecutionDisabledResponseV2 {
  api_version:
    "2";

  error: {
    code:
      "REAL_EXECUTION_DISABLED";

    message:
      string;
  };

  execution_configured:
    false;

  external_action_executed:
    false;
}

export type ContextGuardUiExecutionGateResultV2 =
  | {
      allowed:
        true;
    }
  | {
      allowed:
        false;

      status:
        403;

      body:
        ContextGuardUiExecutionDisabledResponseV2;
    };

export function contextGuardUiExecutionConfiguredV2(
  executorAvailable:
    boolean,

  uiRealExecutionEnabled:
    boolean
): boolean {
  return (
    executorAvailable ===
      true &&
    uiRealExecutionEnabled ===
      true
  );
}

export function contextGuardUiExecutionGateV2(
  enabled:
    boolean
): ContextGuardUiExecutionGateResultV2 {
  if (
    enabled === true
  ) {
    return {
      allowed:
        true
    };
  }

  return {
    allowed:
      false,

    status:
      403,

    body: {
      api_version:
        "2",

      error: {
        code:
          "REAL_EXECUTION_DISABLED",

        message:
          "Real external execution through the browser UI is disabled by server configuration."
      },

      execution_configured:
        false,

      external_action_executed:
        false
    }
  };
}
