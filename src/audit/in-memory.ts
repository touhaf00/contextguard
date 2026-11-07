import {
  createAuditCheckpointV2,
  createAuditRecordV2,
  detachedAuditRecordV2,
  verifyAuditChainV2
} from "./sink.js";

import type {
  AuditAppendRequestV2,
  AuditCheckpointV2,
  AuditRecordV2,
  AuditSinkV2
} from "./sink.js";

export interface InMemoryAuditSinkOptionsV2 {
  sinkId?: string;
}

export class InMemoryAuditSinkV2
  implements AuditSinkV2 {
  readonly sink_version =
    "2" as const;

  readonly sink_id:
    string;

  private readonly records:
    AuditRecordV2[] = [];

  private readonly eventIds =
    new Set<string>();

  constructor(
    options:
      InMemoryAuditSinkOptionsV2 = {}
  ) {
    this.sink_id =
      options.sinkId ??
      "memory.audit";
  }

  async append(
    request:
      AuditAppendRequestV2
  ): Promise<AuditRecordV2> {
    const previous =
      this.records[
        this.records.length - 1
      ];

    const record =
      createAuditRecordV2(
        request,
        this.records.length + 1,
        previous?.event_hash ??
          null
      );

    if (
      this.eventIds.has(
        record.event_id
      )
    ) {
      throw new Error(
        "Audit event_id has already been recorded."
      );
    }

    this.records.push(
      record
    );

    this.eventIds.add(
      record.event_id
    );

    return detachedAuditRecordV2(
      record
    );
  }

  async readAll():
    Promise<AuditRecordV2[]> {
    return this.records.map(
      detachedAuditRecordV2
    );
  }

  async checkpoint():
    Promise<AuditCheckpointV2> {
    return createAuditCheckpointV2(
      this.records
    );
  }

  verify(): boolean {
    return verifyAuditChainV2(
      this.records
    );
  }
}
