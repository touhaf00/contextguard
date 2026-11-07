import {
  randomUUID
} from "node:crypto";

import {
  digestCanonicalJson
} from "../../core/authorization-integrity.js";

import {
  verifyExecutionAuthorizationReceiptIntegrityV2
} from "./execution-receipt.js";

import type {
  ExecutionAuthorizationReceiptV2
} from "./execution-receipt.js";

export const EXECUTION_RECEIPT_STORE_RECORD_VERSION =
  "2" as const;

export const EXECUTION_RECEIPT_CONSUMPTION_VERSION =
  "2" as const;

const SHA256 =
  /^[0-9a-f]{64}$/i;

const DEFAULT_CAPACITY =
  100;

export type ExecutionReceiptStoreStateV2 =
  | "AVAILABLE"
  | "CONSUMED";

export type ExecutionReceiptStoreErrorCodeV2 =
  | "INVALID_RECEIPT"
  | "INVALID_TIME"
  | "DUPLICATE_RECEIPT"
  | "DUPLICATE_LOCK"
  | "NOT_FOUND"
  | "EXPIRED"
  | "ALREADY_CONSUMED"
  | "DIGEST_MISMATCH"
  | "CAPACITY_REACHED"
  | "INVALID_RECORD";

export class ExecutionReceiptStoreErrorV2
  extends Error {
  constructor(
    public readonly code:
      ExecutionReceiptStoreErrorCodeV2,

    message:
      string
  ) {
    super(message);
  }
}

export interface ExecutionReceiptStoreRecordV2 {
  record_version:
    typeof EXECUTION_RECEIPT_STORE_RECORD_VERSION;

  receipt_id:
    string;

  receipt_digest:
    string;

  lock_fingerprint:
    string;

  state:
    ExecutionReceiptStoreStateV2;

  receipt:
    ExecutionAuthorizationReceiptV2;

  stored_at:
    string;

  consumed_at?:
    string;

  consumption_id?:
    string;

  record_digest:
    string;
}

export interface ExecutionReceiptConsumptionV2 {
  consumption_version:
    typeof EXECUTION_RECEIPT_CONSUMPTION_VERSION;

  consumption_id:
    string;

  receipt_id:
    string;

  receipt_digest:
    string;

  lock_id:
    string;

  lock_fingerprint:
    string;

  action_digest:
    string;

  authorized_snapshot_version:
    string;

  status:
    "CONSUMED_FOR_EXECUTION";

  consumed_at:
    string;

  execution_configured:
    false;

  external_action_executed:
    false;

  consumption_digest:
    string;
}

export interface ExecutionReceiptStoreOptionsV2 {
  capacity?:
    number;

  now?:
    () => Date;
}

export interface StoreExecutionReceiptOptionsV2 {
  storedAt?:
    string;
}

export interface ConsumeExecutionReceiptOptionsV2 {
  consumedAt?:
    string;

  consumptionId?:
    string;
}

function clone<T>(
  value:
    T
): T {
  return JSON.parse(
    JSON.stringify(value)
  ) as T;
}

function normalizeTimestamp(
  value:
    unknown,

  label:
    string
): string {
  if (
    typeof value !==
      "string" ||
    !value.trim()
  ) {
    throw new ExecutionReceiptStoreErrorV2(
      "INVALID_TIME",
      `${label} must be a non-empty timestamp.`
    );
  }

  const parsed =
    Date.parse(
      value
    );

  if (
    !Number.isFinite(
      parsed
    )
  ) {
    throw new ExecutionReceiptStoreErrorV2(
      "INVALID_TIME",
      `${label} must be a valid timestamp.`
    );
  }

  return new Date(
    parsed
  ).toISOString();
}

function requiredString(
  value:
    unknown,

  label:
    string
): string {
  if (
    typeof value !==
      "string" ||
    !value.trim()
  ) {
    throw new ExecutionReceiptStoreErrorV2(
      "INVALID_RECEIPT",
      `${label} must be a non-empty string.`
    );
  }

  return value.trim();
}

function requiredSha256(
  value:
    unknown,

  label:
    string
): string {
  const normalized =
    requiredString(
      value,
      label
    ).toLowerCase();

  if (
    !SHA256.test(
      normalized
    )
  ) {
    throw new ExecutionReceiptStoreErrorV2(
      "INVALID_RECEIPT",
      `${label} must be a SHA-256 hex digest.`
    );
  }

  return normalized;
}

