# ADR-010: Package identity and publication

- Status: Accepted
- Date: 2026-08-29
- Classification: Engine ADR

## Context

Unscoped `dop-engine`은 npm에서 다른 package가 사용한다. 소유한 npm user scope는 `@sangyuk-raccoon`이며, 개발 중인 API를 accidental publish하거나 공개 전 source에 사용 권한을 부여해서는 안 된다.

## Decision

- Package name과 import specifier는 `@sangyuk-raccoon/dop-engine`이다. Unscoped alias는 제공하지 않는다.
- Registry는 `https://registry.npmjs.org/`이고 package는 ESM-only다.
- Private development 동안 repository는 private이고 `package.json`은 `"private": true`, `"license": "UNLICENSED"`다.
- 개발 중에는 npm public/private package를 게시하지 않고 local workspace와 tarball로 검증한다.
- M0 완료나 tag 생성은 publish 승인이 아니다.
- 별도 public release 승인 시 MIT License 전문과 `SanGyuk-Raccoon` 표기를 추가하고 `license`를 `"MIT"`로 바꾼다.
- Public release에서는 private guard를 제거하고 npm registry와 public access를 `publishConfig`에 고정한 뒤 trusted publishing을 사용한다.

## Consequences

- 이름 충돌과 accidental publish를 방지한다.
- Private npm plan에 의존하지 않는다.
- Public release는 repository visibility, license, tarball allowlist와 provenance를 함께 검토해야 한다.
- 공개 전 package consumer 검증은 registry install이 아니라 실제 local tarball install로 수행한다.
