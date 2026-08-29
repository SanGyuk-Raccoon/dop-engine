# ADR-007: Arrays are atomic in v1

- Status: Accepted
- Date: 2026-08-29
- Classification: Engine ADR informed by an official-example gap

## Context

범용 자료구조로 array를 허용하는 것은 author canon과 일치한다. 공식 diff 예제는 index를 순회하지만 concurrent insert, delete와 reorder에서 element identity를 정의하지 않는다. Index merge를 일반화하면 서로 다른 logical item을 같은 위치에 덮어쓸 수 있다.

## Decision

- Diff와 reconciliation에서 array 전체를 atomic leaf로 취급한다.
- 같은 reference array는 no change이고 다른 reference는 깊은 값과 관계없이 전체 `replace`다.
- `Change.path`에는 object key만 포함하고 array index change를 만들지 않는다.
- Object property의 array change는 해당 property path의 `replace` operation이다.
- Current와 next가 같은 array path를 바꾸면 서로 다른 index를 의도했어도 conflict다.
- Array path와 sibling object path는 merge할 수 있다.
- Parent replacement/removal과 descendant array 변경, 양쪽 root array 변경은 conflict다.
- Item 단위 merge가 필요한 application은 entity를 `byId` object로 정규화한다.

## Consequences

- Reorder와 index 이동에서 silent overwrite를 막는다.
- Array가 큰 경우 작은 item 변경도 전체 replacement로 진단된다.
- Key extractor와 index-aware merge는 반복 수요가 확인되기 전에는 core에 추가하지 않는다.
