# ADR-004: Commit result, revision and events

- Status: Accepted
- Date: 2026-08-29
- Classification: Engine ADR

## Context

Conflict와 invalid는 호출자가 처리할 수 있는 예상 결과지만 unsupported data, callback 계약 위반과 internal failure는 정상 분기가 아니다. 동일 reference candidate를 commit했을 때 revision과 event를 증가시키면 실제 data version이 없는 phantom update가 생긴다.

## Decision

- `CommitResult<T>`는 `committed`, `conflict`, `invalid` discriminated union이다.
- `committed`에는 `changed`와 `merged`를 둔다.
- Initial revision은 `0`이다.
- `Object.is(candidate, current)`인 no-op은 `committed`, `changed: false`, 기존 data reference와 revision, `merged: false`를 반환한다.
- State-changing commit만 revision을 정확히 1 증가시키고 event를 발생시킨다.
- `merged: true`는 stale base의 non-empty next changes와 non-conflicting current changes가 실제 state-changing candidate에 함께 들어간 경우만 의미한다.
- Commit event의 `previous`는 호출자 base가 아니라 교체 직전 실제 current이고 `current`는 새 candidate다.
- No-op event가 없으므로 event에는 `changed` field를 두지 않는다.
- Listener와 `onListenerError` hook의 exception은 완료된 commit을 rollback하거나 이후 listener를 중단시키지 않으며 engine이 다시 throw하지 않는다.

## Consequences

- Consumer는 성공 여부와 실제 render 필요 여부를 별도로 판단할 수 있다.
- Conflict, invalid와 exception은 state와 revision을 보존한다.
- Revision은 data version diagnostics이며 호출 횟수 counter가 아니다.
- Result와 event 의미를 바꾸는 것은 public API breaking change다.
