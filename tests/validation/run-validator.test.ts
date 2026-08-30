import { describe, expect, it, vi } from "vitest";

import { EngineExecutionError } from "../../src/api/errors.js";
import type { ValidationContext, Validator } from "../../src/api/types.js";
import { runValidator } from "../../src/validation/run-validator.js";

interface TestData {
  readonly marker: string;
}

const candidate: TestData = { marker: "candidate-secret-marker" };

describe("runValidator", () => {
  it("succeeds without a validator", () => {
    expect(runValidator(candidate, { phase: "initial" })).toBeUndefined();
  });

  it("passes the candidate and context references to the validator once", () => {
    const previous: TestData = { marker: "previous" };
    const current: TestData = { marker: "current" };
    const context: ValidationContext<TestData> = {
      phase: "commit",
      previous,
      current,
      merged: true,
    };
    const validator = vi.fn(
      (
        receivedCandidate: TestData,
        receivedContext: ValidationContext<TestData>,
      ) => {
        expect(receivedCandidate).toBe(candidate);
        expect(receivedContext).toBe(context);
        return { ok: true } as const;
      },
    );

    expect(runValidator(candidate, context, validator)).toBeUndefined();
    expect(validator).toHaveBeenCalledTimes(1);
  });

  it("returns the original non-empty issues reference", () => {
    const issues = [
      { code: "required", message: "A value is required." },
      {
        code: "invalid-name",
        message: "The name is invalid.",
        path: ["users", 0, "name"],
      },
      { code: "root", message: "The root is invalid.", path: [] },
    ] as const;
    const validator: Validator<TestData> = () => ({ ok: false, issues });

    expect(runValidator(candidate, { phase: "initial" }, validator)).toBe(
      issues,
    );
  });

  it("wraps a validator exception and preserves its cause", () => {
    const cause = new Error("application validator failed");
    const validator: Validator<TestData> = () => {
      throw cause;
    };

    const error = captureError(() =>
      runValidator(candidate, { phase: "initial" }, validator),
    );

    expect(error).toBeInstanceOf(EngineExecutionError);
    if (!(error instanceof EngineExecutionError)) {
      throw new Error("Expected EngineExecutionError.");
    }
    expect(error.cause).toBe(cause);
    expect(error.message).not.toContain(candidate.marker);
  });

  it("wraps validator result property access failures with their cause", () => {
    const cause = new Error("result access failed");
    const result = new Proxy(
      {},
      {
        get() {
          throw cause;
        },
      },
    );
    const validator = (() => result) as unknown as Validator<TestData>;

    const error = captureError(() =>
      runValidator(candidate, { phase: "initial" }, validator),
    );

    expect(error).toBeInstanceOf(EngineExecutionError);
    if (!(error instanceof EngineExecutionError)) {
      throw new Error("Expected EngineExecutionError.");
    }
    expect(error.cause).toBe(cause);
    expect(error.message).not.toContain(candidate.marker);
  });

  it.each([
    ["a native Promise", Promise.resolve({ ok: true })],
    ["a custom thenable", createThenableResult()],
    ["null", null],
    ["a primitive", true],
    ["an array", []],
    ["a function", () => ({ ok: true })],
    ["a missing discriminator", {}],
    ["an invalid discriminator", { ok: "true" }],
    ["missing issues", { ok: false }],
    ["non-array issues", { ok: false, issues: {} }],
    ["empty issues", { ok: false, issues: [] }],
    ["sparse issues", { ok: false, issues: createSparseArray() }],
    ["a non-object issue", { ok: false, issues: [null] }],
    ["a missing issue code", { ok: false, issues: [{ message: "Invalid." }] }],
    [
      "an empty issue code",
      { ok: false, issues: [{ code: "", message: "Invalid." }] },
    ],
    [
      "a non-string issue code",
      { ok: false, issues: [{ code: 1, message: "Invalid." }] },
    ],
    [
      "an empty issue message",
      { ok: false, issues: [{ code: "invalid", message: "" }] },
    ],
    [
      "a non-string issue message",
      { ok: false, issues: [{ code: "invalid", message: false }] },
    ],
    [
      "an undefined present path",
      {
        ok: false,
        issues: [{ code: "invalid", message: "Invalid.", path: undefined }],
      },
    ],
    [
      "a non-array path",
      {
        ok: false,
        issues: [{ code: "invalid", message: "Invalid.", path: "field" }],
      },
    ],
    [
      "a sparse path",
      {
        ok: false,
        issues: [
          { code: "invalid", message: "Invalid.", path: createSparseArray() },
        ],
      },
    ],
    [
      "a negative path index",
      {
        ok: false,
        issues: [{ code: "invalid", message: "Invalid.", path: [-1] }],
      },
    ],
    [
      "a fractional path index",
      {
        ok: false,
        issues: [{ code: "invalid", message: "Invalid.", path: [1.5] }],
      },
    ],
    [
      "a non-finite path index",
      {
        ok: false,
        issues: [{ code: "invalid", message: "Invalid.", path: [Number.NaN] }],
      },
    ],
    [
      "an unsupported path segment",
      {
        ok: false,
        issues: [{ code: "invalid", message: "Invalid.", path: [false] }],
      },
    ],
  ] as const)(
    "rejects %s as a validator contract violation",
    (_name, result) => {
      const validator = (() => result) as unknown as Validator<TestData>;

      const error = captureError(() =>
        runValidator(candidate, { phase: "initial" }, validator),
      );

      expect(error).toBeInstanceOf(EngineExecutionError);
      if (!(error instanceof EngineExecutionError)) {
        throw new Error("Expected EngineExecutionError.");
      }
      expect(error.message).toContain("Validator contract violation");
      expect(error.message).not.toContain(candidate.marker);
    },
  );
});

function captureError(action: () => void): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }

  throw new Error("Expected action to throw.");
}

function createSparseArray(): unknown[] {
  const values: unknown[] = [];
  values.length = 1;
  return values;
}

function createThenableResult(): object {
  return new Proxy(
    { ok: true },
    {
      get(target, property, receiver) {
        if (property === "then") {
          return () => undefined;
        }

        return Reflect.get(target, property, receiver);
      },
    },
  );
}
