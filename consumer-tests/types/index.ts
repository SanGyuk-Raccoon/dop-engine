import {
  DopDataError,
  EngineExecutionError,
  EngineInvariantError,
  EngineUsageError,
  InitialDataValidationError,
  createDopEngine,
} from "@sangyuk-raccoon/dop-engine";
import type {
  CommitEvent,
  CommitResult,
  DopEngine,
  DopEngineOptions,
  ValidationContext,
  Validator,
} from "@sangyuk-raccoon/dop-engine";

interface TodoItem {
  readonly id: string;
  readonly title: string;
  readonly tags: readonly string[];
}

interface Board {
  readonly items: readonly TodoItem[];
}

interface Preferences {
  readonly density: "comfortable" | "compact";
  readonly accentColor?: string;
}

type Selection =
  | { readonly kind: "none" }
  | { readonly kind: "todo"; readonly id: string };

interface ApplicationState {
  readonly board: Board;
  readonly preferences?: Preferences;
  readonly selection: Selection;
}

const initialData: ApplicationState = {
  board: {
    items: [
      {
        id: "todo-1",
        title: "Validate the package surface",
        tags: ["types", "public-api"],
      },
    ],
  },
  selection: { kind: "none" },
};

const validator: Validator<ApplicationState> = (candidate, context) => {
  const selectedId =
    candidate.selection.kind === "todo" ? candidate.selection.id : undefined;

  if (context.phase === "commit") {
    const previous: ApplicationState = context.previous;
    const current: ApplicationState = context.current;
    const merged: boolean = context.merged;
    void [previous, current, merged];
  }

  if (selectedId === "") {
    return {
      ok: false,
      issues: [
        {
          code: "selection.empty-id",
          message: "A selected todo must have an id.",
          path: ["selection", "id"],
        },
      ],
    };
  }

  return { ok: true };
};

const options: DopEngineOptions<ApplicationState> = {
  initialData,
  validate: validator,
  freeze: "always",
};

const factory: (
  factoryOptions: DopEngineOptions<ApplicationState>,
) => DopEngine<ApplicationState> = createDopEngine;

declare const engine: DopEngine<ApplicationState>;
declare const result: CommitResult<ApplicationState>;
declare const context: ValidationContext<ApplicationState>;

if (result.status === "committed") {
  const changed: boolean = result.changed;
  const data: ApplicationState = result.data;
  void [changed, data];
} else if (result.status === "conflict") {
  const firstConflict = result.conflicts[0];
  const relation: "same" | "ancestor" | "descendant" =
    firstConflict.relation;
  void relation;
} else {
  const firstIssue = result.issues[0];
  const code: string = firstIssue.code;
  void code;
}

if (context.phase === "commit") {
  const current: ApplicationState = context.current;
  void current;
}

const unsubscribe: () => void = engine.subscribe(
  (event: CommitEvent<ApplicationState>) => {
    const revision: number = event.revision;
    void revision;
  },
);

const validationError = new InitialDataValidationError([
  { code: "initial.invalid", message: "Initial data is invalid." },
]);
const executionError = new EngineExecutionError("Validator failed.", {
  cause: new Error("cause"),
});
const preservedCause: unknown = executionError.cause;
const errorValues: readonly Error[] = [
  new DopDataError(),
  validationError,
  new EngineUsageError(),
  executionError,
  new EngineInvariantError(),
];

void [options, factory, unsubscribe, preservedCause, errorValues];

// @ts-expect-error Internal package subpaths are intentionally not exported.
type InternalEngine = import("@sangyuk-raccoon/dop-engine/api/types").DopEngine<ApplicationState>;

type _InternalEngineMustRemainUnavailable = InternalEngine;
