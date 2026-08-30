import { InitialDataValidationError } from "../api/errors.js";
import type { Validator } from "../api/types.js";
import { runValidator } from "./run-validator.js";

export function validateInitialData<T>(
  candidate: T,
  validator?: Validator<T>,
): void {
  const issues = runValidator(candidate, { phase: "initial" }, validator);

  if (issues !== undefined) {
    throw new InitialDataValidationError(
      issues,
      "Initial DOP data validation failed.",
    );
  }
}
