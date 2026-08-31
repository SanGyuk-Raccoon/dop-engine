import { spawn } from "node:child_process";
import { cp, mkdtemp, readFile, readdir, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const fixtureRoot = join(repositoryRoot, "consumer-tests", "pack");
const temporaryBase = await realpath(tmpdir());
const pnpmCli = process.env.npm_execpath;
const maximumOutputLength = 1_000_000;
const packageManifestPath = join(repositoryRoot, "package.json");
const expectedPackageName = "@sangyuk-raccoon/dop-engine";
const expectedRepository = {
  type: "git",
  url: "git+https://github.com/SanGyuk-Raccoon/dop-engine.git",
};
const expectedPublishConfig = {
  access: "public",
  registry: "https://registry.npmjs.org/",
};
const releaseVersionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

if (typeof pnpmCli !== "string" || !isAbsolute(pnpmCli)) {
  throw new Error("pack:check must run through the pinned pnpm executable.");
}

function assertSafeTemporaryDirectory(directory) {
  const expectedPrefix = `${temporaryBase}${sep}`;

  if (
    !directory.startsWith(expectedPrefix) ||
    !basename(directory).startsWith("dop-engine-pack-")
  ) {
    throw new Error(`Refusing to use unsafe temporary directory: ${directory}`);
  }
}

function appendOutput(current, chunk, child, label) {
  const next = current + chunk.toString();

  if (next.length > maximumOutputLength) {
    child.kill("SIGTERM");
    throw new Error(`${label} produced too much output.`);
  }

  return next;
}

function run(command, args, { cwd, label }) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 120_000,
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      try {
        stdout = appendOutput(stdout, chunk, child, label);
      } catch (error) {
        rejectRun(error);
      }
    });
    child.stderr.on("data", (chunk) => {
      try {
        stderr = appendOutput(stderr, chunk, child, label);
      } catch (error) {
        rejectRun(error);
      }
    });
    child.once("error", rejectRun);
    child.once("close", (code, signal) => {
      if (code !== 0) {
        const detail = stderr.trim() || stdout.trim() || `signal ${signal}`;
        rejectRun(new Error(`${label} failed: ${detail}`));
        return;
      }

      resolveRun({ stdout, stderr });
    });
  });
}

function runPnpm(args, cwd, label) {
  return run(process.execPath, [pnpmCli, ...args], { cwd, label });
}

function parsePackResult(stdout) {
  const parsed = JSON.parse(stdout.trim());
  const results = Array.isArray(parsed) ? parsed : [parsed];

  if (results.length !== 1 || !Array.isArray(results[0]?.files)) {
    throw new Error("pnpm pack returned an unexpected JSON result.");
  }

  return results[0];
}

function verifyPublishManifest(manifest, label) {
  if (manifest?.name !== expectedPackageName) {
    throw new Error(`${label} has an unexpected package name.`);
  }

  if (
    typeof manifest.version !== "string" ||
    !releaseVersionPattern.test(manifest.version) ||
    manifest.version === "0.0.0"
  ) {
    throw new Error(`${label} must have a non-zero release version.`);
  }

  if (Object.hasOwn(manifest, "private")) {
    throw new Error(`${label} must not contain the private publish guard.`);
  }

  if (manifest.license !== "MIT") {
    throw new Error(`${label} must use the MIT license.`);
  }

  if (
    JSON.stringify(manifest.repository) !== JSON.stringify(expectedRepository)
  ) {
    throw new Error(`${label} has an unexpected repository.`);
  }

  if (
    JSON.stringify(manifest.publishConfig) !==
    JSON.stringify(expectedPublishConfig)
  ) {
    throw new Error(`${label} has an unexpected publishConfig.`);
  }

  if (manifest.dependencies !== undefined) {
    throw new Error(`${label} must not contain runtime dependencies.`);
  }

  if (
    manifest.type !== "module" ||
    manifest.sideEffects !== false ||
    JSON.stringify(manifest.files) !== JSON.stringify(["dist"])
  ) {
    throw new Error(`${label} changed the ESM package boundary.`);
  }
}

