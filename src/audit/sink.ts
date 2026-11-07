import {
  randomUUID
} from "node:crypto";

import {
  canonicalJson
} from "../core/contracts.js";

import {
  digestCanonicalJson
} from "../core/authorization-integrity.js";

import type {
  JsonObject
} from "../core/contracts.js";

export const AUDIT_SINK_VERSION =
  "2" as const;

export const AUDIT_RECORD_VERSION =
  "2" as const;

const IDENTIFIER =
  /^[a-z0-9][a-z0-9._-]*$/;

const SHA256 =
  /^[0-9a-f]{64}$/i;

export interface AuditAppendRequestV2 {
  event_type:
    string;

  subject_key:
    string;

  payload:
    JsonObject;

  event_id?:
    string;

  timestamp?:
    string;
}

export interface AuditRecordV2 {
  audit_version:
    typeof AUDIT_RECORD_VERSION;

  sequence:
    number;

  event_id:
    string;

  event_type:
    string;

  subject_key:
    string;

  timestamp:
    string;

  previous_hash:
    string | null;

  payload:
    JsonObject;

  payload_hash:
    string;

  event_hash:
    string;
}

export interface AuditCheckpointV2 {
  audit_version:
    typeof AUDIT_RECORD_VERSION;

  event_count:
    number;

  head_hash:
    string | null;
}

export interface AuditSinkV2 {
  sink_version:
    typeof AUDIT_SINK_VERSION;

  sink_id:
    string;

  append(
    request:
      AuditAppendRequestV2
  ): Promise<unknown>;

  readAll():
    Promise<unknown>;

  checkpoint():
    Promise<unknown>;
}

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
  object:
    Record<string, unknown>,
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
  value: unknown,
  label: string
): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    !IDENTIFIER.test(
      value.trim()
    )
  ) {
    throw new Error(
      `${label} must be a valid identifier.`
    );
  }

  return value.trim();
}

function timestamp(
  value: unknown,
  label: string
): string {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    throw new Error(
      `${label} must be a valid timestamp.`
    );
  }

  const parsed =
    Date.parse(value);

  if (
    !Number.isFinite(
      parsed
    )
  ) {
    throw new Error(
      `${label} must be a valid timestamp.`
    );
  }

  return new Date(
    parsed
  ).toISOString();
}

function sha256(
  value: unknown,
  label: string
): string {
  if (
    typeof value !== "string" ||
    !SHA256.test(
      value
    )
  ) {
    throw new Error(
      `${label} must be a SHA-256 hex digest.`
    );
  }

  return value.toLowerCase();
}

function jsonObject(
  value: unknown,
  label: string
): JsonObject {
  asObject(
    value,
    label
  );

  try {
    return JSON.parse(
      canonicalJson(
        value
      )
    ) as JsonObject;
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `${label} is invalid: ${error.message}`
        : `${label} is invalid.`
    );
  }
}

function clone<T>(
  value: T
): T {
  return JSON.parse(
    JSON.stringify(value)
  ) as T;
}

function eventHashMaterial(
  value: Omit<
    AuditRecordV2,
    "event_hash" |
    "payload"
  >
) {
  return value;
}

export function calculateAuditEventHashV2(
  value: Omit<
    AuditRecordV2,
    "event_hash"
  >
): string {
  return digestCanonicalJson(
    eventHashMaterial({
      audit_version:
        value.audit_version,

      sequence:
        value.sequence,

      event_id:
        value.event_id,

      event_type:
        value.event_type,

      subject_key:
        value.subject_key,

      timestamp:
        value.timestamp,

      previous_hash:
        value.previous_hash,

      payload_hash:
        value.payload_hash
    })
  );
}

export function createAuditRecordV2(
  requestValue:
    AuditAppendRequestV2,

  sequence:
    number,

  previousHash:
    string | null
): AuditRecordV2 {
  if (
    !Number.isInteger(
      sequence
    ) ||
    sequence < 1
  ) {
    throw new Error(
      "AuditRecordV2.sequence must be a positive integer."
    );
  }

  const request =
    asObject(
      requestValue,
      "AuditAppendRequestV2"
    );

  const eventType =
    identifier(
      request.event_type,
      "AuditAppendRequestV2.event_type"
    );

  const subjectKey =
    requiredString(
      request,
      "subject_key",
      "AuditAppendRequestV2"
    );

  const payload =
    jsonObject(
      request.payload,
      "AuditAppendRequestV2.payload"
    );

  const eventId =
    request.event_id ===
      undefined
      ? randomUUID()
      : requiredString(
          request,
          "event_id",
          "AuditAppendRequestV2"
        );

  const normalizedTimestamp =
    timestamp(
      request.timestamp ??
        new Date()
          .toISOString(),
      "AuditAppendRequestV2.timestamp"
    );

  const normalizedPreviousHash =
    previousHash === null
      ? null
      : sha256(
          previousHash,
          "AuditRecordV2.previous_hash"
        );

  const payloadHash =
    digestCanonicalJson(
      payload
    );

  const unsigned:
    Omit<
      AuditRecordV2,
      "event_hash"
    > = {
    audit_version:
      AUDIT_RECORD_VERSION,

    sequence,

    event_id:
      eventId,

    event_type:
      eventType,

    subject_key:
      subjectKey,

    timestamp:
      normalizedTimestamp,

    previous_hash:
      normalizedPreviousHash,

    payload,

    payload_hash:
      payloadHash
  };

  return {
    ...unsigned,

    event_hash:
      calculateAuditEventHashV2(
        unsigned
      )
  };
}

