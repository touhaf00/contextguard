"use strict";

const $ = id =>
  document.getElementById(id);

const controlPanel =
  document.getElementById(
    "controlPanel"
  ) ??
  document.querySelector(
    ".control-panel"
  ) ??
  document;


const elements = {
  workspacePlaygroundButton: $("workspacePlaygroundButton"),
  workspaceLiveButton: $("workspaceLiveButton"),
  simulationWorkspace: $("simulationWorkspace"),
  liveWorkspace: $("liveWorkspace"),
  simulationFrame: $("simulationFrame"),
  agentRepository: $("agentRepository"),
  agentRepoPicker: $("agentRepoPicker"),
  agentRepoPickerLabel: $("agentRepoPickerLabel"),
  agentRepoPickerStatus: $("agentRepoPickerStatus"),
  githubAppConnect: $("githubAppConnect"),
  githubAppPrivacy: $("githubAppPrivacy"),
  githubAppInstallLink: $("githubAppInstallLink"),
  operatorLoginLabel: $("operatorLoginLabel"),
  agentBranch: $("agentBranch"),
  agentObjective: $("agentObjective"),
  agentInvestigateButton: $("agentInvestigateButton"),
  agentInvestigationState: $("agentInvestigationState"),
  agentDraftPreview: $("agentDraftPreview"),
  agentDraftTitle: $("agentDraftTitle"),
  agentDraftRationale: $("agentDraftRationale"),
  agentDraftBody: $("agentDraftBody"),
  agentDraftSha: $("agentDraftSha"),
  agentDraftEvidence: $("agentDraftEvidence"),
  agentUseDraftButton: $("agentUseDraftButton"),
  agentDiscardDraftButton: $("agentDiscardDraftButton"),
  dynamicActionPanel:
    $("dynamicActionPanel"),

  actionSelector:
    $("actionSelector"),

  dynamicActionForm:
    $("dynamicActionForm"),

  startButton:
    $("startButton"),

  resetButton:
    $("resetButton"),

  workflow:
    $("workflow"),

  workflowStage:
    $("workflowStage"),

  simpleWorkflow:
    $("simpleWorkflow"),

  simpleWorkflowStage:
    $("simpleWorkflowStage"),

  simpleResourceStep:
    $("simpleResourceStep"),

  simpleAnalysisStep:
    $("simpleAnalysisStep"),

  simpleVerificationStep:
    $("simpleVerificationStep"),

  simpleLockStep:
    $("simpleLockStep"),

  simpleApprovalStep:
    $("simpleApprovalStep"),

  simplePreflightStep:
    $("simplePreflightStep"),

  simpleReceiptStep:
    $("simpleReceiptStep"),

  simpleApprovalGate:
    $("simpleApprovalGate"),

  simpleApproveButton:
    $("simpleApproveButton"),

  simpleRejectButton:
    $("simpleRejectButton"),

  simpleContinueGate:
    $("simpleContinueGate"),

  simpleContinueButton:
    $("simpleContinueButton"),

  simpleReadyPanel:
    $("simpleReadyPanel"),

  simpleExecutionGate:
    $("simpleExecutionGate"),

  simpleExecutionNotice:
    $("simpleExecutionNotice"),

  simpleExecuteConfirmation:
    $("simpleExecuteConfirmation"),

  simpleExecuteButton:
    $("simpleExecuteButton"),

  simpleModeButton:
    $("simpleModeButton"),

  advancedModeButton:
    $("advancedModeButton"),

  capabilityCatalog:
    $("capabilityCatalog"),

  providerSelectionSummary:
    $("providerSelectionSummary"),

  connectionStatus:
    $("connectionStatus"),

  authGate:
    $("authGate"),

  authCard:
    $("authCard"),

  tryDemoButton:
    $("tryDemoButton"),

  publicDemoPanel:
    $("publicDemoPanel"),

  demoScenario:
    $("demoScenario"),

  demoProgress:
    $("demoProgress"),

  demoStatus:
    $("demoStatus"),

  demoTitle:
    $("demoTitle"),

  demoDescription:
    $("demoDescription"),

  demoBackButton:
    $("demoBackButton"),

  demoRejectButton:
    $("demoRejectButton"),

  demoNextButton:
    $("demoNextButton"),

  demoExitButton:
    $("demoExitButton"),

  authToken:
    $("authToken"),

  authButton:
    $("authButton"),

  authError:
    $("authError"),

  logoutButton:
    $("logoutButton"),

  realExecutionStatus:
    $("realExecutionStatus"),

  globalError:
    $("globalError"),

  globalSuccess:
    $("globalSuccess"),

  snapshotStatus:
    $("snapshotStatus"),

  requestId:
    $("requestId"),

  resolvedRepository:
    $("resolvedRepository"),

  snapshotVersion:
    $("snapshotVersion"),

  snapshotObservedAt:
    $("snapshotObservedAt"),

  workerDecision:
    $("workerDecision"),

  workerSummary:
    $("workerSummary"),

  workerDecisionValue:
    $("workerDecisionValue"),

  workerConfidence:
    $("workerConfidence"),

  evidenceCount:
    $("evidenceCount"),

  claimCount:
    $("claimCount"),

  guardVerdict:
    $("guardVerdict"),

  guardSummary:
    $("guardSummary"),

  guardVerdictValue:
    $("guardVerdictValue"),

  guardRisk:
    $("guardRisk"),

  verifiedClaims:
    $("verifiedClaims"),

  findingCount:
    $("findingCount"),

  authorizationStatus:
    $("authorizationStatus"),

  sessionId:
    $("sessionId"),

  lockId:
    $("lockId"),

  lockFingerprint:
    $("lockFingerprint"),

  lockedAction:
    $("lockedAction"),

  sessionExpiresAt:
    $("sessionExpiresAt"),

  approvalStatus:
    $("approvalStatus"),

  approveButton:
    $("approveButton"),

  rejectButton:
    $("rejectButton"),

  approvalDetails:
    $("approvalDetails"),

  preflightStatus:
    $("preflightStatus"),

  authorizedSnapshot:
    $("authorizedSnapshot"),

  currentSnapshot:
    $("currentSnapshot"),

  preflightCheckedAt:
    $("preflightCheckedAt"),

  stateComparison:
    $("stateComparison"),

  preflightButton:
    $("preflightButton"),

  receiptStatus:
    $("receiptStatus"),

  receiptId:
    $("receiptId"),

  receiptExpiresAt:
    $("receiptExpiresAt"),

  receiptDigest:
    $("receiptDigest"),

  receiptButton:
    $("receiptButton"),

  executionStatus:
    $("executionStatus"),

  executeConfirmation:
    $("executeConfirmation"),

  executeButton:
    $("executeButton"),

  executionResult:
    $("executionResult"),

  proofStatus:
    $("proofStatus"),

  proofId:
    $("proofId"),

  providerResult:
    $("providerResult"),

  proofDigest:
    $("proofDigest"),

  auditEventCount:
    $("auditEventCount"),

  auditHeadHash:
    $("auditHeadHash"),

  githubIssueLink:
    $("githubIssueLink"),

  securityLabMode: $("securityLabMode"),
  securityLabGuidance: $("securityLabGuidance"),
  securityLabResult: $("securityLabResult"),
  securityLabScenarioValue: $("securityLabScenarioValue"),
  securityLabWorker: $("securityLabWorker"),
  securityLabGuard: $("securityLabGuard"),
  securityLabLockedSha: $("securityLabLockedSha"),
  securityLabClaims: $("securityLabClaims"),
  securityLabOutcome: $("securityLabOutcome")
};


const state = {
  workspaceMode:
    "live",

  capabilities:
    null,

  selectedProvider:
    null,

  selectedAction:
    null,

  fieldElements:
    new Map(),

  agentIssueDraft: null,
  agentDraftApplied: false,

  sessionId:
    null,

  authorizedSnapshot:
    null,

  receiptId:
    null,

  receiptDigest:
    null,

  executionConfigured:
    false,

  executionAttempted:
    false,

  workflowStarted:
    false,

  terminal:
    false
};


function setStatus(
  element,
  text,
  type = "neutral"
) {
  element.textContent =
    text;

  element.className =
    `status ${type}`;
}


function setVisible(
  element,
  visible
) {
  element.classList.toggle(
    "hidden",
    !visible
  );
}


function setText(
  element,
  value
) {
  element.textContent =
    value === undefined ||
    value === null ||
    value === ""
      ? "—"
      : String(value);
}


function setSimpleProgressState(
  element,
  progressState
) {
  if (!element) {
    return;
  }

  element.classList.remove(
    "pending",
    "active",
    "complete",
    "blocked"
  );

  element.classList.add(
    progressState
  );

  const icon =
    element.querySelector(
      ".simple-progress-icon"
    );

  if (!icon) {
    return;
  }

  switch (progressState) {
    case "complete":
      icon.textContent = "✓";
      break;

    case "active":
      icon.textContent = "●";
      break;

    case "blocked":
      icon.textContent = "×";
      break;

    default:
      icon.textContent = "○";
  }
}


function resetSimpleWorkflowState() {
  const steps = [
    elements.simpleResourceStep,
    elements.simpleAnalysisStep,
    elements.simpleVerificationStep,
    elements.simpleLockStep,
    elements.simpleApprovalStep,
    elements.simplePreflightStep,
    elements.simpleReceiptStep
  ];

  for (
    const step
    of steps
  ) {
    setSimpleProgressState(
      step,
      "pending"
    );
  }

  setStatus(
    elements.simpleWorkflowStage,
    "NOT STARTED",
    "neutral"
  );

  setVisible(
    elements.simpleApprovalGate,
    false
  );

  setVisible(
    elements.simpleContinueGate,
    false
  );

  elements.simpleContinueButton
    .disabled =
      true;

  setVisible(
    elements.simpleReadyPanel,
    false
  );

  setVisible(
    elements.simpleExecutionGate,
    false
  );

  elements.simpleExecutionNotice
    .textContent =
      "Waiting for server execution policy.";

  elements.simpleExecuteConfirmation
    .value = "";

  elements.simpleExecuteConfirmation
    .disabled =
      true;

  elements.simpleExecuteButton
    .disabled =
      true;

  elements.simpleApproveButton
    .disabled =
      true;

  elements.simpleRejectButton
    .disabled =
      true;
}


function renderSimpleStartState(
  result
) {
  const authorization =
    result.authorization;

  const session =
    authorization?.session;

  const lock =
    authorization?.lock;

  setSimpleProgressState(
    elements.simpleResourceStep,
    "complete"
  );

  setSimpleProgressState(
    elements.simpleAnalysisStep,
    "complete"
  );

  setSimpleProgressState(
    elements.simpleVerificationStep,
    "complete"
  );

  setSimpleProgressState(
    elements.simpleLockStep,
    lock
      ? "complete"
      : "blocked"
  );

  setVisible(
    elements.simpleReadyPanel,
    false
  );

  setVisible(
    elements.simpleApprovalGate,
    false
  );

  setVisible(
    elements.simpleContinueGate,
    false
  );

  elements.simpleContinueButton
    .disabled =
      true;

  elements.simpleApproveButton
    .disabled =
      true;

  elements.simpleRejectButton
    .disabled =
      true;

  if (
    result.stage ===
      "AWAITING_HUMAN_APPROVAL" &&
    session &&
    lock
  ) {
    setSimpleProgressState(
      elements.simpleApprovalStep,
      "active"
    );

    setStatus(
      elements.simpleWorkflowStage,
      "REVIEW REQUIRED",
      "warning"
    );

    setVisible(
      elements.simpleApprovalGate,
      true
    );

    elements.simpleApproveButton
      .disabled =
        false;

    elements.simpleRejectButton
      .disabled =
        false;

    return;
  }

  if (
    result.stage ===
      "READY_FOR_PREFLIGHT" &&
    session &&
    lock
  ) {
    setSimpleProgressState(
      elements.simpleApprovalStep,
      "complete"
    );

    setSimpleProgressState(
      elements.simplePreflightStep,
      "active"
    );

    setStatus(
      elements.simpleWorkflowStage,
      "FINAL CHECK",
      "warning"
    );

    setVisible(
      elements.simpleContinueGate,
      true
    );

    elements.simpleContinueButton
      .disabled =
        false;

    return;
  }

  setSimpleProgressState(
    elements.simpleApprovalStep,
    "pending"
  );

  setSimpleProgressState(
    elements.simplePreflightStep,
    "pending"
  );

  setSimpleProgressState(
    elements.simpleReceiptStep,
    "pending"
  );

  setStatus(
    elements.simpleWorkflowStage,
    authorization?.status ??
      "STOPPED SAFELY",
    "danger"
  );
}


