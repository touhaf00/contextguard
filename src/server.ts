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
  getGenericApprovalAccessConfig,
  getGenericRuntimeAccessConfig,
  getGenericExecutorAccessConfig,
  getGitHubSnapshotConfig,
  getGitHubExecutionConfig,
  getContextGuardUiAccessConfig,
  getContextGuardUiLocalSessionConfig,
  getContextGuardUiExecutionConfig,
  getAgentDraftStoreConfig,
  getGitHubAppConfig,
  getLiveAccessConfig,
  getContextGuardUiListenConfig
} from "./config.js";

import {
  InvestigationBusyError,
  InvestigationLock
} from "./api/ui/investigation-lock.js";

import {
  allowedHostsFor,
  isForwardedRequest
} from "./api/ui/host-policy.js";

import {
  LiveAccessError,
  LiveAccessGate
} from "./lib/live-access.js";

import {
  ApprovalStoreError
} from "./lib/approval-store.js";

import {
  AuditCoordinator
} from "./lib/audit-coordinator.js";

import {
  ASSESSMENT_TYPES,
  buildAssessmentMission,
  type AssessmentType
} from "./policies.js";

import {
  TARGET_TYPES,
  type Mission
} from "./types.js";

import {
  GenericApprovalAccessGateV2
} from "./api/v2/approval-access.js";

import {
  GenericRuntimeAccessGateV2
} from "./api/v2/runtime-access.js";

import {
  GenericExecutorAccessGateV2
} from "./api/v2/executor-access.js";

import {
  GenericAuthorizationServiceHttpV2
} from "./api/v2/service-http.js";

import {
  createGitHubAuthorizationPresetV2
} from "./adapters/github/preset.js";

import {
  applyTrustedExecutionContextApiV2
} from "./api/v2/execution-context.js";

import {
  createGitHubSnapshotResolverV2
} from "./adapters/github/snapshot-resolver.js";

import {
  GitHubAgentIssueDiscovery,
  GitHubAgentDraftError,
  comintyIssueDraftChat
} from "./api/ui/agent-issue-draft.js";

import {
  AgentIssueDraftStore
} from "./api/ui/agent-issue-store.js";
import { buildStartupSummary } from "./api/ui/startup-summary.js";
import { GitHubAppUserAuth, GitHubAppAuthError } from "./api/ui/github-app-auth.js";
import { guardInvariantHttpError, agentOutputInvalidHttpError, workerInvariantHttpError } from "./api/ui/guard-invariant-error.js";
import { pipelineHttpError, UNEXPECTED_ERROR_MESSAGE } from "./api/ui/pipeline-errors.js";
import { GitHubAppUserWorkflow } from "./api/ui/github-app-workflow.js";
import { GitHubIssuesExplorer } from "./api/ui/github-issues.js";

import {
  ComintyGenericAgentPipelineV2
} from "./api/ui/cominty-pipeline.js";

import {
  WorkerEvidenceStaleErrorV2
} from "./api/ui/worker-evidence-freshness.js";

import {
  GitHubUiFlowErrorV2,
  GitHubUiFlowV2
} from "./api/ui/github-flow.js";

import {
  ContextGuardUiAccessErrorV2,
  ContextGuardUiAccessGateV2
} from "./api/ui/access.js";

import {
  ContextGuardUiSessionErrorV2,
  ContextGuardUiSessionManagerV2
} from "./api/ui/session.js";

import {
  getContextGuardUiCapabilitiesV2
} from "./api/ui/capabilities.js";

import {
  contextGuardUiExecutionConfiguredV2,
  contextGuardUiExecutionGateV2
} from "./api/ui/execution-gate.js";

import {
  ContextGuardUiHttpErrorV2,
  ContextGuardUiHttpV2,
  contextGuardUiPostExecutionErrorV2,
  contextGuardUiPreflightErrorResponseV2
} from "./api/ui/http.js";

const {
  port: PORT,
  host: UI_LISTEN_HOST,
  extraAllowedHosts: EXTRA_ALLOWED_HOSTS
} = getContextGuardUiListenConfig();

const PUBLIC_DIR =
  resolve(process.cwd(), "public");

const MAX_BODY_SIZE =
  1_000_000;

const demoAuditCoordinator =
  new AuditCoordinator();

