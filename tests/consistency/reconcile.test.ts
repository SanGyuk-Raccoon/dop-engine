import { describe, expect, it } from "vitest";

import type { DopData } from "../../src/api/types.js";
import { reconcileDopData } from "../../src/consistency/reconcile.js";

describe("reconcileDopData", () => {
  it("preserves exact references for identity and fast-forward candidates", () => {
    const current: DopData = { value: "current" };
    const next: DopData = { value: "next" };

    const identity = reconcileDopData(current, current, current);
    const fastForward = reconcileDopData(current, current, next);

    expect(identity).toEqual({
      status: "candidate",
      candidate: current,
      merged: false,
    });
    expect(fastForward).toEqual({
      status: "candidate",
      candidate: next,
      merged: false,
    });
    if (identity.status !== "candidate" || fastForward.status !== "candidate") {
      throw new Error("Expected candidate results.");
    }
    expect(identity.candidate).toBe(current);
    expect(fastForward.candidate).toBe(next);
  });

  it("does not traverse the current value on the fast-forward path", () => {
    const current = new Proxy(Object.create(null) as Record<string, DopData>, {
      ownKeys() {
        throw new Error("fast-forward must not diff the current value");
      },
    });
    const next: DopData = { value: "next" };

    const result = reconcileDopData(current, current, next);

    expect(result.status).toBe("candidate");
    if (result.status !== "candidate") {
      throw new Error("Expected a candidate result.");
    }
    expect(result.candidate).toBe(next);
    expect(result.merged).toBe(false);
  });

  it("returns the exact current reference for an unchanged stale next", () => {
    const previous: DopData = { value: "previous" };
    const current: DopData = { value: "current" };
    const semanticallyUnchangedNext: DopData = { value: "previous" };

    for (const next of [previous, semanticallyUnchangedNext]) {
      const result = reconcileDopData(current, previous, next);

      expect(result).toEqual({
        status: "candidate",
        candidate: current,
        merged: false,
      });
      if (result.status !== "candidate") {
        throw new Error("Expected a candidate result.");
      }
      expect(result.candidate).toBe(current);
    }
  });

  it("merges independent nested add, replace, and remove changes", () => {
    const shared: DopData = { stable: true };
    const previousFlags: DopData = { retired: true };
    const previous: DopData = {
      flags: previousFlags,
      profile: { city: "Seoul", name: "Ada" },
      shared,
    };
    const current: DopData = {
      currentOnly: "kept",
      flags: previousFlags,
      profile: { city: "Seoul", name: "Grace" },
      shared,
    };
    const next: DopData = {
      flags: {},
      nextOnly: "added",
      profile: { city: "Busan", name: "Ada" },
      shared,
    };

    const result = reconcileDopData(current, previous, next);

    expect(result).toEqual({
      status: "candidate",
      candidate: {
        currentOnly: "kept",
        flags: {},
        nextOnly: "added",
        profile: { city: "Busan", name: "Grace" },
        shared,
      },
      merged: true,
    });
    if (result.status !== "candidate") {
      throw new Error("Expected a candidate result.");
    }
    expect((result.candidate as { readonly shared: DopData }).shared).toBe(
      shared,
    );
    expect(previous).toEqual({
      flags: { retired: true },
      profile: { city: "Seoul", name: "Ada" },
      shared,
    });
    expect(current).toEqual({
      currentOnly: "kept",
      flags: previousFlags,
      profile: { city: "Seoul", name: "Grace" },
      shared,
    });
    expect(next).toEqual({
      flags: {},
      nextOnly: "added",
      profile: { city: "Busan", name: "Ada" },
      shared,
    });
  });

  it("does not mark a merge when current is only referentially different", () => {
    const previousStable: DopData = { marker: "previous" };
    const currentStable: DopData = { marker: "previous" };
    const previous: DopData = { stable: previousStable, value: 0 };
    const current: DopData = { stable: currentStable, value: 0 };
    const next: DopData = { stable: previousStable, value: 1 };

    const result = reconcileDopData(current, previous, next);

    expect(result).toEqual({
      status: "candidate",
      candidate: { stable: currentStable, value: 1 },
      merged: false,
    });
    if (result.status !== "candidate") {
      throw new Error("Expected a candidate result.");
    }
    expect((result.candidate as { readonly stable: DopData }).stable).toBe(
      currentStable,
    );
  });

  it("returns ordered conflicts for exact and ancestor overlaps", () => {
    const previous: DopData = {
      alpha: { value: 0 },
      omega: { nested: 0 },
    };
    const current: DopData = {
      alpha: { value: 1 },
      omega: [],
    };
    const next: DopData = {
      alpha: { value: 1 },
      omega: { nested: 1 },
    };

    const result = reconcileDopData(current, previous, next);

    expect(result).toEqual({
      status: "conflict",
      conflicts: [
        {
          currentPath: ["alpha", "value"],
          nextPath: ["alpha", "value"],
          relation: "same",
          currentOperation: "replace",
          nextOperation: "replace",
        },
        {
          currentPath: ["omega"],
          nextPath: ["omega", "nested"],
          relation: "ancestor",
          currentOperation: "replace",
          nextOperation: "replace",
        },
      ],
    });
    expect(result).not.toHaveProperty("candidate");
  });

  it("reports remove-versus-descendant and root overlaps", () => {
    const previous: DopData = { user: { name: "Ada" } };
    const removedCurrent: DopData = {};
    const changedNext: DopData = { user: { name: "Grace" } };

    expect(reconcileDopData(removedCurrent, previous, changedNext)).toEqual({
      status: "conflict",
      conflicts: [
        {
          currentPath: ["user"],
          nextPath: ["user", "name"],
          relation: "ancestor",
          currentOperation: "remove",
          nextOperation: "replace",
        },
      ],
    });

    const changedCurrent: DopData = { user: { name: "Grace" } };
    const removedNext: DopData = {};
    expect(reconcileDopData(changedCurrent, previous, removedNext)).toEqual({
      status: "conflict",
      conflicts: [
        {
          currentPath: ["user", "name"],
          nextPath: ["user"],
          relation: "descendant",
          currentOperation: "replace",
          nextOperation: "remove",
        },
      ],
    });

    const replacedCurrent: DopData = "current root";
    expect(reconcileDopData(replacedCurrent, previous, changedNext)).toEqual({
      status: "conflict",
      conflicts: [
        {
          currentPath: [],
          nextPath: ["user", "name"],
          relation: "ancestor",
          currentOperation: "replace",
          nextOperation: "replace",
        },
      ],
    });
  });

  it("merges an array replacement with a sibling but conflicts at its parent", () => {
    const previousItems: DopData = [0];
    const currentItems: DopData = [1];
    const previous: DopData = { items: previousItems, theme: "light" };
    const current: DopData = { items: currentItems, theme: "light" };
    const siblingNext: DopData = { items: previousItems, theme: "dark" };

    const siblingResult = reconcileDopData(current, previous, siblingNext);

    expect(siblingResult).toEqual({
      status: "candidate",
      candidate: { items: currentItems, theme: "dark" },
      merged: true,
    });
    if (siblingResult.status !== "candidate") {
      throw new Error("Expected a candidate result.");
    }
    expect((siblingResult.candidate as { readonly items: DopData }).items).toBe(
      currentItems,
    );

    const parentPrevious: DopData = { box: { items: previousItems } };
    const parentCurrent: DopData = { box: [] };
    const parentNext: DopData = { box: { items: [2] } };

    expect(reconcileDopData(parentCurrent, parentPrevious, parentNext)).toEqual(
      {
        status: "conflict",
        conflicts: [
          {
            currentPath: ["box"],
            nextPath: ["box", "items"],
            relation: "ancestor",
            currentOperation: "replace",
            nextOperation: "replace",
          },
        ],
      },
    );
  });

  it("produces the same conflict order for equivalent insertion orders", () => {
    const first = reconcileDopData(
      { z: 1, a: 1 },
      { a: 0, z: 0 },
      { a: 2, z: 2 },
    );
    const second = reconcileDopData(
      { a: 1, z: 1 },
      { z: 0, a: 0 },
      { z: 2, a: 2 },
    );

    expect(first).toEqual(second);
    expect(first).toEqual({
      status: "conflict",
      conflicts: [
        {
          currentPath: ["a"],
          nextPath: ["a"],
          relation: "same",
          currentOperation: "replace",
          nextOperation: "replace",
        },
        {
          currentPath: ["z"],
          nextPath: ["z"],
          relation: "same",
          currentOperation: "replace",
          nextOperation: "replace",
        },
      ],
    });
  });
});
