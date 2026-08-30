import { afterEach, describe, expect, it, vi } from "vitest";

import type { DopData } from "../../src/api/types.js";
import { diffDopData } from "../../src/consistency/diff.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("diffDopData", () => {
  it("returns no changes for the exact same root reference", () => {
    const value: DopData = { nested: { stable: true } };
    const keys = vi.spyOn(Object, "keys");

    const changes = diffDopData(value, value);

    expect(changes).toEqual([]);
    expect(keys).not.toHaveBeenCalled();
  });

  it("skips an exact shared subtree while comparing changed siblings", () => {
    const shared: DopData = { deep: { stable: true } };
    const previous: DopData = { changed: "before", shared };
    const target: DopData = { changed: "after", shared };
    const keys = vi.spyOn(Object, "keys");

    const changes = diffDopData(previous, target);

    expect(changes).toEqual([
      {
        op: "replace",
        path: ["changed"],
        before: "before",
        after: "after",
      },
    ]);
    expect(keys.mock.calls.some(([value]) => value === shared)).toBe(false);
  });

  it("creates one root replacement with exact payload references", () => {
    const previous: DopData = { value: "before" };
    const target: DopData = ["after"];

    const changes = diffDopData(previous, target);

    expect(changes).toHaveLength(1);
    const change = changes[0];
    expect(change?.op).toBe("replace");
    if (change?.op !== "replace") {
      throw new Error("Expected a replace change.");
    }
    expect(change.path).toEqual([]);
    expect(change.before).toBe(previous);
    expect(change.after).toBe(target);
  });

  it("emits nested add, replace, and remove changes in path order", () => {
    const added: DopData = { id: "added" };
    const removed: DopData = { id: "removed" };
    const previousItems: DopData = [{ id: "before" }];
    const targetItems: DopData = [{ id: "after" }];
    const shared: DopData = { stable: true };
    const previous: DopData = {
      removed,
      profile: { city: "Seoul", name: "Ada" },
      items: previousItems,
      shared,
    };
    const target: DopData = {
      shared,
      items: targetItems,
      profile: { name: "Grace", city: "Seoul" },
      added,
    };

    const changes = diffDopData(previous, target);

    expect(changes).toEqual([
      { op: "add", path: ["added"], after: added },
      {
        op: "replace",
        path: ["items"],
        before: previousItems,
        after: targetItems,
      },
      {
        op: "replace",
        path: ["profile", "name"],
        before: "Ada",
        after: "Grace",
      },
      { op: "remove", path: ["removed"], before: removed },
    ]);
    expect(changes[0]?.op).toBe("add");
    if (changes[0]?.op !== "add") {
      throw new Error("Expected an add change.");
    }
    expect(changes[0].after).toBe(added);
    expect(changes[1]?.op).toBe("replace");
    if (changes[1]?.op !== "replace") {
      throw new Error("Expected an array replace change.");
    }
    expect(changes[1].before).toBe(previousItems);
    expect(changes[1].after).toBe(targetItems);
    expect(changes[3]?.op).toBe("remove");
    if (changes[3]?.op !== "remove") {
      throw new Error("Expected a remove change.");
    }
    expect(changes[3].before).toBe(removed);
  });

  it("uses deterministic lexicographic ordering independent of insertion order", () => {
    const previousA: DopData = {
      z: "remove",
      middle: { z: 0, a: 0 },
    };
    const targetA: DopData = {
      middle: { a: 1, z: 2 },
      a: "add",
    };
    const previousB: DopData = {
      middle: { a: 0, z: 0 },
      z: "remove",
    };
    const targetB: DopData = {
      a: "add",
      middle: { z: 2, a: 1 },
    };

    const first = diffDopData(previousA, targetA);
    const second = diffDopData(previousB, targetB);

    expect(first).toEqual(second);
    expect(first.map((change) => change.path)).toEqual([
      ["a"],
      ["middle", "a"],
      ["middle", "z"],
      ["z"],
    ]);
  });

  it("sorts integer-like object keys as path strings", () => {
    const previous: DopData = {};
    const target: DopData = { "2": "two", "10": "ten", a: "letter" };

    const changes = diffDopData(previous, target);

    expect(changes.map((change) => change.path)).toEqual([
      ["10"],
      ["2"],
      ["a"],
    ]);
  });

  it("treats arrays as atomic leaves at root and property paths", () => {
    const previousArray: DopData = [{ value: 1 }];
    const equalButDistinctArray: DopData = [{ value: 1 }];

    expect(diffDopData(previousArray, previousArray)).toEqual([]);

    const rootChanges = diffDopData(previousArray, equalButDistinctArray);
    expect(rootChanges).toEqual([
      {
        op: "replace",
        path: [],
        before: previousArray,
        after: equalButDistinctArray,
      },
    ]);

    const propertyChanges = diffDopData(
      { items: previousArray },
      { items: equalButDistinctArray },
    );
    expect(propertyChanges).toEqual([
      {
        op: "replace",
        path: ["items"],
        before: previousArray,
        after: equalButDistinctArray,
      },
    ]);
    expect(propertyChanges[0]?.path).not.toContain("0");
  });

  it("compares null-prototype records as records", () => {
    const previous = Object.assign(Object.create(null), {
      nested: { value: "before" },
      stable: true,
    }) as Record<string, DopData>;
    const target = Object.assign(Object.create(null), {
      stable: true,
      nested: { value: "after" },
    }) as Record<string, DopData>;

    expect(diffDopData(previous, target)).toEqual([
      {
        op: "replace",
        path: ["nested", "value"],
        before: "before",
        after: "after",
      },
    ]);
  });
});