function validateReceipt(
  value:
    unknown
): ExecutionAuthorizationReceiptV2 {
  if (
    !verifyExecutionAuthorizationReceiptIntegrityV2(
      value
    )
  ) {
    throw new ExecutionReceiptStoreErrorV2(
      "INVALID_RECEIPT",
      "Execution authorization receipt failed integrity verification."
    );
  }

  const receipt =
    value as
      ExecutionAuthorizationReceiptV2;

  requiredString(
    receipt.receipt_id,
    "ExecutionAuthorizationReceiptV2.receipt_id"
  );

  requiredString(
    receipt.session_id,
    "ExecutionAuthorizationReceiptV2.session_id"
  );

  requiredString(
    receipt.request_id,
    "ExecutionAuthorizationReceiptV2.request_id"
  );

  requiredString(
    receipt.lock_id,
    "ExecutionAuthorizationReceiptV2.lock_id"
  );

  requiredSha256(
    receipt.lock_fingerprint,
    "ExecutionAuthorizationReceiptV2.lock_fingerprint"
  );

  requiredSha256(
    receipt.receipt_digest,
    "ExecutionAuthorizationReceiptV2.receipt_digest"
  );

  requiredSha256(
    receipt.action_digest,
    "ExecutionAuthorizationReceiptV2.action_digest"
  );

  requiredSha256(
    receipt.policy_digest,
    "ExecutionAuthorizationReceiptV2.policy_digest"
  );

  requiredSha256(
    receipt.runtime_digest,
    "ExecutionAuthorizationReceiptV2.runtime_digest"
  );

  requiredSha256(
    receipt.preflight_response_digest,
    "ExecutionAuthorizationReceiptV2.preflight_response_digest"
  );

  if (
    receipt.action_digest !==
    digestCanonicalJson(
      receipt.proposed_action
    )
  ) {
    throw new ExecutionReceiptStoreErrorV2(
      "INVALID_RECEIPT",
      "Execution receipt action digest does not match its proposed action."
    );
  }

  const issuedAt =
    normalizeTimestamp(
      receipt.issued_at,
      "ExecutionAuthorizationReceiptV2.issued_at"
    );

  const expiresAt =
    normalizeTimestamp(
      receipt.expires_at,
      "ExecutionAuthorizationReceiptV2.expires_at"
    );

  if (
    Date.parse(
      expiresAt
    ) <=
    Date.parse(
      issuedAt
    )
  ) {
    throw new ExecutionReceiptStoreErrorV2(
      "INVALID_RECEIPT",
      "Execution authorization receipt must expire after issuance."
    );
  }

  return clone(
    receipt
  );
}

function recordMaterial(
  value:
    Omit<
      ExecutionReceiptStoreRecordV2,
      "record_digest"
    >
) {
  return {
    record_version:
      value.record_version,

    receipt_id:
      value.receipt_id,

    receipt_digest:
      value.receipt_digest,

    lock_fingerprint:
      value.lock_fingerprint,

    state:
      value.state,

    stored_at:
      value.stored_at,

    ...(value.consumed_at
      ? {
          consumed_at:
            value.consumed_at
        }
      : {}),

    ...(value.consumption_id
      ? {
          consumption_id:
            value.consumption_id
        }
      : {})
  };
}

function validateStoredRecord(
  value:
    ExecutionReceiptStoreRecordV2
): ExecutionReceiptStoreRecordV2 {
  const receipt =
    validateReceipt(
      value.receipt
    );

  if (
    value.record_version !==
      EXECUTION_RECEIPT_STORE_RECORD_VERSION ||
    value.receipt_id !==
      receipt.receipt_id ||
    value.receipt_digest !==
      receipt.receipt_digest ||
    value.lock_fingerprint !==
      receipt.lock_fingerprint
  ) {
    throw new ExecutionReceiptStoreErrorV2(
      "INVALID_RECORD",
      "Stored execution receipt record binding is invalid."
    );
  }

  if (
    value.state !==
      "AVAILABLE" &&
    value.state !==
      "CONSUMED"
  ) {
    throw new ExecutionReceiptStoreErrorV2(
      "INVALID_RECORD",
      "Stored execution receipt state is invalid."
    );
  }

  if (
    value.state ===
      "AVAILABLE" &&
    (
      value.consumed_at !==
        undefined ||
      value.consumption_id !==
        undefined
    )
  ) {
    throw new ExecutionReceiptStoreErrorV2(
      "INVALID_RECORD",
      "Available receipt must not contain consumption metadata."
    );
  }

  if (
    value.state ===
      "CONSUMED" &&
    (
      !value.consumed_at ||
      !value.consumption_id
    )
  ) {
    throw new ExecutionReceiptStoreErrorV2(
      "INVALID_RECORD",
      "Consumed receipt requires consumption metadata."
    );
  }

  const storedAt =
    normalizeTimestamp(
      value.stored_at,
      "ExecutionReceiptStoreRecordV2.stored_at"
    );

  const base:
    Omit<
      ExecutionReceiptStoreRecordV2,
      "record_digest"
    > = {
    record_version:
      EXECUTION_RECEIPT_STORE_RECORD_VERSION,

    receipt_id:
      receipt.receipt_id,

    receipt_digest:
      receipt.receipt_digest,

    lock_fingerprint:
      receipt.lock_fingerprint,

    state:
      value.state,

    receipt,

    stored_at:
      storedAt,

    ...(value.consumed_at
      ? {
          consumed_at:
            normalizeTimestamp(
              value.consumed_at,
              "ExecutionReceiptStoreRecordV2.consumed_at"
            )
        }
      : {}),

    ...(value.consumption_id
      ? {
          consumption_id:
            requiredString(
              value.consumption_id,
              "ExecutionReceiptStoreRecordV2.consumption_id"
            )
        }
      : {})
  };

  if (
    value.record_digest !==
    digestCanonicalJson(
      recordMaterial(
        base
      )
    )
  ) {
    throw new ExecutionReceiptStoreErrorV2(
      "INVALID_RECORD",
      "Stored execution receipt record digest verification failed."
    );
  }

  return {
    ...base,

    record_digest:
      value.record_digest
  };
}

