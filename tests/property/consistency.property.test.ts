import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { DopData } from "../../src/api/types.js";
import { applyChanges } from "../../src/consistency/apply.js";
import { diffDopData } from "../../src/consistency/diff.js";
import { reconcileDopData } from "../../src/consistency/reconcile.js";
import { assertDopData } from "../../src/data/assert-dop-data.js";

const reservedKeys = new Set(["__proto__", "prototype", "constructor"]);
const safeKeyArbitrary = fc
  .string({ maxLength: 8 })
  .filter((key) => !reservedKeys.has(key));
const primitiveArbitrary: fc.Arbitrary<DopData> = fc.oneof(
  fc.constant(null),
  fc.boolean(),
  fc.integer(),
  fc.string({ maxLength: 24 }),
);
const dopDataMemo: fc.Memo<DopData> = fc.memo((maxDepth) => {
  if (maxDepth <= 0) {
    return primitiveArbitrary;
  }

  return fc.oneof(
    primitiveArbitrary,
    fc.array(dopDataMemo(maxDepth - 1), { maxLength: 8 }),
    fc.dictionary(safeKeyArbitrary, dopDataMemo(maxDepth - 1), {
      maxKeys: 8,
      noNullPrototype: true,
    }),
  );
});
const dopDataArbitrary = dopDataMemo(6);
const pathArbitrary = fc.array(safeKeyArbitrary, { maxLength: 5 });
const overlapKindArbitrary = fc.constantFrom(
  "same",
  "ancestor",
  "descendant",
  "root",
  "array",
);
const environment = (
  globalThis as typeof globalThis & {
    readonly process?: {
      readonly env?: Readonly<Record<string, string | undefined>>;
    };
  }
).process?.env;
const isCi = environment?.CI === "true" || environment?.CI === "1";
const propertyRuns = isCi ? 1_000 : 100;
const propertyParameters = { numRuns: propertyRuns } as const;
const propertyTimeout = isCi ? 120_000 : 15_000;

type OverlapKind = "same" | "ancestor" | "descendant" | "root" | "array";

describe("consistency properties", () => {
  it(
    "round-trips bounded supported DopData without mutating inputs",
    () => {
      let executedRuns = 0;

      fc.assert(
        fc.property(dopDataArbitrary, dopDataArbitrary, (previous, target) => {
          executedRuns += 1;
          assertDopData(previous);
          assertDopData(target);
          assertBounds(previous);
          assertBounds(target);
          const previousSnapshot = snapshot(previous);
          const targetSnapshot = snapshot(target);

          const result = applyChanges(previous, diffDopData(previous, target));

          expect(result).toEqual(target);
          expect(snapshot(previous)).toBe(previousSnapshot);
          expect(snapshot(target)).toBe(targetSnapshot);
        }),
        propertyParameters,
      );

      expect(executedRuns).toBe(propertyRuns);
    },
    propertyTimeout,
  );

  it(
    "preserves exact identity, next-only, and current-only references",
    () => {
      fc.assert(
        fc.property(dopDataArbitrary, dopDataArbitrary, (first, second) => {
          const identity = reconcileDopData(first, first, first);
          const nextOnly = reconcileDopData(first, first, second);
          const currentOnly = reconcileDopData(second, first, first);

          expectCandidateReference(identity, first);
          expectCandidateReference(nextOnly, second);
          expectCandidateReference(currentOnly, second);
        }),
        propertyParameters,
      );
    },
    propertyTimeout,
  );

  it(
    "preserves generated changes on disjoint root branches",
    () => {
      fc.assert(
        fc.property(
          dopDataArbitrary,
          dopDataArbitrary,
          dopDataArbitrary,
          dopDataArbitrary,
          (leftBase, rightBase, currentValue, nextValue) => {
            const previousLeft: DopData = { stable: leftBase };
            const previousRight: DopData = { stable: rightBase };
            const currentLeft: DopData = {
              stable: leftBase,
              current: currentValue,
            };
            const nextRight: DopData = { stable: rightBase, next: nextValue };
            const previous: DopData = {
              left: previousLeft,
              right: previousRight,
            };
            const current: DopData = {
              left: currentLeft,
              right: previousRight,
            };
            const next: DopData = { left: previousLeft, right: nextRight };
            const snapshots = [
              snapshot(previous),
              snapshot(current),
              snapshot(next),
            ];

            const result = reconcileDopData(current, previous, next);

            expect(result).toEqual({
              status: "candidate",
              candidate: {
                left: currentLeft,
                right: nextRight,
              },
              merged: true,
            });
            if (result.status !== "candidate") {
              throw new Error("Expected independent changes to merge.");
            }
            const candidate = result.candidate as Readonly<
              Record<string, DopData>
            >;
            expect(candidate.left).toBe(currentLeft);
            expect(snapshot(previous)).toBe(snapshots[0]);
            expect(snapshot(current)).toBe(snapshots[1]);
            expect(snapshot(next)).toBe(snapshots[2]);
          },
        ),
        propertyParameters,
      );
    },
    propertyTimeout,
  );

  it(
    "never silently overwrites generated overlapping changes",
    () => {
      fc.assert(
        fc.property(overlapKindArbitrary, pathArbitrary, (kind, path) => {
          const fixture = createOverlapFixture(kind, path);
          const snapshots = [
            snapshot(fixture.previous),
            snapshot(fixture.current),
            snapshot(fixture.next),
          ];

          const result = reconcileDopData(
            fixture.current,
            fixture.previous,
            fixture.next,
          );

          expect(result.status).toBe("conflict");
          if (result.status !== "conflict") {
            throw new Error("Expected overlapping changes to conflict.");
          }
          expect(result.conflicts).toHaveLength(1);
          expect(result.conflicts[0]).toMatchObject({
            currentPath: fixture.currentPath,
            nextPath: fixture.nextPath,
            relation: fixture.relation,
          });
          expect(snapshot(fixture.previous)).toBe(snapshots[0]);
          expect(snapshot(fixture.current)).toBe(snapshots[1]);
          expect(snapshot(fixture.next)).toBe(snapshots[2]);
        }),
        propertyParameters,
      );
    },
    propertyTimeout,
  );

  it(
    "returns deterministic results for generated three-way inputs",
    () => {
      fc.assert(
        fc.property(
          dopDataArbitrary,
          dopDataArbitrary,
          dopDataArbitrary,
          (previous, current, next) => {
            const snapshots = [
              snapshot(previous),
              snapshot(current),
              snapshot(next),
            ];

            const first = reconcileDopData(current, previous, next);
            const second = reconcileDopData(current, previous, next);

            expect(first).toEqual(second);
            expect(snapshot(previous)).toBe(snapshots[0]);
            expect(snapshot(current)).toBe(snapshots[1]);
            expect(snapshot(next)).toBe(snapshots[2]);
          },
        ),
        propertyParameters,
      );
    },
    propertyTimeout,
  );
});