function renderSimpleApprovalDecision(
  decision
) {
  setVisible(
    elements.simpleApprovalGate,
    false
  );

  elements.simpleApproveButton
    .disabled =
      true;

  elements.simpleRejectButton
    .disabled =
      true;

  setVisible(
    elements.simpleContinueGate,
    false
  );

  elements.simpleContinueButton
    .disabled =
      true;

  if (
    decision ===
      "APPROVED"
  ) {
    setSimpleProgressState(
      elements.simpleApprovalStep,
      "complete"
    );

    setSimpleProgressState(
      elements.simplePreflightStep,
      "active"
    );

    setStatus(
      elements.simpleWorkflowStage,
      "FINAL CHECK",
      "warning"
    );

    setVisible(
      elements.simpleContinueGate,
      true
    );

    elements.simpleContinueButton
      .disabled =
        false;

    return;
  }

  setSimpleProgressState(
    elements.simpleApprovalStep,
    "blocked"
  );

  setStatus(
    elements.simpleWorkflowStage,
    "REJECTED",
    "danger"
  );
}


function renderSimplePreflightState(
  successful
) {
  setVisible(
    elements.simpleContinueGate,
    false
  );

  elements.simpleContinueButton
    .disabled =
      true;

  setSimpleProgressState(
    elements.simplePreflightStep,
    successful
      ? "complete"
      : "blocked"
  );

  if (successful) {
    setSimpleProgressState(
      elements.simpleReceiptStep,
      "active"
    );

    setStatus(
      elements.simpleWorkflowStage,
      "PREPARING AUTHORIZATION",
      "warning"
    );

    return;
  }

  setStatus(
    elements.simpleWorkflowStage,
    "BLOCKED",
    "danger"
  );
}


function renderSimpleReceiptReady() {
  setSimpleProgressState(
    elements.simpleReceiptStep,
    "complete"
  );

  setVisible(
    elements.simpleReadyPanel,
    true
  );

  setVisible(
    elements.simpleExecutionGate,
    true
  );

  elements.simpleExecuteConfirmation
    .value = "";

  if (
    state.executionConfigured
  ) {
    setStatus(
      elements.simpleWorkflowStage,
      "READY TO EXECUTE",
      "warning"
    );

    elements.simpleExecutionNotice
      .textContent =
        "Authorization is ready. Type EXECUTE to allow the single-use external action.";

    elements.simpleExecuteConfirmation
      .disabled =
        false;
  } else {
    setStatus(
      elements.simpleWorkflowStage,
      "AUTHORIZED · EXECUTION DISABLED",
      "success"
    );

    elements.simpleExecutionNotice
      .textContent =
        "Authorization completed safely. Real external execution is disabled by server policy.";

    elements.simpleExecuteConfirmation
      .disabled =
        true;
  }

  updateSimpleExecuteButton();
}


function formatDate(
  value
) {
  if (!value) {
    return "—";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return String(value);
  }

  return date
    .toLocaleString();
}


function formatConfidence(
  value
) {
  if (
    typeof value !==
      "number"
  ) {
    return "—";
  }

  return `${Math.round(
    value * 100
  )}%`;
}


function errorMessage(
  body,
  fallback
) {
  if (
    body &&
    typeof body.error ===
      "object" &&
    body.error &&
    typeof body.error.message ===
      "string"
  ) {
    return body.error.message;
  }

  if (
    body &&
    typeof body.error ===
      "string"
  ) {
    return body.error;
  }

  if (
    body &&
    typeof body.message ===
      "string"
  ) {
    return body.message;
  }

  return fallback;
}


function showError(
  message
) {
  elements.globalError
    .textContent =
      message;

  setVisible(
    elements.globalError,
    true
  );

  setVisible(
    elements.globalSuccess,
    false
  );
}


function showSuccess(
  message
) {
  elements.globalSuccess
    .textContent =
      message;

  setVisible(
    elements.globalSuccess,
    true
  );

  setVisible(
    elements.globalError,
    false
  );
}


function clearMessages() {
  elements.globalError
    .textContent = "";

  elements.globalSuccess
    .textContent = "";

  setVisible(
    elements.globalError,
    false
  );

  setVisible(
    elements.globalSuccess,
    false
  );
}


async function postUi(
  path,
  body
) {
  const response =
    await fetch(
      path,
      {
        method:
          "POST",

        credentials:
          "same-origin",

        headers: {
          "content-type":
            "application/json"
        },

        body:
          JSON.stringify(
            body
          )
      }
    );

  const text =
    await response.text();

  let payload =
    {};

  if (text) {
    try {
      payload =
        JSON.parse(text);
    } catch {
      payload = {
        raw_response:
          text
      };
    }
  }

  if (!response.ok) {
    const error =
      new Error(
        errorMessage(
          payload,
          `HTTP ${response.status}`
        )
      );

    error.status =
      response.status;

    error.body =
      payload;

    throw error;
  }

  return payload;
}


function setBusy(
  button,
  busy,
  busyText
) {
  if (!button) {
    return;
  }

  if (busy) {
    button.dataset
      .normalText =
        button.textContent;

    button.textContent =
      busyText;

    button.disabled =
      true;

    return;
  }

  if (
    button.dataset
      .normalText
  ) {
    button.textContent =
      button.dataset
        .normalText;

    delete button.dataset
      .normalText;
  }
}


function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function capabilityStatusLabel(
  status
) {
  switch (status) {
    case "LIVE_ADAPTER":
      return "READY TO USE";

    case "AUTHORIZATION_MODEL_ONLY":
      return "PROTECTION AVAILABLE";

    case "CORE_API_AVAILABLE":
      return "CUSTOM INTEGRATION";

    case "PLANNED":
      return "COMING SOON";

    default:
      return "UNAVAILABLE";
  }
}


function capabilityStatusClass(
  status
) {
  if (
    status ===
      "LIVE_ADAPTER"
  ) {
    return "live";
  }

  return "core";
}


function setProviderFormVisible(
  visible
) {
  if (!controlPanel) {
    throw new Error(
      "ContextGuard control panel is missing from the page."
    );
  }

  elements.dynamicActionPanel
    .classList.toggle(
      "hidden",
      !visible
    );

  const dangerNote =
    controlPanel.querySelector(
      ".danger-note"
    );

  if (dangerNote) {
    dangerNote.classList.toggle(
      "hidden",
      !visible
    );
  }

  const buttonRow =
    controlPanel.querySelector(
      ".button-row"
    );

  if (buttonRow) {
    buttonRow.classList.toggle(
      "hidden",
      !visible
    );
  }
}


function providerById(
  providerId
) {
  if (
    !state.capabilities
  ) {
    return null;
  }

  for (
    const category
    of state.capabilities
      .categories
  ) {
    const provider =
      category.providers.find(
        item =>
          item.id ===
          providerId
      );

    if (provider) {
      return {
        category,
        provider
      };
    }
  }

  return null;
}


function selectedProviderCapability() {
  const match =
    providerById(
      state.selectedProvider
    );

  return match
    ?.provider ??
    null;
}


function selectedActionCapability() {
  const provider =
    selectedProviderCapability();

  if (!provider) {
    return null;
  }

  return (
    provider.actions.find(
      action =>
        action.id ===
        state.selectedAction
    ) ??
    null
  );
}


function createCapabilityField(
  field
) {
  const label =
    document.createElement(
      "label"
    );

  label.className =
    field.type ===
      "textarea"
      ? "full-field"
      : "dynamic-field";

  label.append(
    document.createTextNode(
      field.label
    )
  );

  let control;

  if (
    field.type ===
      "textarea"
  ) {
    control =
      document.createElement(
        "textarea"
      );
  } else if (
    field.type ===
      "select"
  ) {
    control =
      document.createElement(
        "select"
      );

    for (
      const option
      of field.options ?? []
    ) {
      const element =
        document.createElement(
          "option"
        );

      element.value =
        option.value;

      element.textContent =
        option.label;

      control.appendChild(
        element
      );
    }
  } else {
    control =
      document.createElement(
        "input"
      );

    control.type =
      field.type ===
        "number"
        ? "number"
        : "text";
  }

  control.dataset
    .capabilityField =
      field.id;

  if (
    field.placeholder
  ) {
    control.placeholder =
      field.placeholder;
  }

  if (
    field.required ===
      true
  ) {
    control.required =
      true;
  }

  if (
    Number.isInteger(
      field.max_length
    )
  ) {
    control.maxLength =
      field.max_length;
  }

  if (
    field.default_value !==
      undefined
  ) {
    control.value =
      String(
        field.default_value
      );
  }

  state.fieldElements.set(
    field.id,
    control
  );

  label.appendChild(
    control
  );

  return label;
}


function syncDynamicFieldRules() {
  const kind =
    state.fieldElements.get(
      "target_kind"
    );

  const ref =
    state.fieldElements.get(
      "target_ref"
    );

  if (
    !kind ||
    !ref
  ) {
    return;
  }

  const currentState =
    kind.value ===
      "current_state";

  ref.disabled =
    currentState;

  if (currentState) {
    ref.value = "";

    ref.placeholder =
      "Not required";
  } else {
    if (
      !ref.value.trim()
    ) {
      ref.value =
        "main";
    }

    ref.placeholder =
      kind.value ===
        "commit"
        ? "Full 40-character SHA"
        : "main";
  }
}


function renderActionFields(
  action
) {
  state.fieldElements.clear();

  elements.dynamicActionForm
    .innerHTML = "";

  for (
    const field
    of action.fields
  ) {
    elements.dynamicActionForm
      .appendChild(
        createCapabilityField(
          field
        )
      );
  }

  const kind =
    state.fieldElements.get(
      "target_kind"
    );

  if (kind) {
    kind.addEventListener(
      "change",
      syncDynamicFieldRules
    );
  }

  syncDynamicFieldRules();
}


function selectAction(
  actionId
) {
  maintenancePendingAction = null;

  const provider =
    selectedProviderCapability();

  if (!provider) {
    return;
  }

  const action =
    provider.actions.find(
      item =>
        item.id ===
        actionId
    );

  if (!action) {
    showError(
      "Unknown action for this integration."
    );

    return;
  }

  state.selectedAction =
    action.id;

  renderActionFields(
    action
  );

  elements.startButton
    .disabled =
      action.execution_supported !==
      true;

  clearMessages();

  if (
    action.execution_supported ===
      true
  ) {
    showSuccess(
      `${provider.name} · ${action.label} is ready for protected authorization.`
    );
  } else {
    showError(
      `${action.label} is represented in the ContextGuard authorization model but has no live executor yet.`
    );
  }
}


function renderProviderActions(
  provider
) {
  elements.actionSelector
    .innerHTML = "";

  for (
    const action
    of provider.actions
  ) {
    const option =
      document.createElement(
        "option"
      );

    option.value =
      action.id;

    option.textContent =
      action.label;

    elements.actionSelector
      .appendChild(
        option
      );
  }

  if (
    provider.actions.length ===
      0
  ) {
    state.selectedAction =
      null;

    elements.dynamicActionForm
      .innerHTML = "";

    return;
  }

  selectAction(
    provider.actions[0].id
  );
}


function selectProvider(
  providerId
) {
  clearMessages();

  const match =
    providerById(
      providerId
    );

  if (!match) {
    showError(
      "Unknown ContextGuard integration."
    );

    return;
  }

  const {
    category,
    provider
  } = match;

  for (
    const card
    of elements
      .capabilityCatalog
      .querySelectorAll(
        ".provider-card"
      )
  ) {
    card.classList.toggle(
      "selected",
      card.dataset
        .providerId ===
        providerId
    );
  }

  elements
    .providerSelectionSummary
    .classList.remove(
      "hidden"
    );

  elements
    .providerSelectionSummary
    .innerHTML =
      `
        <div>
          <span class="selection-eyebrow">
            ${escapeHtml(category.label)}
          </span>

          <strong>
            ${escapeHtml(provider.name)}
          </strong>

          <p>
            ${escapeHtml(provider.description)}
          </p>
        </div>

        <span class="capability-state ${capabilityStatusClass(provider.status)}">
          ${capabilityStatusLabel(provider.status)}
        </span>
      `;

  state.selectedProvider =
    provider.selectable
      ? provider.id
      : null;

  state.selectedAction =
    null;

  state.fieldElements
    .clear();

  if (
    provider.selectable !==
      true
  ) {
    setProviderFormVisible(
      false
    );

    elements.startButton
      .disabled =
        true;

    showError(
      `${provider.name} is visible in the ContextGuard catalog, but its simplified live browser adapter is not available yet.`
    );

    return;
  }

  setProviderFormVisible(
    true
  );

  renderProviderActions(
    provider
  );
}


