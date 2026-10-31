import {
  createServer,
  type IncomingMessage,
  type ServerResponse
} from "node:http";

import {
  readFile
} from "node:fs/promises";

import {
  extname,
  resolve,
  sep
} from "node:path";

import {
  buildDemoResult,
  type DemoScenario
} from "./demo.js";

import {
  orchestrate
} from "./orchestrator.js";

import {
  ApprovalStore,
  ApprovalStoreError
} from "./lib/approval-store.js";

import {
  ASSESSMENT_TYPES,
  buildAssessmentMission,
  type AssessmentType
} from "./policies.js";

import {
  TARGET_TYPES,
  type Mission
} from "./types.js";

const PORT =
  Number(process.env.PORT ?? 3000);

const PUBLIC_DIR =
  resolve(process.cwd(), "public");

const MAX_BODY_SIZE =
  1_000_000;

const approvalStore =
  new ApprovalStore();

const mimeTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
  }
}

function sendJson(
  res: ServerResponse<IncomingMessage>,
  status: number,
  value: unknown
): void {
  res.writeHead(status, {
    "Content-Type":
      "application/json; charset=utf-8"
  });

  res.end(
    JSON.stringify(value)
  );
}

async function readJsonBody(
  req: IncomingMessage
): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of req) {
    const buffer =
      Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(chunk);

    size += buffer.length;

    if (size > MAX_BODY_SIZE) {
      throw new HttpError(
        413,
        "Request body is too large."
      );
    }

    chunks.push(buffer);
  }

  const body =
    Buffer.concat(chunks)
      .toString("utf8");

  if (!body.trim()) {
    throw new HttpError(
      400,
      "Request body is empty."
    );
  }

  try {
    return JSON.parse(body);
  } catch {
    throw new HttpError(
      400,
      "Request body must contain valid JSON."
    );
  }
}

function validateMission(
  value: unknown
): Mission {
  if (
    !value ||
    typeof value !== "object"
  ) {
    throw new HttpError(
      400,
      "Invalid mission."
    );
  }

  const input =
    value as Record<string, unknown>;

  if (
    typeof input.repository !== "string" ||
    !input.repository.trim()
  ) {
    throw new HttpError(
      400,
      "Repository is required."
    );
  }

  const legacyMission =
    typeof input.mission === "string"
      ? input.mission.trim()
      : "";

  const rawAssessmentType =
    typeof input.assessment_type === "string"
      ? input.assessment_type.trim()
      : "";

  let assessmentType: AssessmentType;

  if (rawAssessmentType) {
    if (
      !ASSESSMENT_TYPES.includes(
        rawAssessmentType as AssessmentType
      )
    ) {
      throw new HttpError(
        400,
        "Invalid assessment type."
      );
    }

    assessmentType =
      rawAssessmentType as AssessmentType;
  } else if (legacyMission) {
    // Backward compatibility with the previous API.
    assessmentType = "custom";
  } else {
    assessmentType = "technical_release";
  }

  const customInstructions =
    typeof input.custom_instructions === "string"
      ? input.custom_instructions.trim()
      : legacyMission;

  if (
    assessmentType === "custom" &&
    !customInstructions
  ) {
    throw new HttpError(
      400,
      "Custom assessment instructions are required."
    );
  }

  if (
    !input.target ||
    typeof input.target !== "object"
  ) {
    throw new HttpError(
      400,
      "Target is required."
    );
  }

  const target =
    input.target as Record<string, unknown>;

  if (
    typeof target.type !== "string" ||
    !TARGET_TYPES.includes(
      target.type as Mission["target"]["type"]
    )
  ) {
    throw new HttpError(
      400,
      "Invalid target type."
    );
  }

  const type =
    target.type as Mission["target"]["type"];

  if (
    type !== "current_state" &&
    (
      typeof target.reference !== "string" ||
      !target.reference.trim()
    )
  ) {
    throw new HttpError(
      400,
      "Target reference is required."
    );
  }

  return {
    repository:
      input.repository.trim(),

    target: {
      type,

      ...(type !== "current_state"
        ? {
            reference:
              String(
                target.reference
              ).trim()
          }
        : {})
    },

    mission:
      buildAssessmentMission(
        assessmentType,
        customInstructions
      ),

    constraints: {
      read_only: true
    }
  };
}

function validateApprovalRequest(
  value: unknown
): {
  approval_id: string;
  fingerprint: string;
} {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new HttpError(
      400,
      "Invalid approval request."
    );
  }

  const input =
    value as
      Record<string, unknown>;

  if (
    typeof input.approval_id !==
      "string" ||
    !input.approval_id.trim()
  ) {
    throw new HttpError(
      400,
      "approval_id is required."
    );
  }

  if (
    typeof input.fingerprint !==
      "string" ||
    !/^[0-9a-f]{64}$/i.test(
      input.fingerprint
    )
  ) {
    throw new HttpError(
      400,
      "fingerprint must be a SHA-256 hex digest."
    );
  }

  return {
    approval_id:
      input.approval_id.trim(),

    fingerprint:
      input.fingerprint
        .toLowerCase()
  };
}

