# DOP Engine

개인 프로젝트에서 재사용하기 위한 private TypeScript ESM 라이브러리다. immutable data의 validation과 commit 경계를 제공하는 것을 목표로 한다.

현재 M0에서는 public type과 package 경계만 준비되어 있다. `createDopEngine`의 runtime 구현은 후속 작업 전까지 placeholder 오류를 던진다.

## 사용 범위

- 브라우저 메모리 기반 애플리케이션이 주 대상이다.
- Node.js에서는 테스트와 단일 프로세스 메모리 사용만 고려한다.
- 공개 npm 배포, 범용 프레임워크와 DB transaction 대체는 목표가 아니다.

```ts
import { createDopEngine } from "@sangyuk-raccoon/dop-engine";
import type { DopEngineOptions } from "@sangyuk-raccoon/dop-engine";

interface State {
  readonly value: string;
}

const options: DopEngineOptions<State> = {
  initialData: { value: "initial" },
};

const engine = createDopEngine(options);
```

## 개발

Node `24.20.0`과 pnpm `11.23.0`을 사용한다.

```sh
pnpm ci
pnpm run verify
```

개별 package boundary를 다시 확인하려면 `pnpm run pack:check`를 실행한다. tarball은 OS 임시 directory에서만 생성·설치되며 repository에는 남지 않는다.

이 저장소는 `UNLICENSED` private package이며 public registry에 게시하지 않는다.