function expectCandidateReference(
  result: ReturnType<typeof reconcileDopData>,
  expected: DopData,
): void {
  expect(result.status).toBe("candidate");
  if (result.status !== "candidate") {
    throw new Error("Expected a candidate result.");
  }
  expect(result.candidate).toBe(expected);
  expect(result.merged).toBe(false);
}

function createOverlapFixture(kind: OverlapKind, path: readonly string[]) {
  const childPath = [...path, "$leaf"];

  if (kind === "ancestor") {
    return {
      previous: valueAtPath(childPath, "previous"),
      current: valueAtPath(path, ["current"]),
      next: valueAtPath(childPath, "next"),
      currentPath: path,
      nextPath: childPath,
      relation: "ancestor" as const,
    };
  }

  if (kind === "descendant") {
    return {
      previous: valueAtPath(childPath, "previous"),
      current: valueAtPath(childPath, "current"),
      next: valueAtPath(path, ["next"]),
      currentPath: childPath,
      nextPath: path,
      relation: "descendant" as const,
    };
  }

  if (kind === "root") {
    return {
      previous: valueAtPath(["$leaf"], "previous"),
      current: "current root" as DopData,
      next: valueAtPath(["$leaf"], "next"),
      currentPath: [] as const,
      nextPath: ["$leaf"] as const,
      relation: "ancestor" as const,
    };
  }

  if (kind === "array") {
    return {
      previous: valueAtPath(path, [0]),
      current: valueAtPath(path, [1]),
      next: valueAtPath(path, [2]),
      currentPath: path,
      nextPath: path,
      relation: "same" as const,
    };
  }

  return {
    previous: valueAtPath(path, "previous"),
    current: valueAtPath(path, "current"),
    next: valueAtPath(path, "next"),
    currentPath: path,
    nextPath: path,
    relation: "same" as const,
  };
}

function valueAtPath(path: readonly string[], leaf: DopData): DopData {
  let result = leaf;

  for (let index = path.length - 1; index >= 0; index -= 1) {
    const segment = path[index] as string;
    result = { [segment]: result };
  }

  return result;
}

function assertBounds(root: DopData): void {
  const work: { readonly value: DopData; readonly depth: number }[] = [
    { value: root, depth: 0 },
  ];

  for (let item = work.pop(); item !== undefined; item = work.pop()) {
    expect(item.depth).toBeLessThanOrEqual(6);

    if (typeof item.value !== "object" || item.value === null) {
      continue;
    }

    if (Array.isArray(item.value)) {
      expect(item.value.length).toBeLessThanOrEqual(8);
      for (const child of item.value) {
        work.push({ value: child, depth: item.depth + 1 });
      }
      continue;
    }

    const record = item.value as Readonly<Record<string, DopData>>;
    const keys = Object.keys(record);
    expect(keys.length).toBeLessThanOrEqual(8);
    for (const key of keys) {
      expect(reservedKeys.has(key)).toBe(false);
      work.push({
        value: record[key] as DopData,
        depth: item.depth + 1,
      });
    }
  }
}

function snapshot(value: DopData): string {
  const serialized = JSON.stringify(value);

  if (serialized === undefined) {
    throw new Error("Supported DOP data must be JSON serializable.");
  }

  return serialized;
}
