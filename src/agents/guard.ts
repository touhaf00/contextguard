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

function buildGuardPrompt(
  input: Mission,
  workerReport: WorkerReport
): string {
  return `
Independently verify the following Worker assessment.

Original mission:
${input.mission}

Repository:
${input.repository}

Target:
${JSON.stringify(input.target, null, 2)}

Worker report:
${JSON.stringify(workerReport, null, 2)}

Verify the Worker report according to your ContextGuard instructions.

Do not perform any write operation.

Return the complete ContextGuard report using your required JSON schema.
Return JSON only.
`.trim();
}

export async function runGuard(
  input: Mission,
  workerReport: WorkerReport
): Promise<GuardReport> {
  const {
    client,
    guardAgentId
  } = getComintyRuntime();

  console.log(
    "[guard] Verifying evidence"
  );

  // Each verification starts in a fresh thread so
  // ContextGuard stays independent from the Worker.
  const run = await client.chat.start({
    agentId: guardAgentId,
    message:
      buildGuardPrompt(
        input,
        workerReport
      )
  });

  return extractJson<GuardReport>(
    await run.text()
  );
}
