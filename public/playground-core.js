"use strict";

const PlaygroundModel = (() => {
  const evidence = {
    tag: {
      title: "Repository snapshot",
      detail:
        "The tag resolves to a known commit. This identifies " +
        "the source code, but does not prove deployment.",
      reference: "b182a69150a65b60217ef9758b1fd771f64e7d1a",
      verdict: "PASS"
    },
    ci: {
      title: "CI workflow",
      detail:
        "Recorded CI runs succeeded. The tests passed, " +
        "but CI success is not proof of production deployment.",
      reference: "test → docker → deploy",
      verdict: "PASS"
    },
    deploy: {
      title: "Production deployment",
      detail:
        "The deployment job's success message is not enough " +
        "to establish that production was actually updated.",
      reference: "Additional deployment evidence required",
      verdict: "REVIEW"
    }
  };

  const attacks = {
    none: [
      "The approved action remains unchanged.",
      "Original snapshot and action match."
    ],
    drift: [
      "The repository points to a different commit.",
      "Approved SHA differs from the simulated current SHA."
    ],
    tamper: [
      "The issue title was changed after approval.",
      "The action fingerprint no longer matches."
    ],
    missing: [
      "Decision-critical evidence has been removed.",
      "The Guard cannot support the required claim."
    ],
    replay: [
      "A previously consumed authorization is used again.",
      "Receipt state: CONSUMED."
    ],
    expired: [
      "The authorization validity period has ended.",
      "Receipt state: EXPIRED."
    ]
  };

  function evaluate(attack, approval) {
    if (!attacks[attack]) {
      throw new Error("Unknown demonstration scenario");
    }

    const trace = [
      "SOURCE · Example resource identified",
      "WORKER · Evidence inspected"
    ];

    let status;
    let explanation;

    if (attack === "missing") {
      trace.push("GUARD · REVIEW: evidence unavailable");
      status = "BLOCKED · EVIDENCE GAP";
      explanation =
        "The required evidence cannot be verified. " +
        "No ActionLock is issued.";
    } else {
      trace.push("GUARD · PASS: original evidence supported");
      trace.push("ACTIONLOCK · Snapshot and action bound");

      if (approval !== true) {
        status = approval === false
          ? "BLOCKED · HUMAN REJECTION"
          : "WAITING · HUMAN APPROVAL";
        explanation =
          "The human approval gate was not passed.";
        trace.push("HUMAN · Approval not granted");
      } else {
        trace.push("HUMAN · Approved (simulated)");

        const outcomes = {
          none: [
            "AUTHORIZED · SIMULATION ONLY",
            "The resource and action remain unchanged."
          ],
          drift: [
            "BLOCKED · CONTEXT CHANGED",
            "The fresh resource snapshot differs from the approved one."
          ],
          tamper: [
            "BLOCKED · ACTION TAMPERING",
            "The proposed action differs from what the human approved."
          ],
          replay: [
            "BLOCKED · RECEIPT REPLAY",
            "A consumed authorization cannot be reused."
          ],
          expired: [
            "BLOCKED · EXPIRED RECEIPT",
            "The receipt is no longer valid."
          ]
        };

        [status, explanation] = outcomes[attack];

        trace.push(
          attack === "drift" ? "PREFLIGHT · SHA mismatch" :
          attack === "tamper" ? "PREFLIGHT · Action mismatch" :
          attack === "replay" ? "RECEIPT · Already consumed" :
          attack === "expired" ? "RECEIPT · Expired" :
          "PREFLIGHT · All checks passed"
        );
      }
    }

    trace.push("AUDIT · Simulated decision recorded");

    return {
      status,
      explanation,
      observed: attacks[attack][1],
      trace,
      without:
        attack === "none"
          ? "The unchanged action might proceed."
          : "Without an equivalent protection, this change " +
            "could go undetected.",
      with:
        status.startsWith("AUTHORIZED")
          ? "Authorization is illustrated. Nothing is executed."
          : "The action cannot proceed in this simulation."
    };
  }

  return { evidence, attacks, evaluate };
})();

globalThis.ContextGuardPlaygroundModel = PlaygroundModel;

if (typeof document !== "undefined") {
  const $ = id => document.getElementById(id);
  let approval = null;

  function tab(name) {
    $("evidenceView").classList.toggle(
      "hidden", name !== "evidence"
    );
    $("attackView").classList.toggle(
      "hidden", name !== "attack"
    );
    $("evidenceTab").classList.toggle(
      "active", name === "evidence"
    );
    $("attackTab").classList.toggle(
      "active", name === "attack"
    );
  }

  $("evidenceTab").onclick = () => tab("evidence");
  $("attackTab").onclick = () => tab("attack");
  $("goToAttack").onclick = () => tab("attack");

  for (const button of document.querySelectorAll("[data-evidence]")) {
    button.onclick = () => {
      const item = PlaygroundModel.evidence[button.dataset.evidence];
      $("evidenceTitle").textContent = item.title;
      $("evidenceDetail").textContent = item.detail;
      $("evidenceReference").textContent = item.reference;
    };
  }

  $("verifyClaim").onclick = () => {
    const item = PlaygroundModel.evidence[$("claimSelect").value];
    $("claimResult").classList.remove("hidden");
    $("claimVerdict").textContent = "GUARD · " + item.verdict;
    $("claimExplanation").textContent =
      item.verdict === "PASS"
        ? "The available example evidence supports this claim."
        : "The claim needs independent deployment evidence.";
  };

  function reset() {
    approval = null;
    $("approvalState").textContent = "HUMAN APPROVAL · PENDING";
    $("attackDescription").textContent =
      PlaygroundModel.attacks[$("attackSelect").value][0];
    $("verdict").textContent = "AWAITING EXPERIMENT";
    $("explanation").textContent = "Choose an approval decision.";
    $("observedChange").textContent = "";
    $("withoutResult").textContent = "Run an experiment.";
    $("withResult").textContent = "Run an experiment.";
    $("timeline").replaceChildren();
  }

  $("attackSelect").onchange = reset;

  $("approveExample").onclick = () => {
    approval = true;
    $("approvalState").textContent =
      "HUMAN APPROVAL · APPROVED (SIMULATED)";
  };

  $("rejectExample").onclick = () => {
    approval = false;
    $("approvalState").textContent =
      "HUMAN APPROVAL · REJECTED (SIMULATED)";
  };

  $("runCheck").onclick = () => {
    const result = PlaygroundModel.evaluate(
      $("attackSelect").value, approval
    );

    $("verdict").textContent = result.status;
    $("verdict").className =
      result.status.startsWith("AUTHORIZED")
        ? "good" : "bad";
    $("explanation").textContent = result.explanation;
    $("observedChange").textContent = result.observed;
    $("withoutResult").textContent = result.without;
    $("withResult").textContent = result.with;

    const list = $("timeline");
    list.replaceChildren();

    for (const event of result.trace) {
      const item = document.createElement("li");
      item.textContent = event;
      list.appendChild(item);
    }
  };

  $("resetExperiment").onclick = () => {
    $("attackSelect").value = "none";
    reset();
  };

  reset();
}
