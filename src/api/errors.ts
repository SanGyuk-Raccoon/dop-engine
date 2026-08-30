import type { ValidationIssue } from "./types.js";

type ValidationIssues = readonly [ValidationIssue, ...ValidationIssue[]];

export class DopDataError extends TypeError {
  constructor(message?: string) {
    super(message);
    this.name = "DopDataError";
  }
}

export class InitialDataValidationError extends Error {
  readonly issues: ValidationIssues;

  constructor(issues: ValidationIssues, message?: string) {
    super(message);
    this.name = "InitialDataValidationError";
    this.issues = issues;
  }
}

export class EngineUsageError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "EngineUsageError";
  }
}

export class EngineExecutionError extends Error {
  declare readonly cause?: unknown;

  constructor(message?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "EngineExecutionError";
  }
}

export class EngineInvariantError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "EngineInvariantError";
  }
}