elements.actionSelector
  .addEventListener(
    "change",
    event =>
      selectAction(
        event.target.value
      )
  );


function renderCapabilities(
  catalog
) {
  state.capabilities =
    catalog;

  state.selectedProvider =
    null;

  state.selectedAction =
    null;

  elements.capabilityCatalog
    .innerHTML = "";

  for (
    const category
    of catalog.categories
  ) {
    const group =
      document.createElement(
        "section"
      );

    group.className =
      "capability-group";

    const heading =
      document.createElement(
        "div"
      );

    heading.className =
      "capability-group-heading";

    heading.innerHTML =
      `
        <div>
          <h4>${escapeHtml(category.label)}</h4>
          <p>${escapeHtml(category.description)}</p>
        </div>
      `;

    group.appendChild(
      heading
    );

    const providers =
      document.createElement(
        "div"
      );

    providers.className =
      "provider-grid";

    for (
      const provider
      of category.providers
    ) {
      const card =
        document.createElement(
          "button"
        );

      card.type =
        "button";

      card.className =
        [
          "provider-card",

          provider.selectable
            ? "selectable"
            : "unavailable"
        ].join(" ");

      card.dataset.providerId =
        provider.id;

      card.setAttribute(
        "aria-disabled",
        provider.selectable
          ? "false"
          : "true"
      );

      const actionCount =
        provider.actions.length;

      card.innerHTML =
        `
          <div class="provider-card-top">
            <strong>
              ${escapeHtml(provider.name)}
            </strong>

            <span
              class="capability-state ${capabilityStatusClass(provider.status)}"
              data-capability-status="${escapeHtml(provider.status)}"
            >
              ${capabilityStatusLabel(provider.status)}
            </span>
          </div>

          <p>
            ${escapeHtml(provider.description)}
          </p>

          <div class="provider-card-footer">
            <span>
              ${actionCount}
              ${actionCount === 1
                ? "action"
                : "actions"}
            </span>

            <span
              data-executor-state="${
                provider.execution_adapter_available
                  ? "available"
                  : "unavailable"
              }"
            >
              ${
                provider.execution_adapter_available
                  ? "Protected actions ready"
                  : "Integration not connected yet"
              }
            </span>
          </div>
        `;

      card.addEventListener(
        "click",
        () =>
          selectProvider(
            provider.id
          )
      );

      providers.appendChild(
        card
      );
    }

    group.appendChild(
      providers
    );

    elements.capabilityCatalog
      .appendChild(
        group
      );
  }

  setProviderFormVisible(
    false
  );

  elements.startButton
    .disabled =
      true;
}


async function loadCapabilities() {
  const catalog =
    await requestSession(
      "/api/ui/capabilities"
    );

  const realExecutionEnabled =
    catalog
      .ui_real_execution_enabled ===
    true;

  setStatus(
    elements.realExecutionStatus,
    realExecutionEnabled
      ? "REAL EXECUTION ENABLED"
      : "REAL EXECUTION DISABLED",
    realExecutionEnabled
      ? "warning"
      : "neutral"
  );

  renderCapabilities(
    catalog
  );

  return catalog;
}


function capabilityFormValues() {
  const action =
    selectedActionCapability();

  if (!action) {
    throw new Error(
      "Choose an action before starting authorization."
    );
  }

  const values =
    {};

  for (
    const field
    of action.fields
  ) {
    const control =
      state.fieldElements.get(
        field.id
      );

    if (!control) {
      throw new Error(
        `Missing form field: ${field.label}.`
      );
    }

    let value =
      control.value;

    if (
      typeof value ===
        "string"
    ) {
      value =
        value.trim();
    }

    if (
      field.required ===
        true &&
      !control.disabled &&
      value === ""
    ) {
      throw new Error(
        `${field.label} is required.`
      );
    }

    if (
      field.max_length &&
      typeof value ===
        "string" &&
      value.length >
        field.max_length
    ) {
      throw new Error(
        `${field.label} must not exceed ${field.max_length} characters.`
      );
    }

    if (
      field.type ===
        "number" &&
      value !== ""
    ) {
      const number =
        Number(value);

      if (
        !Number.isFinite(
          number
        )
      ) {
        throw new Error(
          `${field.label} must be a number.`
        );
      }

      values[field.id] =
        number;
    } else {
      values[field.id] =
        value;
    }
  }

  return values;
}


function validateStartForm() {
  const provider =
    selectedProviderCapability();

  const action =
    selectedActionCapability();

  if (
    !provider ||
    !action
  ) {
    throw new Error(
      "Choose a supported ContextGuard integration and action."
    );
  }

  if (
    provider.selectable !==
      true ||
    action.execution_supported !==
      true
  ) {
    throw new Error(
      "This integration does not currently expose a live protected browser workflow."
    );
  }

  const values =
    capabilityFormValues();

  if (
    provider.id ===
      "github" &&
    action.id ===
      "create_issue"
  ) {
    const kind =
      values.target_kind;

    if (
      kind !==
        "branch" &&
      kind !==
        "tag" &&
      kind !==
        "commit" &&
      kind !==
        "current_state"
    ) {
      throw new Error(
        "Unsupported GitHub target type."
      );
    }

    if (state.agentDraftApplied && state.agentIssueDraft) {
      const draft = state.agentIssueDraft;
      if (values.repository !== draft.repository ||
          values.target_kind !== "branch" ||
          values.target_ref !== draft.branch ||
          values.title !== draft.issue.title ||
          values.body !== draft.issue.body) {
        throw new Error("This agent proposal was edited. Recreate the draft, or discard it to authorize a manual action.");
      }
    }
    return {
      ...(state.agentDraftApplied && state.agentIssueDraft
        ? { draft_id: state.agentIssueDraft.draft_id }
        : {}),
      repository:
        values.repository,

      target: {
        kind,

        ...(kind !==
          "current_state"
          ? {
              ref:
                values.target_ref
            }
          : {})
      },

      issue: {
        title:
          values.title,

        body:
          values.body
      }
    };
  }

  const maintenanceActions = ["comment_issue", "add_labels", "edit_issue", "close_issue", "reopen_issue"];
  if (provider.id === "github" && maintenanceActions.includes(action.id)) {
    if (values.target_kind !== "branch") throw new Error("Maintenance actions require a branch.");
    if (!Number.isSafeInteger(values.issue_number) || values.issue_number < 1) throw new Error("Provide a valid issue number.");
    const parameters = { issue_number: values.issue_number };
    if (action.id === "comment_issue" || action.id === "edit_issue") parameters.body = values.body;
    if (action.id === "edit_issue") parameters.title = values.title;
    if (action.id === "add_labels") {
      parameters.labels = [...new Set(values.labels.split(",").map(x => x.trim()).filter(Boolean))];
      if (!parameters.labels.length) throw new Error("Provide at least one label.");
    }
    return {
      repository: values.repository,
      target: { kind: "branch", ref: values.target_ref },
      action: action.id,
      parameters
    };
  }

  throw new Error(
    "No browser request adapter exists for the selected provider action."
  );  throw new Error(
    "No browser request adapter exists for the selected provider action."
  );
}



let publicDemoStep = 0;
let publicDemoRejected = false;

function renderPublicDemo() {
  const drift = elements.demoScenario.value === "drift";

  const steps = [
    {
      status: "PROPOSED",
      title: "1. An AI proposes an action",
      description:
        "Example: an AI assistant wants to create an issue in a " +
        "sample GitHub repository. The action has not been executed."
    },
    {
      status: "WORKER · READY (SIMULATED)",
      title: "2. The Worker checks the context",
      description:
        "The simulated Worker inspects the example repository " +
        "state and reports evidence supporting the proposed action."
    },
    {
      status: "GUARD · PASS (SIMULATED)",
      title: "3. An independent Guard reviews the evidence",
      description:
        "The simulated Guard checks the Worker's claims and " +
        "confirms they match the original resource snapshot."
    },
    {
      status: "HUMAN APPROVAL",
      title: "4. You make the decision",
      description:
        "Would you approve this proposed action? " +
        "Your choice determines whether the example continues."
    },
    {
      status: publicDemoRejected
        ? "REJECTED"
        : drift
          ? "BLOCKED · CONTEXT CHANGED"
          : "AUTHORIZED · SIMULATION",
      title: publicDemoRejected
        ? "The human rejected the action"
        : drift
          ? "5. ContextGuard blocks the changed action"
          : "5. The action passes the final check",
      description: publicDemoRejected
        ? "Your rejection stops this example. No action proceeds."
        : drift
          ? "The simulated repository changed after approval. " +
            "The final check detects the mismatch and blocks it."
          : "The example repository is unchanged. A simulated " +
            "single-use authorization would be possible, but " +
            "nothing is executed in this public demo."
    }
  ];

  const current = steps[publicDemoStep];

  elements.demoProgress.textContent =
    `Step ${publicDemoStep + 1} of ${steps.length}`;

  elements.demoStatus.textContent = current.status;
  elements.demoTitle.textContent = current.title;
  elements.demoDescription.textContent = current.description;

  elements.demoBackButton.disabled = publicDemoStep === 0;

  setVisible(
    elements.demoRejectButton,
    publicDemoStep === 3
  );

  elements.demoNextButton.textContent =
    publicDemoStep === 3
      ? "Approve example"
      : publicDemoStep === 4
        ? "Run again"
        : "Continue";
}

function closePublicDemo() {
  elements.authGate.classList.remove("demo-active");
  setVisible(elements.publicDemoPanel, false);
  setVisible(elements.authCard, true);
  publicDemoStep = 0;
  publicDemoRejected = false;
}

function openPublicDemo() {
  window.location.assign("/playground.html");
  return;
  publicDemoStep = 0;
  publicDemoRejected = false;
  elements.demoScenario.value = "unchanged";
  elements.authGate.classList.add("demo-active");
  setVisible(elements.authCard, false);
  setVisible(elements.publicDemoPanel, true);
  renderPublicDemo();
}

elements.tryDemoButton.addEventListener(
  "click",
  openPublicDemo
);

elements.demoExitButton.addEventListener(
  "click",
  () => {
    closePublicDemo();
    elements.authToken.focus();
  }
);

elements.demoScenario.addEventListener(
  "change",
  () => {
    publicDemoStep = 0;
    publicDemoRejected = false;
    renderPublicDemo();
  }
);

elements.demoBackButton.addEventListener(
  "click",
  () => {
    publicDemoStep = Math.max(0, publicDemoStep - 1);
    publicDemoRejected = false;
    renderPublicDemo();
  }
);

elements.demoNextButton.addEventListener(
  "click",
  () => {
    if (publicDemoStep === 4) {
      publicDemoStep = 0;
      publicDemoRejected = false;
    } else {
      publicDemoStep += 1;
    }
    renderPublicDemo();
  }
);

elements.demoRejectButton.addEventListener(
  "click",
  () => {
    publicDemoRejected = true;
    publicDemoStep = 4;
    renderPublicDemo();
  }
);


function authenticatedPrincipalLabel(
  session
) {
  return (
    session?.principal
      ?.display_name ||
    session?.principal
      ?.principal_id ||
    "Operator"
  );
}


let githubAppMode = false;

function renderGithubAppMode(enabled) {
  githubAppMode = enabled;
  document.body.classList.toggle("app-mode", enabled);
  for (const id of ["classicResearch", "advancedTools"]) $(id).open = !enabled;
  for (const id of ["authIntro", "authSecurityNote"]) $(id).classList.toggle("hidden", enabled);
  for (const node of [elements.githubAppConnect, elements.githubAppPrivacy]) {
    node.classList.toggle("hidden", !enabled);
    node.style.display = enabled ? "block" : "none";
  }
  for (const node of [elements.authToken.closest("label"), elements.authButton, elements.operatorLoginLabel]) {
    node.classList.toggle("hidden", enabled);
    node.style.display = enabled ? "none" : "";
  }
  if (!enabled) {
    elements.agentRepoPickerLabel.classList.add("hidden");
    elements.agentRepoPickerLabel.style.display = "none";
  }
}

