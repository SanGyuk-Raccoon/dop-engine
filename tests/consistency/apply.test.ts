import { describe, expect, it } from "vitest";

import { EngineInvariantError } from "../../src/api/errors.js";
import type { DopData } from "../../src/api/types.js";
import { applyChanges } from "../../src/consistency/apply.js";
import type { Change } from "../../src/consistency/change.js";
import { diffDopData } from "../../src/consistency/diff.js";

describe("applyChanges", () => {
  it("returns the exact base when there are no changes", () => {
    const base: DopData = { nested: { stable: true } };

    expect(applyChanges(base, [])).toBe(base);
  });

  it("returns the exact after reference for one root replacement", () => {
    const base: DopData = { value: "before" };
    const after: DopData = ["after"];
    const changes: readonly Change[] = [
      { op: "replace", path: [], before: base, after },
    ];

    expect(applyChanges(base, changes)).toBe(after);
  });

  it("applies nested changes immutably with structural sharing", () => {
    const stable: DopData = Object.freeze({ retained: true });
    const previousItems: DopData = Object.freeze([{ id: "before" }]);
    const targetItems: DopData = [{ id: "after" }];
    const previousProfile: DopData = Object.freeze({
      city: "Seoul",
      name: "Ada",
    });
    const previous: DopData = Object.freeze({
      items: previousItems,
      profile: previousProfile,
      removed: "old",
      stable,
    });
    const target: DopData = {
      added: "new",
      items: targetItems,
      profile: { city: "Seoul", name: "Grace" },
      stable,
    };

    const result = applyChanges(previous, diffDopData(previous, target));
    const resultRecord = result as Readonly<Record<string, DopData>>;
    const previousRecord = previous as Readonly<Record<string, DopData>>;

    expect(result).toEqual(target);
    expect(result).not.toBe(previous);
    expect(resultRecord.stable).toBe(stable);
    expect(resultRecord.items).toBe(targetItems);
    expect(resultRecord.profile).not.toBe(previousProfile);
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(resultRecord.profile)).toBe(Object.prototype);
    expect(Object.isFrozen(result)).toBe(false);
    expect(previousRecord.items).toBe(previousItems);
    expect(previousRecord.profile).toBe(previousProfile);
    expect(previousRecord.removed).toBe("old");
    expect(Object.hasOwn(previousRecord, "added")).toBe(false);
  });

  it("preserves null prototypes for cloned record ancestors", () => {
    const previousNested = Object.assign(Object.create(null), {
      changed: "before",
      stable: "kept",
    }) as Record<string, DopData>;
    const previous = Object.assign(Object.create(null), {
      nested: previousNested,
      sibling: { exact: true },
    }) as Record<string, DopData>;
    const targetNested = Object.assign(Object.create(null), {
      stable: "kept",
      changed: "after",
    }) as Record<string, DopData>;
    const target = Object.assign(Object.create(null), {
      sibling: previous.sibling as DopData,
      nested: targetNested,
    }) as Record<string, DopData>;

    const result = applyChanges(previous, diffDopData(previous, target));
    const resultRecord = result as Readonly<Record<string, DopData>>;

    expect(result).toEqual(target);
    expect(Object.getPrototypeOf(result)).toBeNull();
    expect(Object.getPrototypeOf(resultRecord.nested)).toBeNull();
    expect(resultRecord.sibling).toBe(previous.sibling);
    expect(previousNested.changed).toBe("before");
  });

  it("defines own properties without consulting the prototype chain", () => {
    const base: DopData = {};
    const target: DopData = { toString: "application-value" };

    const result = applyChanges(base, diffDopData(base, target));
    const record = result as Readonly<Record<string, DopData>>;

    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(Object.hasOwn(record, "toString")).toBe(true);
    expect(record.toString).toBe("application-value");
  });

  it.each([
    ["root primitives", "before", "after"],
    ["root arrays", [1, { value: "before" }], [2, { value: "after" }]],
    [
      "nested records",
      { left: { value: 1 }, removed: true },
      { added: [1, 2], left: { value: 2 } },
    ],
    [
      "record and array leaves",
      { config: { enabled: false }, items: [1] },
      { config: { enabled: true }, items: [1] },
    ],
  ] as const)("round-trips %s", (_name, previous, target) => {
    const base = previous as DopData;
    const expected = target as DopData;

    const result = applyChanges(base, diffDopData(base, expected));

    expect(result).toEqual(expected);
  });

  it.each([
    ["a root add", [{ op: "add", path: [], after: "value" }]],
    ["a root remove", [{ op: "remove", path: [], before: "value" }]],
    [
      "a root replacement mixed with another change",
      [
        { op: "replace", path: [], before: {}, after: {} },
        { op: "add", path: ["added"], after: true },
      ],
    ],
    [
      "an add for an existing property",
      [{ op: "add", path: ["existing"], after: "new" }],
    ],
    [
      "a replace for a missing property",
      [
        {
          op: "replace",
          path: ["missing"],
          before: "old",
          after: "new",
        },
      ],
    ],
    [
      "a remove for a missing property",
      [{ op: "remove", path: ["missing"], before: "old" }],
    ],
    [
      "a path through a primitive",
      [
        {
          op: "replace",
          path: ["primitive", "child"],
          before: "old",
          after: "new",
        },
      ],
    ],
    [
      "a path through an array",
      [
        {
          op: "replace",
          path: ["items", "0"],
          before: 1,
          after: 2,
        },
      ],
    ],
    [
      "a reserved path segment",
      [{ op: "add", path: ["__proto__"], after: "unsafe" }],
    ],
    ["a non-array path", [{ op: "add", path: "added", after: true }]],
    ["a non-string path segment", [{ op: "add", path: [0], after: true }]],
    ["an unknown operation", [{ op: "copy", path: ["existing"] }]],
    ["a missing payload", [{ op: "add", path: ["added"] }]],
  ] as const)("rejects %s without mutating the base", (_name, malformed) => {
    const nested: DopData = { retained: true };
    const items: DopData = [1];
    const base: DopData = {
      existing: "value",
      items,
      nested,
      primitive: "leaf",
    };

    const error = captureError(() =>
      applyChanges(base, malformed as unknown as readonly Change[]),
    );

    expect(error).toBeInstanceOf(EngineInvariantError);
    expect(base).toEqual({
      existing: "value",
      items: [1],
      nested: { retained: true },
      primitive: "leaf",
    });
    const record = base as Readonly<Record<string, DopData>>;
    expect(record.items).toBe(items);
    expect(record.nested).toBe(nested);
    expect(Object.hasOwn(record, "added")).toBe(false);
  });

  it("keeps the original base unchanged when a later change fails", () => {
    const base: DopData = { existing: "value" };
    const changes: readonly Change[] = [
      { op: "add", path: ["added"], after: true },
      { op: "remove", path: ["missing"], before: "old" },
    ];

    const error = captureError(() => applyChanges(base, changes));

    expect(error).toBeInstanceOf(EngineInvariantError);
    expect(base).toEqual({ existing: "value" });
    expect(Object.hasOwn(base, "added")).toBe(false);
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
