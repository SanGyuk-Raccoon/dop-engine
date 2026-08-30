export interface VersionedState<T> {
  readonly data: T;
  readonly revision: number;
}

export interface StateCell<T> {
  get(): VersionedState<T>;
  swap(
    update: (current: VersionedState<T>) => VersionedState<T>,
  ): VersionedState<T>;
}

export class MemoryStateCell<T> implements StateCell<T> {
  #current: VersionedState<T>;

  constructor(initialData: T) {
    this.#current = { data: initialData, revision: 0 };
  }

  get(): VersionedState<T> {
    return this.#current;
  }

  swap(
    update: (current: VersionedState<T>) => VersionedState<T>,
  ): VersionedState<T> {
    const next = update(this.#current);
    this.#current = next;
    return next;
  }
}