async function loadGithubAppRepositories() {
  if (!githubAppMode) return;
  const data = await requestSession("/api/ui/github/repositories");
  const choices = Array.isArray(data.repositories) ? data.repositories : [];
  const picker = elements.agentRepoPicker;
  picker.replaceChildren();
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = "Select an authorized repository";
  picker.appendChild(empty);
  for (const repo of choices) {
    const item = document.createElement("option");
    item.value = repo.full_name;
    item.textContent = repo.full_name + (repo.private ? " · private" : "");
    item.dataset.branch = repo.default_branch || "main";
    item.dataset.canCreatePr = repo.can_create_pr === true ? "true" : "false";
    picker.appendChild(item);
  }
  elements.agentRepoPickerStatus.textContent = choices.length
    ? `${choices.length} repositories authorized. Other GitHub repositories cannot be written to.`
    : "No installation with Issues: write permission. Install the GitHub App on a repository first.";
  elements.agentRepoPickerLabel.classList.remove("hidden");
  elements.agentRepoPickerLabel.style.display = "block";
  issuesInitializeIssueWorkspace();
}

elements.agentRepoPicker.addEventListener("change", () => {
  const option = elements.agentRepoPicker.selectedOptions[0];
  if (!option || !option.value) return;
  elements.agentRepository.value = option.value;
  elements.agentBranch.value = option.dataset.branch || "main";
  issuesLoadIssues();
});

function renderAuthenticatedUi(
  session
) {
  closePublicDemo();
  document.body
    .classList
    .remove(
      "auth-locked"
    );

  setVisible(
    elements.authGate,
    false
  );

  elements.authError
    .textContent = "";

  setVisible(
    elements.authError,
    false
  );

  elements.connectionStatus
    .textContent =
      `UI SESSION · ${authenticatedPrincipalLabel(
        session
      )}`;

  elements.connectionStatus
    .className =
      "mode-badge";

  setVisible(
    elements.logoutButton,
    true
  );

  elements.logoutButton
    .disabled =
      false;
}


function renderSignedOutUi(
  message = ""
) {
  closePublicDemo();
  document.body
    .classList
    .add(
      "auth-locked"
    );

  setVisible(
    elements.authGate,
    true
  );

  setVisible(
    elements.logoutButton,
    false
  );

  elements.logoutButton
    .disabled =
      true;

  elements.connectionStatus
    .textContent =
      "SIGN IN REQUIRED";

  elements.connectionStatus
    .className =
      "mode-badge muted";

  elements.startButton
    .disabled =
      true;

  if (message) {
    elements.authError
      .textContent =
        message;

    setVisible(
      elements.authError,
      true
    );
  } else {
    elements.authError
      .textContent = "";

    setVisible(
      elements.authError,
      false
    );
  }
}


async function completeUiAuthentication(
  session
) {
  renderAuthenticatedUi(
    session
  );

  await loadCapabilities();
  await loadGithubAppRepositories();

  return session;
}


async function loginUiSession() {
  const accessToken =
    elements.authToken
      .value
      .trim();

  elements.authError
    .textContent = "";

  setVisible(
    elements.authError,
    false
  );

  if (!accessToken) {
    renderSignedOutUi(
      "Enter your ContextGuard access key."
    );

    elements.authToken
      .focus();

    return;
  }

  setBusy(
    elements.authButton,
    true,
    "Signing in..."
  );

  try {
    const session =
      await postUi(
        "/api/ui/session/login",
        {
          access_token:
            accessToken
        }
      );

    elements.authToken
      .value = "";

    await completeUiAuthentication(
      session
    );
  } catch (error) {
    elements.authToken
      .value = "";

    renderSignedOutUi(
      error.message ||
        "Unable to sign in."
    );

    elements.authToken
      .focus();
  } finally {
    setBusy(
      elements.authButton,
      false
    );

    elements.authButton
      .disabled =
        false;
  }
}


async function logoutUiSession() {
  elements.logoutButton
    .disabled =
      true;

  try {
    await requestSession(
      "/api/ui/session/logout",
      "POST"
    );
  } catch {
  }

  resetWorkflowState(
    true
  );

  discardAgentIssueDraft();
  issuesResetWorkspace();

  state.capabilities =
    null;

  state.selectedProvider =
    null;

  state.selectedAction =
    null;

  state.fieldElements
    .clear();

  elements.capabilityCatalog
    .innerHTML =
      '<div class="catalog-loading">Sign in to load integrations.</div>';

  elements.providerSelectionSummary
    .textContent = "";

  setVisible(
    elements.providerSelectionSummary,
    false
  );

  elements.authToken
    .value = "";

  renderSignedOutUi();

  if (!githubAppMode) elements.authToken.focus();
}


function markConnectionReady() {
  elements.connectionStatus
    .textContent =
      "UI AUTHENTICATED";

  elements.connectionStatus
    .className =
      "mode-badge";
}



function refreshSecurityLabGuidance() {
  const drift = elements.securityLabMode.value === "manual_drift";
  elements.securityLabGuidance.textContent = drift
    ? "Manual real-drift test: use a disposable GitHub branch. Start the " +
      "authorization, approve the exact ActionLock, then change that " +
      "branch OUTSIDE this UI before running preflight. The server must " +
      "re-read GitHub and refuse the changed SHA. This browser never pushes."
    : "Standard test: run a real authorization, approve if eligible, " +
      "and revalidate the same GitHub snapshot using the server preflight.";
}

function resetSecurityLabEvidence() {
  elements.securityLabMode.disabled = false;
  setStatus(elements.securityLabResult, "NOT STARTED", "neutral");
  for (const element of [
    elements.securityLabScenarioValue,
    elements.securityLabWorker,
    elements.securityLabGuard,
    elements.securityLabLockedSha
  ]) {
    setText(element, null);
  }
  elements.securityLabClaims.replaceChildren();
  elements.securityLabOutcome.textContent = "No authorization response yet.";
  refreshSecurityLabGuidance();
}

function setSecurityLabOutcome(status, message, tone = "neutral") {
  setStatus(elements.securityLabResult, status, tone);
  elements.securityLabOutcome.textContent = message;
}

function renderSecurityLabEvidence(result) {
  const worker = result.pipeline.worker_assessment;
  const guard = result.pipeline.guard_verification;
  const claims = result.pipeline.evidence.claims;

  elements.securityLabMode.disabled = true;
  setText(
    elements.securityLabScenarioValue,
    elements.securityLabMode.value === "manual_drift"
      ? "Real branch drift (manual)"
      : "Normal preflight"
  );
  setText(elements.securityLabWorker, worker.decision);
  setText(elements.securityLabGuard, guard.verdict);
  setText(elements.securityLabLockedSha, result.request.snapshot.version);

  const verified = new Set(guard.verified_claims || []);
  const unverified = new Set(guard.unverified_claims || []);
  const contradicted = new Set(guard.contradicted_claims || []);
  elements.securityLabClaims.replaceChildren();

  for (const claim of Array.isArray(claims) ? claims : []) {
    const verdict = contradicted.has(claim.claim_id)
      ? "CONTRADICTED"
      : unverified.has(claim.claim_id)
        ? "UNVERIFIED"
        : verified.has(claim.claim_id)
          ? "VERIFIED"
          : "NOT CLASSIFIED";
    const li = document.createElement("li");
    li.textContent =
      `${claim.claim_id} · ${claim.criticality} · ${claim.status} · ` +
      `Guard: ${verdict} — ${claim.statement}`;
    elements.securityLabClaims.appendChild(li);
  }

  if (!result.authorization.lock) {
    setSecurityLabOutcome(
      "STOPPED",
      `Authorization stopped: ${result.authorization.status}. No preflight permitted.`,
      "danger"
    );
  } else {
    setSecurityLabOutcome(
      "READY FOR APPROVAL",
      "A valid ActionLock was issued. Human approval and a fresh provider read are still required.",
      "warning"
    );
  }
}

function renderStart(
  result
) {
  const request =
    result.request;

  const pipeline =
    result.pipeline;

  const authorization =
    result.authorization;

  const session =
    authorization.session;

  const lock =
    authorization.lock;

  const worker =
    pipeline
      .worker_assessment;

  const guard =
    pipeline
      .guard_verification;

  const evidence =
    pipeline.evidence;

  state.sessionId =
    session?.session_id ??
    null;

  state.authorizedSnapshot =
    request.snapshot.version;

  state.executionConfigured =
    result
      .execution_configured ===
      true;

  state.workflowStarted =
    true;

  syncWorkflowPresentation();

  markConnectionReady();

  setStatus(
    elements.snapshotStatus,
    "RESOLVED",
    "success"
  );

  setText(
    elements.requestId,
    request.request_id
  );

  setText(
    elements.resolvedRepository,
    request.subject
      .resource_id
  );

  setText(
    elements.snapshotVersion,
    request.snapshot
      .version
  );

  setText(
    elements.snapshotObservedAt,
    formatDate(
      request.snapshot
        .observed_at
    )
  );


  const workerType =
    worker.decision ===
      "READY"
      ? "success"
      : worker.decision ===
          "UNKNOWN"
        ? "warning"
        : "danger";

  setStatus(
    elements.workerDecision,
    worker.decision,
    workerType
  );

  setText(
    elements.workerSummary,
    worker.summary
  );

  setText(
    elements.workerDecisionValue,
    worker.decision
  );

  setText(
    elements.workerConfidence,
    formatConfidence(
      worker.confidence
    )
  );

  setText(
    elements.evidenceCount,
    Array.isArray(
      evidence.evidence
    )
      ? evidence.evidence.length
      : 0
  );

  setText(
    elements.claimCount,
    Array.isArray(
      evidence.claims
    )
      ? evidence.claims.length
      : 0
  );


  const guardType =
    guard.verdict ===
      "PASS"
      ? "success"
      : guard.verdict ===
          "REVIEW"
        ? "warning"
        : "danger";

  setStatus(
    elements.guardVerdict,
    guard.verdict,
    guardType
  );

  setText(
    elements.guardSummary,
    guard.summary
  );

  setText(
    elements.guardVerdictValue,
    guard.verdict
  );

  setText(
    elements.guardRisk,
    guard.risk
  );

  setText(
    elements.verifiedClaims,
    Array.isArray(
      guard.verified_claims
    )
      ? guard
          .verified_claims
          .length
      : 0
  );

  setText(
    elements.findingCount,
    Array.isArray(
      guard.findings
    )
      ? guard.findings.length
      : 0
  );


  setStatus(
    elements.authorizationStatus,
    authorization.status,
    lock
      ? "success"
      : "danger"
  );

  setText(
    elements.sessionId,
    session?.session_id
  );

  setText(
    elements.lockId,
    lock?.lock_id
  );

  setText(
    elements.lockFingerprint,
    lock?.fingerprint
  );

  setText(
    elements.lockedAction,
    lock
      ? `${request.proposed_action.namespace}.${request.proposed_action.action}`
      : null
  );

  setText(
    elements.sessionExpiresAt,
    session
      ? formatDate(
          session.expires_at
        )
      : null
  );

  setText(
    elements.authorizedSnapshot,
    request.snapshot.version
  );

  renderSecurityLabEvidence(result);

  renderSimpleStartState(
    result
  );


  if (
    result.stage ===
      "AWAITING_HUMAN_APPROVAL" &&
    session
  ) {
    setStatus(
      elements.workflowStage,
      "AWAITING HUMAN APPROVAL",
      "warning"
    );

    setStatus(
      elements.approvalStatus,
      "WAITING",
      "warning"
    );

    elements.approveButton
      .disabled =
        false;

    elements.rejectButton
      .disabled =
        false;

    return;
  }


  if (
    result.stage ===
      "READY_FOR_PREFLIGHT" &&
    session
  ) {
    setStatus(
      elements.workflowStage,
      "READY FOR PREFLIGHT",
      "success"
    );

    setStatus(
      elements.approvalStatus,
      "NOT REQUIRED",
      "success"
    );

    elements.preflightButton
      .disabled =
        false;

    return;
  }


  state.terminal =
    true;

  setStatus(
    elements.workflowStage,
    authorization.status,
    "danger"
  );

  setStatus(
    elements.approvalStatus,
    "NOT AUTHORIZED",
    "danger"
  );

  showError(
    `Authorization stopped safely: ${authorization.status}. No external action can be executed.`
  );
}


