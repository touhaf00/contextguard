const byId = (id) =>
  document.getElementById(id);

const ui = {
  demoButton: byId("demoButton"),
  liveButton: byId("liveButton"),
  demoScenario: byId("demoScenario"),

  repository: byId("repository"),
  targetType: byId("targetType"),
  targetReference: byId("targetReference"),

  assessmentType: byId("assessmentType"),
  assessmentDescription: byId("assessmentDescription"),
  advancedOptions: byId("advancedOptions"),
  customInstructions: byId("customInstructions"),
  customInstructionsLabel: byId("customInstructionsLabel"),

  results: byId("results"),

  workerDecision: byId("workerDecision"),
  workerSummary: byId("workerSummary"),
  workerConfidence: byId("workerConfidence"),

  guardVerdict: byId("guardVerdict"),
  guardSummary: byId("guardSummary"),
  coverage: byId("coverage"),
  accuracy: byId("accuracy"),
  risk: byId("risk"),

  findingsSection: byId("findingsSection"),
  findingsList: byId("findingsList"),

  retryCard: byId("retryCard"),
  retryConnector: byId("retryConnector"),
  retryUsed: byId("retryUsed"),

  gateStepNumber: byId("gateStepNumber"),
  finalStatus: byId("finalStatus"),
  retries: byId("retries"),
  externalAction: byId("externalAction"),
  humanApproval: byId("humanApproval"),

  approvalSection: byId("approvalSection"),
  approveButton: byId("approveButton"),
  approvalResult: byId("approvalResult")
};

const statusLabels = {
  STOPPED_REVIEW:
    "STOPPED — REVIEW REQUIRED",

  STOPPED_UNKNOWN:
    "STOPPED — UNKNOWN",

  BLOCKED_NOT_READY:
    "BLOCKED — NOT READY",

  BLOCKED_VERIFICATION:
    "BLOCKED — VERIFICATION FAILED",

  AWAITING_HUMAN_APPROVAL:
    "AWAITING HUMAN APPROVAL",

  NOT_READY:
    "NOT READY"
};

function percent(value) {
  return `${Math.round(value * 100)}%`;
}

function setStatus(
  element,
  value
) {
  element.textContent =
    statusLabels[value] ?? value;

  element.className =
    `status ${value
      .toLowerCase()
      .replaceAll(" ", "_")}`;
}

function renderFindings(findings = []) {
  ui.findingsList.replaceChildren();

  if (findings.length === 0) {
    ui.findingsSection.classList.add(
      "hidden"
    );

    return;
  }

  const severityOrder = {
    CRITICAL: 4,
    HIGH: 3,
    MEDIUM: 2,
    LOW: 1
  };

  const sorted =
    [...findings].sort(
      (left, right) =>
        (severityOrder[right.severity] ?? 0) -
        (severityOrder[left.severity] ?? 0)
    );

  for (const finding of sorted) {
    const item =
      document.createElement("div");

    item.className =
      "dynamic-finding";

    const header =
      document.createElement("div");

    header.className =
      "dynamic-finding-header";

    const type =
      document.createElement("span");

    type.className =
      "finding-type";

    type.textContent =
      String(
        finding.type ?? "FINDING"
      ).replaceAll("_", " ");

    const severity =
      document.createElement("strong");

    severity.className =
      `finding-severity severity-${String(
        finding.severity ?? "MEDIUM"
      ).toLowerCase()}`;

    severity.textContent =
      finding.severity ?? "MEDIUM";

    header.append(
      type,
      severity
    );

    const description =
      document.createElement("p");

    description.textContent =
      finding.description ??
      "Verification finding.";

    item.append(
      header,
      description
    );

    if (finding.required_check) {
      const check =
        document.createElement("div");

      check.className =
        "required-check";

      const label =
        document.createElement("span");

      label.textContent =
        "Required check";

      const text =
        document.createElement("div");

      text.textContent =
        finding.required_check;

      check.append(
        label,
        text
      );

      item.append(check);
    }

    ui.findingsList.append(item);
  }

  ui.findingsSection.classList.remove(
    "hidden"
  );
}

function renderRetry(data) {
  if (data.retry_count > 0) {
    ui.retryUsed.textContent =
      `${data.retry_count} / ${data.max_retries}`;

    ui.retryCard.classList.remove(
      "hidden"
    );

    ui.retryConnector.classList.remove(
      "hidden"
    );

    ui.gateStepNumber.textContent =
      "04";

    return;
  }

  ui.retryCard.classList.add(
    "hidden"
  );

  ui.retryConnector.classList.add(
    "hidden"
  );

  ui.gateStepNumber.textContent =
    "03";
}

function renderApproval(data) {
  ui.approveButton.disabled = false;

  ui.approveButton.textContent =
    "Approve next stage";

  ui.approvalResult.classList.add(
    "hidden"
  );

  if (
    data.human_approval_required
  ) {
    ui.approvalSection.classList.remove(
      "hidden"
    );

    return;
  }

  ui.approvalSection.classList.add(
    "hidden"
  );
}

