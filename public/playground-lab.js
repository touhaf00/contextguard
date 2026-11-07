"use strict";

const InteractiveLab = (() => {
  const BASE_SHA = "b182a69150a65b60217ef9758b1fd771f64e7d1a";
  const BASE_TITLE = "Verify deployment evidence for v1.1.0";

  const stages = [
    "RESOURCE", "WORKER", "GUARD", "ACTIONLOCK",
    "HUMAN", "PREFLIGHT", "RECEIPT", "EXECUTION GATE"
  ];

  function normalize(raw) {
    return {
      sha: String(raw.sha ?? "").trim().toLowerCase(),
      title: String(raw.title ?? "").trim(),
      ciEvidence: raw.ciEvidence === true
    };
  }

  function evaluate(lock, raw, receipt = "fresh", decision = "pending") {
    const current = normalize(raw);

    let index = 7;
    let kind = "simulated";
    let verdict = "AUTHORIZED · SIMULATION ONLY";
    let reason =
      "The approved source and action are unchanged. " +
      "No real external action is performed.";

    if (!/^[a-f0-9]{40}$/.test(current.sha) ||
        !current.title || current.title.length > 120) {
      [index, kind, verdict, reason] = [
        0, "blocked", "BLOCKED · INVALID INPUT",
        "A valid 40-character SHA and a title are required."
      ];
    } else if (!current.ciEvidence) {
      [index, kind, verdict, reason] = [
        2, "blocked", "BLOCKED · EVIDENCE GAP",
        "The required CI evidence is missing. Guard cannot verify it."
      ];
    } else if (decision === "rejected") {
      [index, kind, verdict, reason] = [
        4, "blocked", "BLOCKED · HUMAN REJECTION",
        "The human explicitly rejected the action."
      ];
    } else if (!lock || decision !== "approved") {
      [index, kind, verdict, reason] = [
        3, "waiting", "WAITING · APPROVAL REQUIRED",
        "Approve and lock the original snapshot first."
      ];
    } else if (lock.sha !== current.sha) {
      [index, kind, verdict, reason] = [
        5, "blocked", "BLOCKED · COMMIT DRIFT",
        "The current commit differs from the approved commit."
      ];
    } else if (lock.title !== current.title) {
      [index, kind, verdict, reason] = [
        5, "blocked", "BLOCKED · ACTION TAMPERING",
        "The action no longer matches what the human approved."
      ];
    } else if (receipt === "consumed") {
      [index, kind, verdict, reason] = [
        6, "blocked", "BLOCKED · RECEIPT REPLAY",
        "The one-time authorization was already consumed."
      ];
    } else if (receipt === "expired") {
      [index, kind, verdict, reason] = [
        6, "blocked", "BLOCKED · EXPIRED RECEIPT",
        "The authorization receipt has expired."
      ];
    }

    return {
      verdict, reason, kind, index,
      stages: stages.map((name, i) => ({
        name,
        state:
          i < index ? "passed" :
          i === index ? kind : "unvisited"
      }))
    };
  }

  return { BASE_SHA, BASE_TITLE, stages, normalize, evaluate };
})();

globalThis.ContextGuardInteractiveLab = InteractiveLab;

