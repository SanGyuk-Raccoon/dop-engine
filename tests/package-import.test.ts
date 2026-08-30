import { describe, expect, it } from "vitest";

const expectedRuntimeExports = [
  "DopDataError",
  "EngineExecutionError",
  "EngineInvariantError",
  "EngineUsageError",
  "InitialDataValidationError",
  "createDopEngine",
] as const;

function difference(
  left: readonly PropertyKey[],
  right: readonly PropertyKey[],
) {
  return left.filter((key) => !right.includes(key));
}

describe("built package entry point", () => {
  it("exports only the public runtime API without changing global keys", async () => {
    const globalKeysBeforeImport = Reflect.ownKeys(globalThis);

    const publicModule = await import("../dist/index.js");

    const globalKeysAfterImport = Reflect.ownKeys(globalThis);

    expect(Object.keys(publicModule).sort()).toEqual(
      [...expectedRuntimeExports].sort(),
    );
    expect(difference(globalKeysAfterImport, globalKeysBeforeImport)).toEqual(
      [],
    );
    expect(difference(globalKeysBeforeImport, globalKeysAfterImport)).toEqual(
      [],
    );
  });
});
