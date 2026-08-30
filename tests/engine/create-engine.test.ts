import { describe, expect, it, vi } from "vitest";

import {
  DopDataError,
  EngineExecutionError,
  EngineUsageError,
  InitialDataValidationError,
} from "../../src/api/errors.js";
import type { CommitEvent, DopEngine, Validator } from "../../src/api/types.js";
import { createDopEngine } from "../../src/engine/create-engine.js";

interface TestData {
  readonly value: string;
  readonly count?: number;
  readonly left?: string;
  readonly right?: string;
  readonly nested?: { readonly label: string };
}

type EngineMethod = "get" | "commit" | "update" | "subscribe";

describe("createDopEngine", () => {
  it("guards, freezes, validates, and retains the exact initial reference at revision zero", () => {
    const initial: TestData = {
      value: "initial",
      nested: { label: "nested" },
    };
    const validator = vi.fn<Validator<TestData>>((candidate, context) => {
      expect(candidate).toBe(initial);
      expect(Object.isFrozen(candidate)).toBe(true);
      expect(Object.isFrozen(candidate.nested)).toBe(true);
      void context;
      return { ok: true };
    });

    const engine = createDopEngine({
      initialData: initial,
      validate: validator,
    });

    expect(engine.get()).toBe(initial);
    expect(validator).toHaveBeenCalledTimes(1);
    expect(validator).toHaveBeenNthCalledWith(1, initial, {
      phase: "initial",
    });

    const result = engine.commit(initial, initial);

    expect(result).toEqual({
      status: "committed",
      data: initial,
      revision: 0,
      changed: false,
      merged: false,
    });
    expect(engine.get()).toBe(initial);
  });

  it("supports the explicit never freeze policy", () => {
    const initial: TestData = {
      value: "initial",
      nested: { label: "mutable-at-runtime" },
    };
    const next: TestData = { value: "next" };
    const engine = createDopEngine({ initialData: initial, freeze: "never" });

    const result = engine.commit(initial, next);

    expect(result.status).toBe("committed");
    expect(engine.get()).toBe(next);
    expect(Object.isFrozen(initial)).toBe(false);
    expect(Object.isFrozen(initial.nested)).toBe(false);
    expect(Object.isFrozen(next)).toBe(false);
  });

  it("rejects unsupported initial data before invoking the validator", () => {
    const validator = vi.fn<Validator<TestData>>(() => ({ ok: true }));
    const initial = { value: undefined } as unknown as TestData;

    const error = captureError(() =>
      createDopEngine({ initialData: initial, validate: validator }),
    );

    expect(error).toBeInstanceOf(DopDataError);
    expect(validator).not.toHaveBeenCalled();
  });

  it("throws initial validation issues without creating an engine", () => {
    const initial: TestData = { value: "invalid" };
    const issues = [
      { code: "invalid-initial", message: "Initial data is invalid." },
    ] as const;

    const error = captureError(() =>
      createDopEngine({
        initialData: initial,
        validate: () => ({ ok: false, issues }),
      }),
    );

    expect(error).toBeInstanceOf(InitialDataValidationError);
    if (!(error instanceof InitialDataValidationError)) {
      throw new Error("Expected InitialDataValidationError.");
    }
    expect(error.issues).toBe(issues);
  });

  it("emits exact state-changing commit events, including stale merges", () => {
    const initial: TestData = {
      value: "shared",
      left: "base-left",
      right: "base-right",
    };
    const first: TestData = {
      value: "shared",
      left: "current-left",
      right: "base-right",
    };
    const staleNext: TestData = {
      value: "shared",
      left: "base-left",
      right: "next-right",
    };
    const engine = createDopEngine({ initialData: initial });
    const events: CommitEvent<TestData>[] = [];
    engine.subscribe((event) => events.push(event));

    const firstResult = engine.commit(initial, first);
    const mergedResult = engine.commit(initial, staleNext);

    expect(firstResult).toEqual({
      status: "committed",
      data: first,
      revision: 1,
      changed: true,
      merged: false,
    });
    expect(mergedResult).toEqual({
      status: "committed",
      data: {
        value: "shared",
        left: "current-left",
        right: "next-right",
      },
      revision: 2,
      changed: true,
      merged: true,
    });
    if (mergedResult.status !== "committed") {
      throw new Error("Expected a committed merge.");
    }
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({
      previous: initial,
      current: first,
      revision: 1,
      merged: false,
    });
    expect(events[0]?.previous).toBe(initial);
    expect(events[0]?.current).toBe(first);
    expect(events[1]).toEqual({
      previous: first,
      current: mergedResult.data,
      revision: 2,
      merged: true,
    });
    expect(events[1]?.previous).toBe(first);
    expect(events[1]?.current).toBe(mergedResult.data);
    expect(engine.get()).toBe(mergedResult.data);
  });

  it("does not emit for no-op, invalid, unsupported, or conflicting commits", () => {
    const initial: TestData = {
      value: "initial",
      left: "base-left",
      right: "base-right",
    };
    const issues = [
      { code: "invalid", message: "The candidate is invalid." },
    ] as const;
    const validator: Validator<TestData> = (candidate) =>
      candidate.value === "invalid" ? { ok: false, issues } : { ok: true };
    const engine = createDopEngine({
      initialData: initial,
      validate: validator,
    });
    const listener = vi.fn();
    engine.subscribe(listener);

    const noOp = engine.commit(initial, initial);
    const invalid = engine.commit(initial, { ...initial, value: "invalid" });
    const unsupported = captureError(() =>
      engine.commit(initial, {
        ...initial,
        count: Number.NaN,
      }),
    );

    expect(noOp.status).toBe("committed");
    expect(invalid.status).toBe("invalid");
    expect(unsupported).toBeInstanceOf(DopDataError);
    expect(listener).not.toHaveBeenCalled();
    expect(engine.get()).toBe(initial);

    const current: TestData = { ...initial, left: "current-left" };
    engine.commit(initial, current);
    listener.mockClear();

    const conflict = engine.commit(initial, {
      ...initial,
      left: "next-left",
    });

    expect(conflict.status).toBe("conflict");
    expect(listener).not.toHaveBeenCalled();
    expect(engine.get()).toBe(current);
  });

  it("updates from the exact current reference and applies commit no-op rules", () => {
    const initial: TestData = { value: "initial", count: 0 };
    const engine = createDopEngine({ initialData: initial });
    const calculation = vi.fn((current: TestData): TestData => ({
      ...current,
      count: (current.count ?? 0) + 1,
    }));
    const listener = vi.fn();
    engine.subscribe(listener);

    const changed = engine.update(calculation);
    const current = engine.get();
    const noOp = engine.update((received) => received);

    expect(calculation).toHaveBeenCalledTimes(1);
    expect(calculation).toHaveBeenCalledWith(initial);
    expect(changed).toEqual({
      status: "committed",
      data: current,
      revision: 1,
      changed: true,
      merged: false,
    });
    expect(noOp).toEqual({
      status: "committed",
      data: current,
      revision: 1,
      changed: false,
      merged: false,
    });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["a native Promise", () => Promise.resolve({ value: "async" })],
    ["a custom thenable", () => createCalculationThenable()],
  ])(
    "rejects %s calculation result as a usage error",
    (_label, createResult) => {
      const initial: TestData = { value: "initial" };
      const engine = createDopEngine({ initialData: initial });
      const listener = vi.fn();
      engine.subscribe(listener);
      const calculation = (() => createResult()) as unknown as (
        current: TestData,
      ) => TestData;

      const error = captureError(() => engine.update(calculation));

      expect(error).toBeInstanceOf(EngineUsageError);
      expect(engine.get()).toBe(initial);
      expect(listener).not.toHaveBeenCalled();
      expect(engine.commit(initial, initial).revision).toBe(0);
    },
  );

  it("rejects a non-function calculation and recovers the operation guard", () => {
    const initial: TestData = { value: "initial" };
    const next: TestData = { value: "next" };
    const engine = createDopEngine({ initialData: initial });

    const error = captureError(() =>
      engine.update(null as unknown as (current: TestData) => TestData),
    );

    expect(error).toBeInstanceOf(EngineUsageError);
    expect(engine.commit(initial, next).status).toBe("committed");
    expect(engine.get()).toBe(next);
  });

  it("propagates calculation exceptions without changing state and remains usable", () => {
    const initial: TestData = { value: "initial" };
    const next: TestData = { value: "next" };
    const cause = new Error("calculation failed");
    const engine = createDopEngine({ initialData: initial });
    const listener = vi.fn();
    engine.subscribe(listener);

    const error = captureError(() =>
      engine.update(() => {
        throw cause;
      }),
    );

    expect(error).toBe(cause);
    expect(engine.get()).toBe(initial);
    expect(listener).not.toHaveBeenCalled();
    expect(engine.update(() => next).status).toBe("committed");
    expect(engine.get()).toBe(next);
  });

  it.each<EngineMethod>(["get", "commit", "update", "subscribe"])(
    "rejects calculation reentry through %s and restores the engine",
    (method) => {
      const initial: TestData = { value: "initial" };
      const next: TestData = { value: "next" };
      const engine = createDopEngine({ initialData: initial });
      const listener = vi.fn();
      engine.subscribe(listener);

      const error = captureError(() =>
        engine.update((current) => {
          reenter(method, engine, current);
          return next;
        }),
      );

      expect(error).toBeInstanceOf(EngineUsageError);
      expect(error).not.toBeInstanceOf(EngineExecutionError);
      expect(engine.get()).toBe(initial);
      expect(listener).not.toHaveBeenCalled();

      const recovery = engine.update(() => next);
      expect(recovery.status).toBe("committed");
      expect(recovery.revision).toBe(1);
    },
  );

  it.each<EngineMethod>(["get", "commit", "update", "subscribe"])(
    "preserves validator reentry through %s as EngineUsageError",
    (method) => {
      const initial: TestData = { value: "initial" };
      const next: TestData = { value: "next" };
      let engine!: DopEngine<TestData>;
      let shouldReenter = true;
      const validator: Validator<TestData> = (_candidate, context) => {
        if (context.phase === "commit" && shouldReenter) {
          reenter(method, engine, context.current);
        }
        return { ok: true };
      };
      engine = createDopEngine({ initialData: initial, validate: validator });
      const listener = vi.fn();
      engine.subscribe(listener);

      const error = captureError(() => engine.commit(initial, next));

      expect(error).toBeInstanceOf(EngineUsageError);
      expect(error).not.toBeInstanceOf(EngineExecutionError);
      expect(engine.get()).toBe(initial);
      expect(listener).not.toHaveBeenCalled();

      shouldReenter = false;
      const recovery = engine.commit(initial, next);
      expect(recovery.status).toBe("committed");
      expect(recovery.revision).toBe(1);
    },
  );

  it("keeps ordinary validator failures wrapped and restores the engine", () => {
    const initial: TestData = { value: "initial" };
    const next: TestData = { value: "next" };
    const cause = new Error("validator failed");
    let shouldThrow = true;
    const validator: Validator<TestData> = (_candidate, context) => {
      if (context.phase === "commit" && shouldThrow) {
        throw cause;
      }
      return { ok: true };
    };
    const engine = createDopEngine({
      initialData: initial,
      validate: validator,
    });
    const listener = vi.fn();
    engine.subscribe(listener);

    const error = captureError(() => engine.commit(initial, next));

    expect(error).toBeInstanceOf(EngineExecutionError);
    if (!(error instanceof EngineExecutionError)) {
      throw new Error("Expected EngineExecutionError.");
    }
    expect(error.cause).toBe(cause);
    expect(engine.get()).toBe(initial);
    expect(listener).not.toHaveBeenCalled();

    shouldThrow = false;
    expect(engine.commit(initial, next).status).toBe("committed");
  });

  it("allows listener updates and delivers their events in FIFO order", () => {
    const initial: TestData = { value: "counter", count: 0 };
    const engine = createDopEngine({ initialData: initial });
    const calls: string[] = [];
    let depth = 0;
    let maximumDepth = 0;

    engine.subscribe((event) => {
      depth += 1;
      maximumDepth = Math.max(maximumDepth, depth);
      calls.push(`first:${event.revision}`);

      if (event.revision < 3) {
        engine.update((current) => ({
          ...current,
          count: (current.count ?? 0) + 1,
        }));
      }

      depth -= 1;
    });
    engine.subscribe((event) => calls.push(`second:${event.revision}`));

    const result = engine.update((current) => ({
      ...current,
      count: (current.count ?? 0) + 1,
    }));

    expect(result.revision).toBe(1);
    expect(calls).toEqual([
      "first:1",
      "second:1",
      "first:2",
      "second:2",
      "first:3",
      "second:3",
    ]);
    expect(maximumDepth).toBe(1);
    expect(engine.get()).toEqual({ value: "counter", count: 3 });
    expect(engine.commit(engine.get(), engine.get()).revision).toBe(3);
  });

  it("isolates listener and error-hook failures from commits and later events", () => {
    const initial: TestData = { value: "initial" };
    const first: TestData = { value: "first" };
    const second: TestData = { value: "second" };
    const listenerError = new Error("listener failed");
    const hook = vi.fn(() => {
      throw new Error("hook failed");
    });
    const healthy = vi.fn();
    const engine = createDopEngine({
      initialData: initial,
      onListenerError: hook,
    });
    engine.subscribe(() => {
      throw listenerError;
    });
    engine.subscribe(healthy);

    const firstResult = engine.commit(initial, first);
    const secondResult = engine.commit(first, second);

    expect(firstResult.status).toBe("committed");
    expect(secondResult.status).toBe("committed");
    expect(engine.get()).toBe(second);
    expect(hook).toHaveBeenCalledTimes(2);
    expect(hook).toHaveBeenNthCalledWith(1, listenerError);
    expect(hook).toHaveBeenNthCalledWith(2, listenerError);
    expect(healthy).toHaveBeenCalledTimes(2);
  });

  it("keeps duplicate subscriptions independent through detached methods", () => {
    const initial: TestData = { value: "initial", count: 0 };
    const engine = createDopEngine({ initialData: initial });
    const { get, subscribe, update } = engine;
    const listener = vi.fn();
    const unsubscribeFirst = subscribe(listener);
    const unsubscribeSecond = subscribe(listener);

    update((current) => ({ ...current, count: 1 }));
    unsubscribeFirst();
    unsubscribeFirst();
    update((current) => ({ ...current, count: 2 }));
    unsubscribeSecond();
    update((current) => ({ ...current, count: 3 }));

    expect(listener).toHaveBeenCalledTimes(3);
    expect(get()).toEqual({ value: "initial", count: 3 });
  });
});

function reenter(
  method: EngineMethod,
  engine: DopEngine<TestData>,
  current: TestData,
): void {
  switch (method) {
    case "get":
      engine.get();
      return;
    case "commit":
      engine.commit(current, current);
      return;
    case "update":
      engine.update((received) => received);
      return;
    case "subscribe":
      engine.subscribe(() => undefined);
  }
}

function captureError(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }

  throw new Error("Expected action to throw.");
}

function createCalculationThenable(): object {
  return new Proxy(
    { value: "thenable" },
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