const liveAuditCoordinator =
  new AuditCoordinator();

const liveAccessGate =
  new LiveAccessGate(
    getLiveAccessConfig()
  );

const githubAppConfig = getGitHubAppConfig();

const ALLOWED_HOSTS = allowedHostsFor(
  PORT,
  githubAppConfig?.callbackUrl,
  EXTRA_ALLOWED_HOSTS
);
const githubSnapshotConfig = githubAppConfig
  ? { apiBaseUrl: "https://api.github.com" }
  : getGitHubSnapshotConfig();
const githubExecutionConfig = githubAppConfig
  ? { allowedRepositories: [] as string[], apiBaseUrl: "https://api.github.com" }
  : getGitHubExecutionConfig();

const genericAuthorizationPreset =
  createGitHubAuthorizationPresetV2({
    token:
      githubSnapshotConfig.token,

    apiBaseUrl:
      githubSnapshotConfig.apiBaseUrl,

    ...(githubExecutionConfig.token
      ? {
          execution: {
            token:
              githubExecutionConfig.token,

            allowedRepositories:
              githubExecutionConfig
                .allowedRepositories,

            apiBaseUrl:
              githubExecutionConfig
                .apiBaseUrl
          }
        }
      : {})
  });

const genericAuthorizationService =
  genericAuthorizationPreset.service;

const genericExecutionContextApi = {
  update(
    body:
      unknown
  ) {
    return applyTrustedExecutionContextApiV2(
      body,
      genericAuthorizationService.sessions,
      genericAuthorizationPreset.contextStore
    );
  }
};

const genericApprovalAccessGate =
  new GenericApprovalAccessGateV2(
    getGenericApprovalAccessConfig()
  );

const genericRuntimeAccessGate =
  new GenericRuntimeAccessGateV2(
    getGenericRuntimeAccessConfig()
  );

const genericExecutorAccessGate =
  new GenericExecutorAccessGateV2(
    getGenericExecutorAccessConfig()
  );

const genericAuthorizationHttp =
  new GenericAuthorizationServiceHttpV2(
    genericAuthorizationService,
    genericApprovalAccessGate,
    genericRuntimeAccessGate,
    genericExecutionContextApi,
    genericExecutorAccessGate
  );


const contextGuardUiExecutionConfig =
  getContextGuardUiExecutionConfig();

const contextGuardUiSessions =
  new ContextGuardUiSessionManagerV2(
    getContextGuardUiLocalSessionConfig()
  );

const contextGuardUiAccessGate =
  new ContextGuardUiAccessGateV2(
    getContextGuardUiAccessConfig(),
    contextGuardUiSessions
  );

const githubAppAuth = githubAppConfig
  ? new GitHubAppUserAuth(githubAppConfig, contextGuardUiSessions)
  : null;
const githubIssues = githubAppAuth ? new GitHubIssuesExplorer(githubAppAuth) : null;
const githubAppWorkflows = githubAppAuth
  ? new GitHubAppUserWorkflow(
      githubAppAuth, contextGuardUiAccessGate, getContextGuardUiExecutionConfig().enabled
    )
  : null;

const contextGuardUiSnapshotResolver =
  createGitHubSnapshotResolverV2(
    genericAuthorizationPreset.client,
    {
      resolverId:
        "github.ui-snapshot"
    }
  );

const agentDraftStoreConfig = getAgentDraftStoreConfig();
const agentIssueDraftStore = new AgentIssueDraftStore(
  100,
  agentDraftStoreConfig.ttlMinutes * 60 * 1000,
  !githubAppConfig && agentDraftStoreConfig.filePath
    ? { filePath: agentDraftStoreConfig.filePath }
    : {}
);
const githubIssueAssistant = new GitHubAgentIssueDiscovery(
  genericAuthorizationPreset.client,
  comintyIssueDraftChat
);
const contextGuardUiPipeline =
  new ComintyGenericAgentPipelineV2();

