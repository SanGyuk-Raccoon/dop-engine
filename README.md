# DOP Engine

개인 프로젝트에서 재사용하기 위한 TypeScript ESM 라이브러리다. 브라우저 main thread의 immutable application data를 검증하고, stale update를 보수적으로 조정한 뒤 commit하고 구독자에게 알린다.

## 사용 범위

- 브라우저 main thread와 하나의 JavaScript isolate에서 사용하는 메모리 엔진이다.
- calculation과 validator는 동기 함수여야 한다. 비동기 작업은 `get()`으로 base를 보존한 뒤 `commit(previous, next)`으로 연결한다.
- Node.js에서는 테스트와 단일 프로세스 메모리 사용만 고려한다.
- DB transaction, 여러 Worker·프로세스 사이의 원자성, 범용 상태 관리 framework를 제공하지 않는다.
- `0.x` 버전은 개인 프로젝트에서 검증 중인 pre-1.0 API이므로 minor version에서도 공개 API가 바뀔 수 있다.

## 설치

```sh
pnpm add @sangyuk-raccoon/dop-engine@0.4.0
```

다른 package manager를 사용한다면 같은 package와 version을 dependency로 추가한다. Browser TypeScript 애플리케이션의 bundler는 package root ESM import를 resolve해야 한다.

## 기본 사용

```ts
import { createDopEngine } from "@sangyuk-raccoon/dop-engine";

interface State {
  readonly value: string;
  readonly saved: boolean;
}

const engine = createDopEngine<State>({
  initialData: { value: "initial", saved: true },
  validate: (candidate) =>
    candidate.value.length > 0
      ? { ok: true }
      : {
          ok: false,
          issues: [
            {
              code: "empty-value",
              message: "value는 비어 있을 수 없습니다.",
              path: ["value"],
            },
          ],
        },
});

const unsubscribe = engine.subscribe(({ current }) => {
  render(current);
});

const result = engine.update((current) => ({
  ...current,
  value: "next",
  saved: false,
}));

if (result.status === "invalid") {
  showValidation(result.issues);
}

unsubscribe();
```

기본 `freeze: "always"`는 지원되는 object와 array를 clone 없이 깊게 동결한다. `freeze: "never"`는 측정된 비용 때문에 runtime enforcement를 끌 때만 사용하며 mutation을 허용한다는 의미가 아니다.

## 비동기 stale update

`update()`에 async 함수를 전달하지 않는다. I/O 전에 읽은 reference를 `previous`로 보존하고, 응답으로 계산한 `next`를 명시적으로 commit한다.

```ts
const previous = engine.get();
const suggestion = await fetchSuggestion();
const next = applySuggestion(previous, suggestion);
const result = engine.commit(previous, next);

if (result.status === "conflict") {
  showConflict(result.conflicts);
}
```

현재 state가 그 사이 바뀌었더라도 변경 path가 독립적이면 병합하고, 같은 path나 ancestor/descendant가 겹치면 current state를 유지한 `conflict`를 반환한다.

## 개발

Node `24.20.0`과 pnpm `11.23.0`을 사용한다. 최초 실행이나 Playwright version 변경 뒤에는 version-matched Chromium headless shell을 준비한다.

```sh
pnpm ci
pnpm run browser:install
pnpm run verify
```

`pnpm run verify`는 lint, typecheck, build, unit/property test, tarball consumer와 실제 Chromium native ESM smoke를 실행한다. 개별 package boundary는 `pnpm run pack:check`, browser 동작은 `pnpm run browser:check`로 다시 확인할 수 있다.

아직 npm에 게시하지 않은 branch나 version을 다른 local project에서 시험하려면 build 후 tarball을 만든다.

```sh
pnpm run build
pnpm pack --pack-destination /tmp/dop-engine-package
```

출력된 `.tgz` 경로를 consumer project의 `pnpm add`에 전달한다.

## 라이선스

[MIT](LICENSE)
