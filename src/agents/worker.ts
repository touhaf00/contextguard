import {
  getComintyRuntime
} from "../cominty.js";

import {
  extractJson
} from "../lib/extract-json.js";

import type {
  GuardReport,
  Mission,
  WorkerReport
} from "../types.js";

function buildWorkerPrompt(
  input: Mission
): string {
  return `
Assess the release readiness of the requested repository and target
using only verifiable repository evidence.

Repository: ${input.repository}

Target:
${JSON.stringify(input.target, null, 2)}

Mission:
${input.mission}

Constraints:
${JSON.stringify(input.constraints, null, 2)}

Do not modify, create, delete, trigger, merge, deploy, or update anything.

Return the complete Worker report using your required JSON schema.
Return JSON only.
`.trim();
}

function buildRetryPrompt(
  guardReport: GuardReport
): string {
  const checks =
    guardReport.requested_checks ?? [];

  const requestedChecks =
    checks.length > 0
      ? checks
          .map(
            (item, index) =>
              `${index + 1}. [${item.finding_id}] ${item.check}`
          )
          .join("\n")
      : "No targeted checks were supplied.";

  return `
This is a targeted evidence-recovery request following an independent
ContextGuard review.

Do not repeat the complete investigation.

Perform only the requested checks, plus the minimum retrieval necessary
to interpret them correctly.

Requested checks:

${requestedChecks}

ContextGuard summary:

${guardReport.summary}

Use primary repository evidence whenever available.

The new evidence may confirm the previous decision, change it, or leave
the decision UNKNOWN.

Update claims affected by the new evidence.
Preserve previously verified claims unless new evidence contradicts them.
Never invent evidence.

If a requested check cannot be completed, report it as unchecked.

Do not perform any write operation.

Return the complete updated Worker report using the original Worker JSON schema.
Return JSON only.
`.trim();
}

export async function runWorker(
  input: Mission
): Promise<{
  report: WorkerReport;
  threadId: string;
}> {
  const {
    client,
    workerAgentId
  } = getComintyRuntime();

  console.log(
    "[worker] Investigating repository"
  );

  const run = await client.chat.start({
    agentId: workerAgentId,
    message: buildWorkerPrompt(input)
  });

  const raw = await run.text();

  return {
    report:
      extractJson<WorkerReport>(raw),

    threadId:
      run.thread.id
  };
}

export async function retryWorker(
  threadId: string,
  guardReport: GuardReport
): Promise<WorkerReport> {
  const {
    client,
    workerAgentId
  } = getComintyRuntime();

  console.log(
    "[worker] Running targeted evidence recovery"
  );

  const run = await client.chat.send(
    threadId,
    {
      agentId: workerAgentId,
      message:
        buildRetryPrompt(guardReport)
    }
  );

  return extractJson<WorkerReport>(
    await run.text()
  );
}
