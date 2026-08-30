import { once } from "node:events";
import { readFile, realpath, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const repositoryRoot = await realpath(
  fileURLToPath(new URL("../", import.meta.url)),
);
const fixturePath = await realpath(
  join(repositoryRoot, "consumer-tests", "browser", "index.html"),
);
const distRoot = await realpath(join(repositoryRoot, "dist"));
const loopbackHost = "127.0.0.1";
const fixtureTimeout = 15_000;

await runBrowserCheck();

async function runBrowserCheck() {
  const serverErrors = [];
  const server = createServer((request, response) => {
    void handleRequest(request, response).catch((error) => {
      serverErrors.push(error);

      if (!response.headersSent) {
        send(response, 500, "text/plain; charset=utf-8", "Internal error");
      } else {
        response.destroy();
      }
    });
  });
  let browser;
  let context;
  let page;
  let browserVersion;
  let failure;

  server.on("clientError", (error, socket) => {
    serverErrors.push(error);
    socket.destroy();
  });

  try {
    server.listen(0, loopbackHost);
    await once(server, "listening");

    const address = server.address();

    if (address === null || typeof address === "string") {
      throw new Error("Browser smoke server did not receive a TCP address.");
    }

    const origin = `http://${loopbackHost}:${address.port}`;
    const diagnostics = [];
    await verifyRejectedRoutes(origin);
    browser = await chromium.launch({ headless: true });
    browserVersion = browser.version();
    context = await browser.newContext({ serviceWorkers: "block" });
    page = await context.newPage();

    page.on("console", (message) => {
      if (message.type() === "error") {
        diagnostics.push(`console: ${message.text()}`);
      }
    });
    page.on("pageerror", (error) => {
      diagnostics.push(`pageerror: ${error.message}`);
    });
    page.on("requestfailed", (request) => {
      diagnostics.push(
        `requestfailed: ${request.url()} (${request.failure()?.errorText ?? "unknown"})`,
      );
    });
    page.on("response", (response) => {
      if (response.status() < 200 || response.status() >= 300) {
        diagnostics.push(`response: ${response.status()} ${response.url()}`);
      }
    });
    page.on("request", (request) => {
      const requestUrl = new URL(request.url());

      if (requestUrl.protocol !== "data:" && requestUrl.origin !== origin) {
        diagnostics.push(`external request: ${request.url()}`);
      }
    });

    await page.goto(`${origin}/`, {
      waitUntil: "load",
      timeout: fixtureTimeout,
    });
    await page.waitForFunction(
      () => Object.hasOwn(globalThis, "__DOP_BROWSER_CHECK__"),
      undefined,
      { timeout: fixtureTimeout },
    );

    const result = await page.evaluate(() => globalThis.__DOP_BROWSER_CHECK__);

    if (
      typeof result !== "object" ||
      result === null ||
      result.status !== "passed"
    ) {
      const message =
        typeof result === "object" &&
        result !== null &&
        typeof result.message === "string"
          ? result.message
          : "Browser fixture returned an invalid result.";
      throw new Error(message);
    }

    if (serverErrors.length > 0 || diagnostics.length > 0) {
      throw new AggregateError(
        [...serverErrors, ...diagnostics.map((value) => new Error(value))],
        "Browser smoke recorded unexpected diagnostics.",
      );
    }
  } catch (error) {
    failure = error;
  }

  const cleanupErrors = [];

  for (const close of [
    () => {
      page?.removeAllListeners();
      return page?.close();
    },
    () => context?.close(),
    () => browser?.close(),
    () => closeServer(server),
    () => server.removeAllListeners(),
  ]) {
    try {
      await close();
    } catch (error) {
      cleanupErrors.push(error);
    }
  }

  if (failure !== undefined || cleanupErrors.length > 0) {
    throw new AggregateError(
      [failure, ...cleanupErrors].filter((error) => error !== undefined),
      "Chromium browser verification failed.",
    );
  }

  process.stdout.write(
    `Browser consumer verification passed (Chromium ${browserVersion}).\n`,
  );
}

async function verifyRejectedRoutes(origin) {
  const [traversal, declaration, method] = await Promise.all([
    fetch(`${origin}/package/%2e%2e%2fpackage.json`, {
      signal: AbortSignal.timeout(fixtureTimeout),
    }),
    fetch(`${origin}/package/index.d.ts`, {
      signal: AbortSignal.timeout(fixtureTimeout),
    }),
    fetch(`${origin}/`, {
      method: "POST",
      signal: AbortSignal.timeout(fixtureTimeout),
    }),
  ]);

  if (
    traversal.status !== 404 ||
    declaration.status !== 404 ||
    method.status !== 405
  ) {
    throw new Error("Browser smoke server accepted a rejected route.");
  }
}

async function handleRequest(request, response) {
  if (request.method !== "GET") {
    send(response, 405, "text/plain; charset=utf-8", "Method not allowed");
    return;
  }

  if (typeof request.url !== "string" || !request.url.startsWith("/")) {
    send(response, 400, "text/plain; charset=utf-8", "Bad request");
    return;
  }

  let url;

  try {
    url = new URL(request.url, "http://browser-check.invalid");
  } catch {
    send(response, 400, "text/plain; charset=utf-8", "Bad request");
    return;
  }

  let pathname;

  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    send(response, 400, "text/plain; charset=utf-8", "Bad request");
    return;
  }

  if (pathname === "/") {
    await sendFile(response, fixturePath, "text/html; charset=utf-8");
    return;
  }

  const packagePrefix = "/package/";

  if (!pathname.startsWith(packagePrefix)) {
    send(response, 404, "text/plain; charset=utf-8", "Not found");
    return;
  }

  const relativePath = pathname.slice(packagePrefix.length);
  const segments = relativePath.split("/");

  if (
    relativePath.length === 0 ||
    relativePath.includes("\\") ||
    segments.some(
      (segment) => segment.length === 0 || segment === "." || segment === "..",
    )
  ) {
    send(response, 404, "text/plain; charset=utf-8", "Not found");
    return;
  }

  const candidate = resolve(distRoot, ...segments);

  if (
    !candidate.startsWith(`${distRoot}${sep}`) ||
    extname(candidate) !== ".js"
  ) {
    send(response, 404, "text/plain; charset=utf-8", "Not found");
    return;
  }

  let actualPath;

  try {
    actualPath = await realpath(candidate);
  } catch {
    send(response, 404, "text/plain; charset=utf-8", "Not found");
    return;
  }

  if (!actualPath.startsWith(`${distRoot}${sep}`)) {
    send(response, 404, "text/plain; charset=utf-8", "Not found");
    return;
  }

  const file = await stat(actualPath);

  if (!file.isFile()) {
    send(response, 404, "text/plain; charset=utf-8", "Not found");
    return;
  }

  await sendFile(response, actualPath, "text/javascript; charset=utf-8");
}

async function sendFile(response, path, contentType) {
  const body = await readFile(path);
  send(response, 200, contentType, body);
}

function send(response, status, contentType, body) {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
    "Content-Type": contentType,
    "X-Content-Type-Options": "nosniff",
  });
  response.end(body);
}

function closeServer(server) {
  if (!server.listening) {
    return undefined;
  }

  return new Promise((resolveClose, rejectClose) => {
    server.close((error) => {
      if (error === undefined) {
        resolveClose();
      } else {
        rejectClose(error);
      }
    });
  });
}
