import assert from "node:assert/strict";
import test from "node:test";
import {
  readFileSync
} from "node:fs";


const html =
  readFileSync(
    new URL(
      "../public/index.html",
      import.meta.url
    ),
    "utf8"
  );

const app =
  readFileSync(
    new URL(
      "../public/app.js",
      import.meta.url
    ),
    "utf8"
  );

const server =
  readFileSync(
    new URL(
      "../src/server.ts",
      import.meta.url
    ),
    "utf8"
  );


test(
  "deployed UI exposes an explicit sign-in gate and sign-out control",
  () => {
    assert.match(
      html,
      /<body class="auth-locked">/
    );

    assert.match(
      html,
      /id="authGate"/
    );

    assert.match(
      html,
      /id="authToken"[\s\S]*type="password"/
    );

    assert.match(
      html,
      /id="authButton"/
    );

    assert.match(
      html,
      /id="logoutButton"/
    );
  }
);


test(
  "browser exchanges the access key for a session without persistent browser storage",
  () => {
    assert.match(
      app,
      /\/api\/ui\/session\/login/
    );

    assert.match(
      app,
      /access_token/
    );

    assert.match(
      app,
      /elements\.authToken[\s\S]*\.value\s*=\s*""/
    );

    assert.doesNotMatch(
      app,
      /\blocalStorage\b/
    );

    assert.doesNotMatch(
      app,
      /\bsessionStorage\b/
    );

    assert.match(
      app,
      /\/api\/ui\/session\/logout/
    );
  }
);


test(
  "server login validates the access credential before issuing an opaque session cookie",
  () => {
    const routeStart =
      server.indexOf(
        '"/api/ui/session/login"'
      );

    const routeEnd =
      server.indexOf(
        '"/api/ui/session/logout"',
        routeStart
      );

    assert.ok(
      routeStart >= 0
    );

    assert.ok(
      routeEnd > routeStart
    );

    const route =
      server.slice(
        routeStart,
        routeEnd
      );

    assert.match(
      route,
      /contextGuardUiAccessGate[\s\S]*\.authenticate/
    );

    assert.match(
      route,
      /createAuthenticatedSession/
    );

    assert.match(
      route,
      /cookieHeader/
    );

    assert.match(
      route,
      /Cache-Control/
    );

    assert.match(
      route,
      /no-store/
    );

    const responseSection =
      route.slice(
        route.indexOf(
          "sendJson("
        )
      );

    assert.doesNotMatch(
      responseSection,
      /access_token/
    );
  }
);
