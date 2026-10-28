export const ASSESSMENT_TYPES = [
  "technical_release",
  "deployment_readiness",
  "custom"
] as const;

export type AssessmentType =
  (typeof ASSESSMENT_TYPES)[number];

const TECHNICAL_RELEASE_POLICY = `
Assess the technical release readiness of the requested repository target.

For this assessment, technical readiness means:

1. The requested target resolves to a specific repository state.
2. Repository-established automated tests or validation checks that are relevant to this target have sufficient successful execution evidence.
3. Repository-established build mechanisms that are relevant to this target have sufficient successful execution evidence.
4. Required workflow or dependency ordering does not allow a required downstream stage to bypass failed prerequisites.
5. No verified material technical blocker exists in the repository-established mechanisms relevant to this target.

Autonomously discover which tests, builds, checks, workflows, packaging mechanisms, publication mechanisms, deployment mechanisms, or other technical controls are actually relevant to this repository.

Do not invent release requirements merely because they are common industry conventions.

Image publication is not required unless the repository or requested target establishes it as a requirement.

Deployment is not required unless the repository or requested target establishes it as a requirement.

Do not infer semantic effects from job names, step names, workflow names, or successful statuses alone.

When execution output is decision-critical, inspect the strongest available execution evidence.

Return READY when the technical readiness criteria above are sufficiently verified and no material blocker exists.

Return NOT_READY when verified evidence establishes a material technical blocker.

Return UNKNOWN when decision-critical evidence required by this policy cannot responsibly be verified.
`.trim();

const DEPLOYMENT_READINESS_POLICY = `
Assess whether the requested repository target is technically ready to proceed to deployment approval.

For this assessment, deployment readiness means:

1. The requested target resolves to a specific repository state.
2. Repository-established test, validation, and build prerequisites for deployment are satisfied.
3. A real deployment mechanism or deployment configuration relevant to this target is established by repository evidence.
4. Required deployment inputs, artifacts, dependencies, or workflow prerequisites are available when they can be verified.
5. No verified material blocker prevents the deployment mechanism from being used for this target.

A deployment does not need to have already occurred in order for the target to be deployment-ready.

However, if prior deployment execution is used as evidence, distinguish successful workflow execution from proof that the real deployment effect occurred.

A job or step named deploy is not proof of deployment.

Do not invent deployment requirements that the repository itself does not establish.

Return READY when the deployment-readiness criteria above are sufficiently verified and no material blocker exists.

Return NOT_READY when verified evidence establishes a material deployment blocker.

Return UNKNOWN when decision-critical deployment evidence cannot responsibly be verified.
`.trim();

function withAdditionalInstructions(
  base: string,
  instructions: string
): string {
  const trimmed =
    instructions.trim();

  if (!trimmed) {
    return base;
  }

  return `${base}

Additional user instructions:

${trimmed}`;
}

export function buildAssessmentMission(
  type: AssessmentType,
  instructions = ""
): string {
  if (type === "technical_release") {
    return withAdditionalInstructions(
      TECHNICAL_RELEASE_POLICY,
      instructions
    );
  }

  if (type === "deployment_readiness") {
    return withAdditionalInstructions(
      DEPLOYMENT_READINESS_POLICY,
      instructions
    );
  }

  const custom =
    instructions.trim();

  if (!custom) {
    throw new Error(
      "Custom assessment instructions are required."
    );
  }

  return custom;
}