function approvalHttpError(
  error: ApprovalStoreError
): HttpError {
  if (
    error.code ===
      "NOT_FOUND"
  ) {
    return new HttpError(
      404,
      error.message
    );
  }

  if (
    error.code ===
      "EXPIRED"
  ) {
    return new HttpError(
      410,
      error.message
    );
  }

  if (
    error.code ===
      "CAPACITY_REACHED"
  ) {
    return new HttpError(
      503,
      error.message
    );
  }

  return new HttpError(
    409,
    error.message
  );
}

async function serveStatic(
  req: IncomingMessage,
  res: ServerResponse<IncomingMessage>
): Promise<void> {
  const url =
    new URL(
      req.url ?? "/",
      "http://localhost"
    );

  const pathname =
    decodeURIComponent(
      url.pathname === "/"
        ? "/index.html"
        : url.pathname
    );

  const filePath =
    resolve(
      PUBLIC_DIR,
      `.${pathname}`
    );

  if (
    filePath !== PUBLIC_DIR &&
    !filePath.startsWith(
      `${PUBLIC_DIR}${sep}`
    )
  ) {
    throw new HttpError(
      403,
      "Forbidden."
    );
  }

  let content: Buffer;

  try {
    content =
      await readFile(filePath);
  } catch {
    throw new HttpError(
      404,
      "Not found."
    );
  }

  res.writeHead(200, {
    "Content-Type":
      mimeTypes[extname(filePath)] ??
      "application/octet-stream"
  });

  if (req.method === "HEAD") {
    res.end();
    return;
  }

  res.end(content);
}

const server = createServer(
  async (req, res) => {
    try {
      const url =
        new URL(
          req.url ?? "/",
          `http://localhost:${PORT}`
        );

      if (
        req.method === "GET" &&
        url.pathname === "/api/demo"
      ) {
        const scenario =
          (
            url.searchParams.get("scenario") ??
            "review"
          ) as DemoScenario;

        sendJson(
          res,
          200,
          buildDemoResult(scenario)
        );

        return;
      }

      if (
        req.method === "POST" &&
        url.pathname === "/api/live"
      ) {
        const mission =
          validateMission(
            await readJsonBody(req)
          );

        console.log(
          `[live] ${mission.repository} ${mission.target.type}` +
          (
            mission.target.reference
              ? `:${mission.target.reference}`
              : ""
          )
        );

        const result =
          await orchestrate(mission);

        console.log(
          `[live] Final status: ${result.status}`
        );

        const approval =
          result.human_approval_required
            ? approvalStore.create(
                result
              )
            : undefined;

        sendJson(
          res,
          200,
          {
            ...result,

            ...(approval
              ? {
                  approval
                }
              : {})
          }
        );

        return;
      }

      if (
        req.method === "POST" &&
        url.pathname ===
          "/api/approve"
      ) {
        const approvalRequest =
          validateApprovalRequest(
            await readJsonBody(req)
          );

        try {
          const approval =
            approvalStore.approve(
              approvalRequest
                .approval_id,
              approvalRequest
                .fingerprint
            );

          console.log(
            `[approval] Approved ${approval.approval_id} fingerprint=${approval.fingerprint}`
          );

          sendJson(
            res,
            200,
            {
              approval,

              status:
                "APPROVED_LOCKED",

              external_action_executed:
                false,

              execution_configured:
                false
            }
          );

          return;
        } catch (error) {
          if (
            error instanceof
              ApprovalStoreError
          ) {
            throw approvalHttpError(
              error
            );
          }

          throw error;
        }
      }

      if (
        req.method !== "GET" &&
        req.method !== "HEAD"
      ) {
        throw new HttpError(
          405,
          "Method not allowed."
        );
      }

      await serveStatic(
        req,
        res
      );
    } catch (error) {
      const status =
        error instanceof HttpError
          ? error.status
          : 500;

      const internalMessage =
        error instanceof Error
          ? error.message
          : "Unknown error";

      const publicMessage =
        error instanceof HttpError
          ? error.message
          : "Internal server error.";

      console.error(
        `[server] ${internalMessage}`
      );

      sendJson(
        res,
        status,
        {
          error: publicMessage
        }
      );
    }
  }
);

server.listen(PORT, () => {
  console.log(
    `ContextGuard UI: http://localhost:${PORT}`
  );

  console.log(
    "Demo endpoint : GET /api/demo"
  );

  console.log(
    "Live endpoint : POST /api/live"
  );

  console.log(
    "Cominty is called only through /api/live."
  );
});
