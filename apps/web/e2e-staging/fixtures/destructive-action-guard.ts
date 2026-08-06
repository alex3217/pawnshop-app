import type { Page, Request } from "@playwright/test";

import { stagingApiOrigin } from "./staging-origins";

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const AUTHENTICATION_POST_PATHS = new Set(["/api/auth/login"]);

type GuardOptions = {
  allowAuthenticationLogin?: boolean;
};

function sanitizedRequest(request: Request) {
  let pathname = "/invalid-url";
  let origin = "";
  try {
    const url = new URL(request.url());
    pathname = url.pathname;
    origin = url.origin;
  } catch {
    // Keep the fixed safe placeholder. Never include the original URL.
  }

  return {
    method: request.method().toUpperCase(),
    pathname,
    origin,
  };
}

export async function installReadOnlyMutationGuard(
  page: Page,
  options: GuardOptions = {},
) {
  const blocked: string[] = [];

  await page.route("**/*", async (route) => {
    const safe = sanitizedRequest(route.request());
    if (!UNSAFE_METHODS.has(safe.method)) {
      await route.continue();
      return;
    }

    const isAllowedLogin =
      options.allowAuthenticationLogin === true &&
      safe.method === "POST" &&
      safe.origin === stagingApiOrigin &&
      AUTHENTICATION_POST_PATHS.has(safe.pathname);

    if (isAllowedLogin) {
      await route.continue();
      return;
    }

    blocked.push(`${safe.method} ${safe.pathname}`);
    await route.abort("blockedbyclient");
  });

  return {
    assertNoBlockedMutations() {
      if (blocked.length) {
        throw new Error(
          `Read-only staging guard blocked unsafe request(s): ${[...new Set(blocked)].join(", ")}`,
        );
      }
    },
  };
}