function toArchivePath(path) {
  const normalized = path.replaceAll("\\", "/").replace(/^\.\//, "");
  return normalized.startsWith("package/")
    ? normalized
    : `package/${normalized}`;
}

function verifyPackedFiles(files) {
  const archivePaths = files.map(({ path }) => toArchivePath(path));
  const uniquePaths = new Set(archivePaths);
  const requiredPaths = [
    "package/package.json",
    "package/README.md",
    "package/LICENSE",
    "package/dist/index.js",
    "package/dist/index.d.ts",
  ];

  if (archivePaths.length !== uniquePaths.size) {
    throw new Error("pnpm pack reported duplicate archive paths.");
  }

  for (const path of archivePaths) {
    const allowedRootFile =
      path === "package/package.json" ||
      path === "package/README.md" ||
      path === "package/LICENSE";

    if (!allowedRootFile && !path.startsWith("package/dist/")) {
      throw new Error(`Unexpected file in package tarball: ${path}`);
    }
  }

  for (const path of requiredPaths) {
    if (!uniquePaths.has(path)) {
      throw new Error(`Required file is missing from package tarball: ${path}`);
    }
  }
}

let temporaryRoot;

try {
  const sourceManifest = JSON.parse(
    await readFile(packageManifestPath, "utf8"),
  );
  verifyPublishManifest(sourceManifest, "source package.json");

  temporaryRoot = await mkdtemp(join(temporaryBase, "dop-engine-pack-"));
  temporaryRoot = await realpath(temporaryRoot);
  assertSafeTemporaryDirectory(temporaryRoot);

  const { stdout } = await runPnpm(
    ["pack", "--json", "--pack-destination", temporaryRoot],
    repositoryRoot,
    "pnpm pack",
  );
  const packResult = parsePackResult(stdout);
  if (
    packResult.name !== sourceManifest.name ||
    packResult.version !== sourceManifest.version
  ) {
    throw new Error("pnpm pack name/version does not match package.json.");
  }
  verifyPackedFiles(packResult.files);

  const tarballNames = (await readdir(temporaryRoot, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".tgz"))
    .map((entry) => entry.name);

  if (tarballNames.length !== 1) {
    throw new Error("pnpm pack must create exactly one tarball.");
  }

  const tarballPath = resolve(temporaryRoot, tarballNames[0]);
  const consumerRoot = join(temporaryRoot, "consumer");

  await cp(fixtureRoot, consumerRoot, { recursive: true });
  await runPnpm(
    ["add", "--offline", "--ignore-scripts", "--save-exact", tarballPath],
    consumerRoot,
    "tarball installation",
  );
  const installedManifest = JSON.parse(
    await readFile(
      join(
        consumerRoot,
        "node_modules",
        "@sangyuk-raccoon",
        "dop-engine",
        "package.json",
      ),
      "utf8",
    ),
  );
  verifyPublishManifest(installedManifest, "packed package.json");
  if (installedManifest.version !== sourceManifest.version) {
    throw new Error(
      "Packed package version does not match source package.json.",
    );
  }

  await run(
    process.execPath,
    [
      join(repositoryRoot, "node_modules", "typescript", "bin", "tsc"),
      "--project",
      join(consumerRoot, "tsconfig.json"),
    ],
    { cwd: consumerRoot, label: "tarball declaration consumer" },
  );
  await run(process.execPath, [join(consumerRoot, "runtime-consumer.mjs")], {
    cwd: consumerRoot,
    label: "tarball runtime consumer",
  });

  process.stdout.write("Pack consumer verification passed.\n");
} finally {
  if (temporaryRoot !== undefined) {
    assertSafeTemporaryDirectory(temporaryRoot);
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}
