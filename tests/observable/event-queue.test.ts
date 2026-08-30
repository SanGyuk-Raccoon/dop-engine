import { describe, expect, it, vi } from "vitest";

import { EventQueue } from "../../src/observable/event-queue.js";

interface TestEvent {
  readonly id: string;
}

describe("EventQueue", () => {
  it("delivers exact events in subscription order and supports idempotent unsubscribe", () => {
    const queue = new EventQueue<TestEvent>();
    const calls: { readonly listener: string; readonly event: TestEvent }[] =
      [];
    const unsubscribeFirst = queue.subscribe((event) => {
      calls.push({ listener: "first", event });
    });
    queue.subscribe((event) => {
      calls.push({ listener: "second", event });
    });
    const firstEvent = { id: "first-event" };
    const secondEvent = { id: "second-event" };

    queue.emit(firstEvent);
    unsubscribeFirst();
    unsubscribeFirst();
    queue.emit(secondEvent);

    expect(calls).toEqual([
      { listener: "first", event: firstEvent },
      { listener: "second", event: firstEvent },
      { listener: "second", event: secondEvent },
    ]);
    expect(calls[0]?.event).toBe(firstEvent);
    expect(calls[1]?.event).toBe(firstEvent);
    expect(calls[2]?.event).toBe(secondEvent);
  });

  it("treats duplicate listener subscriptions independently", () => {
    const queue = new EventQueue<TestEvent>();
    const listener = vi.fn<(event: TestEvent) => void>();
    const unsubscribeFirst = queue.subscribe(listener);
    const unsubscribeSecond = queue.subscribe(listener);
    const firstEvent = { id: "first" };
    const secondEvent = { id: "second" };

    queue.emit(firstEvent);
    unsubscribeFirst();
    queue.emit(secondEvent);
    unsubscribeSecond();

    expect(listener.mock.calls).toEqual([
      [firstEvent],
      [firstEvent],
      [secondEvent],
    ]);
  });

  it("applies subscription changes to the next event snapshot", () => {
    const queue = new EventQueue<TestEvent>();
    const calls: string[] = [];
    const secondEvent = { id: "second" };
    let unsubscribeSecond!: () => void;

    queue.subscribe((event) => {
      calls.push(`first:${event.id}`);
      if (event.id === "first") {
        unsubscribeSecond();
        queue.subscribe((nextEvent) => {
          calls.push(`third:${nextEvent.id}`);
        });
        queue.emit(secondEvent);
      }
    });
    unsubscribeSecond = queue.subscribe((event) => {
      calls.push(`second:${event.id}`);
    });

    queue.emit({ id: "first" });

    expect(calls).toEqual([
      "first:first",
      "second:first",
      "first:second",
      "third:second",
    ]);
  });

  it("drains reentrant events in FIFO order without nested listener dispatch", () => {
    const queue = new EventQueue<TestEvent>();
    const calls: string[] = [];
    let listenerDepth = 0;
    let maximumListenerDepth = 0;

    queue.subscribe((event) => {
      listenerDepth += 1;
      maximumListenerDepth = Math.max(maximumListenerDepth, listenerDepth);
      calls.push(`first:${event.id}`);
      if (event.id === "a") {
        queue.emit({ id: "b" });
        queue.emit({ id: "c" });
      }
      if (event.id === "b") {
        queue.emit({ id: "d" });
      }
      listenerDepth -= 1;
    });
    queue.subscribe((event) => {
      listenerDepth += 1;
      maximumListenerDepth = Math.max(maximumListenerDepth, listenerDepth);
      calls.push(`second:${event.id}`);
      listenerDepth -= 1;
    });

    queue.emit({ id: "a" });

    expect(calls).toEqual([
      "first:a",
      "second:a",
      "first:b",
      "second:b",
      "first:c",
      "second:c",
      "first:d",
      "second:d",
    ]);
    expect(maximumListenerDepth).toBe(1);
  });

  it("isolates listener and error-hook failures and remains usable", () => {
    const firstError = new Error("first listener failed");
    const secondError = new Error("second listener failed");
    const reported: unknown[] = [];
    const calls: string[] = [];
    const queue = new EventQueue<TestEvent>((error) => {
      reported.push(error);
      if (error === firstError) {
        throw new Error("error hook failed");
      }
    });

    queue.subscribe((event) => {
      calls.push(`throwing:${event.id}`);
      if (event.id === "first") {
        throw firstError;
      }
      if (event.id === "second") {
        throw secondError;
      }
    });
    queue.subscribe((event) => {
      calls.push(`stable:${event.id}`);
      if (event.id === "first") {
        queue.emit({ id: "second" });
      }
    });

    expect(() => queue.emit({ id: "first" })).not.toThrow();
    expect(() => queue.emit({ id: "third" })).not.toThrow();

    expect(reported).toEqual([firstError, secondError]);
    expect(calls).toEqual([
      "throwing:first",
      "stable:first",
      "throwing:second",
      "stable:second",
      "throwing:third",
      "stable:third",
    ]);

    const queueWithoutHook = new EventQueue<TestEvent>();
    queueWithoutHook.subscribe(() => {
      throw new Error("unreported");
    });
    expect(() => queueWithoutHook.emit({ id: "ignored" })).not.toThrow();
  });

  it("does not retain an event emitted without listeners", () => {
    const queue = new EventQueue<TestEvent>();
    const listener = vi.fn<(event: TestEvent) => void>();
    const ignored = { id: "ignored" };
    const delivered = { id: "delivered" };

    queue.emit(ignored);
    queue.subscribe(listener);
    queue.emit(delivered);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(delivered);
  });
});
