# Breadcrumb Verification

변경 범위에 맞춰 다음 검증을 수행한다.

- 모든 변경에서 diff를 검토하고 `git diff --check`를 실행한다.
- 문서만 변경했다면 Markdown 구조, 링크, 예시와 개발 명세의 일관성을 수동으로 확인한다.
- `package.json`, `pnpm-lock.yaml`과 관련 스크립트가 준비된 뒤에는 고정된 의존성으로 설치하고 `pnpm ci`를 실행한다.
- 패키지 구성이나 공개 API를 변경했다면 `pnpm pack:check`와 독립 consumer 검증도 수행한다.
- 실행한 명령과 결과, 실행하지 못한 검증과 그 이유를 최종 보고에 기록한다.
