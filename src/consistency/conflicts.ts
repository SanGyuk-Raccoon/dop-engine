import type { Conflict } from "../api/types.js";
import type { Change } from "./change.js";
import { classifyPathRelation, comparePaths } from "./path.js";

export function findChangeConflicts(
  currentChanges: readonly Change[],
  nextChanges: readonly Change[],
): readonly Conflict[] {
  const conflicts: Conflict[] = [];

  for (const currentChange of currentChanges) {
    for (const nextChange of nextChanges) {
      const relation = classifyPathRelation(
        currentChange.path,
        nextChange.path,
      );

      if (relation === undefined) {
        continue;
      }

      conflicts.push({
        currentPath: currentChange.path,
        nextPath: nextChange.path,
        relation,
        currentOperation: currentChange.op,
        nextOperation: nextChange.op,
      });
    }
  }

  conflicts.sort(compareConflicts);
  return conflicts;
}

function compareConflicts(left: Conflict, right: Conflict): number {
  return (
    comparePaths(left.currentPath, right.currentPath) ||
    comparePaths(left.nextPath, right.nextPath) ||
    compareText(left.currentOperation, right.currentOperation) ||
    compareText(left.nextOperation, right.nextOperation) ||
    compareText(left.relation, right.relation)
  );
}

function compareText(left: string, right: string): number {
  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
}