const contextGuardUiFlow =
  new GitHubUiFlowV2({
    authorizationService:
      genericAuthorizationService,

    executionContextStore:
      genericAuthorizationPreset
        .contextStore,

    snapshotResolver:
      contextGuardUiSnapshotResolver,

    agentPipeline:
      contextGuardUiPipeline,

    getAgentDraft: id => agentIssueDraftStore.get(id),

    explainMissingAgentDraft: id =>
      agentIssueDraftStore.lookup(id).status === "expired"
        ? "expired"
        : "unknown",

    executionConfigured:
      contextGuardUiExecutionConfiguredV2(
        Boolean(
          genericAuthorizationPreset
            .executor
        ),
        contextGuardUiExecutionConfig
          .enabled
      )
  });

const contextGuardUiHttp =
  new ContextGuardUiHttpV2(
    contextGuardUiFlow,
    genericAuthorizationService,
    contextGuardUiAccessGate
  );

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

function contextGuardUiHttpError(
  error:
    unknown
): HttpError | null {
  if (error instanceof GitHubAppAuthError) {
    return new HttpError(error.status, error.message);
  }
  if (error instanceof WorkerEvidenceStaleErrorV2) {
    return new HttpError(422, error.message);
  }
  if (error instanceof GitHubAgentDraftError) {
    return new HttpError(
      ["INVALID_AGENT_OUTPUT", "UNSUPPORTED_EVIDENCE", "AGENT_UNAVAILABLE"].includes(error.code) ? 502 : 400,
      error.message
    );
  }

  if (
    error instanceof
      ContextGuardUiSessionErrorV2
  ) {
    const status =
      error.code ===
        "REMOTE_NOT_ALLOWED"
        ? 403
        : error.code ===
            "DISABLED" ||
          error.code ===
            "CAPACITY_EXCEEDED"
          ? 503
          : 401;

    return new HttpError(
      status,
      error.message
    );
  }

  if (
    error instanceof
      ContextGuardUiAccessErrorV2
  ) {
    return new HttpError(
      error.code === "DISABLED"
        ? 503
        : 401,
      error.message
    );
  }

  if (
    error instanceof
      ContextGuardUiHttpErrorV2 ||
    error instanceof
      GitHubUiFlowErrorV2
  ) {
    return new HttpError(
      400,
      error.message
    );
  }

  const guardInvariant =
    guardInvariantHttpError(error);

  if (guardInvariant) {
    return new HttpError(
      guardInvariant.status,
      guardInvariant.message
    );
  }

  const workerInvariant =
    workerInvariantHttpError(error);

  if (workerInvariant) {
    return new HttpError(
      workerInvariant.status,
      workerInvariant.message
    );
  }

  const agentOutput =
    agentOutputInvalidHttpError(error);

  if (agentOutput) {
    return new HttpError(
      agentOutput.status,
      agentOutput.message
    );
  }

  const pipeline = pipelineHttpError(error);

  if (pipeline) {
    return new HttpError(
      pipeline.status,
      pipeline.message
    );
  }

  return null;
}

function setSecurityHeaders(res: ServerResponse<IncomingMessage>): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Content-Security-Policy", "frame-ancestors 'self'; object-src 'none'; base-uri 'self'");
  res.setHeader("Referrer-Policy", "no-referrer");
}

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function originIsAllowed(origin: string): boolean {
  try {
    return ALLOWED_HOSTS.has(new URL(origin).host.toLowerCase());
  } catch {
    return false;
  }
}

const investigationLock = new InvestigationLock(2);

