export type JsonPrimitive =
  | string
  | number
  | boolean
  | null;

export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | JsonObject;

export interface JsonObject {
  [key: string]: JsonValue;
}

export interface SubjectRef {
  provider: string;
  resource_type: string;
  resource_id: string;

  selector?: JsonObject;
}

export interface ResourceSnapshot {
  snapshot_id: string;

  subject: SubjectRef;

  version: string;

  observed_at: string;

  integrity_hash?: string;

  metadata?: JsonObject;
}

export interface ProposedAction {
  namespace: string;

  action: string;

  parameters: JsonObject;
}

export const HUMAN_APPROVAL_REQUIREMENTS = [
  "REQUIRED",
  "OPTIONAL",
  "NONE"
] as const;

export type HumanApprovalRequirement =
  (
    typeof HUMAN_APPROVAL_REQUIREMENTS
  )[number];

export interface PolicyDefinition {
  policy_id: string;
  version: string;

  name: string;
  objective: string;

  decision_rules: string[];

  human_approval:
    HumanApprovalRequirement;

  preflight_required: boolean;

  freshness?: {
    max_age_seconds: number;
  };
}

const IDENTIFIER =
  /^[a-z0-9][a-z0-9._-]*$/;

const SHA256 =
  /^[0-9a-f]{64}$/i;

function asObject(
  value: unknown,
  label: string
): Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new Error(
      `${label} must be a JSON object.`
    );
  }

  return value as
    Record<string, unknown>;
}

function requiredString(
  object: Record<string, unknown>,
  key: string,
  label: string
): string {
  const value =
    object[key];

  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    throw new Error(
      `${label}.${key} must be a non-empty string.`
    );
  }

  return value.trim();
}

function identifier(
  object: Record<string, unknown>,
  key: string,
  label: string
): string {
  const value =
    requiredString(
      object,
      key,
      label
    );

  if (!IDENTIFIER.test(value)) {
    throw new Error(
      `${label}.${key} must use lowercase letters, numbers, dot, underscore or hyphen.`
    );
  }

  return value;
}

function jsonValue(
  value: unknown,
  label: string,
  ancestors =
    new Set<object>()
): JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(
        `${label} contains a non-finite number.`
      );
    }

    return value;
  }

  if (Array.isArray(value)) {
    if (ancestors.has(value)) {
      throw new Error(
        `${label} contains a cyclic value.`
      );
    }

    ancestors.add(value);

    const result =
      value.map(
        (item, index) =>
          jsonValue(
            item,
            `${label}[${index}]`,
            ancestors
          )
      );

    ancestors.delete(value);

    return result;
  }

  if (
    typeof value === "object" &&
    value !== null
  ) {
    if (ancestors.has(value)) {
      throw new Error(
        `${label} contains a cyclic value.`
      );
    }

    ancestors.add(value);

    const result:
      JsonObject = {};

    for (
      const [key, item]
      of Object.entries(value)
    ) {
      result[key] =
        jsonValue(
          item,
          `${label}.${key}`,
          ancestors
        );
    }

    ancestors.delete(value);

    return result;
  }

  throw new Error(
    `${label} contains a value that is not JSON-compatible.`
  );
}

function jsonObject(
  value: unknown,
  label: string
): JsonObject {
  const object =
    asObject(
      value,
      label
    );

  return jsonValue(
    object,
    label
  ) as JsonObject;
}