function discardAgentIssueDraft() {
  state.agentIssueDraft = null;
  state.agentDraftApplied = false;
  setVisible(elements.agentDraftPreview, false);
  elements.agentInvestigationState.textContent =
    "No agent proposal selected. You may still use the manual action form.";
}

async function investigateRepositoryWithCominty() {
  if (state.workspaceMode !== "live") return;
  const repository = elements.agentRepository.value.trim();
  const branch = elements.agentBranch.value.trim();
  const objective = elements.agentObjective.value.trim();
  if (!repository || !branch || objective.length < 10) {
    elements.agentInvestigationState.textContent =
      "Enter the repository, branch, and an investigation objective (10+ characters).";
    return;
  }
  if (!window.confirm(
    "Ask the real Cominty Managed Agent to investigate this GitHub repository and propose an issue?\n\n" +
    "This uses GitHub read-only API calls and may consume Cominty credits. " +
    "It does NOT create an issue."
  )) return;
  discardAgentIssueDraft();
  setBusy(elements.agentInvestigateButton, true, "Agent investigating...");
  elements.agentInvestigationState.textContent =
    "Reading GitHub and asking the Cominty Worker to propose an actionable issue...";
  try {
    const draft = await postUi("/api/ui/agent-draft", { repository, branch, objective });
    if (draft.created_by !== "COMINTY_MANAGED_AGENT" ||
        draft.status !== "PROPOSED_REQUIRES_VERIFICATION_AND_APPROVAL") {
      throw new Error("The server did not return a valid agent proposal.");
    }
    state.agentIssueDraft = draft;
    elements.agentDraftTitle.textContent = draft.issue.title;
    elements.agentDraftRationale.textContent = draft.rationale;
    elements.agentDraftBody.textContent = draft.issue.body;
    elements.agentDraftSha.textContent = draft.investigated_sha;
    elements.agentDraftEvidence.replaceChildren();
    for (const url of draft.evidence_urls) {
      const a = document.createElement("a");
      a.href = url;
      a.textContent = url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      elements.agentDraftEvidence.appendChild(a);
    }
    setVisible(elements.agentDraftPreview, true);
    elements.agentInvestigationState.textContent =
      "Cominty Worker generated a proposal. Review it carefully; no GitHub write occurred.";
  } catch (error) {
    elements.agentInvestigationState.textContent =
      `Investigation stopped: ${error.message}`;
  } finally {
    setBusy(elements.agentInvestigateButton, false);
  }
}

