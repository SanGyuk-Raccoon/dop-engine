import { EngineExecutionError, EngineUsageError } from "../api/errors.js";
import type {
  CommitEvent,
  CommitResult,
  DopEngine,
  DopEngineOptions,
} from "../api/types.js";
import { assertDopData } from "../data/assert-dop-data.js";
import { createDeepFreezer } from "../data/create-deep-freezer.js";
import { EventQueue } from "../observable/event-queue.js";
import { MemoryStateCell } from "../state/memory-state-cell.js";
import { validateInitialData } from "../validation/validate-initial-data.js";
import { createCommit } from "./commit.js";

interface CommitTransition<T> {
  readonly result: CommitResult<T>;
  readonly event?: CommitEvent<T>;
}

export function createDopEngine<T>(options: DopEngineOptions<T>): DopEngine<T> {
  const freeze = createDeepFreezer(options.freeze);
  const initialData = options.initialData;

  assertDopData(initialData);
  freeze(initialData);
  validateInitialData(initialData, options.validate);

  const stateCell = new MemoryStateCell<T>(initialData);
  const commitCore = createCommit<T>(stateCell, freeze, options.validate);
  const events = new EventQueue<CommitEvent<T>>(options.onListenerError);
  const reentrantErrors = new WeakSet<EngineUsageError>();
  let callbackActive = false;

  const assertAvailable = (): void => {
    if (!callbackActive) {
      return;
    }

    const error = new EngineUsageError(
      "DOP Engine APIs cannot be called from a calculation or validator.",
    );
    reentrantErrors.add(error);
    throw error;
  };

  const runExclusive = <Result>(operation: () => Result): Result => {
    assertAvailable();
    callbackActive = true;

    try {
      return operation();
    } catch (error) {
      if (
        error instanceof EngineExecutionError &&
        error.cause instanceof EngineUsageError &&
        reentrantErrors.has(error.cause)
      ) {
        throw error.cause;
      }

      throw error;
    } finally {
      callbackActive = false;
    }
  };

  const createTransition = (previous: T, next: T): CommitTransition<T> => {
    const actualPrevious = stateCell.get().data;
    const result = commitCore(previous, next);

    if (result.status !== "committed" || !result.changed) {
      return { result };
    }

    return {
      result,
      event: {
        previous: actualPrevious,
        current: result.data,
        revision: result.revision,
        merged: result.merged,
      },
    };
  };

  const finish = (transition: CommitTransition<T>): CommitResult<T> => {
    if (transition.event !== undefined) {
      events.emit(transition.event);
    }

    return transition.result;
  };

  return {
    get: () => {
      assertAvailable();
      return stateCell.get().data;
    },
    commit: (previous, next) =>
      finish(runExclusive(() => createTransition(previous, next))),
    update: (calculation) => {
      const transition = runExclusive(() => {
        if (typeof calculation !== "function") {
          throw new EngineUsageError("Calculation must be a function.");
        }

        const previous = stateCell.get().data;
        const next = calculation(previous);

        assertSynchronousCalculationResult(next);
        return createTransition(previous, next);
      });

      return finish(transition);
    },
    subscribe: (listener) => {
      assertAvailable();
      return events.subscribe(listener);
    },
  };
}

function assertSynchronousCalculationResult(value: unknown): void {
  if (
    (typeof value !== "object" || value === null) &&
    typeof value !== "function"
  ) {
    return;
  }

  let then: unknown;

  try {
    then = Reflect.get(value, "then");
  } catch {
    throw new EngineUsageError(
      "Calculation results must be synchronously inspectable.",
    );
  }

  if (typeof then === "function") {
    throw new EngineUsageError(
      "Calculations must be synchronous and cannot return a Promise or thenable.",
    );
  }
}
