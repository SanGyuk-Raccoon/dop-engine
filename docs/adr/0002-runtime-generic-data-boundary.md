# ADR-002: Runtime generic-data boundary

- Status: Accepted
- Date: 2026-08-29
- Classification: Engine ADR

## Context

저자의 범용 자료구조 원칙은 plain object, array와 primitive를 사용한다. 그러나 public generic에 `DopData` constraint를 두면 index signature가 없는 일반 TypeScript interface를 소비자 type으로 쓰기 어렵고, TypeScript만으로 finite number, descriptor, sparse array, prototype과 cycle을 판정할 수도 없다.

## Decision

- `DopEngine<T>`와 `createDopEngine<T>`의 public generic `T`에는 `DopData` constraint를 두지 않는다.
- `DopData`는 선택적인 helper와 내부 표현 type으로만 제공한다.
- Runtime guard를 지원 데이터 판정의 권위 있는 기준으로 사용한다.
- 허용 primitive는 `null`, boolean, string과 finite number다.
- 현재 realm의 plain object와 null-prototype record만 허용한다. Record own property는 enumerable string-keyed data property여야 한다.
- Array는 표준 `length`와 enumerable data index만 있고 hole, accessor index, symbol과 추가 own property가 없는 dense array만 허용한다.
- `undefined`, non-finite number, bigint, symbol, function, accessor, symbol key, class instance와 special native object를 거부한다.
- `__proto__`, `prototype`, `constructor` key와 cycle을 거부한다. 순환하지 않는 동일 subtree의 반복 reference는 허용한다.
- Guard는 `initialData`, 외부 `previous`와 `next`, calculation 결과 및 최종 candidate가 engine invariant에 들어가기 전에 실행한다.

## Consequences

- 일반 application interface와 optional property를 그대로 사용할 수 있다.
- 지원하지 않는 값은 compile error가 아니라 `DopDataError`로 판정될 수 있다.
- Cross-realm object는 현재 realm의 generic data로 먼저 정규화해야 한다.
- Guard가 전체 새 subtree를 검사하는 비용은 safety boundary의 일부다.
