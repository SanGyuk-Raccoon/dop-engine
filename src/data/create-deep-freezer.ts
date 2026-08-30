import { EngineExecutionError } from "../api/errors.js";
import type { FreezePolicy } from "../api/types.js";

type DeepFreezer = <T>(value: T) => T;

interface FreezeFrame {
  readonly phase: "enter" | "freeze";
  readonly value: object;
}

export function createDeepFreezer(
  policy: FreezePolicy = "always",
): DeepFreezer {
  if (policy === "never") {
    return identity;
  }

  const frozenSubtrees = new WeakSet<object>();

  return <T>(value: T): T => {
    if (!isObject(value) || frozenSubtrees.has(value)) {
      return value;
    }

    try {
      freezeSubtree(value, frozenSubtrees);
    } catch (error) {
      throw new EngineExecutionError("Failed to deep freeze DOP data.", {
        cause: error,
      });
    }

    return value;
  };
}

function freezeSubtree(root: object, frozenSubtrees: WeakSet<object>): void {
  const visiting = new WeakSet<object>();
  const frames: FreezeFrame[] = [{ phase: "enter", value: root }];

  for (let frame = frames.pop(); frame !== undefined; frame = frames.pop()) {
    if (frozenSubtrees.has(frame.value)) {
      continue;
    }

    if (frame.phase === "freeze") {
      Object.freeze(frame.value);
      frozenSubtrees.add(frame.value);
      visiting.delete(frame.value);
      continue;
    }

    if (visiting.has(frame.value)) {
      throw new Error(
        "Deep freeze received cyclic data before the runtime guard.",
      );
    }

    visiting.add(frame.value);
    frames.push({ phase: "freeze", value: frame.value });

    const children = getObjectChildren(frame.value);

    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index];

      if (isObject(child) && !frozenSubtrees.has(child)) {
        frames.push({ phase: "enter", value: child });
      }
    }
  }
}

function getObjectChildren(value: object): unknown[] {
  const children: unknown[] = [];

  for (const key of Reflect.ownKeys(value)) {
    if (Array.isArray(value) && key === "length") {
      continue;
    }

    const descriptor = Object.getOwnPropertyDescriptor(value, key);

    if (descriptor !== undefined && "value" in descriptor) {
      children.push(descriptor.value);
    }
  }

  return children;
}

function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

function identity<T>(value: T): T {
  return value;
}
