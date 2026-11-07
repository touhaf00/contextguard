import {
  verifyExecutionProofIntegrityV2
} from "./execution-proof.js";

import type {
  ExecutionProofV2
} from "./execution-proof.js";

const DEFAULT_CAPACITY =
  100;

export type ExecutionProofStoreErrorCodeV2 =
  | "INVALID_PROOF"
  | "DUPLICATE_PROOF"
  | "DUPLICATE_RECEIPT"
  | "NOT_FOUND"
  | "CAPACITY_REACHED";

export class ExecutionProofStoreErrorV2
  extends Error {
  constructor(
    public readonly code:
      ExecutionProofStoreErrorCodeV2,

    message:
      string
  ) {
    super(message);
  }
}

export interface ExecutionProofStoreOptionsV2 {
  capacity?:
    number;
}

function clone<T>(
  value:
    T
): T {
  return JSON.parse(
    JSON.stringify(
      value
    )
  ) as T;
}

export class ExecutionProofStoreV2 {
  private readonly byProofId =
    new Map<
      string,
      ExecutionProofV2
    >();

  private readonly byReceiptId =
    new Map<
      string,
      string
    >();

  private readonly capacity:
    number;

  constructor(
    options:
      ExecutionProofStoreOptionsV2 = {}
  ) {
    this.capacity =
      options.capacity ??
      DEFAULT_CAPACITY;

    if (
      !Number.isInteger(
        this.capacity
      ) ||
      this.capacity <=
        0
    ) {
      throw new ExecutionProofStoreErrorV2(
        "CAPACITY_REACHED",
        "Execution proof store capacity must be a positive integer."
      );
    }
  }

  record(
    proofValue:
      unknown
  ): ExecutionProofV2 {
    if (
      !verifyExecutionProofIntegrityV2(
        proofValue
      )
    ) {
      throw new ExecutionProofStoreErrorV2(
        "INVALID_PROOF",
        "Execution proof failed integrity verification."
      );
    }

    const proof =
      clone(
        proofValue as
          ExecutionProofV2
      );

    if (
      this.byProofId.has(
        proof.proof_id
      )
    ) {
      throw new ExecutionProofStoreErrorV2(
        "DUPLICATE_PROOF",
        "Execution proof is already stored."
      );
    }

    if (
      this.byReceiptId.has(
        proof.receipt_id
      )
    ) {
      throw new ExecutionProofStoreErrorV2(
        "DUPLICATE_RECEIPT",
        "An execution proof already exists for this receipt."
      );
    }

    if (
      this.byProofId.size >=
        this.capacity
    ) {
      throw new ExecutionProofStoreErrorV2(
        "CAPACITY_REACHED",
        "Execution proof store capacity has been reached."
      );
    }

    this.byProofId.set(
      proof.proof_id,
      clone(
        proof
      )
    );

    this.byReceiptId.set(
      proof.receipt_id,
      proof.proof_id
    );

    return clone(
      proof
    );
  }

  get(
    proofId:
      string
  ): ExecutionProofV2 {
    const proof =
      this.byProofId.get(
        proofId.trim()
      );

    if (
      !proof
    ) {
      throw new ExecutionProofStoreErrorV2(
        "NOT_FOUND",
        "Execution proof was not found."
      );
    }

    if (
      !verifyExecutionProofIntegrityV2(
        proof
      )
    ) {
      throw new ExecutionProofStoreErrorV2(
        "INVALID_PROOF",
        "Stored execution proof failed integrity verification."
      );
    }

    return clone(
      proof
    );
  }

  getByReceipt(
    receiptId:
      string
  ): ExecutionProofV2 {
    const proofId =
      this.byReceiptId.get(
        receiptId.trim()
      );

    if (
      !proofId
    ) {
      throw new ExecutionProofStoreErrorV2(
        "NOT_FOUND",
        "Execution proof for receipt was not found."
      );
    }

    return this.get(
      proofId
    );
  }

  readAll():
    ExecutionProofV2[] {
    return Array.from(
      this.byProofId.values()
    ).map(
      proof =>
        clone(
          proof
        )
    );
  }
}