export function validateAuditRecordV2(
  value: unknown,
  expectedSequence?: number,
  expectedPreviousHash?:
    string | null
): AuditRecordV2 {
  const object =
    asObject(
      value,
      "AuditRecordV2"
    );

  if (
    object.audit_version !==
      AUDIT_RECORD_VERSION
  ) {
    throw new Error(
      `AuditRecordV2.audit_version must be ${AUDIT_RECORD_VERSION}.`
    );
  }

  if (
    !Number.isInteger(
      object.sequence
    ) ||
    Number(
      object.sequence
    ) < 1
  ) {
    throw new Error(
      "AuditRecordV2.sequence must be a positive integer."
    );
  }

  const sequence =
    Number(
      object.sequence
    );

  if (
    expectedSequence !==
      undefined &&
    sequence !==
      expectedSequence
  ) {
    throw new Error(
      "AuditRecordV2 sequence continuity verification failed."
    );
  }

  const eventId =
    requiredString(
      object,
      "event_id",
      "AuditRecordV2"
    );

  const eventType =
    identifier(
      object.event_type,
      "AuditRecordV2.event_type"
    );

  const subjectKey =
    requiredString(
      object,
      "subject_key",
      "AuditRecordV2"
    );

  const normalizedTimestamp =
    timestamp(
      object.timestamp,
      "AuditRecordV2.timestamp"
    );

  let previousHash:
    string | null;

  if (
    object.previous_hash ===
      null
  ) {
    previousHash =
      null;
  } else {
    previousHash =
      sha256(
        object.previous_hash,
        "AuditRecordV2.previous_hash"
      );
  }

  if (
    expectedPreviousHash !==
      undefined &&
    previousHash !==
      expectedPreviousHash
  ) {
    throw new Error(
      "AuditRecordV2 previous hash continuity verification failed."
    );
  }

  const payload =
    jsonObject(
      object.payload,
      "AuditRecordV2.payload"
    );

  const payloadHash =
    sha256(
      object.payload_hash,
      "AuditRecordV2.payload_hash"
    );

  if (
    payloadHash !==
      digestCanonicalJson(
        payload
      )
  ) {
    throw new Error(
      "AuditRecordV2 payload hash verification failed."
    );
  }

  const eventHash =
    sha256(
      object.event_hash,
      "AuditRecordV2.event_hash"
    );

  const unsigned:
    Omit<
      AuditRecordV2,
      "event_hash"
    > = {
    audit_version:
      AUDIT_RECORD_VERSION,

    sequence,

    event_id:
      eventId,

    event_type:
      eventType,

    subject_key:
      subjectKey,

    timestamp:
      normalizedTimestamp,

    previous_hash:
      previousHash,

    payload,

    payload_hash:
      payloadHash
  };

  const expectedEventHash =
    calculateAuditEventHashV2(
      unsigned
    );

  if (
    eventHash !==
      expectedEventHash
  ) {
    throw new Error(
      "AuditRecordV2 event hash verification failed."
    );
  }

  return {
    ...unsigned,

    event_hash:
      eventHash
  };
}

export function verifyAuditChainV2(
  values:
    readonly unknown[]
): boolean {
  let previousHash:
    string | null =
      null;

  const eventIds =
    new Set<string>();

  try {
    for (
      let index = 0;
      index < values.length;
      index += 1
    ) {
      const event =
        validateAuditRecordV2(
          values[index],
          index + 1,
          previousHash
        );

      if (
        eventIds.has(
          event.event_id
        )
      ) {
        return false;
      }

      eventIds.add(
        event.event_id
      );

      previousHash =
        event.event_hash;
    }

    return true;
  } catch {
    return false;
  }
}

