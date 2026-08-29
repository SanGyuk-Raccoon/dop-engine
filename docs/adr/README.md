# DOP Engine Architecture Decision Records

이 디렉터리는 저자 자료가 정의하지 않은 DOP Engine의 제품·플랫폼 결정을 기록한다. 공개 계약의 단일 기준은 [`ARCHITECTURE.md`](../../ARCHITECTURE.md)이며, ADR은 각 계약을 선택한 이유와 결과를 보존한다.

현재 Accepted 결정은 [M0 work issue #1](https://github.com/SanGyuk-Raccoon/dop-engine/issues/1)에서 확정했다.

## 근거 우선순위

1. Yehonathan Sharvit가 책 완성 후 정리한 2022년 DOP 원칙
2. 공식 책 source에서 확인되는 operational detail
3. 이 디렉터리의 engine ADR

코드와 데이터 분리, 범용 자료구조, 불변 데이터, 스키마와 표현의 분리는 author canon이다. 이 프로젝트가 다시 승인하거나 대체할 선택지가 아니므로 ADR로 만들지 않는다.

## Index

| ID | Decision | Status |
|----|----------|--------|
| [ADR-001](0001-platform-and-module-boundary.md) | TypeScript, browser-memory first, ESM-only | Accepted |
| [ADR-002](0002-runtime-generic-data-boundary.md) | Unconstrained generic과 runtime data boundary | Accepted |
| [ADR-003](0003-validation-context-and-errors.md) | Phase-aware synchronous validation | Accepted |
| [ADR-004](0004-commit-result-revision-and-events.md) | Result, no-op, revision과 event | Accepted |
| [ADR-005](0005-default-deep-freeze.md) | Default always deep freeze | Accepted |
| [ADR-006](0006-conservative-three-way-reconciliation.md) | Conservative three-way reconciliation | Accepted |
| [ADR-007](0007-atomic-arrays.md) | Arrays are atomic in v1 | Accepted |
| [ADR-008](0008-state-cell-and-concurrency-boundary.md) | State Cell swap와 concurrency boundary | Accepted |
| [ADR-009](0009-db-transaction-boundary.md) | DB transaction boundary | Accepted |
| [ADR-010](0010-package-identity-and-publication.md) | Scoped package와 private-to-MIT release | Accepted |
| [ADR-011](0011-deferred-optimizations.md) | Custom resolver와 Rust/WASM deferred | Accepted |

## 상태 규칙

- `Proposed`: 아직 구현 계약이 아니다.
- `Accepted`: `ARCHITECTURE.md`에 반영된 현재 계약이다.
- `Superseded`: 새 ADR이 대체했으며 기존 구현의 역사만 설명한다.

Accepted ADR을 바꾸려면 기존 파일을 소급 수정해 판단 근거를 지우지 않고, 대체 ADR과 migration 영향을 함께 기록한다.
