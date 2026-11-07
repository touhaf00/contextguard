import assert from "node:assert/strict";
import test from "node:test";

import {
  getContextGuardUiCapabilitiesV2
} from "../dist/api/ui/capabilities.js";

function providers(
  catalog
) {
  return catalog.categories
    .flatMap(
      category =>
        category.providers
    );
}

test(
  "UI catalog exposes only currently honest product surfaces",
  () => {
    const catalog =
      getContextGuardUiCapabilitiesV2();

    assert.deepEqual(
      catalog.categories.map(
        category =>
          category.id
      ),
      [
        "code_devops",
        "custom"
      ]
    );

    assert.deepEqual(
      providers(catalog).map(
        provider =>
          provider.id
      ),
      [
        "github",
        "generic_api"
      ]
    );
  }
);

test(
  "GitHub is the current live browser integration",
  () => {
    const catalog =
      getContextGuardUiCapabilitiesV2();

    const github =
      providers(catalog)
        .find(
          provider =>
            provider.id ===
            "github"
        );

    assert.equal(
      github.status,
      "LIVE_ADAPTER"
    );

    assert.equal(
      github.selectable,
      true
    );

    assert.equal(
      github.execution_adapter_available,
      true
    );

    assert.equal(
      github.actions.length,
      6
    );

    assert.equal(
      github.actions[0].id,
      "create_issue"
    );
    assert.deepEqual(github.actions.map(a=>a.id),[
      'create_issue','comment_issue','add_labels','edit_issue','close_issue','reopen_issue'
    ]);
    assert.ok(github.actions.every(a=>a.execution_supported));
  }
);

test(
  "Custom API exposes the generic core without claiming a browser executor",
  () => {
    const catalog =
      getContextGuardUiCapabilitiesV2();

    const custom =
      providers(catalog)
        .find(
          provider =>
            provider.id ===
            "generic_api"
        );

    assert.equal(
      custom.status,
      "CORE_API_AVAILABLE"
    );

    assert.equal(
      custom.selectable,
      false
    );

    assert.equal(
      custom.execution_adapter_available,
      false
    );

    assert.deepEqual(
      custom.actions,
      []
    );
  }
);

test(
  "GitHub dynamic form is fully described by capability metadata",
  () => {
    const catalog =
      getContextGuardUiCapabilitiesV2();

    const github =
      providers(catalog)
        .find(
          provider =>
            provider.id ===
            "github"
        );

    const action =
      github.actions[0];

    assert.deepEqual(
      action.fields.map(
        field =>
          field.id
      ),
      [
        "repository",
        "target_kind",
        "target_ref",
        "title",
        "body"
      ]
    );

    assert.equal(
      action.fields.find(
        field =>
          field.id ===
            "title"
      ).max_length,
      256
    );

    assert.equal(
      action.fields.find(
        field =>
          field.id ===
            "body"
      ).max_length,
      10000
    );
  }
);

test(
  "real UI execution policy remains separate from provider availability",
  () => {
    const disabled =
      getContextGuardUiCapabilitiesV2({
        uiRealExecutionEnabled:
          false
      });

    const enabled =
      getContextGuardUiCapabilitiesV2({
        uiRealExecutionEnabled:
          true
      });

    assert.equal(
      disabled
        .ui_real_execution_enabled,
      false
    );

    assert.equal(
      enabled
        .ui_real_execution_enabled,
      true
    );

    const github =
      providers(disabled)
        .find(
          provider =>
            provider.id ===
            "github"
        );

    assert.equal(
      github
        .execution_adapter_available,
      true
    );
  }
);
