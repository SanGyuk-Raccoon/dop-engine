import { describe, expect, it, vi } from "vitest";

import {
  EngineExecutionError,
  InitialDataValidationError,
} from "../../src/api/errors.js";
import type { Validator } from "../../src/api/types.js";
import { assertDopData } from "../../src/data/assert-dop-data.js";
import { createDeepFreezer } from "../../src/data/create-deep-freezer.js";
import { validateInitialData } from "../../src/validation/validate-initial-data.js";

interface TestData {
  readonly nested: readonly { readonly value: string }[];
}

describe("validateInitialData", () => {
  it("succeeds without a validator", () => {
    expect(() => validateInitialData({ nested: [] })).not.toThrow();
  });

  it("uses the initial context and the original candidate once", () => {
    const candidate: TestData = { nested: [{ value: "valid" }] };
    const validator = vi.fn((received: TestData) => {
      expect(received).toBe(candidate);
      return { ok: true } as const;
    });

    validateInitialData(candidate, validator);

    expect(validator).toHaveBeenCalledTimes(1);
    expect(validator).toHaveBeenCalledWith(candidate, { phase: "initial" });
  });

  it("throws InitialDataValidationError with the original issues", () => {
    const issues = [
      {
        code: "invalid-initial-data",
        message: "Initial data is invalid.",
        path: ["nested", 0],
      },
    ] as const;
    const validator: Validator<TestData> = () => ({ ok: false, issues });

    const error = captureError(() =>
      validateInitialData({ nested: [] }, validator),
    );

    expect(error).toBeInstanceOf(InitialDataValidationError);
    if (!(error instanceof InitialDataValidationError)) {
      throw new Error("Expected InitialDataValidationError.");
    }
    expect(error.issues).toBe(issues);
  });

  it("propagates validator contract failures as EngineExecutionError", () => {
    const validator = (() =>
      Promise.resolve({ ok: true })) as unknown as Validator<TestData>;

    expect(() => validateInitialData({ nested: [] }, validator)).toThrow(
      EngineExecutionError,
    );
  });

  it("validates a guard-checked and deeply frozen candidate", () => {
    const candidate: TestData = { nested: [{ value: "stable" }] };
    const validator: Validator<TestData> = (received, context) => {
      expect(received).toBe(candidate);
      expect(context).toEqual({ phase: "initial" });
      expect(Object.isFrozen(received)).toBe(true);
      expect(Object.isFrozen(received.nested)).toBe(true);
      expect(Object.isFrozen(received.nested[0])).toBe(true);
      return { ok: true };
    };

    assertDopData(candidate);
    createDeepFreezer()(candidate);
    validateInitialData(candidate, validator);
  });
});

function captureError(action: () => void): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }

  throw new Error("Expected action to throw.");
}
