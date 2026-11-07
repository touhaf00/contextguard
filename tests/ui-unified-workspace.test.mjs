import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
const read = file => readFileSync(new URL(`../public/${file}`, import.meta.url), "utf8");
const html=read("index.html"),js=read("app.js"),play=read("playground.html");

test("authenticated interface contains simulation and live workspaces",()=>{
  for(const id of ["workspacePlaygroundButton","workspaceLiveButton","simulationWorkspace","liveWorkspace","simulationFrame"]) {
    assert.match(html,new RegExp(`id="${id}"`));
  }
  assert.match(html,/playground\.html\?embed=1/);
  assert.match(js,/function setWorkspaceMode\(mode\)/);
  assert.match(js,/setWorkspaceMode\("simulation"\)/);
});
test("same existing public model drives all five attack cases",()=>{
  const lab=read("playground-lab.js");
  for(const attack of ["labChangeSha","labChangeTitle","labDropEvidence","labReplay","labExpire"]){assert.match(lab,new RegExp(attack));}
  for(const claim of ["The tag resolves to the expected commit","The CI workflow succeeded","Production deployment was completed"]){assert.ok(play.includes(claim));}
  assert.doesNotMatch(lab,/fetch\s*\(|XMLHttpRequest|\/api\/ui\/execute/);
});
test("iframe communication is origin-and-source-scoped",()=>{
  assert.match(html,/sandbox="allow-scripts"/);
  assert.doesNotMatch(html,/allow-same-origin/);
  assert.match(js,/event\.origin !== "null"/);
  assert.match(js,/event\.source !== elements\.simulationFrame\.contentWindow/);
  assert.match(play,/contextguard:playground:height/);
});
test("live mode retains independent server-side preflight and disabled execution controls",()=>{
  assert.match(js,/"\/api\/ui\/preflight"/);
  assert.match(js,/preflightCode === "SNAPSHOT_CHANGED"/);
  assert.match(html,/Starting an authorization may call Cominty and consume credits/);
  assert.match(js,/state\.workspaceMode !== "live"/);
  assert.match(js,/Start a REAL GitHub evidence assessment/);
  assert.doesNotMatch(html,/id="autoPush"|id="runAttackOnGithub"/);
});
