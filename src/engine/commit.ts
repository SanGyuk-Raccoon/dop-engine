import type { CommitResult, DopData, Validator } from "../api/types.js";
import { reconcileDopData } from "../consistency/reconcile.js";
import { assertDopData } from "../data/assert-dop-data.js";
import type { StateCell, VersionedState } from "../state/memory-state-cell.js";
import { runValidator } from "../validation/run-validator.js";

export function createCommit<T>(
  stateCell: StateCell<T>,
  freeze: <Value>(value: Value) => Value,
  validator?: Validator<T>,
): (previous: T, next: T) => CommitResult<T> {
  return (previous, next) => {
    assertDopData(previous);
    freeze(previous);
    assertDopData(next);
    freeze(next);

    let result!: CommitResult<T>;

    stateCell.swap((currentState) => {
      const current = currentState.data;
      const reconciliation = reconcileDopData(
        current as unknown as DopData,
        previous,
        next,
      );

      if (reconciliation.status === "conflict") {
        result = {
          status: "conflict",
          current,
          revision: currentState.revision,
          conflicts: reconciliation.conflicts,
        };
        return currentState;
      }

      const candidate = reconciliation.candidate as T;
      assertDopData(candidate);
      freeze(candidate);

      const issues = runValidator(
        candidate,
        {
          phase: "commit",
          previous,
          current,
          merged: reconciliation.merged,
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

      if (Object.is(candidate, current)) {
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
        data: candidate,
        revision: currentState.revision + 1,
      };

      result = {
        status: "committed",
        data: candidate,
        revision: nextState.revision,
        changed: true,
        merged: reconciliation.merged,
      };
      return nextState;
    });

    return result;
  };
}
