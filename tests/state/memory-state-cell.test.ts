import { describe, expect, it, vi } from "vitest";

import {
  MemoryStateCell,
  type VersionedState,
} from "../../src/state/memory-state-cell.js";

interface TestData {
  readonly value: string;
}

describe("MemoryStateCell", () => {
  it("starts at revision zero with the exact initial data reference", () => {
    const initialData: TestData = { value: "initial" };
    const cell = new MemoryStateCell(initialData);

    const initialState = cell.get();

    expect(initialState.data).toBe(initialData);
    expect(initialState.revision).toBe(0);
    expect(cell.get()).toBe(initialState);
  });

  it("calls swap once with the exact current state and installs its result", () => {
    const cell = new MemoryStateCell<TestData>({ value: "initial" });
    const current = cell.get();
    const nextData: TestData = { value: "next" };
    const next: VersionedState<TestData> = {
      data: nextData,
      revision: 7,
    };
    const update = vi.fn((received: VersionedState<TestData>) => {
      expect(received).toBe(current);
      return next;
    });

    const result = cell.swap(update);

    expect(update).toHaveBeenCalledTimes(1);
    expect(result).toBe(next);
    expect(result.data).toBe(nextData);
    expect(result.revision).toBe(7);
    expect(cell.get()).toBe(next);
  });

  it("preserves the exact state when swap returns the current object", () => {
    const cell = new MemoryStateCell<TestData>({ value: "initial" });
    const current = cell.get();

    const result = cell.swap((received) => received);

    expect(result).toBe(current);
    expect(result.data).toBe(current.data);
    expect(result.revision).toBe(current.revision);
    expect(cell.get()).toBe(current);
  });

  it("passes the latest installed state to a later swap", () => {
    const cell = new MemoryStateCell<TestData>({ value: "initial" });
    const first: VersionedState<TestData> = {
      data: { value: "first" },
      revision: 3,
    };
    const second: VersionedState<TestData> = {
      data: { value: "second" },
      revision: 11,
    };

    expect(cell.swap(() => first)).toBe(first);
    expect(
      cell.swap((current) => {
        expect(current).toBe(first);
        return second;
      }),
    ).toBe(second);
    expect(cell.get()).toBe(second);
  });

  it("rethrows a callback error without changing the current state", () => {
    const cell = new MemoryStateCell<TestData>({ value: "initial" });
    const current = cell.get();
    const cause = new Error("swap failed");
    let captured: unknown;

    try {
      cell.swap((received) => {
        expect(received).toBe(current);
        throw cause;
      });
    } catch (error) {
      captured = error;
    }

    expect(captured).toBe(cause);
    expect(cell.get()).toBe(current);

    const recovered: VersionedState<TestData> = {
      data: { value: "recovered" },
      revision: 1,
    };
    expect(
      cell.swap((received) => {
        expect(received).toBe(current);
        return recovered;
      }),
    ).toBe(recovered);
    expect(cell.get()).toBe(recovered);
  });
});