function renderResult(data) {
  setStatus(
    ui.workerDecision,
    data.worker.decision
  );

  ui.workerSummary.textContent =
    data.worker.summary;

  ui.workerConfidence.textContent =
    percent(
      data.worker.confidence
    );

  setStatus(
    ui.guardVerdict,
    data.guard.verdict
  );

  ui.guardSummary.textContent =
    data.guard.summary;

  ui.coverage.textContent =
    percent(
      data.guard.evidence_coverage
    );

  ui.accuracy.textContent =
    percent(
      data.guard.claim_accuracy
    );

  ui.risk.textContent =
    data.guard.risk;

  renderFindings(
    data.guard.findings ?? []
  );

  renderRetry(data);

  setStatus(
    ui.finalStatus,
    data.status
  );

  ui.retries.textContent =
    `${data.retry_count} / ${data.max_retries}`;

  ui.externalAction.textContent =
    data.external_action_executed
      ? "Executed"
      : "Not executed";

  ui.humanApproval.textContent =
    data.human_approval_required
      ? "Required"
      : "Not available";

  renderApproval(data);

  ui.results.classList.remove(
    "hidden"
  );

  ui.results.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

async function requestJson(
  url,
  options
) {
  const response =
    await fetch(
      url,
      options
    );

  const data =
    await response.json();

  if (!response.ok) {
    throw new Error(
      data.error ??
      "Request failed."
    );
  }

  return data;
}

ui.demoButton.addEventListener(
  "click",
  async () => {
    ui.demoButton.disabled = true;

    ui.demoButton.textContent =
      "Loading demo...";

    try {
      const scenario =
        ui.demoScenario.value;

      const data =
        await requestJson(
          `/api/demo?scenario=${encodeURIComponent(
            scenario
          )}`
        );

      renderResult(data);
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "Unable to load demo."
      );
    } finally {
      ui.demoButton.disabled = false;

      ui.demoButton.textContent =
        "Load demo";
    }
  }
);

ui.liveButton.addEventListener(
  "click",
  async () => {
    const repository =
      ui.repository.value.trim();

    const targetType =
      ui.targetType.value;

    const targetReference =
      ui.targetReference.value.trim();

    const assessmentType =
      ui.assessmentType.value;

    const customInstructions =
      ui.customInstructions.value.trim();

    if (!repository) {
      alert(
        "Repository is required."
      );

      return;
    }

    if (
      assessmentType === "custom" &&
      !customInstructions
    ) {
      alert(
        "Custom assessment instructions are required."
      );

      ui.advancedOptions.open = true;
      ui.customInstructions.focus();

      return;
    }

    if (
      targetType !== "current_state" &&
      !targetReference
    ) {
      alert(
        "Target reference is required."
      );

      return;
    }

    const confirmed =
      confirm(
        "Run a live ContextGuard assessment?\n\n" +
        "This calls the Worker and ContextGuard and may consume Cominty credits.\n\n" +
        "No GitHub write operation will be performed."
      );

    if (!confirmed) {
      return;
    }

    ui.demoButton.disabled = true;
    ui.liveButton.disabled = true;

    ui.liveButton.textContent =
      "Running live assessment...";

    try {
      const data =
        await requestJson(
          "/api/live",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json"
            },

            body: JSON.stringify({
              repository,

              target: {
                type: targetType,

                ...(targetType !==
                "current_state"
                  ? {
                      reference:
                        targetReference
                    }
                  : {})
              },

              assessment_type:
                assessmentType,

              custom_instructions:
                customInstructions
            })
          }
        );

      renderResult(data);
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "Live assessment failed."
      );
    } finally {
      ui.demoButton.disabled = false;
      ui.liveButton.disabled = false;

      ui.liveButton.textContent =
        "Run live assessment";
    }
  }
);

const assessmentDescriptions = {
  technical_release:
    "Agents autonomously discover and verify the repository's release-relevant tests, builds, workflows and technical blockers.",

  deployment_readiness:
    "Agents verify whether the target satisfies the repository-established prerequisites for deployment approval.",

  custom:
    "Define a custom verification mission. ContextGuard will still independently verify the Worker's evidence."
};

function updateAssessmentUi() {
  const type =
    ui.assessmentType.value;

  ui.assessmentDescription.textContent =
    assessmentDescriptions[type] ??
    assessmentDescriptions.technical_release;

  if (type === "custom") {
    ui.customInstructionsLabel.textContent =
      "Custom assessment instructions";

    ui.customInstructions.placeholder =
      "Describe the decision the agents should investigate and verify.";

    ui.advancedOptions.open = true;
  } else {
    ui.customInstructionsLabel.textContent =
      "Additional instructions (optional)";

    ui.customInstructions.placeholder =
      "Add constraints or repository-specific context only if needed.";
  }
}

ui.assessmentType.addEventListener(
  "change",
  updateAssessmentUi
);

updateAssessmentUi();

ui.targetType.addEventListener(
  "change",
  () => {
    const currentState =
      ui.targetType.value ===
      "current_state";

    ui.targetReference.disabled =
      currentState;

    if (currentState) {
      ui.targetReference.value = "";

      ui.targetReference.placeholder =
        "Not required";
    } else {
      ui.targetReference.placeholder =
        "e.g. v1.1.0";
    }
  }
);

ui.approveButton.addEventListener(
  "click",
  () => {
    ui.approveButton.disabled = true;

    ui.approveButton.textContent =
      "Approved";

    ui.approvalResult.classList.remove(
      "hidden"
    );
  }
);
