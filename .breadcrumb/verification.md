# Breadcrumb Verification

변경 범위에 맞춰 다음 검증을 수행한다.

- 모든 변경에서 diff를 검토하고 `git diff --check`를 실행한다.
- 문서만 변경했다면 Markdown 구조, 링크, 예시와 개발 명세의 일관성을 수동으로 확인한다.
- 코드, 테스트나 package 구성을 변경했다면 Node 24.20.0과 pnpm 11.23.0에서 `pnpm ci` 후 `pnpm run verify`를 실행한다.
- baseline test는 built public module의 정확한 runtime export와 import 전후 global key 불변성을 확인하되 placeholder factory를 실행하지 않는다.
- 패키지 구성이나 공개 API를 변경했다면 `pnpm run pack:check`를 독립 실행해 실제 tarball의 ESM import, declaration compile, internal subpath 차단과 file allowlist를 확인한다.
- CI를 변경했다면 pull request와 `main` push trigger, 최소 권한, immutable action SHA, 고정된 Node·pnpm 버전과 로컬 gate 실행 순서를 검토한다.
- 실행한 명령과 결과, 실행하지 못한 검증과 그 이유를 최종 보고에 기록한다.
