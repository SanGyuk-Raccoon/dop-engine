import type { Conflict, DopData } from "../api/types.js";
import { applyChanges } from "./apply.js";
import { findChangeConflicts } from "./conflicts.js";
import { diffDopData } from "./diff.js";

export interface ReconciliationCandidate {
  readonly status: "candidate";
  readonly candidate: DopData;
  readonly merged: boolean;
}

export interface ReconciliationConflict {
  readonly status: "conflict";
  readonly conflicts: readonly [Conflict, ...Conflict[]];
}

export type ReconciliationResult =
  ReconciliationCandidate | ReconciliationConflict;

export function reconcileDopData(
  current: DopData,
  previous: DopData,
  next: DopData,
): ReconciliationResult {
  if (Object.is(current, previous)) {
    return { status: "candidate", candidate: next, merged: false };
  }

  const currentChanges = diffDopData(previous, current);
  const nextChanges = diffDopData(previous, next);

  if (nextChanges.length === 0) {
    return { status: "candidate", candidate: current, merged: false };
  }

  const conflicts = findChangeConflicts(currentChanges, nextChanges);
  const firstConflict = conflicts[0];

  if (firstConflict !== undefined) {
    return {
      status: "conflict",
      conflicts: [firstConflict, ...conflicts.slice(1)],
    };
  }

  return {
    status: "candidate",
    candidate: applyChanges(current, nextChanges),
    merged: currentChanges.length > 0,
  };
}
