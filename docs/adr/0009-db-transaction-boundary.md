# ADR-009: DB transaction boundary

- Status: Accepted
- Date: 2026-08-29
- Classification: Engine ADR informed by official DB examples

## Context

저자의 DB 예제는 JDBC 결과를 list of maps로 변환해 generic data calculation에 사용한다. 이는 database를 in-memory engine으로 대체한다는 뜻이 아니다. Prisma와 relational database가 source of truth인 서비스에 두 번째 global state를 만들면 consistency 문제가 커진다.

## Decision

- DOP Engine은 DB transaction, ORM, SQL generation과 persistence retry를 제공하지 않는다.
- DB-backed application은 필요한 context를 plain generic data로 읽고 pure calculation을 수행한 뒤 DB transaction으로 명시적 change를 저장한다.
- Server global state를 engine과 DB에 동시에 유지하지 않는다.
- Frontend browser state와 backend DB state는 각자 명시적인 boundary를 가진다.

## Consequences

- Domain calculation과 validator는 engine 없이 DB project에서도 재사용할 수 있다.
- DB conflict는 기본적으로 reload, recalculate와 transaction retry로 처리한다.
- 단순 CRUD backend에서는 full engine을 사용하지 않는 것이 정상적인 판단이다.