function canonicalize(
  value: JsonValue
): string {
  if (value === null) {
    return "null";
  }

  if (
    typeof value === "string" ||
    typeof value === "boolean" ||
    typeof value === "number"
  ) {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return (
      "[" +
      value
        .map(canonicalize)
        .join(",") +
      "]"
    );
  }

  return (
    "{" +
    Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalize(
            value[key]
          )}`
      )
      .join(",") +
    "}"
  );
}

export function canonicalJson(
  value: unknown
): string {
  return canonicalize(
    jsonValue(
      value,
      "value"
    )
  );
}

export function validateSubjectRef(
  value: unknown,
  label = "SubjectRef"
): SubjectRef {
  const object =
    asObject(
      value,
      label
    );

  const provider =
    identifier(
      object,
      "provider",
      label
    );

  const resourceType =
    identifier(
      object,
      "resource_type",
      label
    );

  const resourceId =
    requiredString(
      object,
      "resource_id",
      label
    );

  const selector =
    object.selector === undefined
      ? undefined
      : jsonObject(
          object.selector,
          `${label}.selector`
        );

  return {
    provider,
    resource_type:
      resourceType,
    resource_id:
      resourceId,

    ...(selector
      ? { selector }
      : {})
  };
}

export function validateResourceSnapshot(
  value: unknown,
  label = "ResourceSnapshot"
): ResourceSnapshot {
  const object =
    asObject(
      value,
      label
    );

  const snapshotId =
    requiredString(
      object,
      "snapshot_id",
      label
    );

  const subject =
    validateSubjectRef(
      object.subject,
      `${label}.subject`
    );

  const version =
    requiredString(
      object,
      "version",
      label
    );

  const observedAt =
    requiredString(
      object,
      "observed_at",
      label
    );

  const parsedTime =
    Date.parse(
      observedAt
    );

  if (
    !Number.isFinite(
      parsedTime
    )
  ) {
    throw new Error(
      `${label}.observed_at must be a valid timestamp.`
    );
  }

  let integrityHash:
    string | undefined;

  if (
    object.integrity_hash !==
      undefined
  ) {
    integrityHash =
      requiredString(
        object,
        "integrity_hash",
        label
      ).toLowerCase();

    if (
      !SHA256.test(
        integrityHash
      )
    ) {
      throw new Error(
        `${label}.integrity_hash must be a SHA-256 hex digest.`
      );
    }
  }

  const metadata =
    object.metadata === undefined
      ? undefined
      : jsonObject(
          object.metadata,
          `${label}.metadata`
        );

  return {
    snapshot_id:
      snapshotId,

    subject,

    version,

    observed_at:
      new Date(
        parsedTime
      ).toISOString(),

    ...(integrityHash
      ? {
          integrity_hash:
            integrityHash
        }
      : {}),

    ...(metadata
      ? { metadata }
      : {})
  };
}

export function validateProposedAction(
  value: unknown,
  label = "ProposedAction"
): ProposedAction {
  const object =
    asObject(
      value,
      label
    );

  return {
    namespace:
      identifier(
        object,
        "namespace",
        label
      ),

    action:
      identifier(
        object,
        "action",
        label
      ),

    parameters:
      jsonObject(
        object.parameters,
        `${label}.parameters`
      )
  };
}

export function validatePolicyDefinition(
  value: unknown,
  label = "PolicyDefinition"
): PolicyDefinition {
  const object =
    asObject(
      value,
      label
    );

  const policyId =
    identifier(
      object,
      "policy_id",
      label
    );

  const version =
    requiredString(
      object,
      "version",
      label
    );

  const name =
    requiredString(
      object,
      "name",
      label
    );

  const objective =
    requiredString(
      object,
      "objective",
      label
    );

  if (
    !Array.isArray(
      object.decision_rules
    ) ||
    object.decision_rules.length ===
      0
  ) {
    throw new Error(
      `${label}.decision_rules must contain at least one rule.`
    );
  }

  const decisionRules =
    object.decision_rules.map(
      (rule, index) => {
        if (
          typeof rule !== "string" ||
          !rule.trim()
        ) {
          throw new Error(
            `${label}.decision_rules[${index}] must be a non-empty string.`
          );
        }

        return rule.trim();
      }
    );

  if (
    new Set(
      decisionRules
    ).size !==
    decisionRules.length
  ) {
    throw new Error(
      `${label}.decision_rules must not contain duplicates.`
    );
  }

  const humanApproval =
    object.human_approval;

  if (
    typeof humanApproval !==
      "string" ||
    !HUMAN_APPROVAL_REQUIREMENTS
      .includes(
        humanApproval as
          HumanApprovalRequirement
      )
  ) {
    throw new Error(
      `${label}.human_approval is invalid.`
    );
  }

  if (
    typeof object.preflight_required !==
      "boolean"
  ) {
    throw new Error(
      `${label}.preflight_required must be a boolean.`
    );
  }

  let freshness:
    PolicyDefinition["freshness"];

  if (
    object.freshness !== undefined
  ) {
    const freshnessObject =
      asObject(
        object.freshness,
        `${label}.freshness`
      );

    const maxAge =
      freshnessObject
        .max_age_seconds;

    if (
      !Number.isInteger(maxAge) ||
      Number(maxAge) <= 0
    ) {
      throw new Error(
        `${label}.freshness.max_age_seconds must be a positive integer.`
      );
    }

    freshness = {
      max_age_seconds:
        Number(maxAge)
    };
  }

  return {
    policy_id:
      policyId,

    version,
    name,
    objective,

    decision_rules:
      decisionRules,

    human_approval:
      humanApproval as
        HumanApprovalRequirement,

    preflight_required:
      object.preflight_required,

    ...(freshness
      ? { freshness }
      : {})
  };
}

export function sameSubject(
  left: unknown,
  right: unknown
): boolean {
  const a =
    validateSubjectRef(
      left,
      "left"
    );

  const b =
    validateSubjectRef(
      right,
      "right"
    );

  return (
    a.provider ===
      b.provider &&
    a.resource_type ===
      b.resource_type &&
    a.resource_id ===
      b.resource_id &&
    canonicalJson(
      a.selector ?? {}
    ) ===
      canonicalJson(
        b.selector ?? {}
      )
  );
}

export function snapshotMatchesSubject(
  snapshot: unknown,
  subject: unknown
): boolean {
  const resolved =
    validateResourceSnapshot(
      snapshot
    );

  return sameSubject(
    resolved.subject,
    subject
  );
}

export interface RuntimeIdentity {
  platform: string;

  worker_agent_id: string;
  guard_agent_id: string;

  worker_profile_version?: string;
  guard_profile_version?: string;

  tool_scope?: string[];
}

export interface AuthorizationRequest {
  request_id: string;

  subject: SubjectRef;

  snapshot: ResourceSnapshot;

  proposed_action:
    ProposedAction;

  policy:
    PolicyDefinition;

  runtime:
    RuntimeIdentity;

  requested_at: string;

  context?: JsonObject;
}

export function validateRuntimeIdentity(
  value: unknown,
  label = "RuntimeIdentity"
): RuntimeIdentity {
  const object =
    asObject(
      value,
      label
    );

  const platform =
    identifier(
      object,
      "platform",
      label
    );

  const workerAgentId =
    requiredString(
      object,
      "worker_agent_id",
      label
    );

  const guardAgentId =
    requiredString(
      object,
      "guard_agent_id",
      label
    );

  let workerProfileVersion:
    string | undefined;

  if (
    object.worker_profile_version !==
      undefined
  ) {
    workerProfileVersion =
      requiredString(
        object,
        "worker_profile_version",
        label
      );
  }

  let guardProfileVersion:
    string | undefined;

  if (
    object.guard_profile_version !==
      undefined
  ) {
    guardProfileVersion =
      requiredString(
        object,
        "guard_profile_version",
        label
      );
  }

  let toolScope:
    string[] | undefined;

  if (
    object.tool_scope !== undefined
  ) {
    if (
      !Array.isArray(
        object.tool_scope
      )
    ) {
      throw new Error(
        `${label}.tool_scope must be an array.`
      );
    }

    toolScope =
      object.tool_scope.map(
        (item, index) => {
          if (
            typeof item !== "string" ||
            !item.trim()
          ) {
            throw new Error(
              `${label}.tool_scope[${index}] must be a non-empty string.`
            );
          }

          return item.trim();
        }
      );

    if (
      new Set(toolScope).size !==
      toolScope.length
    ) {
      throw new Error(
        `${label}.tool_scope must not contain duplicates.`
      );
    }

    toolScope.sort();
  }

  return {
    platform,

    worker_agent_id:
      workerAgentId,

    guard_agent_id:
      guardAgentId,

    ...(workerProfileVersion
      ? {
          worker_profile_version:
            workerProfileVersion
        }
      : {}),

    ...(guardProfileVersion
      ? {
          guard_profile_version:
            guardProfileVersion
        }
      : {}),

    ...(toolScope
      ? {
          tool_scope:
            toolScope
        }
      : {})
  };
}

export function validateAuthorizationRequest(
  value: unknown,
  label = "AuthorizationRequest"
): AuthorizationRequest {
  const object =
    asObject(
      value,
      label
    );

  const requestId =
    requiredString(
      object,
      "request_id",
      label
    );

  const subject =
    validateSubjectRef(
      object.subject,
      `${label}.subject`
    );

  const snapshot =
    validateResourceSnapshot(
      object.snapshot,
      `${label}.snapshot`
    );

  if (
    !sameSubject(
      subject,
      snapshot.subject
    )
  ) {
    throw new Error(
      `${label}.snapshot must belong to the requested subject.`
    );
  }

  const proposedAction =
    validateProposedAction(
      object.proposed_action,
      `${label}.proposed_action`
    );

  const policy =
    validatePolicyDefinition(
      object.policy,
      `${label}.policy`
    );

  const runtime =
    validateRuntimeIdentity(
      object.runtime,
      `${label}.runtime`
    );

  const requestedAt =
    requiredString(
      object,
      "requested_at",
      label
    );

  const parsedTime =
    Date.parse(
      requestedAt
    );

  if (
    !Number.isFinite(
      parsedTime
    )
  ) {
    throw new Error(
      `${label}.requested_at must be a valid timestamp.`
    );
  }

  const context =
    object.context === undefined
      ? undefined
      : jsonObject(
          object.context,
          `${label}.context`
        );

  return {
    request_id:
      requestId,

    subject,
    snapshot,

    proposed_action:
      proposedAction,

    policy,
    runtime,

    requested_at:
      new Date(
        parsedTime
      ).toISOString(),

    ...(context
      ? { context }
      : {})
  };
}
