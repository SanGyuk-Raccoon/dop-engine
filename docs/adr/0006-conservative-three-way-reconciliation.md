# ADR-006: Conservative three-way reconciliation

- Status: Accepted
- Date: 2026-08-29
- Classification: Engine ADR informed by official examples

## Context

공식 예제는 previous/current/next의 변경 path를 비교해 independent change를 병합한다. Library contract에는 path ordering, ancestor 관계, 같은 결과를 쓰는 concurrent change와 domain-specific resolver 처리까지 명시해야 한다.

## Decision

- `Object.is(current, previous)`이면 next를 fast-forward candidate로 사용한다.
- Stale base에서는 previous→current와 previous→next의 semantic add/replace/remove change를 계산한다.
- Same, ancestor와 descendant path overlap은 conflict다. Independent object path만 자동 병합한다.
- 겹친 변경이 결과적으로 같은 값을 만들더라도 v1에서는 conflict다.
- Change ordering과 conflict diagnostics는 deterministic해야 한다.
- Root replacement는 다른 모든 overlapping change와 conflict다.
- Domain-specific custom resolver는 v1 public API에 넣지 않는다.

## Consequences

- 자동 merge 범위보다 silent overwrite 방지를 우선한다.
- 일부 안전하게 합칠 수 있는 domain change도 false conflict가 될 수 있다.
- Application은 conflict 후 최신 data로 재계산하거나 사용자에게 선택을 요청한다.
- Array 처리의 추가 제한은 [ADR-007](0007-atomic-arrays.md)이 정의한다.