export function createAuditCheckpointV2(
  records:
    readonly unknown[]
): AuditCheckpointV2 {
  if (
    !verifyAuditChainV2(
      records
    )
  ) {
    throw new Error(
      "Cannot checkpoint an invalid audit chain."
    );
  }

  const head =
    records.length === 0
      ? null
      : validateAuditRecordV2(
          records[
            records.length - 1
          ]
        ).event_hash;

  return {
    audit_version:
      AUDIT_RECORD_VERSION,

    event_count:
      records.length,

    head_hash:
      head
  };
}

export function validateAuditCheckpointV2(
  value: unknown
): AuditCheckpointV2 {
  const object =
    asObject(
      value,
      "AuditCheckpointV2"
    );

  if (
    object.audit_version !==
      AUDIT_RECORD_VERSION
  ) {
    throw new Error(
      `AuditCheckpointV2.audit_version must be ${AUDIT_RECORD_VERSION}.`
    );
  }

  if (
    !Number.isInteger(
      object.event_count
    ) ||
    Number(
      object.event_count
    ) < 0
  ) {
    throw new Error(
      "AuditCheckpointV2.event_count must be a non-negative integer."
    );
  }

  let headHash:
    string | null;

  if (
    object.head_hash ===
      null
  ) {
    headHash =
      null;
  } else {
    headHash =
      sha256(
        object.head_hash,
        "AuditCheckpointV2.head_hash"
      );
  }

  if (
    Number(
      object.event_count
    ) === 0 &&
    headHash !== null
  ) {
    throw new Error(
      "Empty AuditCheckpointV2 must have a null head_hash."
    );
  }

  if (
    Number(
      object.event_count
    ) > 0 &&
    headHash === null
  ) {
    throw new Error(
      "Non-empty AuditCheckpointV2 must have a head_hash."
    );
  }

  return {
    audit_version:
      AUDIT_RECORD_VERSION,

    event_count:
      Number(
        object.event_count
      ),

    head_hash:
      headHash
  };
}

export function verifyAuditCheckpointV2(
  records:
    readonly unknown[],

  checkpointValue:
    unknown
): boolean {
  try {
    const checkpoint =
      validateAuditCheckpointV2(
        checkpointValue
      );

    if (
      !verifyAuditChainV2(
        records
      )
    ) {
      return false;
    }

    if (
      records.length !==
        checkpoint.event_count
    ) {
      return false;
    }

    const actualHead =
      records.length === 0
        ? null
        : validateAuditRecordV2(
            records[
              records.length - 1
            ]
          ).event_hash;

    return (
      actualHead ===
      checkpoint.head_hash
    );
  } catch {
    return false;
  }
}

export function validateAuditSinkV2(
  sink:
    AuditSinkV2
): AuditSinkV2 {
  if (
    typeof sink !== "object" ||
    sink === null
  ) {
    throw new Error(
      "AuditSinkV2 must be an object."
    );
  }

  if (
    sink.sink_version !==
      AUDIT_SINK_VERSION
  ) {
    throw new Error(
      `AuditSinkV2.sink_version must be ${AUDIT_SINK_VERSION}.`
    );
  }

  identifier(
    sink.sink_id,
    "AuditSinkV2.sink_id"
  );

  if (
    typeof sink.append !==
      "function" ||
    typeof sink.readAll !==
      "function" ||
    typeof sink.checkpoint !==
      "function"
  ) {
    throw new Error(
      "AuditSinkV2 must implement append, readAll and checkpoint."
    );
  }

  return sink;
}

export async function readVerifiedAuditChainV2(
  sinkValue:
    AuditSinkV2
): Promise<AuditRecordV2[]> {
  const sink =
    validateAuditSinkV2(
      sinkValue
    );

  const raw =
    await sink.readAll();

  if (
    !Array.isArray(
      raw
    )
  ) {
    throw new Error(
      "AuditSinkV2.readAll must return an array."
    );
  }

  if (
    !verifyAuditChainV2(
      raw
    )
  ) {
    throw new Error(
      "AuditSinkV2 returned an invalid audit chain."
    );
  }

  return raw.map(
    (
      item,
      index
    ) =>
      validateAuditRecordV2(
        item,
        index + 1,
        index === 0
          ? null
          : validateAuditRecordV2(
              raw[index - 1]
            ).event_hash
      )
  );
}

export async function verifyAuditSinkCheckpointV2(
  sinkValue:
    AuditSinkV2
): Promise<boolean> {
  const sink =
    validateAuditSinkV2(
      sinkValue
    );

  const records =
    await sink.readAll();

  if (
    !Array.isArray(
      records
    )
  ) {
    return false;
  }

  const checkpoint =
    await sink.checkpoint();

  return verifyAuditCheckpointV2(
    records,
    checkpoint
  );
}

export function detachedAuditRecordV2(
  value:
    AuditRecordV2
): AuditRecordV2 {
  return clone(
    value
  );
}