function consumptionMaterial(
  value:
    Omit<
      ExecutionReceiptConsumptionV2,
      "consumption_digest"
    >
) {
  return value;
}

export class ExecutionAuthorizationReceiptStoreV2 {
  private readonly records =
    new Map<
      string,
      ExecutionReceiptStoreRecordV2
    >();

  private readonly capacity:
    number;

  private readonly now:
    () => Date;

  constructor(
    options:
      ExecutionReceiptStoreOptionsV2 = {}
  ) {
    this.capacity =
      options.capacity ??
      DEFAULT_CAPACITY;

    if (
      !Number.isInteger(
        this.capacity
      ) ||
      this.capacity <= 0
    ) {
      throw new ExecutionReceiptStoreErrorV2(
        "CAPACITY_REACHED",
        "Execution receipt store capacity must be a positive integer."
      );
    }

    this.now =
      options.now ??
      (() => new Date());
  }

  record(
    receiptValue:
      unknown,

    options:
      StoreExecutionReceiptOptionsV2 = {}
  ): ExecutionReceiptStoreRecordV2 {
    const receipt =
      validateReceipt(
        receiptValue
      );

    if (
      this.records.has(
        receipt.receipt_id
      )
    ) {
      throw new ExecutionReceiptStoreErrorV2(
        "DUPLICATE_RECEIPT",
        "Execution authorization receipt is already stored."
      );
    }

    for (
      const record
      of this.records.values()
    ) {
      if (
        record.lock_fingerprint ===
          receipt.lock_fingerprint
      ) {
        throw new ExecutionReceiptStoreErrorV2(
          "DUPLICATE_LOCK",
          "An execution receipt already exists for this ActionLock."
        );
      }
    }

    if (
      this.records.size >=
        this.capacity
    ) {
      throw new ExecutionReceiptStoreErrorV2(
        "CAPACITY_REACHED",
        "Execution receipt store capacity has been reached."
      );
    }

    const storedAt =
      normalizeTimestamp(
        options.storedAt ??
          this.now()
            .toISOString(),
        "ExecutionReceiptStoreRecordV2.stored_at"
      );

    if (
      Date.parse(
        storedAt
      ) <
      Date.parse(
        receipt.issued_at
      )
    ) {
      throw new ExecutionReceiptStoreErrorV2(
        "INVALID_TIME",
        "Execution receipt cannot be stored before it was issued."
      );
    }

    if (
      Date.parse(
        storedAt
      ) >=
      Date.parse(
        receipt.expires_at
      )
    ) {
      throw new ExecutionReceiptStoreErrorV2(
        "EXPIRED",
        "Execution authorization receipt expired before storage."
      );
    }

    const base:
      Omit<
        ExecutionReceiptStoreRecordV2,
        "record_digest"
      > = {
      record_version:
        EXECUTION_RECEIPT_STORE_RECORD_VERSION,

      receipt_id:
        receipt.receipt_id,

      receipt_digest:
        receipt.receipt_digest,

      lock_fingerprint:
        receipt.lock_fingerprint,

      state:
        "AVAILABLE",

      receipt:
        clone(
          receipt
        ),

      stored_at:
        storedAt
    };

    const record:
      ExecutionReceiptStoreRecordV2 = {
      ...base,

      record_digest:
        digestCanonicalJson(
          recordMaterial(
            base
          )
        )
    };

    this.records.set(
      receipt.receipt_id,
      clone(
        record
      )
    );

    return clone(
      record
    );
  }

