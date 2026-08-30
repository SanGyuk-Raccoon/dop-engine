export type DopPrimitive = null | boolean | number | string;

export type DopData =
  DopPrimitive | readonly DopData[] | { readonly [key: string]: DopData };

export type FreezePolicy = "always" | "never";

export interface ValidationIssue {
  readonly code: string;
  readonly message: string;
  readonly path?: readonly (string | number)[];
}

export type ValidationContext<T> =
  | { readonly phase: "initial" }
  | {
      readonly phase: "commit";
      readonly previous: T;
      readonly current: T;
      readonly merged: boolean;
    };

export type ValidationResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly issues: readonly [ValidationIssue, ...ValidationIssue[]];
    };

export type Validator<T> = (
  candidate: T,
  context: ValidationContext<T>,
) => ValidationResult;

export interface Conflict {
  readonly currentPath: readonly string[];
  readonly nextPath: readonly string[];
  readonly relation: "same" | "ancestor" | "descendant";
  readonly currentOperation: "add" | "replace" | "remove";
  readonly nextOperation: "add" | "replace" | "remove";
}

export interface CommittedResult<T> {
  readonly status: "committed";
  readonly data: T;
  readonly revision: number;
  readonly changed: boolean;
  readonly merged: boolean;
}

export interface ConflictResult<T> {
  readonly status: "conflict";
  readonly current: T;
  readonly revision: number;
  readonly conflicts: readonly [Conflict, ...Conflict[]];
}

export interface InvalidResult<T> {
  readonly status: "invalid";
  readonly current: T;
  readonly revision: number;
  readonly issues: readonly [ValidationIssue, ...ValidationIssue[]];
}

export type CommitResult<T> =
  CommittedResult<T> | ConflictResult<T> | InvalidResult<T>;

export interface CommitEvent<T> {
  readonly previous: T;
  readonly current: T;
  readonly revision: number;
  readonly merged: boolean;
}

export interface DopEngine<T> {
  get(): T;
  commit(previous: T, next: T): CommitResult<T>;
  update(calculation: (current: T) => T): CommitResult<T>;
  subscribe(listener: (event: CommitEvent<T>) => void): () => void;
}

export interface DopEngineOptions<T> {
  readonly initialData: T;
  readonly validate?: Validator<T>;
  readonly freeze?: FreezePolicy;
  readonly onListenerError?: (error: unknown) => void;
}
