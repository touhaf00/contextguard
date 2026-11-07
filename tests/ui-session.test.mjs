import assert from "node:assert/strict";
import test from "node:test";

import {
  CONTEXTGUARD_UI_SESSION_COOKIE,
  ContextGuardUiSessionErrorV2,
  ContextGuardUiSessionManagerV2,
  isLoopbackAddressV2
} from "../dist/api/ui/session.js";

function manager(
  overrides = {}
) {
  return new ContextGuardUiSessionManagerV2({
    localSessionEnabled:
      true,

    principalId:
      "local-user",

    displayName:
      "Local ContextGuard User",

    now:
      () =>
        new Date(
          "2026-11-02T23:00:00.000Z"
        ),

    sessionId:
      () =>
        "local-session-1",

    ...overrides
  });
}

test(
  "local UI session accepts only loopback addresses",
  () => {
    assert.equal(
      isLoopbackAddressV2(
        "127.0.0.1"
      ),
      true
    );

    assert.equal(
      isLoopbackAddressV2(
        "::1"
      ),
      true
    );

    assert.equal(
      isLoopbackAddressV2(
        "::ffff:127.0.0.1"
      ),
      true
    );

    assert.equal(
      isLoopbackAddressV2(
        "192.168.1.10"
      ),
      false
    );
  }
);

test(
  "local UI session creates an opaque authenticated session",
  () => {
    const service =
      manager();

    const session =
      service.createLocalSession(
        "127.0.0.1"
      );

    assert.equal(
      session.session_id,
      "local-session-1"
    );

    assert.equal(
      session.principal
        .principal_id,
      "local-user"
    );

    assert.equal(
      session.principal
        .authentication_method,
      "local_session"
    );
  }
);

test(
  "remote clients cannot create automatic local sessions",
  () => {
    assert.throws(
      () =>
        manager()
          .createLocalSession(
            "10.0.0.25"
          ),
      error =>
        error instanceof
          ContextGuardUiSessionErrorV2 &&
        error.code ===
          "REMOTE_NOT_ALLOWED"
    );
  }
);

test(
  "session cookie authenticates without exposing a bearer token",
  () => {
    const service =
      manager();

    const session =
      service.createLocalSession(
        "::1"
      );

    const setCookie =
      service.cookieHeader(
        session
      );

    assert.match(
      setCookie,
      new RegExp(
        `^${CONTEXTGUARD_UI_SESSION_COOKIE}=`
      )
    );

    assert.match(
      setCookie,
      /HttpOnly/
    );

    assert.match(
      setCookie,
      /SameSite=Strict/
    );

    const cookie =
      setCookie
        .split(";")[0];

    const principal =
      service.authenticate(
        cookie
      );

    assert.equal(
      principal.principal_id,
      "local-user"
    );
  }
);

test(
  "expired UI session fails closed",
  () => {
    let now =
      new Date(
        "2026-11-02T23:00:00.000Z"
      );

    const service =
      manager({
        ttlMs:
          1000,

        now:
          () => now
      });

    const session =
      service.createLocalSession(
        "127.0.0.1"
      );

    const cookie =
      service
        .cookieHeader(
          session
        )
        .split(";")[0];

    now =
      new Date(
        "2026-11-02T23:00:02.000Z"
      );

    assert.throws(
      () =>
        service.authenticate(
          cookie
        ),
      error =>
        error instanceof
          ContextGuardUiSessionErrorV2 &&
        error.code ===
          "EXPIRED"
    );
  }
);


test(
  "bearer-authenticated principal becomes an opaque UI session",
  () => {
    const service =
      manager({
        sessionId:
          () =>
            "authenticated-session-1"
      });

    const session =
      service
        .createAuthenticatedSession({
          principal_type:
            "HUMAN",

          principal_id:
            "operator-1",

          display_name:
            "ContextGuard Operator",

          authentication_method:
            "bearer_token"
        });

    assert.equal(
      session.session_id,
      "authenticated-session-1"
    );

    assert.equal(
      session.principal
        .principal_id,
      "operator-1"
    );

    assert.equal(
      session.principal
        .authentication_method,
      "bearer_token"
    );

    const cookie =
      service
        .cookieHeader(
          session
        );

    assert.match(
      cookie,
      /HttpOnly/
    );

    assert.match(
      cookie,
      /SameSite=Strict/
    );

    assert.doesNotMatch(
      cookie,
      /ui-secret/
    );

    const authenticated =
      service.authenticate(
        cookie.split(";")[0]
      );

    assert.equal(
      authenticated
        .principal_id,
      "operator-1"
    );

    assert.equal(
      authenticated
        .authentication_method,
      "bearer_token"
    );
  }
);


test(
  "authenticated UI session rejects an invalid human principal",
  () => {
    assert.throws(
      () =>
        manager()
          .createAuthenticatedSession({
            principal_type:
              "HUMAN",

            principal_id:
              "   ",

            authentication_method:
              "bearer_token"
          }),
      error =>
        error instanceof
          ContextGuardUiSessionErrorV2 &&
        error.code ===
          "UNAUTHORIZED"
    );
  }
);