  get(
    receiptIdValue:
      string
  ): ExecutionReceiptStoreRecordV2 {
    const receiptId =
      receiptIdValue.trim();

    const record =
      this.records.get(
        receiptId
      );

    if (!record) {
      throw new ExecutionReceiptStoreErrorV2(
        "NOT_FOUND",
        "Execution authorization receipt was not found."
      );
    }

    return clone(
      validateStoredRecord(
        record
      )
    );
  }

  consume(
    receiptIdValue:
      string,

    expectedReceiptDigestValue:
      string,

    options:
      ConsumeExecutionReceiptOptionsV2 = {}
  ): ExecutionReceiptConsumptionV2 {
    const record =
      this.get(
        receiptIdValue
      );

    const expectedDigest =
      requiredSha256(
        expectedReceiptDigestValue,
        "expectedReceiptDigest"
      );

    if (
      expectedDigest !==
        record.receipt_digest
    ) {
      throw new ExecutionReceiptStoreErrorV2(
        "DIGEST_MISMATCH",
        "Execution receipt digest does not match the stored authorization."
      );
    }

    if (
      record.state ===
        "CONSUMED"
    ) {
      throw new ExecutionReceiptStoreErrorV2(
        "ALREADY_CONSUMED",
        "Execution authorization receipt has already been consumed."
      );
    }

    const consumedAt =
      normalizeTimestamp(
        options.consumedAt ??
          this.now()
            .toISOString(),
        "ExecutionReceiptConsumptionV2.consumed_at"
      );

    if (
      Date.parse(
        consumedAt
      ) <
      Date.parse(
        record.stored_at
      )
    ) {
      throw new ExecutionReceiptStoreErrorV2(
        "INVALID_TIME",
        "Execution receipt cannot be consumed before storage."
      );
    }

    if (
      Date.parse(
        consumedAt
      ) >=
      Date.parse(
        record.receipt
          .expires_at
      )
    ) {
      throw new ExecutionReceiptStoreErrorV2(
        "EXPIRED",
        "Execution authorization receipt has expired."
      );
    }

    const consumptionId =
      options.consumptionId ??
      randomUUID();

    const consumptionBase:
      Omit<
        ExecutionReceiptConsumptionV2,
        "consumption_digest"
      > = {
      consumption_version:
        EXECUTION_RECEIPT_CONSUMPTION_VERSION,

      consumption_id:
        consumptionId,

      receipt_id:
        record.receipt_id,

      receipt_digest:
        record.receipt_digest,

      lock_id:
        record.receipt
          .lock_id,

      lock_fingerprint:
        record.lock_fingerprint,

      action_digest:
        record.receipt
          .action_digest,

      authorized_snapshot_version:
        record.receipt
          .authorized_snapshot_version,

      status:
        "CONSUMED_FOR_EXECUTION",

      consumed_at:
        consumedAt,

      execution_configured:
        false,

      external_action_executed:
        false
    };

    const consumption:
      ExecutionReceiptConsumptionV2 = {
      ...consumptionBase,

      consumption_digest:
        digestCanonicalJson(
          consumptionMaterial(
            consumptionBase
          )
        )
    };

    const updatedBase:
      Omit<
        ExecutionReceiptStoreRecordV2,
        "record_digest"
      > = {
      record_version:
        EXECUTION_RECEIPT_STORE_RECORD_VERSION,

      receipt_id:
        record.receipt_id,

      receipt_digest:
        record.receipt_digest,

      lock_fingerprint:
        record.lock_fingerprint,

      state:
        "CONSUMED",

      receipt:
        clone(
          record.receipt
        ),

      stored_at:
        record.stored_at,

      consumed_at:
        consumedAt,

      consumption_id:
        consumptionId
    };

    const updated:
      ExecutionReceiptStoreRecordV2 = {
      ...updatedBase,

      record_digest:
        digestCanonicalJson(
          recordMaterial(
            updatedBase
          )
        )
    };

    this.records.set(
      record.receipt_id,
      clone(
        updated
      )
    );

    return clone(
      consumption
    );
  }

  has(
    receiptId:
      string
  ): boolean {
    return this.records.has(
      receiptId.trim()
    );
  }

  size(): number {
    return this.records.size;
  }
}
