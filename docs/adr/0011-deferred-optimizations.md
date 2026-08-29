# ADR-011: Deferred optimizations and extension points

- Status: Accepted
- Date: 2026-08-29
- Classification: Engine ADR

## Context

Custom conflict resolver, keyed array merge, history, framework adapter와 Rust/WASM backend는 모두 유용할 수 있다. 그러나 실제 프로젝트에서 반복되지 않은 기능을 core에 넣으면 domain 의미, API surface와 경계 비용이 함께 커진다.

## Decision

- v1 core에는 custom resolver, keyed/index-aware array merge와 public internal subpath를 넣지 않는다.
- History/undo, framework, Worker, schema-library adapter는 core 밖의 후보로 유지한다.
- Rust/WASM backend는 TypeScript implementation의 benchmark에서 지속적인 병목이 확인되기 전까지 구현하지 않는다.
- 새 extension은 최소 두 프로젝트의 같은 요구 또는 기존 core로 해결할 수 없는 실제 장애가 있을 때만 승격한다.

## Consequences

- Core public surface와 safety reasoning이 작게 유지된다.
- 일부 application은 domain layer에서 normalization이나 adapter를 작성해야 한다.
- 최적화는 추측이 아니라 benchmark와 dogfood evidence를 요구한다.
