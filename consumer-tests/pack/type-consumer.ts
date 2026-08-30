import { createDopEngine } from "@sangyuk-raccoon/dop-engine";
import type { DopEngine, DopEngineOptions } from "@sangyuk-raccoon/dop-engine";
// @ts-expect-error Internal package subpaths are intentionally not exported.
import type { DopEngine as InternalDopEngine } from "@sangyuk-raccoon/dop-engine/api/types";

interface ConsumerState {
  readonly value: string;
}

const options: DopEngineOptions<ConsumerState> = {
  initialData: { value: "initial" },
};

const factory: (
  factoryOptions: DopEngineOptions<ConsumerState>,
) => DopEngine<ConsumerState> = createDopEngine;

void [options, factory];

type _InternalEngineMustRemainUnavailable = InternalDopEngine<ConsumerState>;
