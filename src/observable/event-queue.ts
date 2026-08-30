interface Subscription<Event> {
  readonly listener: (event: Event) => void;
}

export class EventQueue<Event> {
  readonly #subscriptions = new Set<Subscription<Event>>();
  readonly #events: Event[] = [];
  readonly #onListenerError: ((error: unknown) => void) | undefined;
  #dispatching = false;

  constructor(onListenerError?: (error: unknown) => void) {
    this.#onListenerError = onListenerError;
  }

  subscribe(listener: (event: Event) => void): () => void {
    const subscription = { listener };
    this.#subscriptions.add(subscription);

    return () => {
      this.#subscriptions.delete(subscription);
    };
  }

  emit(event: Event): void {
    this.#events.push(event);

    if (this.#dispatching) {
      return;
    }

    this.#dispatching = true;
    let head = 0;

    try {
      while (head < this.#events.length) {
        const current = this.#events[head] as Event;
        head += 1;
        const subscriptions = Array.from(this.#subscriptions);

        for (const subscription of subscriptions) {
          try {
            subscription.listener(current);
          } catch (error) {
            this.#reportListenerError(error);
          }
        }
      }
    } finally {
      this.#events.length = 0;
      this.#dispatching = false;
    }
  }

  #reportListenerError(error: unknown): void {
    if (this.#onListenerError === undefined) {
      return;
    }

    try {
      this.#onListenerError(error);
    } catch {
      // A reporting hook cannot change a completed commit or stop dispatch.
    }
  }
}
