# ADR-001: Platform and module boundary

- Status: Accepted
- Date: 2026-08-29
- Classification: Engine ADR

## Context

DOP 원칙은 특정 언어, UI framework나 module system을 지정하지 않는다. 이 프로젝트는 browser-memory 애플리케이션에서 반복되는 state commit을 우선 해결하면서 Node.js 기반 테스트와 도구에서도 같은 package를 사용해야 한다.

## Decision

- TypeScript strict mode를 구현 언어와 공개 type surface로 사용한다.
- Browser main thread를 primary runtime, modern Node.js의 단일 process를 secondary runtime으로 지원한다.
- Package는 ESM만 제공한다. CommonJS dual package와 framework adapter는 v1 core 범위에서 제외한다.
- Core는 React, Vue, Svelte, Prisma, Zod와 Ajv에 의존하지 않는다.

## Consequences

- 일반 TypeScript application data와 별도 변환 계층 없이 통합할 수 있다.
- declaration, ESM consumer와 실제 browser smoke test가 release gate에 포함된다.
- CommonJS 전용 소비자는 별도 호환 계층을 사용해야 한다.
- shared-memory multi-thread와 DB transaction 보장은 이 플랫폼 결정으로부터 도출되지 않는다.
