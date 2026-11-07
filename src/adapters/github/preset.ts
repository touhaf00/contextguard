import type { CodeFixTrustedExecutionOptions } from "./trusted-executor.js";

import {
  GenericAuthorizationServiceV2
} from "../../api/v2/service.js";

import {
  TrustedExecutionContextStoreV2
} from "../../api/v2/execution-context-store.js";

import {
  GitHubRestSnapshotClientV2
} from "./rest-client.js";

import {
  GitHubRestExecutionTransportV2
} from "./execution-transport.js";

import {
  GitHubTrustedExecutorV2
} from "./trusted-executor.js";

import {
  createGitHubSnapshotResolverRegistryV2
} from "./registry.js";

import {
  createGitHubSnapshotResolverV2
} from "./snapshot-resolver.js";

import type {
  AuthorizationSessionStoreOptionsV2
} from "../../api/v2/session-store.js";

export interface GitHubExecutionPresetOptionsV2 {
  token:
    string;

  allowedRepositories:
    readonly string[];

  apiBaseUrl?:
    string;

  apiVersion?:
    string;

  userAgent?:
    string;

  fetchImpl?:
    typeof fetch;

  now?:
    () => Date;

  codeFix?: CodeFixTrustedExecutionOptions;
}

export interface GitHubAuthorizationPresetOptionsV2 {
  token?:
    string;

  apiBaseUrl?:
    string;

  executionContextStore?:
    TrustedExecutionContextStoreV2;

  sessionStoreOptions?:
    AuthorizationSessionStoreOptionsV2;

  execution?:
    GitHubExecutionPresetOptionsV2;
}

export interface GitHubAuthorizationPresetV2 {
  client:
    GitHubRestSnapshotClientV2;

  contextStore:
    TrustedExecutionContextStoreV2;

  service:
    GenericAuthorizationServiceV2;

  executionTransport?:
    GitHubRestExecutionTransportV2;

  executor?:
    GitHubTrustedExecutorV2;
}

export function createGitHubAuthorizationPresetV2(
  options:
    GitHubAuthorizationPresetOptionsV2 = {}
): GitHubAuthorizationPresetV2 {
  const client =
    new GitHubRestSnapshotClientV2({
      token:
        options.token,

      apiBaseUrl:
        options.apiBaseUrl
    });

  const registry =
    createGitHubSnapshotResolverRegistryV2(
      client
    );

  const contextStore =
    options.executionContextStore ??
    new TrustedExecutionContextStoreV2();

  let executionTransport:
    GitHubRestExecutionTransportV2 |
    undefined;

  let executor:
    GitHubTrustedExecutorV2 |
    undefined;

  if (
    options.execution
  ) {
    executionTransport =
      new GitHubRestExecutionTransportV2({
        token:
          options.execution.token,

        apiBaseUrl:
          options.execution
            .apiBaseUrl,

        apiVersion:
          options.execution
            .apiVersion,

        userAgent:
          options.execution
            .userAgent,

        fetchImpl:
          options.execution
            .fetchImpl
      });

    const executionStateResolver =
      createGitHubSnapshotResolverV2(
        client,
        {
          resolverId:
            "github.execution-snapshot"
        }
      );

    executor =
      new GitHubTrustedExecutorV2({
        transport:
          executionTransport,

        stateResolver:
          executionStateResolver,

        allowedRepositories:
          options.execution
            .allowedRepositories,

        now:
          options.execution
            .now,

        codeFix: options.execution.codeFix
      });
  }

  const service =
    new GenericAuthorizationServiceV2({
      preflightResolverRegistry:
        registry,

      preflightContextProvider:
        contextStore,

      sessionStoreOptions:
        options.sessionStoreOptions,

      trustedExecutor:
        executor
    });

  return {
    client,
    contextStore,
    service,

    ...(executionTransport
      ? {
          executionTransport
        }
      : {}),

    ...(executor
      ? {
          executor
        }
      : {})
  };
}