async function runInvestigation<T>(key: string, task: () => Promise<T>): Promise<T> {
  try {
    return await investigationLock.run(key, task);
  } catch (error) {
    if (error instanceof InvestigationBusyError) {
      throw new HttpError(429, error.message);
    }
    throw error;
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

function liveAccessHttpError(
  error: LiveAccessError
): HttpError {
  if (
    error.code ===
      "UNAUTHORIZED"
  ) {
    return new HttpError(
      401,
      error.message
    );
  }

  if (
    error.code ===
      "REPOSITORY_NOT_ALLOWED"
  ) {
    return new HttpError(
      403,
      error.message
    );
  }

  if (
    error.code ===
      "BUSY"
  ) {
    return new HttpError(
      409,
      error.message
    );
  }

  if (
    error.code ===
      "RATE_LIMITED"
  ) {
    return new HttpError(
      429,
      error.message
    );
  }

  return new HttpError(
    503,
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

  let pathname: string;
  try {
    pathname = decodeURIComponent(
      url.pathname === "/"
        ? "/index.html"
        : url.pathname
    );
  } catch {
    throw new HttpError(400, "Malformed request path.");
  }

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
    setSecurityHeaders(res);
    try {
      const url =
        new URL(
          req.url ?? "/",
          `http://localhost:${PORT}`
        );

      if (!ALLOWED_HOSTS.has((req.headers.host ?? "").toLowerCase())) {
        throw new HttpError(403, "Request host is not allowed.");
      }

      if (
        UNSAFE_METHODS.has(req.method ?? "") &&
        req.headers.origin !== undefined &&
        !originIsAllowed(req.headers.origin)
      ) {
        throw new HttpError(403, "Cross-origin ContextGuard request refused.");
      }

      if (githubAppAuth && req.method === "POST" && url.pathname.startsWith("/api/ui/")) {
        const origin = req.headers.origin;
        const configured = new URL(githubAppConfig!.callbackUrl).origin;
        if (origin !== configured) {
          throw new HttpError(403, "Cross-origin ContextGuard request refused.");
        }
      }

      if (req.method === "GET" && url.pathname === "/api/ui/auth/mode") {
        res.setHeader("Cache-Control", "no-store");
        sendJson(res, 200, {
          github_app_enabled: Boolean(githubAppAuth),
          ...(githubAppConfig?.slug ? {
            install_url: `https://github.com/apps/${githubAppConfig.slug}/installations/new`
          } : {})
        });
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/ui/github/connect") {
        if (!githubAppAuth) throw new HttpError(503, "GitHub App connection is not configured.");
        const start = githubAppAuth.begin();
        res.writeHead(302, { Location: start.location, "Set-Cookie": start.cookie, "Cache-Control": "no-store" });
        res.end();
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/ui/github/callback") {
        if (!githubAppAuth) throw new HttpError(503, "GitHub App connection is not configured.");
        const session = await githubAppAuth.complete(
          url.searchParams.get("code") ?? "",
          url.searchParams.get("state") ?? "",
          req.headers.cookie
        );
        res.writeHead(303, {
          Location: "/",
          "Set-Cookie": [
            githubAppAuth.clearStateCookie(),
            contextGuardUiSessions.cookieHeader(session) + githubAppAuth.secureSuffix()
          ],
          "Cache-Control": "no-store"
        });
        res.end();
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/ui/github/repositories") {
        if (!githubAppAuth) throw new HttpError(503, "GitHub App connection is not configured.");
        const session = contextGuardUiSessions.getSession(req.headers.cookie);
        res.setHeader("Cache-Control", "no-store");
        sendJson(res, 200, {
          user: githubAppAuth.identityFor(session),
          repositories: await githubAppAuth.repositories(session)
        });
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/ui/github/issues") {
        if (!githubIssues) throw new HttpError(503, "GitHub App connection is not configured.");
        const session = contextGuardUiSessions.getSession(req.headers.cookie);
        const repository = url.searchParams.get("repository") ?? "";
        const state = url.searchParams.get("state") ?? "open";
        res.setHeader("Cache-Control", "no-store");
        sendJson(res, 200, await githubIssues.list(session, repository, state));
        return;
      }

      if (req.method === "GET" && url.pathname.startsWith("/api/ui/github/issues/")) {
        if (!githubIssues) throw new HttpError(503, "GitHub App connection is not configured.");
        const session = contextGuardUiSessions.getSession(req.headers.cookie);
        const repository = url.searchParams.get("repository") ?? "";
        const number = Number(url.pathname.slice("/api/ui/github/issues/".length));
        res.setHeader("Cache-Control", "no-store");
        sendJson(res, 200, await githubIssues.detail(session, repository, number));
        return;
      }

      if (
        req.method === "GET" &&
        url.pathname === "/api/demo"
      ) {
        const scenario =
          (
            url.searchParams.get("scenario") ??
            "review"
          ) as DemoScenario;

        const demoResult =
          buildDemoResult(
            scenario
          );

        const auditResult =
          demoAuditCoordinator
            .completeAssessment(
              demoResult
            );

        sendJson(
          res,
          200,
          {
            ...demoResult,

            demo:
              true,

            assessment_id:
              auditResult
                .assessment_id,

            ...(auditResult.approval
              ? {
                  approval:
                    auditResult
                      .approval
                }
              : {}),

            audit_checkpoint:
              auditResult
                .audit_checkpoint
          }
        );

        return;
      }

      if (
        req.method === "GET" &&
        url.pathname ===
          "/api/ui/capabilities"
      ) {
        const session = contextGuardUiSessions
          .getSession(req.headers.cookie);
        if (githubAppAuth) githubAppAuth.tokenFor(session);

        sendJson(
          res,
          200,
          getContextGuardUiCapabilitiesV2({
            uiRealExecutionEnabled:
              contextGuardUiExecutionConfig
                .enabled
          })
        );

        return;
      }

      if (
        req.method === "GET" &&
        url.pathname ===
          "/api/ui/session"
      ) {
        const session =
          contextGuardUiSessions
            .getSession(req.headers.cookie);
        if (githubAppAuth) githubAppAuth.tokenFor(session);

        sendJson(
          res,
          200,
          {
            status:
              "AUTHENTICATED",

            principal:
              session.principal,

            expires_at:
              session.expires_at
          }
        );

        return;
      }

      if (
        req.method === "POST" &&
        url.pathname ===
          "/api/ui/session/local"
      ) {
        if (githubAppAuth) throw new HttpError(403, "Use Connect with GitHub.");
        const session =
          contextGuardUiSessions
            .createLocalSession(
              isForwardedRequest(req.headers)
                ? undefined
                : req.socket
                  .remoteAddress
            );

        res.setHeader(
          "Set-Cookie",
          contextGuardUiSessions
            .cookieHeader(
              session
            )
        );

        sendJson(
          res,
          200,
          {
            status:
              "AUTHENTICATED",

            principal:
              session.principal,

            expires_at:
              session.expires_at
          }
        );

        return;
      }

      if (
        req.method === "POST" &&
        url.pathname ===
          "/api/ui/session/login"
      ) {
        if (githubAppAuth) throw new HttpError(403, "Use Connect with GitHub.");
        const body =
          await readJsonBody(req);

        if (
          !body ||
          typeof body !==
            "object" ||
          Array.isArray(body)
        ) {
          throw new HttpError(
            400,
            "Invalid ContextGuard UI login request."
          );
        }

        const input =
          body as
            Record<string, unknown>;

        const keys =
          Object.keys(input);

        if (
          keys.length !== 1 ||
          keys[0] !==
            "access_token" ||
          typeof input.access_token !==
            "string" ||
          !input.access_token
            .trim()
        ) {
          throw new HttpError(
            400,
            "ContextGuard UI access token is required."
          );
        }

        const principal =
          contextGuardUiAccessGate
            .authenticate(
              `Bearer ${input.access_token.trim()}`
            );

        const session =
          contextGuardUiSessions
            .createAuthenticatedSession(
              principal
            );

        res.setHeader(
          "Set-Cookie",
          contextGuardUiSessions
            .cookieHeader(
              session
            )
        );

        res.setHeader(
          "Cache-Control",
          "no-store"
        );

        sendJson(
          res,
          200,
          {
            status:
              "AUTHENTICATED",

            principal:
              session.principal,

            expires_at:
              session.expires_at
          }
        );

        return;
      }


      if (
        req.method === "POST" &&
        url.pathname ===
          "/api/ui/session/logout"
      ) {
        if (githubAppWorkflows) {
          try {
            const session = contextGuardUiSessions.getSession(req.headers.cookie);
            githubAppWorkflows.disconnect(session.session_id);
          } catch { }
        }
        contextGuardUiSessions
          .revoke(req.headers.cookie);

        res.setHeader(
          "Set-Cookie",
          contextGuardUiSessions.clearCookieHeader() +
            (githubAppAuth?.secureSuffix() ?? "")
        );

        sendJson(
          res,
          200,
          {
            status:
              "SIGNED_OUT"
          }
        );

        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/ui/github/pr/investigate') {
        if (!githubAppWorkflows || !githubAppAuth) throw new HttpError(503,'GitHub App mode required.');
        const session=contextGuardUiSessions.getSession(req.headers.cookie);
        githubAppAuth.tokenFor(session);
        const proposal = await runInvestigation(session.session_id, async () =>
          githubAppWorkflows.investigatePr(session, await readJsonBody(req)));
        res.setHeader('Cache-Control','no-store');
        sendJson(res,200,proposal);
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/ui/github/assistant/investigate') {
        if (!githubAppWorkflows || !githubAppAuth) throw new HttpError(503, 'GitHub App mode required.');
        const session = contextGuardUiSessions.getSession(req.headers.cookie);
        githubAppAuth.tokenFor(session);
        const proposal = await runInvestigation(session.session_id, async () =>
          githubAppWorkflows.investigateAssistant(session, await readJsonBody(req)));
        res.setHeader('Cache-Control', 'no-store');
        sendJson(res, 200, proposal);
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/ui/github/maintenance/investigate') {
        if (!githubAppWorkflows || !githubAppAuth) throw new HttpError(503, 'GitHub App mode required.');
        const session = contextGuardUiSessions.getSession(req.headers.cookie);
        githubAppAuth.tokenFor(session);
        const proposal = await runInvestigation(session.session_id, async () =>
          githubAppWorkflows.investigateMaintenance(session, await readJsonBody(req)));
        res.setHeader('Cache-Control', 'no-store');
        sendJson(res, 200, proposal);
        return;
      }

      if (
        req.method === "POST" &&
        url.pathname === "/api/ui/agent-draft"
      ) {
        const userSession = githubAppAuth
          ? contextGuardUiSessions.getSession(req.headers.cookie) : null;
        if (githubAppAuth && userSession) githubAppAuth.tokenFor(userSession);
        else contextGuardUiAccessGate.authenticate(req.headers.authorization, req.headers.cookie);
        const draft = await runInvestigation(userSession?.session_id ?? "local-access", async () => {
          const body = await readJsonBody(req);
          const generated = githubAppWorkflows && userSession
            ? await githubAppWorkflows.investigate(userSession, body)
            : await githubIssueAssistant.generate(body);
          if (!githubAppWorkflows) agentIssueDraftStore.put(generated as Parameters<typeof agentIssueDraftStore.put>[0]);
          return generated;
        });
        res.setHeader("Cache-Control", "no-store");
        sendJson(res, 200, draft);
        return;
      }

      if (
        req.method === "POST" &&
        url.pathname ===
          "/api/ui/start"
      ) {
        const body = await readJsonBody(req);
        const result = githubAppWorkflows
          ? await githubAppWorkflows.start(contextGuardUiSessions.getSession(req.headers.cookie), body, req.headers.cookie)
          : await contextGuardUiHttp.start(body, req.headers.authorization, req.headers.cookie);

        sendJson(
          res,
          200,
          result
        );

        return;
      }

      if (
        req.method === "POST" &&
        url.pathname ===
          "/api/ui/approve"
      ) {
        const body = await readJsonBody(req);
        const result = githubAppWorkflows
          ? await githubAppWorkflows.approve(contextGuardUiSessions.getSession(req.headers.cookie), body, req.headers.cookie)
          : contextGuardUiHttp.approve(body, req.headers.authorization, req.headers.cookie);

        sendJson(
          res,
          200,
          result
        );

        return;
      }

      if (
        req.method === "POST" &&
        url.pathname ===
          "/api/ui/preflight"
      ) {
        const body = await readJsonBody(req);
        const result = githubAppWorkflows
          ? await githubAppWorkflows.preflight(contextGuardUiSessions.getSession(req.headers.cookie), body, req.headers.cookie)
          : await contextGuardUiHttp.preflight(body, req.headers.authorization, req.headers.cookie);

        sendJson(
          res,
          200,
          result
        );

        return;
      }

      if (
        req.method === "POST" &&
        url.pathname ===
          "/api/ui/receipt"
      ) {
        const body = await readJsonBody(req);
        const result = githubAppWorkflows
          ? await githubAppWorkflows.issueReceipt(contextGuardUiSessions.getSession(req.headers.cookie), body, req.headers.cookie)
          : await contextGuardUiHttp.issueReceipt(body, req.headers.authorization, req.headers.cookie);

        sendJson(
          res,
          200,
          result
        );

        return;
      }

      if (
        req.method === "POST" &&
        url.pathname ===
          "/api/ui/execute"
      ) {
        const executionGate =
          contextGuardUiExecutionGateV2(
            contextGuardUiExecutionConfig
              .enabled
          );

        if (
          !executionGate.allowed
        ) {
          sendJson(
            res,
            executionGate.status,
            executionGate.body
          );

          return;
        }

        const body = await readJsonBody(req);
        const result = githubAppWorkflows
          ? await githubAppWorkflows.execute(contextGuardUiSessions.getSession(req.headers.cookie), body, req.headers.cookie)
          : await contextGuardUiHttp.execute(body, req.headers.authorization, req.headers.cookie);

        sendJson(
          res,
          200,
          result
        );

        return;
      }

      if (
        req.method === "POST" &&
        url.pathname ===
          "/api/v2/authorization"
      ) {
        const result =
          genericAuthorizationHttp
            .authorize(
              await readJsonBody(req),
              req.headers.authorization
            );

        sendJson(
          res,
          result.status,
          result.body
        );

        return;
      }

      if (
        req.method === "POST" &&
        url.pathname ===
          "/api/v2/execution-context"
      ) {
        const result =
          genericAuthorizationHttp
            .executionContext(
              await readJsonBody(req),
              req.headers.authorization
            );

        sendJson(
          res,
          result.status,
          result.body
        );

        return;
      }

      if (
        req.method === "POST" &&
        url.pathname ===
          "/api/v2/execution-receipt"
      ) {
        const result =
          await genericAuthorizationHttp
            .issueExecutionReceipt(
              await readJsonBody(req),
              req.headers.authorization
            );

        sendJson(
          res,
          result.status,
          result.body
        );

        return;
      }

      if (
        req.method === "POST" &&
        url.pathname ===
          "/api/v2/execute"
      ) {
        const result =
          await genericAuthorizationHttp
            .executeReceipt(
              await readJsonBody(req),
              req.headers.authorization
            );

        sendJson(
          res,
          result.status,
          result.body
        );

        return;
      }

      if (
        req.method === "POST" &&
        url.pathname ===
          "/api/v2/preflight"
      ) {
        const result =
          await genericAuthorizationHttp
            .preflight(
              await readJsonBody(req),
              req.headers.authorization
            );

        sendJson(
          res,
          result.status,
          result.body
        );

        return;
      }

      if (
        req.method === "POST" &&
        url.pathname ===
          "/api/v2/approval"
      ) {
        const result =
          genericAuthorizationHttp
            .approve(
              await readJsonBody(req),
              req.headers.authorization
            );

        sendJson(
          res,
          result.status,
          result.body
        );

        return;
      }

      if (
        req.method === "POST" &&
        url.pathname === "/api/live"
      ) {
        try {
          liveAccessGate
            .authenticate(
              req.headers
                .authorization
            );

          const mission =
            validateMission(
              await readJsonBody(req)
            );

          liveAccessGate
            .assertRepositoryAllowed(
              mission.repository
            );

          liveAccessGate.begin();

          try {
            console.log(
              `[live] ${mission.repository} ${mission.target.type}` +
              (
                mission.target.reference
                  ? `:${mission.target.reference}`
                  : ""
              )
            );

            const result =
              await orchestrate(
                mission
              );

            console.log(
              `[live] Final status: ${result.status}`
            );

            const auditResult =
              liveAuditCoordinator
                .completeAssessment(
                  result
                );

            sendJson(
              res,
              200,
              {
                ...result,

                assessment_id:
                  auditResult
                    .assessment_id,

                ...(auditResult.approval
                  ? {
                      approval:
                        auditResult
                          .approval
                    }
                  : {}),

                audit_checkpoint:
                  auditResult
                    .audit_checkpoint
              }
            );

            return;
          } finally {
            liveAccessGate.end();
          }
        } catch (error) {
          if (
            error instanceof
              LiveAccessError
          ) {
            throw liveAccessHttpError(
              error
            );
          }

          throw error;
        }
      }

      if (
        req.method === "POST" &&
        url.pathname ===
          "/api/demo/approve"
      ) {
        const approvalRequest =
          validateApprovalRequest(
            await readJsonBody(req)
          );

        try {
          const approval =
            demoAuditCoordinator
              .approve(
                approvalRequest
                  .approval_id,
                approvalRequest
                  .fingerprint
              );

          console.log(
            `[demo-approval] Approved ${approval.approval_id}`
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
                false,

              audit_checkpoint:
                demoAuditCoordinator
                  .checkpoint()
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
        req.method === "POST" &&
        url.pathname ===
          "/api/live/approve"
      ) {
        try {
          liveAccessGate
            .authenticate(
              req.headers
                .authorization
            );
        } catch (error) {
          if (
            error instanceof
              LiveAccessError
          ) {
            throw liveAccessHttpError(
              error
            );
          }

          throw error;
        }

        const approvalRequest =
          validateApprovalRequest(
            await readJsonBody(req)
          );

        try {
          const approval =
            liveAuditCoordinator
              .approve(
                approvalRequest
                  .approval_id,
                approvalRequest
                  .fingerprint
              );

          console.log(
            `[live-approval] Approved ${approval.approval_id}`
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
                false,

              audit_checkpoint:
                liveAuditCoordinator
                  .checkpoint()
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
      const postExecutionError =
        contextGuardUiPostExecutionErrorV2(
          error
        );

      if (postExecutionError) {
        console.error(
          `[server] ${error instanceof Error ? error.message : "Post-execution evidence failure"}`
        );

        sendJson(
          res,
          postExecutionError.status,
          postExecutionError.body
        );

        return;
      }

      const preflightError =
        contextGuardUiPreflightErrorResponseV2(error);

      if (preflightError) {
        sendJson(res, preflightError.status, preflightError.body);
        return;
      }

      const uiError =
        contextGuardUiHttpError(
          error
        );

      const mappedError =
        uiError ??
        (
          error instanceof HttpError
            ? error
            : null
        );

      const status =
        mappedError
          ?.status ??
        500;

      const internalMessage =
        error instanceof Error
          ? error.message
          : "Unknown error";

      const publicMessage =
        mappedError
          ?.message ??
        UNEXPECTED_ERROR_MESSAGE;

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

server.listen(PORT, UI_LISTEN_HOST, () => {
  const shownHost =
    UI_LISTEN_HOST === "127.0.0.1"
      ? "localhost"
      : UI_LISTEN_HOST.includes(":")
        ? `[${UI_LISTEN_HOST}]`
        : UI_LISTEN_HOST;

  console.log(
    `ContextGuard UI: http://${shownHost}:${PORT}`
  );

  if (UI_LISTEN_HOST !== "127.0.0.1" && UI_LISTEN_HOST !== "::1") {
    console.log(
      `WARNING: listening on ${UI_LISTEN_HOST}, beyond this machine. Use HTTPS in front of it and list its public names in CONTEXTGUARD_ALLOWED_HOSTS.`
    );
  }

  if (githubAppConfig) {
    console.log("GitHub identity  : GitHub App user sessions (no personal-token executor)");
    console.log(`GitHub writes    : ${contextGuardUiExecutionConfig.enabled ? "ENABLED after per-user approval" : "DISABLED (kill switch)"}`);
    if (!contextGuardUiExecutionConfig.enabled) {
      console.log("To test writes   : set CONTEXTGUARD_UI_REAL_EXECUTION_ENABLED=true in .env.local, or run: npm run start:live");
    }
    console.log("OAuth tokens     : in server memory only; re-login after restart or expiry");
    console.log("Agent drafts     : per-user, memory only in GitHub App mode");
  } else for (const line of buildStartupSummary({
    realExecutionEnabled: contextGuardUiExecutionConfig.enabled,
    allowedRepositories: process.env.GITHUB_EXECUTION_ALLOWED_REPOSITORIES,
    draftTtlMinutes: agentDraftStoreConfig.ttlMinutes,
    draftFilePath: agentDraftStoreConfig.filePath
  })) {
    console.log(line);
  }

  console.log(
    "Demo endpoint : GET /api/demo"
  );

  console.log(
    "Demo approval : POST /api/demo/approve"
  );

  console.log(
    "Live endpoint : POST /api/live"
  );

  console.log(
    "Live approval : POST /api/live/approve"
  );

  console.log(
    "Legacy Cominty assessment : POST /api/live"
  );

  console.log(
    "V2 UI start : POST /api/ui/start"
  );

  console.log(
    "V2 UI approve : POST /api/ui/approve"
  );

  console.log(
    "V2 UI preflight : POST /api/ui/preflight"
  );

  console.log(
    "V2 UI receipt : POST /api/ui/receipt"
  );

  console.log(
    "V2 UI execute : POST /api/ui/execute"
  );
});
