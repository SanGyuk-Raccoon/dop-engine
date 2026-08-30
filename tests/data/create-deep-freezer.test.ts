import { afterEach, describe, expect, it, vi } from "vitest";

import { EngineExecutionError } from "../../src/api/errors.js";
import { createDeepFreezer } from "../../src/data/create-deep-freezer.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createDeepFreezer", () => {
  it.each([null, false, true, "value", 0, 42])(
    "returns the primitive %j unchanged",
    (value) => {
      expect(createDeepFreezer()(value)).toBe(value);
    },
  );

  it("deep freezes records and arrays in place by default", () => {
    const nullPrototypeRecord = Object.assign(Object.create(null), {
      value: "stable",
    }) as Record<string, unknown>;
    const array = [nullPrototypeRecord, { enabled: true }];
    const root = { array };

    const result = createDeepFreezer()(root);

    expect(result).toBe(root);
    expect(Object.isFrozen(root)).toBe(true);
    expect(Object.isFrozen(array)).toBe(true);
    expect(Object.isFrozen(nullPrototypeRecord)).toBe(true);
    expect(Object.isFrozen(array[1])).toBe(true);
    expect(Reflect.set(nullPrototypeRecord, "value", "changed")).toBe(false);
  });

  it("freezes children before their parents", () => {
    const child = { value: "child" };
    const root = { child };
    const freezeSpy = vi.spyOn(Object, "freeze");

    createDeepFreezer()(root);

    const calls = freezeSpy.mock.calls.map(([value]) => value);
    expect(calls.indexOf(child)).toBeLessThan(calls.indexOf(root));
  });

  it("does not traverse or freeze data with the never policy", () => {
    let accessCount = 0;
    const child = { value: "mutable" };
    const root = Object.defineProperty({}, "child", {
      enumerable: true,
      get() {
        accessCount += 1;
        return child;
      },
    });
    const freezeSpy = vi.spyOn(Object, "freeze");

    const result = createDeepFreezer("never")(root);

    expect(result).toBe(root);
    expect(freezeSpy).not.toHaveBeenCalled();
    expect(accessCount).toBe(0);
    expect(Object.isFrozen(root)).toBe(false);
    expect(Object.isFrozen(child)).toBe(false);
  });

  it("freezes a shared subtree once across current and later roots", () => {
    const shared = { value: "shared" };
    const firstRoot = { left: shared, right: shared };
    const secondRoot = { shared };
    const freezeSpy = vi.spyOn(Object, "freeze");
    const freeze = createDeepFreezer();

    freeze(firstRoot);
    freeze(secondRoot);

    const calls = freezeSpy.mock.calls.map(([value]) => value);
    expect(calls.filter((value) => value === shared)).toHaveLength(1);
    expect(calls.filter((value) => value === firstRoot)).toHaveLength(1);
    expect(calls.filter((value) => value === secondRoot)).toHaveLength(1);
  });

  it("keeps subtree caches isolated between freezer instances", () => {
    const value = Object.freeze({ stable: true });
    const freezeSpy = vi.spyOn(Object, "freeze");

    createDeepFreezer()(value);
    createDeepFreezer()(value);

    expect(
      freezeSpy.mock.calls.filter(([input]) => input === value),
    ).toHaveLength(2);
  });

  it("inspects descendants of an externally shallow-frozen root", () => {
    const child = { value: "mutable" };
    const root = Object.freeze({ child });

    createDeepFreezer()(root);

    expect(Object.isFrozen(root)).toBe(true);
    expect(Object.isFrozen(child)).toBe(true);
  });

  it("preserves the cause and does not cache an object after freeze failure", () => {
    const cause = new Error("prevent extensions failed");
    let shouldFail = true;
    const childTarget = { value: "eventually frozen" };
    const child = new Proxy(childTarget, {
      preventExtensions(target) {
        if (shouldFail) {
          shouldFail = false;
          throw cause;
        }

        return Reflect.preventExtensions(target);
      },
    });
    const root = { child };
    const freeze = createDeepFreezer();
    let captured: unknown;

    try {
      freeze(root);
    } catch (error) {
      captured = error;
    }

    expect(captured).toBeInstanceOf(EngineExecutionError);
    if (!(captured instanceof EngineExecutionError)) {
      throw new Error("Expected EngineExecutionError.");
    }
    expect(captured.cause).toBe(cause);
    expect(Object.isFrozen(root)).toBe(false);
    expect(Object.isFrozen(child)).toBe(false);

    expect(freeze(root)).toBe(root);
    expect(Object.isFrozen(root)).toBe(true);
    expect(Object.isFrozen(child)).toBe(true);
  });
});
