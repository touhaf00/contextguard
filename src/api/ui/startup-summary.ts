export interface StartupSummaryInput {
  realExecutionEnabled: boolean;
  allowedRepositories: string | undefined;
  draftTtlMinutes: number;
  draftFilePath: string | undefined;
}

const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

function describeAllowlist(raw: string | undefined): string {
  const entries = (raw ?? "")
    .split(",")
    .map(entry => entry.trim())
    .filter(Boolean);
  if (entries.length === 0) return "none configured";
  return entries
    .map(entry => (REPOSITORY.test(entry) ? entry : "(invalid entry hidden)"))
    .join(", ");
}

export function buildStartupSummary(input: StartupSummaryInput): string[] {
  const lines: string[] = [];
  if (input.realExecutionEnabled) {
    lines.push(
      `GitHub writes     : ENABLED - allowlist: ${describeAllowlist(input.allowedRepositories)}`
    );
    lines.push(
      "WARNING           : real issue creation is ON. Use a disposable demo repository."
    );
  } else {
    lines.push(
      "GitHub writes     : DISABLED (kill switch) - no external write can occur"
    );
  }
  lines.push(
    input.draftFilePath
      ? `Agent drafts      : kept ${input.draftTtlMinutes} min, saved to ${input.draftFilePath} (survive restarts)`
      : `Agent drafts      : kept ${input.draftTtlMinutes} min, memory only (lost on restart)`
  );
  return lines;
}