if (typeof document !== "undefined") {
  const model = InteractiveLab;
  const $ = id => document.getElementById(id);

  const lab = document.createElement("section");
  lab.id = "manualAttackLab";
  lab.className = "panel lab-lab";

  lab.innerHTML = `
    <div class="eyebrow">NEW · LIVE ATTACK LAB</div>
    <h2>Modify an approved action yourself</h2>
    <p>
      Approve the original action, change its contents,
      then discover exactly where ContextGuard blocks it.
    </p>

    <div class="lab-fields">
      <label>
        GitHub commit SHA
        <input id="labSha" spellcheck="false"
          autocomplete="off" value="${model.BASE_SHA}">
      </label>
      <label>
        GitHub issue title
        <input id="labTitle" maxlength="120"
          value="${model.BASE_TITLE}">
      </label>
    </div>

    <label class="lab-proof">
      <input id="labEvidence" type="checkbox" checked>
      CI evidence is available for verification
    </label>

    <div class="lab-buttons">
      <button id="labApprove" class="primary">
        Approve & lock snapshot
      </button>
      <button id="labReject">Reject</button>
      <button id="labReset">Reset lab</button>
    </div>

    <p id="labLockState" class="lab-help" role="status">
      No approved snapshot.
    </p>

    <div class="lab-digests">
      <div>
        <small>Approved SHA-256 (illustrative)</small>
        <code id="labApprovedDigest">—</code>
      </div>
      <div>
        <small>Current SHA-256 (illustrative)</small>
        <code id="labCurrentDigest">—</code>
      </div>
    </div>

    <div class="eyebrow">ATTACK SHORTCUTS</div>

    <div class="lab-buttons">
      <button id="labChangeSha">Change commit</button>
      <button id="labChangeTitle">Change issue title</button>
      <button id="labDropEvidence">Remove evidence</button>
      <button id="labReplay">Replay receipt</button>
      <button id="labExpire">Expire receipt</button>
      <button id="labRestore">Restore approved state</button>
    </div>

    <button id="labCheck" class="primary lab-check">
      Run final security check
    </button>

    <div id="labPipeline" class="lab-pipeline"></div>

    <h3 id="labVerdict" aria-live="polite">
      AWAITING FINAL CHECK
    </h3>
    <p id="labReason">Approve an action and modify it.</p>

    <div class="comparison">
      <div class="panel">
        <div class="eyebrow bad">
          WITHOUT FINAL CHECK · HYPOTHETICAL
        </div>
        <p id="labWithout">No experiment yet.</p>
      </div>
      <div class="panel">
        <div class="eyebrow good">
          WITH CONTEXTGUARD · SIMULATED
        </div>
        <p id="labWith">No experiment yet.</p>
      </div>
    </div>

    <small class="lab-help">
      Educational simulation only. SHA-256 hashes illustrate
      how changes affect an identity; they are not real
      ActionLocks or execution authorizations.
      No Cominty or GitHub requests are made.
    </small>

    <hr>
    <p class="lab-help">
      Preset security scenarios are also available below.
    </p>
  `;

  $("attackView").prepend(lab);

  const css = document.createElement("style");
  css.textContent = `
    .lab-lab {
      border-color: #5b76b0;
      background: linear-gradient(145deg, #172840, #111926 65%);
    }
    .lab-fields, .lab-digests {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 15px;
      margin: 20px 0;
    }
    .lab-fields label {
      display: grid;
      gap: 8px;
      color: var(--muted);
      font-size: 12px;
    }
    .lab-fields input {
      width: 100%;
      min-width: 0;
      padding: 13px;
      border: 1px solid #50648a;
      border-radius: 9px;
      background: #0c1423;
      color: var(--text);
      font: inherit;
    }
    .lab-proof {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 18px;
    }
    .lab-buttons {
      display: flex;
      flex-wrap: wrap;
      gap: 9px;
      margin: 14px 0 20px;
    }
    .lab-buttons button { padding: 11px 13px; }
    .lab-help {
      color: var(--muted);
      font-size: 12px;
      line-height: 1.6;
    }
    .lab-digests div {
      min-width: 0;
      padding: 14px;
      background: #0b1422;
      border: 1px solid var(--border);
      border-radius: 11px;
    }
    .lab-digests small {
      display: block;
      color: var(--muted);
      margin-bottom: 8px;
    }
    .lab-digests code {
      display: block;
      overflow-wrap: anywhere;
      font-size: 11px;
    }
    .lab-check {
      width: 100%;
      margin-bottom: 24px;
    }
    .lab-pipeline {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 9px;
      margin-bottom: 25px;
    }
    .lab-node {
      padding: 12px 8px;
      text-align: center;
      font-size: 11px;
      background: #101a2a;
      border: 1px solid var(--border);
      border-radius: 10px;
      animation: labAppear .22s ease both;
    }
    .lab-node strong {
      display: block;
      font-size: 10px;
      margin-top: 7px;
    }
    .lab-passed {
      border-color: #326a58;
      color: var(--green);
    }
    .lab-blocked {
      border-color: #994f5a;
      background: #381b2b;
      color: var(--red);
    }
    .lab-waiting {
      border-color: #957943;
      color: var(--yellow);
    }
    .lab-simulated {
      border-color: #6a86d4;
      color: var(--accent);
    }
    .lab-unvisited { opacity: .45; }
    @keyframes labAppear {
      from { transform: translateY(5px); opacity: .5; }
      to { transform: translateY(0); opacity: 1; }
    }
    @media (max-width: 750px) {
      .lab-fields, .lab-digests {
        grid-template-columns: 1fr;
      }
      .lab-pipeline {
        grid-template-columns: repeat(2, 1fr);
      }
    }
  `;

  document.head.append(css);

  let lock = null;
  let decision = "pending";
  let receipt = "fresh";
  let revision = 0;

  function current() {
    return model.normalize({
      sha: $("labSha").value,
      title: $("labTitle").value,
      ciEvidence: $("labEvidence").checked
    });
  }

  async function hashSnapshot(value) {
    if (!globalThis.crypto?.subtle) {
      return "Unavailable in this browser";
    }

    const bytes = new TextEncoder().encode(
      JSON.stringify(value)
    );

    const digest = new Uint8Array(
      await globalThis.crypto.subtle.digest("SHA-256", bytes)
    );

    return Array.from(
      digest,
      b => b.toString(16).padStart(2, "0")
    ).join("");
  }

  async function preview() {
    const id = ++revision;
    const state = current();

    $("labLockState").textContent = lock
      ? "The approved snapshot is frozen. Changes require a new check."
      : "No snapshot has been approved yet.";

    try {
      const [oldHash, newHash] = await Promise.all([
        lock ? hashSnapshot(lock) : Promise.resolve("—"),
        hashSnapshot(state)
      ]);

      if (id !== revision) return;

      $("labApprovedDigest").textContent = oldHash;
      $("labCurrentDigest").textContent = newHash;
    } catch {
      $("labCurrentDigest").textContent =
        "SHA-256 display unavailable";
    }
  }

  function onChange() {
    $("labVerdict").textContent = "CHANGES READY · RUN FINAL CHECK";
    $("labReason").textContent =
      "Current inputs have not been re-authorized.";
    preview();
  }

  function run() {
    const result = model.evaluate(
      lock, current(), receipt, decision
    );

    $("labVerdict").textContent = result.verdict;
    $("labReason").textContent = result.reason;

    const pipeline = $("labPipeline");
    pipeline.replaceChildren();

    for (const stage of result.stages) {
      const node = document.createElement("div");
      node.className = "lab-node lab-" + stage.state;

      const label = document.createElement("span");
      label.textContent = stage.name;

      const status = document.createElement("strong");
      status.textContent = stage.state.toUpperCase();

      node.append(label, status);
      pipeline.append(node);
    }

    $("labWithout").textContent =
      result.kind === "simulated"
        ? "The unchanged example could proceed."
        : "Without an equivalent check, the problem might go undetected.";

    $("labWith").textContent = result.reason;
  }

  $("labApprove").onclick = () => {
    const state = current();

    if (!/^[a-f0-9]{40}$/.test(state.sha) ||
        !state.title ||
        state.title.length > 120 ||
        !state.ciEvidence) {
      $("labVerdict").textContent = "CANNOT APPROVE";
      $("labReason").textContent =
        "Valid source, title and CI evidence are required.";
      return;
    }

    lock = Object.freeze({ ...state });
    decision = "approved";
    receipt = "fresh";

    onChange();
    $("labVerdict").textContent =
      "APPROVED · SNAPSHOT FROZEN";
  };

  $("labReject").onclick = () => {
    lock = null;
    decision = "rejected";
    onChange();
    run();
  };

  $("labCheck").onclick = run;

  $("labChangeSha").onclick = () => {
    $("labSha").value = "f".repeat(40);
    onChange();
  };

  $("labChangeTitle").onclick = () => {
    $("labTitle").value = "Announce production deployment";
    onChange();
  };

  $("labDropEvidence").onclick = () => {
    $("labEvidence").checked = false;
    onChange();
  };

  $("labReplay").onclick = () => {
    receipt = "consumed";
    onChange();
  };

  $("labExpire").onclick = () => {
    receipt = "expired";
    onChange();
  };

  $("labRestore").onclick = () => {
    if (!lock) return;

    $("labSha").value = lock.sha;
    $("labTitle").value = lock.title;
    $("labEvidence").checked = lock.ciEvidence;
    receipt = "fresh";
    onChange();
  };

  $("labReset").onclick = () => {
    lock = null;
    decision = "pending";
    receipt = "fresh";

    $("labSha").value = model.BASE_SHA;
    $("labTitle").value = model.BASE_TITLE;
    $("labEvidence").checked = true;

    onChange();
    run();
  };

  for (const id of ["labSha", "labTitle", "labEvidence"]) {
    $(id).addEventListener("input", onChange);
  }

  run();
  preview();
}
