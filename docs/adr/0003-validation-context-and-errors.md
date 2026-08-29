# ADR-003: Validation context and errors

- Status: Accepted
- Date: 2026-08-29
- Classification: Engine ADR informed by official examples

## Context

공식 예제는 original previous와 reconciliation 결과를 함께 검증하지만 initial data에는 previous가 없다. Candidate-only callback은 stale transition을 검증하는 데 필요한 정보를 잃고, 같은 값을 두 번 전달하는 방식은 initial과 no-op 의미를 모호하게 만든다.

## Decision

- Validator는 `candidate`와 `ValidationContext<T>`를 받는다.
- Context는 `{ phase: "initial" }` 또는 `{ phase: "commit", previous, current, merged }`다.
- Runtime data guard와 freeze를 application validator보다 먼저 실행한다.
- Initial invalid는 non-empty issues를 가진 `InitialDataValidationError`로 engine 생성을 중단한다.
- Commit invalid는 current data와 revision을 보존한 `status: "invalid"` result다.
- Validator throw는 `EngineExecutionError`로 감싸고 cause를 보존한다.
- Promise/thenable, malformed result, empty issues와 invalid issue field도 `EngineExecutionError`인 계약 위반이다.
- Validation은 동기식이며 reconciliation 이후 최종 candidate에 정확히 한 번 실행한다.
- `ValidationIssue`의 안정 field는 non-empty `code`, non-empty `message`, 선택적 string 또는 non-negative integer `path`다.

## Consequences

- Application은 initial invariant와 stale commit transition을 구분할 수 있다.
- Validator는 frozen candidate를 받으므로 검증 중 mutation을 시도할 수 없다.
- Revision은 validation context에서 제외되어 domain invariant가 engine diagnostics에 결합되지 않는다.
- Async 또는 외부 I/O validation은 application service가 commit 전에 처리해야 한다.
