import { EngineExecutionError } from "../api/errors.js";
import type {
  ValidationContext,
  ValidationIssue,
  Validator,
} from "../api/types.js";

export type ValidationIssues = readonly [ValidationIssue, ...ValidationIssue[]];

class ValidatorContractViolation extends Error {}

export function runValidator<T>(
  candidate: T,
  context: ValidationContext<T>,
  validator?: Validator<T>,
): ValidationIssues | undefined {
  if (validator === undefined) {
    return undefined;
  }

  let result: unknown;

  try {
    result = validator(candidate, context);
  } catch (error) {
    throw new EngineExecutionError("Validator execution failed.", {
      cause: error,
    });
  }

  try {
    return inspectValidationResult(result);
  } catch (error) {
    if (error instanceof ValidatorContractViolation) {
      throw new EngineExecutionError(
        `Validator contract violation: ${error.message}.`,
      );
    }

    throw new EngineExecutionError("Validator result inspection failed.", {
      cause: error,
    });
  }
}

function inspectValidationResult(
  result: unknown,
): ValidationIssues | undefined {
  if (typeof result !== "object" || result === null || Array.isArray(result)) {
    contractViolation("result must be an object");
  }

  if (typeof Reflect.get(result, "then") === "function") {
    contractViolation("validation must be synchronous");
  }

  const ok = Reflect.get(result, "ok");

  if (ok === true) {
    return undefined;
  }

  if (ok !== false) {
    contractViolation("result.ok must be true or false");
  }

  const issues = Reflect.get(result, "issues");

  if (!Array.isArray(issues) || issues.length === 0) {
    contractViolation("an invalid result must contain non-empty issues");
  }

  for (let index = 0; index < issues.length; index += 1) {
    if (!Object.hasOwn(issues, index)) {
      contractViolation("issues must not be sparse");
    }

    inspectValidationIssue(Reflect.get(issues, String(index)));
  }

  return issues as unknown as ValidationIssues;
}

function inspectValidationIssue(issue: unknown): void {
  if (typeof issue !== "object" || issue === null || Array.isArray(issue)) {
    contractViolation("each issue must be an object");
  }

  const code = Reflect.get(issue, "code");
  const message = Reflect.get(issue, "message");

  if (typeof code !== "string" || code.length === 0) {
    contractViolation("each issue.code must be a non-empty string");
  }

  if (typeof message !== "string" || message.length === 0) {
    contractViolation("each issue.message must be a non-empty string");
  }

  if (!Reflect.has(issue, "path")) {
    return;
  }

  const path = Reflect.get(issue, "path");

  if (!Array.isArray(path)) {
    contractViolation("issue.path must be an array when present");
  }

  for (let index = 0; index < path.length; index += 1) {
    if (!Object.hasOwn(path, index)) {
      contractViolation("issue.path must not be sparse");
    }

    const segment = Reflect.get(path, String(index));

    if (typeof segment === "string") {
      continue;
    }

    if (
      typeof segment !== "number" ||
      !Number.isFinite(segment) ||
      !Number.isInteger(segment) ||
      segment < 0
    ) {
      contractViolation(
        "issue.path segments must be strings or finite non-negative integers",
      );
    }
  }
}

function contractViolation(reason: string): never {
  throw new ValidatorContractViolation(reason);
}
