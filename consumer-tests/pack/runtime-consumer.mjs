import { deepStrictEqual, rejects } from "node:assert/strict";

const expectedRuntimeExports = [
  "DopDataError",
  "EngineExecutionError",
  "EngineInvariantError",
  "EngineUsageError",
  "InitialDataValidationError",
  "createDopEngine",
];

const publicModule = await import("@sangyuk-raccoon/dop-engine");

deepStrictEqual(
  Object.keys(publicModule).sort(),
  expectedRuntimeExports.sort(),
);

await rejects(
  () => import("@sangyuk-raccoon/dop-engine/api/types"),
  (error) =>
    error instanceof Error &&
    "code" in error &&
    error.code === "ERR_PACKAGE_PATH_NOT_EXPORTED",
);
