export {
  DopDataError,
  EngineExecutionError,
  EngineInvariantError,
  EngineUsageError,
  InitialDataValidationError,
} from "./api/errors.js";
export { createDopEngine } from "./engine/create-engine.js";

export type {
  CommitEvent,
  CommitResult,
  CommittedResult,
  Conflict,
  ConflictResult,
  DopData,
  DopEngine,
  DopEngineOptions,
  DopPrimitive,
  FreezePolicy,
  InvalidResult,
  ValidationContext,
  ValidationIssue,
  ValidationResult,
  Validator,
} from "./api/types.js";
