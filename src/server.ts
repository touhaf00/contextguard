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
  TARGET_TYPES,
  type Mission
} from "./types.js";

const PORT =
  Number(process.env.PORT ?? 3000);

const PUBLIC_DIR =
  resolve(process.cwd(), "public");

const MAX_BODY_SIZE =
  1_000_000;

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

  if (
    typeof input.mission !== "string" ||
    !input.mission.trim()
  ) {
    throw new HttpError(
      400,
      "Mission is required."
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
      input.mission.trim(),

    constraints: {
      read_only: true
    }
  };
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

        sendJson(
          res,
          200,
          result
        );

        return;
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
