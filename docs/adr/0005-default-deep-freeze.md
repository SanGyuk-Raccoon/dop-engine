# ADR-005: Default always deep freeze

- Status: Accepted
- Date: 2026-08-29
- Classification: Engine ADR supporting author canon

## Context

불변 데이터는 author canon이지만 JavaScript object는 기본적으로 mutable하다. Environment detection에 따른 development-only freeze는 production에서 가장 중요한 reference identity 계약을 약하게 만든다.

## Decision

- `FreezePolicy`는 `"always" | "never"`이며 기본값은 `"always"`다.
- Guard를 통과한 object와 array를 clone 없이 in-place deep freeze한다.
- Initial data는 guard와 freeze 후 validate한다. Commit 경계의 외부 `previous`, `next`, calculation result와 최종 candidate도 validate 전에 freeze한다.
- Engine이 전체 subtree를 순회한 object만 engine-owned `WeakSet`에 기록하고 이후 재순회를 생략한다.
- 외부에서 이미 `Object.isFrozen()`인 object도 children을 검사한다.
- Deep freeze 실패는 `EngineExecutionError`로 감싸며 state와 revision을 보존한다.
- `"never"`는 runtime enforcement만 끄며 immutable update 계약, guard, reconciliation과 validation을 끄지 않는다.

## Consequences

- 기본 경로는 production에서도 mutation을 조기에 실패시킨다.
- Invalid 또는 conflict 입력도 경계 처리 중 freeze될 수 있다.
- 큰 데이터에는 traversal 비용이 있지만 structural sharing과 subtree cache로 반복 비용을 줄인다.
- `"never"`에서 mutation으로 reference identity를 깨뜨린 결과는 보장하지 않는다.
