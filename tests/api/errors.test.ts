import { describe, expect, it } from "vitest";

import {
  DopDataError,
  EngineExecutionError,
  EngineInvariantError,
  EngineUsageError,
  InitialDataValidationError,
} from "../../src/api/errors.js";

describe("public error classes", () => {
  it("preserves the documented names and inheritance hierarchy", () => {
    const issues = [
      { code: "initial.invalid", message: "Initial data is invalid." },
    ] as const;
    const errors = [
      new DopDataError(),
      new InitialDataValidationError(issues),
      new EngineUsageError(),
      new EngineExecutionError(),
      new EngineInvariantError(),
    ];

    expect(errors.map((error) => error.name)).toEqual([
      "DopDataError",
      "InitialDataValidationError",
      "EngineUsageError",
      "EngineExecutionError",
      "EngineInvariantError",
    ]);
    expect(errors.every((error) => error instanceof Error)).toBe(true);
    expect(errors[0]).toBeInstanceOf(TypeError);
  });

  it("retains structured issues and execution causes by reference", () => {
    const issues = [
      {
        code: "initial.invalid",
        message: "Initial data is invalid.",
        path: ["value"],
      },
    ] as const;
    const cause = { source: "validator" };

    const validationError = new InitialDataValidationError(issues);
    const executionError = new EngineExecutionError(undefined, { cause });

    expect(validationError.issues).toBe(issues);
    expect(executionError.cause).toBe(cause);
  });
});