function applyAgentIssueDraft() {
  const draft = state.agentIssueDraft;
  if (!draft) return;
  if (state.selectedProvider !== "github" ||
      state.selectedAction !== "create_issue") {
    selectProvider("github");
    selectAction("create_issue");
  }
  const values = {
    repository: draft.repository,
    target_kind: "branch",
    target_ref: draft.branch,
    title: draft.issue.title,
    body: draft.issue.body
  };
  for (const [key, value] of Object.entries(values)) {
    const control = state.fieldElements.get(key);
    if (!control) throw new Error(`Missing form field ${key}.`);
    control.value = value;
  }
  syncDynamicFieldRules();
  state.agentDraftApplied = true;
  elements.agentInvestigationState.textContent =
    "Agent proposal loaded into the protected action form. Next click Start protected authorization to run independent Worker + Guard (additional Cominty credits).";
  elements.dynamicActionPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function startWorkflow() {
  clearMessages();

  resetWorkflowState(
    false
  );

  let body;

  try {
    body = maintenancePendingAction
      ? structuredClone(maintenancePendingAction)
      : validateStartForm();
  } catch (error) {
    showError(
      error.message
    );

    return;
  }

  if (state.workspaceMode !== "live") return;
  if (!window.confirm(
    "Start a REAL GitHub evidence assessment?\n\n" +
    "Cominty Worker and Guard may consume credits.\n" +
    "This only verifies the proposed action. GitHub is not changed until you approve and execute."
  )) return;

  setBusy(
    elements.startButton,
    true,
    "Running Worker + Guard..."
  );

  try {
    const result =
      await postUi(
        "/api/ui/start",
        body
      );

    renderStart(
      result
    );

    showSuccess(
      "Trusted snapshot resolution, Worker assessment and independent Guard verification completed."
    );
  } catch (error) {
    elements.connectionStatus
      .textContent =
        error.status === 401
          ? "UI UNAUTHORIZED"
          : error.status >= 400 && error.status < 500
            ? "REQUEST REFUSED"
            : "UI ERROR";

    elements.connectionStatus
      .className =
        "mode-badge muted";

    showError(
      error.message
    );
  } finally {
    setBusy(
      elements.startButton,
      false
    );

    elements.startButton
      .disabled =
        state.sessionId !==
          null ||
        state.terminal;
  }
}


async function decideApproval(
  decision
) {
  clearMessages();

  if (!state.sessionId) {
    showError(
      "No active authorization session."
    );

    return;
  }

  elements.approveButton
    .disabled =
      true;

  elements.rejectButton
    .disabled =
      true;

  const selectedButton =
    decision ===
      "APPROVED"
      ? elements.approveButton
      : elements.rejectButton;

  setBusy(
    selectedButton,
    true,
    decision ===
      "APPROVED"
      ? "Approving..."
      : "Rejecting..."
  );

  try {
    const result =
      await postUi(
        "/api/ui/approve",
        {
          session_id:
            state.sessionId,

          decision
        }
      );

    const approvalDecision =
      result.approval
        .decision;

    if (
      approvalDecision !==
        "APPROVED" &&
      approvalDecision !==
        "REJECTED"
    ) {
      throw new Error(
        "Server returned an invalid approval decision."
      );
    }

    setStatus(
      elements.approvalStatus,
      approvalDecision,
      approvalDecision ===
        "APPROVED"
        ? "success"
        : "danger"
    );

    setVisible(
      elements.approvalDetails,
      true
    );

    elements.approvalDetails
      .textContent =
        [
          `Approval ID: ${result.approval.approval_id}`,
          `Decision: ${approvalDecision}`,
          `Decided at: ${formatDate(result.approval.decided_at)}`
        ].join("\n");

    renderSimpleApprovalDecision(
      approvalDecision
    );

    if (
      approvalDecision ===
        "APPROVED"
    ) {
      setStatus(
        elements.workflowStage,
        "READY FOR PREFLIGHT",
        "success"
      );

      setStatus(
        elements.preflightStatus,
        "READY",
        "warning"
      );

      elements.preflightButton
        .disabled =
          false;

      showSuccess(
        "Human approval recorded for the exact ActionLock."
      );

      return;
    }

    state.terminal =
      true;

    setStatus(
      elements.workflowStage,
      "REJECTED BY HUMAN",
      "danger"
    );

    setStatus(
      elements.preflightStatus,
      "BLOCKED",
      "danger"
    );

    showError(
      "Human rejected the action. Workflow stopped and no external action was performed."
    );
  } catch (error) {
    showError(
      error.message
    );
  } finally {
    setBusy(
      selectedButton,
      false
    );
  }
}


async function continueSimpleAuthorization() {
  clearMessages();

  if (
    !state.sessionId ||
    state.terminal
  ) {
    return;
  }

  setBusy(
    elements.simpleContinueButton,
    true,
    "Running final checks..."
  );

  try {
    await runPreflight();

    if (
      state.terminal ||
      elements.receiptButton.disabled
    ) {
      return;
    }

    await issueReceipt();

    if (
      state.receiptId ||
      state.terminal
    ) {
      setVisible(
        elements.simpleContinueGate,
        false
      );
    }
  } finally {
    setBusy(
      elements.simpleContinueButton,
      false
    );

    elements.simpleContinueButton
      .disabled =
        true;
  }
}


async function runPreflight() {
  clearMessages();

  if (
    !state.sessionId ||
    state.terminal
  ) {
    return;
  }

  setBusy(
    elements.preflightButton,
    true,
    "Revalidating GitHub..."
  );

  try {
    const result =
      await postUi(
        "/api/ui/preflight",
        {
          session_id:
            state.sessionId
        }
      );

    const preflight =
      result.preflight;

    const current =
      preflight
        .observed_snapshot_version;

    const matches =
      current ===
      state.authorizedSnapshot;

    setText(
      elements.currentSnapshot,
      current
    );

    setText(
      elements.preflightCheckedAt,
      formatDate(
        preflight.checked_at
      )
    );

    setText(
      elements.stateComparison,
      matches
        ? "MATCH"
        : "CHANGED"
    );

    setStatus(
      elements.preflightStatus,
      preflight.status,
      matches
        ? "success"
        : "danger"
    );

    renderSimplePreflightState(
      matches
    );

    if (!matches) {
      state.terminal =
        true;

      setStatus(
        elements.workflowStage,
        "STATE CHANGED",
        "danger"
      );

      showError(
        "Provider state changed after authorization. Execution is blocked."
      );

      return;
    }

    setStatus(
      elements.workflowStage,
      "PREFLIGHT VERIFIED",
      "success"
    );

    setStatus(
      elements.receiptStatus,
      "READY",
      "warning"
    );

    elements.receiptButton
      .disabled =
        false;

    if (elements.securityLabMode.value === "manual_drift") {
      state.terminal = true;
      elements.receiptButton.disabled = true;
      elements.simpleExecuteButton.disabled = true;
      setSimpleProgressState(elements.simpleReceiptStep, "pending");
      setStatus(elements.receiptStatus, "NOT ISSUED", "neutral");
      setStatus(elements.workflowStage, "DRIFT CHECK COMPLETE", "neutral");
      setStatus(elements.simpleWorkflowStage, "DRIFT CHECK COMPLETE", "neutral");
      setSecurityLabOutcome(
        "MATCH · NO DRIFT",
        "The real server preflight returned an unchanged snapshot. " +
          "No receipt will be issued from this read-only lab scenario.",
        "warning"
      );
      showSuccess("Snapshot unchanged. This read-only drift check is complete.");
      return;
    }

    setSecurityLabOutcome(
      "MATCH",
      "The real server preflight verified the currently observed snapshot.",
      "success"
    );
    showSuccess(
      "Fresh GitHub state matches the authorized snapshot."
    );
  } catch (error) {
    state.terminal =
      true;

    setStatus(
      elements.preflightStatus,
      "BLOCKED",
      "danger"
    );

    setStatus(
      elements.workflowStage,
      "PREFLIGHT BLOCKED",
      "danger"
    );

    renderSimplePreflightState(
      false
    );

    const preflightCode =
      error.body?.error?.code ?? error.body?.code ?? null;
    if (preflightCode === "SNAPSHOT_CHANGED") {
      setText(elements.stateComparison, "CHANGED");
      setSecurityLabOutcome(
        "SNAPSHOT_CHANGED",
        "The real ContextGuard server rejected a changed GitHub snapshot. " +
          "No receipt or external action was issued.",
        "danger"
      );
    } else {
      setSecurityLabOutcome(
        preflightCode || "PREFLIGHT BLOCKED",
        `Server preflight rejected the request: ${error.message}`,
        "danger"
      );
    }
    showError(
      `Preflight failed closed: ${error.message}`
    );
  } finally {
    setBusy(
      elements.preflightButton,
      false
    );

    elements.preflightButton
      .disabled =
        true;
  }
}


async function issueReceipt() {
  clearMessages();

  if (
    !state.sessionId ||
    state.terminal
  ) {
    return;
  }

  setBusy(
    elements.receiptButton,
    true,
    "Issuing receipt..."
  );

  try {
    const result =
      await postUi(
        "/api/ui/receipt",
        {
          session_id:
            state.sessionId
        }
      );

    const receipt =
      result.receipt;

    state.receiptId =
      receipt.receipt_id;

    state.receiptDigest =
      receipt.receipt_digest;

    setText(
      elements.receiptId,
      receipt.receipt_id
    );

    setText(
      elements.receiptDigest,
      receipt.receipt_digest
    );

    setText(
      elements.receiptExpiresAt,
      formatDate(
        receipt.expires_at
      )
    );

    setStatus(
      elements.receiptStatus,
      "AVAILABLE",
      "success"
    );

    setStatus(
      elements.workflowStage,
      "EXECUTION AUTHORIZED",
      "success"
    );

    renderSimpleReceiptReady();

    if (
      state.executionConfigured
    ) {
      setStatus(
        elements.executionStatus,
        "READY",
        "warning"
      );

      elements.executeConfirmation
        .disabled =
          false;

      updateExecuteButton();

      showSuccess(
        "Single-use execution receipt issued. Final execution remains locked until explicit confirmation."
      );
    } else {
      setStatus(
        elements.executionStatus,
        "NOT CONFIGURED",
        "danger"
      );

      elements.executeConfirmation
        .disabled =
          true;

      elements.executeButton
        .disabled =
          true;

      showError(
        "Authorization receipt was issued, but trusted external execution is not configured on this server."
      );
    }
  } catch (error) {
    state.terminal =
      true;

    setStatus(
      elements.receiptStatus,
      "BLOCKED",
      "danger"
    );

    setSimpleProgressState(
      elements.simpleReceiptStep,
      "blocked"
    );

    setStatus(
      elements.simpleWorkflowStage,
      "BLOCKED",
      "danger"
    );

    setVisible(
      elements.simpleContinueGate,
      false
    );

    elements.simpleContinueButton
      .disabled =
        true;

    showError(
      `Receipt issuance failed closed: ${error.message}`
    );
  } finally {
    setBusy(
      elements.receiptButton,
      false
    );

    elements.receiptButton
      .disabled =
        true;
  }
}


function updateExecuteButton() {
  const confirmed =
    elements.executeConfirmation
      .value
      .trim() ===
    "EXECUTE";

  elements.executeButton
    .disabled =
      !state.executionConfigured ||
      !state.receiptId ||
      !state.receiptDigest ||
      state.executionAttempted ||
      !confirmed;
}


function renderProviderExecution(
  result
) {
  setVisible(
    elements.executionResult,
    true
  );

  elements.executionResult
    .textContent =
      [
        `Status: ${result.status}`,
        `Provider: ${result.provider}`,
        `Action: ${result.action}`,
        result.pull_request
          ? `Draft Pull Request: #${result.pull_request.number} on ${result.pull_request.head_branch}`
          : result.issue_number
            ? `GitHub issue: #${result.issue_number}`
            : null,
        result.pull_request?.commit_sha
          ? `Committed SHA: ${result.pull_request.commit_sha}` : null,
        result.execution_snapshot_version
          ? `Execution snapshot: ${result.execution_snapshot_version}`
          : null,
        result.completed_at
          ? `Completed at: ${formatDate(result.completed_at)}`
          : null
      ]
        .filter(Boolean)
        .join("\n");

  if (
    typeof result.html_url ===
      "string" &&
    result.html_url.startsWith(
      "https://github.com/"
    )
  ) {
    elements.githubIssueLink
      .href =
        result.html_url;
    elements.githubIssueLink.textContent = result.pull_request
      ? "Open the created Draft Pull Request ↗"
      : "Open the GitHub issue ↗";

    setVisible(
      elements.githubIssueLink,
      true
    );
  }
}


function renderProof(
  response
) {
  const proof =
    response.proof;

  const checkpoint =
    response.audit_checkpoint;

  if (!proof) {
    return;
  }

  setStatus(
    elements.proofStatus,
    proof.status,
    "success"
  );

  setText(
    elements.proofId,
    proof.proof_id
  );

  setText(
    elements.proofDigest,
    proof.proof_digest
  );

  const providerResult =
    proof.provider_result;

  setText(
    elements.providerResult,
    providerResult?.pull_request
      ? `Draft PR #${providerResult.pull_request.number} · ${providerResult.pull_request.commit_sha}`
      : providerResult?.issue_number
        ? `GitHub issue #${providerResult.issue_number}`
        : `${proof.provider}.${proof.action}`
  );

  setText(
    elements.auditEventCount,
    checkpoint
      ?.event_count
  );

  setText(
    elements.auditHeadHash,
    checkpoint
      ?.head_hash
  );
}


function updateSimpleExecuteButton() {
  const confirmed =
    elements.simpleExecuteConfirmation
      .value
      .trim() ===
    "EXECUTE";

  elements.simpleExecuteButton
    .disabled =
      !state.executionConfigured ||
      !state.receiptId ||
      !state.receiptDigest ||
      state.executionAttempted ||
      !confirmed;
}


async function executeSimpleAction() {
  elements.executeConfirmation
    .value =
      elements.simpleExecuteConfirmation
        .value;

  updateExecuteButton();

  setBusy(
    elements.simpleExecuteButton,
    true,
    "Executing once..."
  );

  try {
    await executeAction();
  } finally {
    setBusy(
      elements.simpleExecuteButton,
      false
    );

    if (
      state.executionAttempted
    ) {
      elements.simpleExecuteButton
        .disabled =
          true;

      elements.simpleExecuteConfirmation
        .disabled =
          true;
    } else {
      updateSimpleExecuteButton();
    }
  }
}


async function executeAction() {
  clearMessages();

  if (
    state.executionAttempted
  ) {
    showError(
      "This execution attempt has already been used. Start a fresh authorization instead of retrying."
    );

    return;
  }

  if (
    !state.receiptId ||
    !state.receiptDigest
  ) {
    showError(
      "No execution receipt is available."
    );

    return;
  }

  if (
    elements.executeConfirmation
      .value
      .trim() !==
    "EXECUTE"
  ) {
    showError(
      "Type EXECUTE exactly before final execution."
    );

    return;
  }

  const accepted =
    window.confirm(
      "REAL EXTERNAL ACTION\n\n" +
      "ContextGuard will consume this single-use receipt and perform the exact approved GitHub action.\n\n" +
      "The receipt cannot safely be retried after this attempt.\n\n" +
      "Continue?"
    );

  if (!accepted) {
    return;
  }

  state.executionAttempted =
    true;

  elements.simpleExecuteConfirmation
    .disabled =
      true;

  elements.simpleExecuteButton
    .disabled =
      true;

  elements.executeButton
    .disabled =
      true;

  elements.executeConfirmation
    .disabled =
      true;

  setBusy(
    elements.executeButton,
    true,
    "Executing once..."
  );

  setStatus(
    elements.executionStatus,
    "EXECUTING",
    "warning"
  );

  try {
    const response =
      await postUi(
        "/api/ui/execute",
        {
          receipt_id:
            state.receiptId,

          receipt_digest:
            state.receiptDigest,

          confirmation:
            "EXECUTE"
        }
      );

    if (
      response
        .external_action_executed !==
        true
    ) {
      throw new Error(
        "Server did not confirm external execution."
      );
    }

    setStatus(
      elements.executionStatus,
      "EXECUTED",
      "success"
    );

    setStatus(
      elements.receiptStatus,
      "CONSUMED",
      "success"
    );

    setStatus(
      elements.workflowStage,
      "EXTERNAL ACTION EXECUTED",
      "success"
    );

    setStatus(
      elements.simpleWorkflowStage,
      "EXECUTED",
      "success"
    );

    elements.simpleExecutionNotice
      .textContent =
        "Provider-confirmed external action completed.";

    renderProviderExecution(
      response.result
    );

    renderProof(
      response
    );

    showSuccess(
      "Provider-confirmed external action completed. ExecutionProof and audit evidence were recorded."
    );
    if (maintenancePendingAction && (maintenancePendingAction.action || maintenancePendingAction.pr_draft_id)) {
      $("maintenanceAgentProposal").classList.add("hidden");
      $("maintenanceManualAuthorize").classList.add("hidden");
      $("maintenanceAgentFeedback").textContent = maintenancePendingAction.pr_draft_id
        ? "Commit and Draft PR created. Open the verified Pull Request link in the execution result."
        : `GitHub ${maintenancePendingAction.action} completed. Open the verified issue link in the execution result.`;
      maintenancePendingAction = null;
      maintenanceAgentDraft = null;
      issuesPreviewBody = null;
    }
    if (state.agentDraftApplied) {
      state.agentDraftApplied = false;
      setVisible(elements.agentDraftPreview, false);
    }
  } catch (error) {
    const body =
      error.body ?? {};

    if (
      body
        .external_action_executed ===
        true
    ) {
      setStatus(
        elements.executionStatus,
        "EXECUTED",
        "warning"
      );

      setStatus(
        elements.receiptStatus,
        "CONSUMED",
        "warning"
      );

      setStatus(
        elements.proofStatus,
        "EVIDENCE INCOMPLETE",
        "warning"
      );

      setStatus(
        elements.workflowStage,
        "EXECUTED · EVIDENCE INCOMPLETE",
        "warning"
      );

      setStatus(
        elements.simpleWorkflowStage,
        "EXECUTED · EVIDENCE INCOMPLETE",
        "warning"
      );

      elements.simpleExecutionNotice
        .textContent =
          "The external action executed, but local proof or audit evidence is incomplete. Do not retry.";

      if (body.result) {
        renderProviderExecution(
          body.result
        );
      }

      showError(
        "IMPORTANT: the external action DID execute, but local proof/audit recording was incomplete. Do NOT retry this receipt or the GitHub action."
      );

      return;
    }

    setStatus(
      elements.executionStatus,
      "NOT CONFIRMED",
      "danger"
    );

    setStatus(
      elements.receiptStatus,
      "DO NOT RETRY",
      "danger"
    );

    setStatus(
      elements.workflowStage,
      "EXECUTION ATTEMPT ENDED",
      "danger"
    );

    setStatus(
      elements.simpleWorkflowStage,
      "EXECUTION ATTEMPT ENDED",
      "danger"
    );

    elements.simpleExecutionNotice
      .textContent =
        "Execution did not return confirmed external success. This receipt must not be retried.";

    showError(
      `Execution did not return confirmed external success: ${error.message}. This receipt must not be retried. Start a fresh authorization if another attempt is required.`
    );
  } finally {
    setBusy(
      elements.executeButton,
      false
    );

    elements.executeButton
      .disabled =
        true;

    elements.executeConfirmation
      .disabled =
        true;
  }
}


function resetWorkflowState(
  clearMessage = true
) {
  state.sessionId =
    null;

  state.authorizedSnapshot =
    null;

  state.receiptId =
    null;

  state.receiptDigest =
    null;

  state.executionConfigured =
    false;

  state.executionAttempted =
    false;

  state.workflowStarted =
    false;

  state.terminal =
    false;

  if (clearMessage) {
    clearMessages();
  }

  setVisible(
    elements.workflow,
    false
  );

  setVisible(
    elements.simpleWorkflow,
    false
  );

  setVisible(
    elements.approvalDetails,
    false
  );

  setVisible(
    elements.executionResult,
    false
  );

  setVisible(
    elements.githubIssueLink,
    false
  );

  elements.githubIssueLink
    .removeAttribute(
      "href"
    );

  elements.approvalDetails
    .textContent = "";

  elements.executionResult
    .textContent = "";

  elements.executeConfirmation
    .value = "";

  elements.approveButton
    .disabled =
      true;

  elements.rejectButton
    .disabled =
      true;

  elements.preflightButton
    .disabled =
      true;

  elements.receiptButton
    .disabled =
      true;

  elements.executeConfirmation
    .disabled =
      true;

  elements.executeButton
    .disabled =
      true;

  elements.startButton
    .disabled =
      !(
        state.selectedProvider ===
          "github" &&
        state.selectedAction ===
          "create_issue"
      );

  const neutralStatuses = [
    [
      elements.workflowStage,
      "NOT STARTED"
    ],

    [
      elements.snapshotStatus,
      "PENDING"
    ],

    [
      elements.workerDecision,
      "PENDING"
    ],

    [
      elements.guardVerdict,
      "PENDING"
    ],

    [
      elements.authorizationStatus,
      "PENDING"
    ],

    [
      elements.approvalStatus,
      "WAITING"
    ],

    [
      elements.preflightStatus,
      "LOCKED"
    ],

    [
      elements.receiptStatus,
      "LOCKED"
    ],

    [
      elements.executionStatus,
      "LOCKED"
    ],

    [
      elements.proofStatus,
      "NOT AVAILABLE"
    ]
  ];

  for (
    const [
      element,
      text
    ]
    of neutralStatuses
  ) {
    setStatus(
      element,
      text,
      "neutral"
    );
  }

  const blankElements = [
    elements.requestId,
    elements.resolvedRepository,
    elements.snapshotVersion,
    elements.snapshotObservedAt,

    elements.workerDecisionValue,
    elements.workerConfidence,
    elements.evidenceCount,
    elements.claimCount,

    elements.guardVerdictValue,
    elements.guardRisk,
    elements.verifiedClaims,
    elements.findingCount,

    elements.sessionId,
    elements.lockId,
    elements.lockFingerprint,
    elements.lockedAction,
    elements.sessionExpiresAt,

    elements.authorizedSnapshot,
    elements.currentSnapshot,
    elements.preflightCheckedAt,
    elements.stateComparison,

    elements.receiptId,
    elements.receiptExpiresAt,
    elements.receiptDigest,

    elements.proofId,
    elements.providerResult,
    elements.proofDigest,
    elements.auditEventCount,
    elements.auditHeadHash
  ];

  for (
    const element
    of blankElements
  ) {
    setText(
      element,
      null
    );
  }

  elements.workerSummary
    .textContent =
      "Waiting for Worker assessment.";

  elements.guardSummary
    .textContent =
      "Waiting for independent verification.";

  resetSimpleWorkflowState();
  resetSecurityLabEvidence();
}



async function requestSession(
  path,
  method = "GET"
) {
  const response =
    await fetch(
      path,
      {
        method,

        credentials:
          "same-origin",

        headers: {
          accept:
            "application/json"
        }
      }
    );

  let body =
    {};

  try {
    body =
      await response.json();
  } catch {
    body = {};
  }

  if (!response.ok) {
    const error =
      new Error(
        errorMessage(
          body,
          `HTTP ${response.status}`
        )
      );

    error.status =
      response.status;

    throw error;
  }

  return body;
}


function syncWorkflowPresentation() {
  const advanced =
    document.body
      .classList
      .contains(
        "advanced-mode"
      );

  const visible =
    state.workflowStarted ===
      true;

  setVisible(
    elements.simpleWorkflow,
    visible &&
      !advanced
  );

  setVisible(
    elements.workflow,
    visible &&
      advanced
  );
}


function setWorkspaceMode(mode) {
  if (mode !== "simulation" && mode !== "live") return;

  state.workspaceMode = mode;
  const live = mode === "live";

  setVisible(elements.simulationWorkspace, !live);
  setVisible(elements.liveWorkspace, live);

  elements.workspacePlaygroundButton.classList.toggle("active", !live);
  elements.workspaceLiveButton.classList.toggle("active", live);
  elements.workspacePlaygroundButton.setAttribute("aria-pressed", String(!live));
  elements.workspaceLiveButton.setAttribute("aria-pressed", String(live));
}

window.addEventListener("message", (event) => {
  if (event.origin !== "null" ||
      event.source !== elements.simulationFrame.contentWindow ||
      event.data?.type !== "contextguard:playground:height") return;
  const height = Number(event.data.height);
  if (!Number.isFinite(height)) return;
  elements.simulationFrame.style.height =
    `${Math.max(600, Math.min(7500, Math.ceil(height) + 12))}px`;
});

function setViewMode(
  mode
) {
  const advanced =
    mode ===
    "advanced";

  document.body
    .classList.toggle(
      "advanced-mode",
      advanced
    );

  syncWorkflowPresentation();

  elements.simpleModeButton
    .classList.toggle(
      "active",
      !advanced
    );

  elements.advancedModeButton
    .classList.toggle(
      "active",
      advanced
    );

  elements.simpleModeButton
    .setAttribute(
      "aria-pressed",
      String(!advanced)
    );

  elements.advancedModeButton
    .setAttribute(
      "aria-pressed",
      String(advanced)
    );
}


elements.workspacePlaygroundButton.addEventListener(
  "click", () => setWorkspaceMode("simulation")
);

elements.workspaceLiveButton.addEventListener(
  "click", () => setWorkspaceMode("live")
);

elements.securityLabMode.addEventListener(
  "change",
  refreshSecurityLabGuidance
);


elements.simpleModeButton
  .addEventListener(
    "click",
    () =>
      setViewMode(
        "simple"
      )
  );


elements.advancedModeButton
  .addEventListener(
    "click",
    () =>
      setViewMode(
        "advanced"
      )
  );


async function initializeUiSession() {
  elements.connectionStatus
    .textContent =
      "CONNECTING";

  elements.startButton
    .disabled =
      true;

  document.body
    .classList
    .add(
      "auth-locked"
    );

  try {
    const mode = await requestSession("/api/ui/auth/mode");
    renderGithubAppMode(mode.github_app_enabled === true);
    if (typeof mode.install_url === "string" &&
        /^https:\/\/github\.com\/apps\/[a-z0-9-]+\/installations\/new$/i.test(mode.install_url)) {
      elements.githubAppInstallLink.href = mode.install_url;
      elements.githubAppInstallLink.classList.remove("hidden");
    }
    let session;

    try {
      session =
        await requestSession(
          "/api/ui/session"
        );
    } catch (error) {
      if (
        error.status !== 401
      ) {
        throw error;
      }

      if (githubAppMode) {
        renderSignedOutUi();
        return null;
      }

      try {
        session =
          await requestSession(
            "/api/ui/session/local",
            "POST"
          );
      } catch (localError) {
        if (
          localError.status === 403 ||
          localError.status === 503
        ) {
          renderSignedOutUi();
          return null;
        }

        throw localError;
      }
    }

    return await completeUiAuthentication(
      session
    );
  } catch (error) {
    renderSignedOutUi(
      `Unable to establish ContextGuard session: ${error.message}`
    );

    return null;
  }
}


elements.authButton
  .addEventListener(
    "click",
    loginUiSession
  );


elements.authToken
  .addEventListener(
    "keydown",
    event => {
      if (
        event.key === "Enter" &&
        !elements.authButton
          .disabled
      ) {
        loginUiSession();
      }
    }
  );


elements.logoutButton
  .addEventListener(
    "click",
    logoutUiSession
  );


elements.agentInvestigateButton.addEventListener("click", investigateRepositoryWithCominty);
elements.agentUseDraftButton.addEventListener("click", applyAgentIssueDraft);
elements.agentDiscardDraftButton.addEventListener("click", discardAgentIssueDraft);

elements.startButton
  .addEventListener(
    "click",
    startWorkflow
  );


function startOver() {
  maintenancePendingAction = null;
  resetWorkflowState(true);
}

elements.resetButton.addEventListener("click", startOver);
$("simpleResetButton").addEventListener("click", startOver);


elements.approveButton
  .addEventListener(
    "click",
    () =>
      decideApproval(
        "APPROVED"
      )
  );


elements.simpleApproveButton
  .addEventListener(
    "click",
    () =>
      decideApproval(
        "APPROVED"
      )
  );


elements.simpleRejectButton
  .addEventListener(
    "click",
    () =>
      decideApproval(
        "REJECTED"
      )
  );


elements.simpleContinueButton
  .addEventListener(
    "click",
    continueSimpleAuthorization
  );


elements.rejectButton
  .addEventListener(
    "click",
    () =>
      decideApproval(
        "REJECTED"
      )
  );


elements.preflightButton
  .addEventListener(
    "click",
    runPreflight
  );


elements.receiptButton
  .addEventListener(
    "click",
    issueReceipt
  );


elements.simpleExecuteConfirmation
  .addEventListener(
    "input",
    updateSimpleExecuteButton
  );


elements.simpleExecuteButton
  .addEventListener(
    "click",
    () =>
      executeSimpleAction()
  );


elements.executeConfirmation
  .addEventListener(
    "input",
    updateExecuteButton
  );


elements.executeButton
  .addEventListener(
    "click",
    executeAction
  );


let maintenancePendingAction = null;
let maintenanceAgentDraft = null;
let issuesPreviewBody = null;
let issuesSelectedIssue = null;
let issuesRequestEpoch = 0;
function issuesStatus(message) { $("issuesStatus").textContent = message; }
function issuesResetWorkspace() {
  issuesRequestEpoch++;
  issuesSelectedIssue = null;
  maintenancePendingAction = null;
  maintenanceAgentDraft = null;
  issuesPreviewBody = null;
  $("maintenanceAgentProposal").classList.add("hidden");
  $("maintenanceManualAuthorize").classList.add("hidden");
  $("issueSelect").replaceChildren(new Option("Select an issue", ""));
  $("issueDetail").classList.add("hidden");
  $("issuesCompose").classList.add("hidden");
  $("issuesPreviewResult").classList.add("hidden");
  issuesStatus("Select an authorized repository to inspect its issues.");
}
function issuesInitializeIssueWorkspace() {
  $("issuesWorkspace").classList.toggle("hidden", !githubAppMode);
  if (githubAppMode) issuesStatus("Select an authorized repository to inspect its issues.");
}
async function issuesLoadIssues() {
  if (!githubAppMode) return;
  const epoch = ++issuesRequestEpoch;
  issuesSelectedIssue = null;
  $("issueSelect").replaceChildren(new Option("Select an issue", ""));
  $("issueDetail").classList.add("hidden");
  $("issuesCompose").classList.add("hidden");
  $("issuesPreviewResult").classList.add("hidden");
  const repository = $("agentRepoPicker").value;
  if (!repository) { issuesStatus("Choose an authorized repository first."); return; }
  issuesStatus("Loading issues from GitHub (read only)...");
  try {
    const data = await requestSession(
      `/api/ui/github/issues?repository=${encodeURIComponent(repository)}&state=${encodeURIComponent($("issueState").value)}`);
    if (epoch !== issuesRequestEpoch) return;
    for (const issue of data.issues || []) {
      const option = new Option(`#${issue.number} · ${issue.title}`, String(issue.number));
      $("issueSelect").appendChild(option);
    }
    issuesStatus(`${(data.issues || []).length} issues loaded (max 30 recent issues; pull requests excluded). No Cominty credits used.`);
  } catch (error) {
    if (epoch !== issuesRequestEpoch) return;
    issuesStatus(`Unable to load issues: ${error.message}`);
  }
}
async function issuesLoadDetail() {
  const epoch = ++issuesRequestEpoch;
  const repository = $("agentRepoPicker").value;
  const number = Number($("issueSelect").value);
  $("issueDetail").classList.add("hidden");
  $("issuesCompose").classList.add("hidden");
  $("issuesPreviewResult").classList.add("hidden");
  $("maintenanceManualAuthorize").classList.add("hidden");
  issuesPreviewBody = null;
  issuesSelectedIssue = null;
  if (!repository || !Number.isSafeInteger(number) || number < 1) return;
  issuesStatus("Loading issue details (read only)...");
  try {
    const data = await requestSession(
      `/api/ui/github/issues/${number}?repository=${encodeURIComponent(repository)}`);
    if (epoch !== issuesRequestEpoch) return;
    const issue = data.issue;
    issuesSelectedIssue = { ...issue, repository };
    $("issueTitle").textContent = `#${issue.number} · ${issue.title}`;
    $("issueMeta").textContent = `${issue.state.toUpperCase()} · Updated ${issue.updated_at} · ${issue.comments} comments`;
    $("issueBody").textContent = issue.body || "(No description)";
    $("issueUrl").href = issue.html_url;
    const labels = $("issueLabels");
    labels.replaceChildren();
    for (const name of issue.labels) {
      const chip = document.createElement("span");
      chip.textContent = name;
      labels.appendChild(chip);
    }
    $("issueDetail").classList.remove("hidden");
    $("issuesCompose").classList.remove("hidden");
    $("issuesAction").value = "comment_issue";
    $("issuesActionBody").value = "";
    $("issuesNewLabels").value = "";
    $("issuesNewTitle").value = issue.title;
    issuesRenderActionFields();
    issuesStatus("Issue retrieved from GitHub. Actions can be verified, approved and executed through ContextGuard.");
  } catch (error) {
    if (epoch !== issuesRequestEpoch) return;
    issuesStatus(`Unable to load issue: ${error.message}`);
  }
}
function issuesRenderActionFields() {
  const action = $("issuesAction").value;
  $("issuesTitleField").classList.toggle("hidden", action !== "edit_issue");
  $("issuesLabelsField").classList.toggle("hidden", action !== "add_labels");
  $("issuesBodyField").classList.toggle("hidden", !["comment_issue", "edit_issue"].includes(action));
  $("issuesBodyField").firstChild.textContent = action === "edit_issue" ? "Proposed new description" : "Proposed comment";
  if (action === "edit_issue" && issuesSelectedIssue) $("issuesActionBody").value = issuesSelectedIssue.body;
  $("issuesPreviewResult").classList.add("hidden");
  $("maintenanceManualAuthorize").classList.add("hidden");
  issuesPreviewBody = null;
}
function issuesPreviewAction() {
  const issue = issuesSelectedIssue;
  if (!issue) { issuesStatus("Select an issue first."); return; }
  const action = $("issuesAction").value;
  let parameters = { issue_number: issue.number };
  if (action === "comment_issue") {
    const body = $("issuesActionBody").value.trim();
    if (!body) { issuesStatus("Write the proposed comment first."); return; }
    parameters.body = body;
  } else if (action === "add_labels") {
    const labels = [...new Set($("issuesNewLabels").value.split(",").map(x => x.trim()).filter(Boolean))];
    if (!labels.length || labels.some(x => x.length > 50)) {
      issuesStatus("Enter at least one valid label (max 50 characters each)."); return;
    }
    parameters.labels = labels;
  } else if (action === "edit_issue") {
    const title = $("issuesNewTitle").value.trim();
    const body = $("issuesActionBody").value.trim();
    if (!title || !body) { issuesStatus("Provide a title and a description."); return; }
    parameters.title = title;
    parameters.body = body;
  } else if (action === "close_issue" || action === "reopen_issue") {
  } else { issuesStatus("Unsupported maintenance action."); return; }
  const preview = {
    status: "AWAITING_WORKER_GUARD_VERIFICATION_AND_HUMAN_APPROVAL",
    repository: issue.repository,
    issue_url: issue.html_url,
    action,
    parameters,
    human_approval_required: true,
    writes_performed: 0,
    next_step: "Verify and authorize this exact action. Then approve, preflight and execute once."
  };
  $("issuesPreviewResult").textContent = JSON.stringify(preview, null, 2);
  $("issuesPreviewResult").classList.remove("hidden");
  issuesPreviewBody = {
    repository: issue.repository,
    target: { kind: "branch", ref: $("agentBranch").value.trim() || "main" },
    action, parameters
  };
  $("maintenanceManualAuthorize").classList.remove("hidden");
  issuesStatus("Preview ready. Click Verify & authorize to run Cominty Worker and Guard before any write.");
}

async function maintenanceRunProtectedAction(body) {
  if (!body || body.repository !== $("agentRepoPicker").value) {
    issuesStatus("Select the same authorized repository first.");
    return;
  }
  maintenancePendingAction = structuredClone(body);
  elements.dynamicActionPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  await startWorkflow();
}
function assistantRenderGuidedChoices() {
  const guided = $("assistantMode").value === "guided";
  $("assistantActionField").classList.toggle("hidden", !guided);
  $("assistantIssueField").classList.toggle("hidden", !guided || $("assistantAction").value === "create_issue");
  $("maintenanceAutoInvestigate").textContent = guided ? "Let Cominty prepare my chosen action" : "Let Cominty choose an action";
  maintenanceAgentDraft = null;
  maintenancePendingAction = null;
  $("maintenanceAgentProposal").classList.add("hidden");
  $("codeFixReview").classList.add("hidden");
}
const PROPOSAL_ACTION_LABELS = {
  create_issue: "Create a new issue",
  comment_issue: "Add a comment to an issue",
  add_labels: "Add labels to an issue",
  edit_issue: "Edit an issue's title and description",
  close_issue: "Close an issue",
  reopen_issue: "Reopen an issue",
  propose_pr_fix: "Fix the code and open a Draft pull request"
};

function renderProposalSummary(response) {
  const draft = response.proposal;
  const rows = [];
  if (response.kind === "pull_request") {
    const files = draft.files.map(f => f.path).join(", ");
    rows.push(["What Cominty proposes", PROPOSAL_ACTION_LABELS.propose_pr_fix],
      ["Repository", draft.repository],
      ["Issue", `#${draft.issue_number}`],
      ["Files changed", files],
      ["Draft branch to create", draft.head_branch],
      ["Based on", `${draft.base_branch} @ ${String(draft.base_commit_sha).slice(0, 7)}`]);
  } else if (response.kind === "create_issue") {
    rows.push(["What Cominty proposes", PROPOSAL_ACTION_LABELS.create_issue],
      ["Repository", draft.repository],
      ["Issue title", draft.issue?.title ?? ""]);
  } else {
    rows.push(["What Cominty proposes", PROPOSAL_ACTION_LABELS[draft.action] ?? String(draft.action)],
      ["Repository", draft.repository],
      ["Issue", `#${draft.issue_number} · ${draft.issue_title}`]);
  }
  const list = $("maintenanceAgentSummary");
  list.replaceChildren();
  for (const [label, value] of rows) {
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = String(value);
    list.append(dt, dd);
  }
}

async function assistantInvestigate() {
  const repository = $("agentRepoPicker").value;
  if (!repository) { $("maintenanceAgentFeedback").textContent = "Choose an authorized repository first."; return; }
  const button = $("maintenanceAutoInvestigate");
  button.disabled = true;
  $("maintenanceAgentFeedback").textContent = "Cominty is examining verified GitHub evidence for your requested mode and action...";
  $("maintenanceAgentProposal").classList.add("hidden");
  $("codeFixReview").classList.add("hidden");
  maintenanceAgentDraft = null;
  maintenancePendingAction = null;
  try {
    const mode = $("assistantMode").value;
    const request = {
      repository,
      branch: $("agentBranch").value.trim() || "main",
      mode,
      objective: $("assistantObjective").value.trim() || "Investigate the repository and propose one useful action supported by GitHub evidence."
    };
    if (mode === "guided") {
      request.requested_action = $("assistantAction").value;
      const rawIssueNumber = $("assistantIssueNumber").value.trim();
      if (request.requested_action !== "create_issue" && rawIssueNumber) {
        const issueNumber = Number(rawIssueNumber);
        if (!Number.isSafeInteger(issueNumber) || issueNumber < 1) throw new Error("Choose a valid issue number.");
        request.issue_number = issueNumber;
      }
    }
    const isCodePr = mode === "guided" && request.requested_action === "propose_pr_fix";
    if (isCodePr && $("agentRepoPicker").selectedOptions[0]?.dataset.canCreatePr !== "true") {
      throw new Error("Code fixes require GitHub App permissions Contents: Read & write and Pull requests: Read & write. Update the GitHub App, accept its new permissions, then reconnect before spending Cominty credits.");
    }
    const response = isCodePr
      ? await postUi("/api/ui/github/pr/investigate", {
          repository: request.repository, branch: request.branch,
          ...(request.issue_number !== undefined ? { issue_number: request.issue_number } : {}),
          objective: request.objective
        })
      : await postUi("/api/ui/github/assistant/investigate", request);
    if (!["create_issue", "maintenance", "pull_request"].includes(response.kind) || !response.proposal ||
        response.created_by !== "COMINTY_MANAGED_AGENT" && response.proposal.created_by !== "COMINTY_MANAGED_AGENT") {
      throw new Error("The server returned an invalid agent proposal.");
    }
    const draft = response.proposal;
    if (mode === "guided" && draft.action !== request.requested_action &&
        !(response.kind === "create_issue" && request.requested_action === "create_issue") &&
        !(response.kind === "pull_request" && request.requested_action === "propose_pr_fix")) {
      throw new Error("The agent attempted to change your selected action.");
    }
    maintenanceAgentDraft = response;
    const details = response.kind === "pull_request" ? {
      repository: draft.repository, issue_number: draft.issue_number,
      issue_url: `https://github.com/${draft.repository}/issues/${draft.issue_number}`,
      issue_selection: response.issue_selection?.mode === "COMINTY_SELECTED"
        ? `Cominty selected issue #${draft.issue_number}: ${response.issue_selection.issue_title}`
        : "You selected this issue explicitly",
      action: "propose_pr_fix", title: draft.title, description: draft.description,
      source_branch: draft.base_branch, verified_commit: draft.base_commit_sha,
      proposed_branch: draft.head_branch, plan_digest: draft.plan_digest,
      files: draft.files.map(f => ({path: f.path, before_sha256: f.before_sha256, after_sha256: f.after_sha256})),
      status: "REVIEW ONLY — no write until verified and human approved"
    } : response.kind === "create_issue" ? {
      repository: draft.repository, action: "create_issue", issue: draft.issue,
      evidence_urls: draft.evidence_urls, rationale: draft.rationale,
      confidence: draft.confidence, status: "PROPOSED — requires Worker/Guard and human approval"
    } : {
      repository: draft.repository,
      issue: `#${draft.issue_number} · ${draft.issue_title}`,
      issue_url: draft.issue_url, action: draft.action,
      parameters: draft.parameters, rationale: draft.rationale,
      confidence: draft.confidence, status: "PROPOSED — requires Worker/Guard and human approval"
    };
    renderProposalSummary(response);
    $("maintenanceAgentProposalBody").textContent = JSON.stringify(details, null, 2);
    $("maintenanceAgentProposalBody").closest("details").open = response.kind !== "pull_request";
    if (response.kind === "pull_request") {
      $("codeFixReviewDiff").textContent = draft.files.map(f => f.diff).join("\n\n");
      $("codeFixReview").classList.remove("hidden");
      $("maintenanceAgentAuthorize").textContent = "Verify this exact code change with Worker + Guard";
    } else {
      $("codeFixReview").classList.add("hidden");
      $("maintenanceAgentAuthorize").textContent = "Verify & authorize agent proposal";
    }
    $("maintenanceAgentProposal").classList.remove("hidden");
    $("maintenanceAgentFeedback").textContent = "Review Cominty's exact proposal, then run protected verification. No GitHub write yet.";
  } catch (error) {
    $("maintenanceAgentFeedback").textContent = `Cominty investigation failed: ${error.message}`;
  } finally { button.disabled = false; }
}
$("maintenanceAutoInvestigate").addEventListener("click", assistantInvestigate);
$("assistantMode").addEventListener("change", assistantRenderGuidedChoices);
$("assistantAction").addEventListener("change", assistantRenderGuidedChoices);
$("assistantIssueNumber").addEventListener("change", () => {
  maintenanceAgentDraft = null; maintenancePendingAction = null; $("maintenanceAgentProposal").classList.add("hidden");
});
$("assistantObjective").addEventListener("change", () => {
  maintenanceAgentDraft = null; maintenancePendingAction = null; $("maintenanceAgentProposal").classList.add("hidden");
});
$("maintenanceAgentAuthorize").addEventListener("click", async () => {
  if (!maintenanceAgentDraft) return;
  const selected = maintenanceAgentDraft;
  const draft = selected.proposal;
  if (selected.kind === "pull_request") {
    await maintenanceRunProtectedAction({
      repository: draft.repository,
      target: {kind:"branch",ref:draft.base_branch},
      pr_draft_id: draft.plan_digest
    });
    return;
  }
  if (selected.kind === "create_issue") {
    maintenancePendingAction = null;
    state.agentIssueDraft = draft;
    state.agentDraftApplied = false;
    applyAgentIssueDraft();
    await startWorkflow();
    return;
  }
  await maintenanceRunProtectedAction({
    repository: draft.repository,
    target: { kind: "branch", ref: draft.branch },
    action: draft.action,
    parameters: draft.parameters,
    maintenance_draft_id: draft.draft_id
  });
});
assistantRenderGuidedChoices();
$("maintenanceManualAuthorize").addEventListener("click", () => {
  if (issuesPreviewBody) maintenanceRunProtectedAction(issuesPreviewBody);
});

$("issuesLoadIssues").addEventListener("click", issuesLoadIssues);
$("issueState").addEventListener("change", issuesLoadIssues);
$("issueSelect").addEventListener("change", issuesLoadDetail);
$("issuesAction").addEventListener("change", issuesRenderActionFields);
$("issuesPreview").addEventListener("click", issuesPreviewAction);

resetWorkflowState(
  true
);

setWorkspaceMode("live");

setViewMode(
  "simple"
);

initializeUiSession();
