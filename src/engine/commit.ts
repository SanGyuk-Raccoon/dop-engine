import type {
  CommittedResult,
  InvalidResult,
  Validator,
} from "../api/types.js";
import { assertDopData } from "../data/assert-dop-data.js";
import type { StateCell, VersionedState } from "../state/memory-state-cell.js";
import { runValidator } from "../validation/run-validator.js";

export interface StaleCommitResult<T> {
  readonly status: "stale";
  readonly current: T;
  readonly revision: number;
}

export type FastForwardCommitResult<T> =
  CommittedResult<T> | InvalidResult<T> | StaleCommitResult<T>;

export function createFastForwardCommit<T>(
  stateCell: StateCell<T>,
  freeze: <Value>(value: Value) => Value,
  validator?: Validator<T>,
): (previous: T, next: T) => FastForwardCommitResult<T> {
  return (previous, next) => {
    assertDopData(previous);
    freeze(previous);
    assertDopData(next);
    freeze(next);

    let result!: FastForwardCommitResult<T>;

    stateCell.swap((currentState) => {
      const current = currentState.data;

      if (!Object.is(current, previous)) {
        result = {
          status: "stale",
          current,
          revision: currentState.revision,
        };
        return currentState;
      }

      const issues = runValidator(
        next,
        {
          phase: "commit",
          previous,
          current,
          merged: false,
        },
        validator,
      );

      if (issues !== undefined) {
        result = {
          status: "invalid",
          current,
          revision: currentState.revision,
          issues,
        };
        return currentState;
      }

      if (Object.is(next, current)) {
        result = {
          status: "committed",
          data: current,
          revision: currentState.revision,
          changed: false,
          merged: false,
        };
        return currentState;
      }

      const nextState: VersionedState<T> = {
        data: next,
        revision: currentState.revision + 1,
      };

      result = {
        status: "committed",
        data: next,
        revision: nextState.revision,
        changed: true,
        merged: false,
      };
      return nextState;
    });

    return result;
  };
}
