import {
  APIConnectionError,
  APIError,
  AuthError,
  ComintyError,
  InvalidParams,
  PermissionError,
  RateLimitError,
  StreamInterrupted
} from "@cominty-ai/sdk";
import { GitHubRestClientErrorV2 } from "../../adapters/github/rest-client.js";
import { GitHubTrustedExecutorErrorV2 } from "../../adapters/github/trusted-executor.js";
import { TrustedExecutorStateErrorV2 } from "../../core/trusted-executor.js";
import { PromptTooLargeError } from "./prompt-budget.js";

export interface PipelineHttpError {
  readonly status: number;
  readonly message: string;
}

const NOTHING_WRITTEN = "Nothing was written to GitHub.";

const STATE_CHANGED =
  `The repository changed while Cominty and the Guard were checking it, so the evidence no longer agrees. ${NOTHING_WRITTEN} Prepare a new proposal.`;

function codeFixMessage(message: string): string {
  const detail = message
    .replace(/^CODE_FIX_DENIED:\s*/, "")
    .replace(/[^\x20-\x7e]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
  return `ContextGuard refused this code fix: ${detail || "it breaks a safety rule"}. See the server log for details.`;
}

const PLAIN_ERRORS: Array<[RegExp, (message: string) => PipelineHttpError]> = [
  [/^GITHUB_DUPLICATE_ISSUE:/, () => ({
    status: 409,
    message: `An open issue with exactly this title already exists, so creating another would be a duplicate. ${NOTHING_WRITTEN}`
  })],
  [/^GITHUB_(ISSUES_STATE_CHANGED|SOURCE_EVIDENCE_CHANGED|OBSERVATION_CHANGED|PROVIDER_INCONSISTENT):/, () => ({
    status: 409,
    message: STATE_CHANGED
  })],
  [/^GITHUB_ISSUE_CHANGED:/, () => ({
    status: 409,
    message: `The issue changed after Cominty read it. ${NOTHING_WRITTEN} Prepare a new proposal.`
  })],
  [/^INVALID_ISSUE_BINDING/, () => ({
    status: 400,
    message: `The issue in this request does not match the one Cominty prepared. ${NOTHING_WRITTEN} Prepare a new proposal.`
  })],
  [/^CODE_FIX_DENIED:/, message => ({ status: 422, message: codeFixMessage(message) })],
  [/^GitHub commit does not match the branch reference\./, () => ({
    status: 409,
    message: STATE_CHANGED
  })]
];

export function pipelineHttpError(error: unknown): PipelineHttpError | null {
  if (error instanceof PromptTooLargeError) {
    return {
      status: 422,
      message:
        "The evidence for this action is too large for one agent message, even after shortening it. " +
        `${NOTHING_WRITTEN} Choose a narrower task: a specific issue number, or a smaller change.`
    };
  }

  if (error instanceof RateLimitError) {
    return error.scope === "concurrency"
      ? { status: 429, message: `Cominty is busy with other conversations. Wait a few seconds and run it again. ${NOTHING_WRITTEN}` }
      : { status: 429, message: `The Cominty quota is used up for now. Wait, or raise the limit in your Cominty plan. ${NOTHING_WRITTEN}` };
  }
  if (error instanceof AuthError || error instanceof PermissionError) {
    return {
      status: 502,
      message: `Cominty refused the API key or the access of the configured agents. Check COMINTY_API_KEY and the Worker and Guard agent ids. ${NOTHING_WRITTEN}`
    };
  }
  if (error instanceof InvalidParams) {
    return {
      status: 502,
      message: `Cominty rejected the message ContextGuard sent (its size or format). ${NOTHING_WRITTEN} The server log has the exact reason.`
    };
  }
  if (error instanceof APIConnectionError || error instanceof StreamInterrupted) {
    return {
      status: 502,
      message: `Cominty could not be reached or stopped answering. Check the network and try again. ${NOTHING_WRITTEN}`
    };
  }
  if (error instanceof APIError) {
    return {
      status: 502,
      message: `Cominty answered with an error (HTTP ${error.status}). Try again in a moment. ${NOTHING_WRITTEN}`
    };
  }
  if (error instanceof ComintyError) {
    return { status: 502, message: `Cominty could not complete this step. Try again. ${NOTHING_WRITTEN}` };
  }

  if (error instanceof TrustedExecutorStateErrorV2) {
    if (error.code === "STATE_UNAVAILABLE") {
      return {
        status: 503,
        message: `GitHub could not be read again immediately before the write, so ContextGuard did not write. ${NOTHING_WRITTEN} Prepare a new proposal and approve it again.`
      };
    }
    if (/^GITHUB_DUPLICATE_ISSUE:/.test(error.message)) {
      return {
        status: 409,
        message: `An open issue with exactly this title was found immediately before the write, so creating another would be a duplicate. ${NOTHING_WRITTEN}`
      };
    }
    return {
      status: 409,
      message: `The branch changed after your approval, so the approved evidence no longer holds. ${NOTHING_WRITTEN} Prepare a new proposal.`
    };
  }
  if (error instanceof GitHubTrustedExecutorErrorV2 && (error.code === "EXECUTION_FAILED" || error.code === "INVALID_RESULT")) {
    return {
      status: 502,
      message:
        "GitHub did not confirm the write, so it may or may not have happened. Check the repository on GitHub before " +
        "trying again. The approval was used and cannot be reused."
    };
  }

  if (error instanceof GitHubRestClientErrorV2) {
    if (error.code === "INVALID_CONFIG" || error.code === "INVALID_REPOSITORY") {
      return {
        status: 400,
        message: `The repository, branch or issue number is not valid. ${NOTHING_WRITTEN}`
      };
    }
    return {
      status: 502,
      message:
        "GitHub could not be read just now (network, rate limit or missing App permission). " +
        `${NOTHING_WRITTEN} Try again; if it keeps happening, check the GitHub App permissions.`
    };
  }

  if (error instanceof Error) {
    for (const [pattern, build] of PLAIN_ERRORS) {
      if (pattern.test(error.message)) return build(error.message);
    }
  }
  return null;
}

export const UNEXPECTED_ERROR_MESSAGE =
  "Unexpected error. Nothing was written to GitHub. The terminal where ContextGuard runs shows the details; " +
  "run the step again, and if it keeps happening send that line to the maintainers.";
