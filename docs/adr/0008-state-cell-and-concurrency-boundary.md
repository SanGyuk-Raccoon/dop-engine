# ADR-008: State Cell and concurrency boundary

- Status: Accepted
- Date: 2026-08-29
- Classification: Engine ADR informed by `Atom.swap`

## Context

공식 책 source의 `Atom.swap`은 현재 값을 기준으로 update function을 적용하는 모델을 보여준다. JavaScript browser main thread에서 이 abstraction을 사용할 수 있지만 hardware CAS나 여러 process의 원자성을 주장할 근거는 없다.

## Decision

- State Cell의 유일한 변경 primitive는 `swap(update)`다. 별도 `replace` lifecycle을 정의하지 않는다.
- Coordinator는 swap callback의 actual current를 기준으로 reconcile, validation과 state transition을 결정한다.
- Failure와 no-op은 같은 `VersionedState`를 반환한다. State-changing commit만 data reference와 revision을 함께 교체한다.
- Public base identity는 data reference이고 numeric revision은 diagnostics와 subscription용 data version이다.
- v1 concurrency 보장은 browser main thread 또는 하나의 JS isolate로 제한한다.

## Consequences

- Await 동안 stale해진 base는 commit 시점의 current와 reconcile할 수 있다.
- Worker, thread, process, server instance와 DB 사이의 atomicity는 보장하지 않는다.
- 실제 atomic backend가 필요하면 별도 adapter와 검증 계약이 필요하다.
- DOP Engine을 shared-memory lock-free engine으로 홍보하지 않는다.
