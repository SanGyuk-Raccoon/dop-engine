import { describe, expect, it } from "vitest";

import type { DopData } from "../../src/api/types.js";
import type { Change, Path } from "../../src/consistency/change.js";
import { findChangeConflicts } from "../../src/consistency/conflicts.js";
import { diffDopData } from "../../src/consistency/diff.js";

describe("findChangeConflicts", () => {
  it("returns no diagnostics for independent diff-produced changes", () => {
    const previous: DopData = { left: 0, right: 0 };
    const currentChanges = diffDopData(previous, { left: 1, right: 0 });
    const nextChanges = diffDopData(previous, { left: 0, right: 1 });

    expect(findChangeConflicts(currentChanges, nextChanges)).toEqual([]);
  });

  it("maps same, ancestor, and descendant pairs with exact paths and operations", () => {
    const ancestorCurrentPath = ["alpha"] as const;
    const ancestorNextPath = ["alpha", "child"] as const;
    const descendantCurrentPath = ["omega", "child"] as const;
    const descendantNextPath = ["omega"] as const;
    const sameCurrentPath = ["same"] as const;
    const sameNextPath = ["same"] as const;
    const currentChanges: readonly Change[] = [
      { op: "remove", path: descendantCurrentPath, before: 1 },
      { op: "add", path: sameCurrentPath, after: 1 },
      {
        op: "replace",
        path: ancestorCurrentPath,
        before: 1,
        after: 2,
      },
    ];
    const nextChanges: readonly Change[] = [
      { op: "remove", path: sameNextPath, before: 1 },
      { op: "add", path: ancestorNextPath, after: 2 },
      {
        op: "replace",
        path: descendantNextPath,
        before: 1,
        after: 2,
      },
    ];

    const conflicts = findChangeConflicts(currentChanges, nextChanges);

    expect(conflicts).toEqual([
      {
        currentPath: ancestorCurrentPath,
        nextPath: ancestorNextPath,
        relation: "ancestor",
        currentOperation: "replace",
        nextOperation: "add",
      },
      {
        currentPath: descendantCurrentPath,
        nextPath: descendantNextPath,
        relation: "descendant",
        currentOperation: "remove",
        nextOperation: "replace",
      },
      {
        currentPath: sameCurrentPath,
        nextPath: sameNextPath,
        relation: "same",
        currentOperation: "add",
        nextOperation: "remove",
      },
    ]);
    expect(conflicts[0]?.currentPath).toBe(ancestorCurrentPath);
    expect(conflicts[0]?.nextPath).toBe(ancestorNextPath);
    expect(conflicts[1]?.currentPath).toBe(descendantCurrentPath);
    expect(conflicts[1]?.nextPath).toBe(descendantNextPath);
    expect(conflicts[2]?.currentPath).toBe(sameCurrentPath);
    expect(conflicts[2]?.nextPath).toBe(sameNextPath);
  });

  it("reports equal-result writes without inspecting their payload", () => {
    const payload = new Proxy(Object.create(null) as Record<string, DopData>, {
      get() {
        throw new Error("payload must not be read");
      },
      getOwnPropertyDescriptor() {
        throw new Error("payload must not be inspected");
      },
      getPrototypeOf() {
        throw new Error("payload must not be inspected");
      },
      ownKeys() {
        throw new Error("payload must not be inspected");
      },
    });
    const currentPath = ["value"] as const;
    const nextPath = ["value"] as const;
    const currentChange: Change = {
      op: "replace",
      path: currentPath,
      before: 0,
      after: payload,
    };
    const nextChange: Change = {
      op: "replace",
      path: nextPath,
      before: 0,
      after: payload,
    };

    expect(findChangeConflicts([currentChange], [nextChange])).toEqual([
      {
        currentPath,
        nextPath,
        relation: "same",
        currentOperation: "replace",
        nextOperation: "replace",
      },
    ]);
  });

  it("applies ordinary overlap rules to atomic array paths", () => {
    const previous: DopData = { box: { nested: 0 } };
    const currentChanges = diffDopData(previous, { box: [1] });
    const nextChanges = diffDopData(previous, { box: { nested: 1 } });

    expect(currentChanges.map((change) => change.path)).toEqual([["box"]]);
    expect(nextChanges.map((change) => change.path)).toEqual([
      ["box", "nested"],
    ]);
    expect(findChangeConflicts(currentChanges, nextChanges)).toEqual([
      {
        currentPath: ["box"],
        nextPath: ["box", "nested"],
        relation: "ancestor",
        currentOperation: "replace",
        nextOperation: "replace",
      },
    ]);

    const previousRoot: DopData = [0];
    const currentRootChanges = diffDopData(previousRoot, [1]);
    const nextRootChanges = diffDopData(previousRoot, [2]);

    expect(findChangeConflicts(currentRootChanges, nextRootChanges)).toEqual([
      {
        currentPath: [],
        nextPath: [],
        relation: "same",
        currentOperation: "replace",
        nextOperation: "replace",
      },
    ]);
    expect(currentRootChanges[0]?.path).not.toContain("0");
    expect(nextRootChanges[0]?.path).not.toContain("0");
  });

  it("returns deterministic ordering without mutating either change list", () => {
    const currentAPath = Object.freeze(["a"] satisfies Path);
    const currentZPath = Object.freeze(["z"] satisfies Path);
    const nextAPath = Object.freeze(["a"] satisfies Path);
    const nextZPath = Object.freeze(["z", "leaf"] satisfies Path);
    const currentA = Object.freeze({
      op: "add",
      path: currentAPath,
      after: 1,
    } satisfies Change);
    const currentZ = Object.freeze({
      op: "remove",
      path: currentZPath,
      before: 1,
    } satisfies Change);
    const nextA = Object.freeze({
      op: "replace",
      path: nextAPath,
      before: 0,
      after: 1,
    } satisfies Change);
    const nextZ = Object.freeze({
      op: "add",
      path: nextZPath,
      after: 1,
    } satisfies Change);
    const currentChanges = Object.freeze([currentZ, currentA]);
    const nextChanges = Object.freeze([nextZ, nextA]);

    const first = findChangeConflicts(currentChanges, nextChanges);
    const second = findChangeConflicts(
      Object.freeze([...currentChanges].reverse()),
      Object.freeze([...nextChanges].reverse()),
    );

    expect(first).toEqual(second);
    expect(
      first.map(({ currentPath, nextPath }) => [currentPath, nextPath]),
    ).toEqual([
      [["a"], ["a"]],
      [["z"], ["z", "leaf"]],
    ]);
    expect(currentChanges).toEqual([currentZ, currentA]);
    expect(nextChanges).toEqual([nextZ, nextA]);
  });
});
