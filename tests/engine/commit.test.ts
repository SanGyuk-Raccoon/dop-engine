import { describe, expect, it, vi } from "vitest";

import { DopDataError, EngineExecutionError } from "../../src/api/errors.js";
import type { ValidationContext, Validator } from "../../src/api/types.js";
import { createDeepFreezer } from "../../src/data/create-deep-freezer.js";
import { createFastForwardCommit } from "../../src/engine/commit.js";
import { MemoryStateCell } from "../../src/state/memory-state-cell.js";

interface TestData {
  readonly marker: string;
  readonly nested?: readonly { readonly value: string }[];
}

describe("createFastForwardCommit", () => {
  it("installs the exact frozen next reference and increments the revision once", () => {
    const previous: TestData = {
      marker: "previous",
      nested: [{ value: "before" }],
    };
    const next: TestData = {
      marker: "next",
      nested: [{ value: "after" }],
    };
    const freezeValue = createDeepFreezer();
    freezeValue(previous);
    const frozenValues: unknown[] = [];
    const freeze = <Value>(value: Value): Value => {
      frozenValues.push(value);
      return freezeValue(value);
    };
    const stateCell = new MemoryStateCell(previous);
    const previousState = stateCell.get();
    const swap = vi.spyOn(stateCell, "swap");
    const validator = vi.fn(
      (candidate: TestData, context: ValidationContext<TestData>) => {
        expect(candidate).toBe(next);
        expect(Object.isFrozen(candidate)).toBe(true);
        expect(Object.isFrozen(candidate.nested)).toBe(true);
        expect(Object.isFrozen(candidate.nested?.[0])).toBe(true);
        expect(context.phase).toBe("commit");
        if (context.phase !== "commit") {
          throw new Error("Expected commit validation context.");
        }
        expect(context.previous).toBe(previous);
        expect(context.current).toBe(previous);
        expect(context.merged).toBe(false);
        return { ok: true } as const;
      },
    );
    const commit = createFastForwardCommit(stateCell, freeze, validator);

    const result = commit(previous, next);

    expect(frozenValues).toEqual([previous, next]);
    expect(swap).toHaveBeenCalledTimes(1);
    expect(validator).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      status: "committed",
      data: next,
      revision: 1,
      changed: true,
      merged: false,
    });
    if (result.status !== "committed") {
      throw new Error("Expected committed result.");
    }
    expect(result.data).toBe(next);
    expect(stateCell.get()).not.toBe(previousState);
    expect(stateCell.get().data).toBe(next);
    expect(stateCell.get().revision).toBe(1);
  });

  it("uses a supplied never freezer without freezing the candidate", () => {
    const previous: TestData = { marker: "previous" };
    const next: TestData = { marker: "next" };
    const stateCell = new MemoryStateCell(previous);
    const validator: Validator<TestData> = (candidate) => {
      expect(candidate).toBe(next);
      expect(Object.isFrozen(candidate)).toBe(false);
      return { ok: true };
    };
    const commit = createFastForwardCommit(
      stateCell,
      createDeepFreezer("never"),
      validator,
    );

    const result = commit(previous, next);

    expect(result.status).toBe("committed");
    expect(Object.isFrozen(previous)).toBe(false);
    expect(Object.isFrozen(next)).toBe(false);
    expect(stateCell.get().data).toBe(next);
  });

  it("returns original validation issues and preserves the exact state", () => {
    const previous: TestData = { marker: "current" };
    const next: TestData = { marker: "invalid" };
    const freeze = createDeepFreezer();
    freeze(previous);
    const stateCell = new MemoryStateCell(previous);
    const currentState = stateCell.get();
    const issues = [
      {
        code: "invalid-next",
        message: "The next value is invalid.",
        path: ["marker"],
      },
    ] as const;
    const validator: Validator<TestData> = () => ({ ok: false, issues });
    const commit = createFastForwardCommit(stateCell, freeze, validator);

    const result = commit(previous, next);

    expect(result.status).toBe("invalid");
    if (result.status !== "invalid") {
      throw new Error("Expected invalid result.");
    }
    expect(result.issues).toBe(issues);
    expect(result.current).toBe(previous);
    expect(result.revision).toBe(0);
    expect(stateCell.get()).toBe(currentState);
    expect(stateCell.get().data).toBe(previous);
    expect(stateCell.get().revision).toBe(0);
  });

  it("validates a no-op once and preserves state, data, and revision", () => {
    const current: TestData = { marker: "unchanged" };
    const freeze = createDeepFreezer();
    freeze(current);
    const stateCell = new MemoryStateCell(current);
    const currentState = stateCell.get();
    const validator = vi.fn<Validator<TestData>>(() => ({ ok: true }));
    const commit = createFastForwardCommit(stateCell, freeze, validator);

    const result = commit(current, current);

    expect(validator).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      status: "committed",
      data: current,
      revision: 0,
      changed: false,
      merged: false,
    });
    if (result.status !== "committed") {
      throw new Error("Expected committed result.");
    }
    expect(result.data).toBe(current);
    expect(stateCell.get()).toBe(currentState);
    expect(stateCell.get().data).toBe(current);
    expect(stateCell.get().revision).toBe(0);
  });

  it("returns an internal stale result after guarding and freezing both inputs", () => {
    const current: TestData = { marker: "current" };
    const previous: TestData = {
      marker: "stale",
      nested: [{ value: "old" }],
    };
    const next: TestData = {
      marker: "next",
      nested: [{ value: "new" }],
    };
    const freeze = createDeepFreezer();
    freeze(current);
    const stateCell = new MemoryStateCell(current);
    const currentState = stateCell.get();
    const validator = vi.fn<Validator<TestData>>(() => ({ ok: true }));
    const commit = createFastForwardCommit(stateCell, freeze, validator);

    const result = commit(previous, next);

    expect(result).toEqual({
      status: "stale",
      current,
      revision: 0,
    });
    if (result.status !== "stale") {
      throw new Error("Expected stale result.");
    }
    expect(result.current).toBe(current);
    expect(validator).not.toHaveBeenCalled();
    expect(Object.isFrozen(previous)).toBe(true);
    expect(Object.isFrozen(previous.nested)).toBe(true);
    expect(Object.isFrozen(next)).toBe(true);
    expect(Object.isFrozen(next.nested)).toBe(true);
    expect(stateCell.get()).toBe(currentState);
  });

  it("rejects an unsupported previous value without changing state", () => {
    const current: TestData = { marker: "current" };
    const stateCell = new MemoryStateCell(current);
    const currentState = stateCell.get();
    const previous = { marker: undefined } as unknown as TestData;
    const next: TestData = { marker: "next" };
    const commit = createFastForwardCommit(stateCell, createDeepFreezer());

    const error = captureError(() => commit(previous, next));

    expect(error).toBeInstanceOf(DopDataError);
    expect(stateCell.get()).toBe(currentState);
  });

  it("rejects an unsupported next value before checking a stale base", () => {
    const current: TestData = { marker: "current" };
    const stateCell = new MemoryStateCell(current);
    const currentState = stateCell.get();
    const previous: TestData = { marker: "stale" };
    const next = { marker: Number.NaN } as unknown as TestData;
    const validator = vi.fn<Validator<TestData>>(() => ({ ok: true }));
    const commit = createFastForwardCommit(
      stateCell,
      createDeepFreezer(),
      validator,
    );

    const error = captureError(() => commit(previous, next));

    expect(error).toBeInstanceOf(DopDataError);
    expect(validator).not.toHaveBeenCalled();
    expect(stateCell.get()).toBe(currentState);
  });

  it("preserves state when deep freezing fails and retains the cause", () => {
    const previous: TestData = { marker: "current" };
    const stateCell = new MemoryStateCell(previous);
    const currentState = stateCell.get();
    const cause = new Error("prevent extensions failed");
    const next = new Proxy<TestData>(
      { marker: "next" },
      {
        preventExtensions() {
          throw cause;
        },
      },
    );
    const commit = createFastForwardCommit(stateCell, createDeepFreezer());

    const error = captureError(() => commit(previous, next));

    expect(error).toBeInstanceOf(EngineExecutionError);
    if (!(error instanceof EngineExecutionError)) {
      throw new Error("Expected EngineExecutionError.");
    }
    expect(error.cause).toBe(cause);
    expect(stateCell.get()).toBe(currentState);
    expect(stateCell.get().data).toBe(previous);
    expect(stateCell.get().revision).toBe(0);
  });

  it("preserves state when the validator throws and retains the cause", () => {
    const previous: TestData = { marker: "current" };
    const next: TestData = { marker: "next" };
    const stateCell = new MemoryStateCell(previous);
    const currentState = stateCell.get();
    const cause = new Error("validator failed");
    const validator: Validator<TestData> = () => {
      throw cause;
    };
    const commit = createFastForwardCommit(
      stateCell,
      createDeepFreezer(),
      validator,
    );

    const error = captureError(() => commit(previous, next));

    expect(error).toBeInstanceOf(EngineExecutionError);
    if (!(error instanceof EngineExecutionError)) {
      throw new Error("Expected EngineExecutionError.");
    }
    expect(error.cause).toBe(cause);
    expect(stateCell.get()).toBe(currentState);
    expect(stateCell.get().data).toBe(previous);
    expect(stateCell.get().revision).toBe(0);
  });

  it("preserves state when the validator violates its sync contract", () => {
    const previous: TestData = { marker: "current" };
    const next: TestData = { marker: "next" };
    const stateCell = new MemoryStateCell(previous);
    const currentState = stateCell.get();
    const validator = (() =>
      Promise.resolve({ ok: true })) as unknown as Validator<TestData>;
    const commit = createFastForwardCommit(
      stateCell,
      createDeepFreezer(),
      validator,
    );

    const error = captureError(() => commit(previous, next));

    expect(error).toBeInstanceOf(EngineExecutionError);
    if (!(error instanceof EngineExecutionError)) {
      throw new Error("Expected EngineExecutionError.");
    }
    expect(error.message).toContain("Validator contract violation");
    expect(stateCell.get()).toBe(currentState);
    expect(stateCell.get().data).toBe(previous);
    expect(stateCell.get().revision).toBe(0);
  });

  it("increments once per consecutive change and observes the latest current", () => {
    const initial: TestData = { marker: "initial" };
    const first: TestData = { marker: "first" };
    const second: TestData = { marker: "second" };
    const freeze = createDeepFreezer();
    freeze(initial);
    const stateCell = new MemoryStateCell(initial);
    const validator = vi.fn<Validator<TestData>>(() => ({ ok: true }));
    const commit = createFastForwardCommit(stateCell, freeze, validator);

    const firstResult = commit(initial, first);
    const firstState = stateCell.get();
    const secondResult = commit(first, second);

    expect(firstResult.status).toBe("committed");
    expect(firstResult.revision).toBe(1);
    expect(firstState.data).toBe(first);
    expect(firstState.revision).toBe(1);
    expect(secondResult.status).toBe("committed");
    expect(secondResult.revision).toBe(2);
    expect(stateCell.get().data).toBe(second);
    expect(stateCell.get().revision).toBe(2);
    expect(validator).toHaveBeenCalledTimes(2);

    const secondContext = validator.mock.calls[1]?.[1];
    expect(secondContext?.phase).toBe("commit");
    if (secondContext?.phase !== "commit") {
      throw new Error("Expected commit validation context.");
    }
    expect(secondContext.previous).toBe(first);
    expect(secondContext.current).toBe(first);
    expect(secondContext.merged).toBe(false);
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
