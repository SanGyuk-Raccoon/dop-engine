---
document: DOP Engine 개발 명세서
status: accepted
target_version: v1.0-personal
primary_environment: browser-memory web applications
language: TypeScript
module_system: ESM
audience:
  - AI coding agents
  - maintainer
source_of_truth: true
last_updated: 2026-08-29
---

# DOP Engine 개발 명세서

*Yehonathan Sharvit의 DOP 방향을 바탕으로 한 개인용 안정 버전*

> [!IMPORTANT] **AI Agent 읽기 지침**
> 이 문서를 구현 계약의 source of truth로 취급한다. DOP 자체에 관한 해석은 **2022년 저자 원칙 → 공식 책 source → 엔진 ADR** 순서로 확인한다. 구현 판단이 충돌하면 이 근거 순위 안에서 **비목표 → Safety invariant → ADR → milestone 완료 기준**을 적용한다. P2 기능은 문서의 승격 조건을 충족하기 전에는 구현하지 않는다.

| **문서 상태** | Accepted · 구현 기준 문서                   |
|---------------|---------------------------------------------|
| **목표 버전** | v1.0-personal                               |
| **주요 대상** | 브라우저 메모리 기반 웹 애플리케이션        |
| **보조 대상** | Node.js 및 DB 기반 프로젝트의 DOP 적용 경계 |
| **구현 언어** | TypeScript · ESM                            |
| **최종 갱신** | 2026-08-29                                  |

**핵심 정의**

> **도메인 코드가 계산한 immutable한 다음 데이터 버전을 검증하고, 현재 상태와 조정한 뒤 안전하게 commit하는 작은 consistency engine.**

> [!NOTE] **문서 해석 기준**
> 이 문서는 저자의 네 가지 원칙과 공개 예제 코드를 근거로 한다. 저자는 완성된 범용 엔진 API를 공식 명세로 제시하지 않았으므로, API·오류 모델·배포 방식 등은 저자의 방향을 보존하기 위한 설계 결정으로 구분해 표기한다.

**요약 결정**

- Browser-memory first, TypeScript first
- unconstrained consumer generic과 runtime generic-data guard 사용
- previous / current / next 기반의 보수적 three-way reconciliation
- 기본 deep freeze, no-op revision/event 억제
- DB transaction·ORM·도메인 규칙은 엔진 밖에 유지
- 배열은 v1에서 atomic value로 취급
- npm package는 `@sangyuk-raccoon/dop-engine`으로 고정
- 개인 프로젝트 2개 이상에서 검증한 뒤 v1.0-personal 고정

# 목차
1. 문서 목적과 설계 전제
2. 목표·비목표·성공 기준
3. 대상 환경과 적용 경계
4. Top-level Architecture
5. 핵심 공개 인터페이스
6. 데이터 계약과 불변성
7. Commit lifecycle
8. Consistency와 reconciliation 규칙
9. Validation 모델
10. State Cell과 동시성 범위
11. 오류·진단·이벤트 모델
12. 사용하는 프로젝트의 개발 방식
13. DB·Prisma 프로젝트에서의 적용
14. 저장소와 개발 환경
15. 테스트 전략
16. 성능·안정성·보안 기준
17. 구현 로드맵
18. 개인용 안정 버전 승인 기준
19. 리스크와 대응
20. Architecture Decision Records
21. 구현 작업 목록
22. 참고 자료

# 1. 문서 목적과 설계 전제
## 1.1 목적
이 문서는 DOP Engine을 개인 프로젝트에서 반복 사용할 수 있는 안정적인 TypeScript 라이브러리로 구현하기 위한 기준 문서다. 구현 세부를 변경하더라도 엔진의 책임, 데이터 계약, commit 의미, 테스트 불변식과 배포 기준은 이 문서를 우선한다.

주요 목적은 애플리케이션마다 반복되는 immutable state commit, validation lifecycle, optimistic conflict detection, three-way reconciliation을 한 번 구현하고 재사용하는 것이다. 도메인 계산 자체는 애플리케이션에 남긴다.

## 1.2 저자의 방향에서 가져온 핵심
| **분류**         | **근거**                               | **엔진 설계에 반영하는 의미**                                                      |
|------------------|----------------------------------------|------------------------------------------------------------------------------------|
| Author canon     | 코드와 데이터 분리 [S1][S2]           | 도메인 계산은 엔진 밖의 함수이며 엔진은 데이터의 의미를 모른다.                    |
| Author canon     | 범용 자료구조 [S1]                     | 엔진은 plain object·array·primitive 형태의 generic data만 다룬다.                  |
| Author canon     | 데이터 불변성 [S1]                     | 현재 버전을 가리키는 reference만 변경되고 데이터 자체는 수정하지 않는다.           |
| Author canon     | 스키마와 표현 분리 [S1]                | 엔진은 schema를 소유하지 않고 validator를 주입받는다.                              |
| Official example | SystemState commit [S3]                | 도메인 calculation과 공통 commit을 분리한다.                                       |
| Official example | three-way reconciliation [S4]          | previous/current/next의 변경 경로를 비교해 fast-forward·merge·conflict를 결정한다. |
| Official example | Atom.swap [S5]                         | 상태 변경은 swap abstraction 안에서 계산한다.                                      |
| Official example | JDBC 결과를 list of maps로 변환 [S6]   | DB를 대체하지 않고, DB boundary에서 generic data로 변환해 DOP 계산에 사용한다.     |

> [!IMPORTANT] **근거 우선순위**
> 저자가 책 완성 후 다시 정리한 2022년 원칙 [S1]을 DOP 정의의 최상위 근거로 사용한다. 공식 책 source [S3]~[S6]는 원칙에 없는 operational detail을 보완한다. 두 근거가 정의하지 않은 TypeScript API, 오류, freeze, 배열 merge, package와 배포 방식만 이 저장소의 ADR로 결정한다. 예제의 교육용 단순화를 보편적인 DOP 원칙으로 확장하지 않는다.

> [!NOTE] **설계 판단**
> 저자의 예제는 책의 개념을 단계적으로 설명하기 위한 코드다. 본 문서는 이를 실제 라이브러리로 만들기 위해 Result 기반 오류 처리, 기본 deep freeze, conflict diagnostics, ESM 패키징 등을 추가한다. 이러한 항목은 저자의 공식 API가 아니라 구현 안정성을 위한 결정이며 20장의 개별 ADR에서 추적한다.

## 1.3 용어
| **용어**        | **정의**                                                                                                |
|-----------------|---------------------------------------------------------------------------------------------------------|
| Data            | 엔진이 보관하거나 계산에 전달하는 JSON-compatible immutable 값.                                         |
| previous        | 도메인 계산을 시작할 때 읽은 데이터 버전.                                                               |
| current         | commit 시점에 엔진이 실제로 보유한 최신 데이터 버전.                                                    |
| next            | 도메인 calculation이 previous를 기준으로 만든 다음 버전.                                                |
| candidate       | current와 next를 reconcile한 뒤 validation 대상으로 삼는 최종 후보.                                     |
| commit          | candidate가 유효할 때 current reference를 candidate로 교체하는 작업.                                    |
| conflict        | 두 concurrent 변경의 path가 겹쳐 자동 병합을 중단한 결과.                                               |
| personal stable | 개인 프로젝트에서 반복 사용할 수 있도록 API·테스트·배포가 안정된 상태. 범용 OSS 호환성은 목표가 아니다. |

# 2. 목표·비목표·성공 기준
## 2.1 개발 목표
- 도메인과 무관한 immutable data commit kernel을 제공한다.
- 동시 변경이 없으면 fast-forward하고, 독립 변경은 병합하며, 애매한 변경은 안전하게 conflict로 중단한다.
- 최종 candidate가 application invariant를 만족할 때만 commit한다.
- 브라우저 웹 프로젝트에서 별도 서버 없이 npm dependency로 재사용한다.
- 같은 도메인 계산을 엔진 없이도 DB 기반 프로젝트에서 재사용할 수 있도록 경계를 유지한다.
- 핵심 모듈은 runtime dependency가 없거나 최소화된 상태로 유지한다.

## 2.2 명시적 비목표
| **비목표**                                    | **제외 이유**                                                                       |
|-----------------------------------------------|-------------------------------------------------------------------------------------|
| DB transaction·ORM·SQL 생성                   | DB가 source of truth인 환경에서는 Prisma와 DB가 담당한다.                           |
| 도메인 schema·business rule                   | 엔진이 도메인 의미를 알게 되는 것을 방지한다.                                       |
| query language·rule engine·workflow           | 범용 application framework로 팽창하는 것을 방지한다.                                |
| event sourcing·CQRS·audit log                 | 별도 아키텍처 선택이며 DOP 핵심 commit과 동일하지 않다.                             |
| React·Vue·Svelte 종속성                       | core를 framework-agnostic으로 유지한다.                                             |
| 분산 시스템 consensus                         | 프로세스 간 consistency는 DB·메시지 시스템 등의 책임이다.                           |
| 공유 메모리 다중 스레드의 실제 lock-free 보장 | v1은 browser main thread와 단일 JS isolate를 대상으로 한다.                         |
| 배열의 key-aware 자동 병합                    | index 이동·삭제·재정렬 의미가 도메인 의존적이므로 v1에서는 atomic value로 취급한다. |

## 2.3 성공 기준
- [ ] 동일 패키지를 서로 다른 browser-memory 웹앱 2개 이상에서 프로젝트별 분기 없이 사용한다.
- [ ] 두 번의 연속적인 실제 앱 통합에서 core public API를 변경하지 않는다.
- [ ] conflict·invalid·exception에서는 state와 revision이 절대 변경되지 않는다.
- [ ] no-op은 기존 reference와 revision을 유지하고 event를 발생시키지 않는다.
- [ ] reconciliation property test에서 silent overwrite가 발생하지 않는다.
- [ ] npm pack 결과를 독립 consumer fixture가 ESM과 TypeScript type declaration으로 정상 사용한다.
- [ ] critical modules(commit, diff, reconciliation)의 branch coverage가 90% 이상이다.
- [ ] DB 프로젝트에서는 global in-memory engine을 source of truth로 두지 않는 사용 가이드를 검증한다.
- [ ] P0/P1로 분류된 알려진 결함이 없는 상태에서 v1.0-personal을 태그한다.

# 3. 대상 환경과 적용 경계
## 3.1 우선순위
| **환경**                    | **지원 수준**      | **엔진의 역할**                                                     |
|-----------------------------|--------------------|---------------------------------------------------------------------|
| Browser main thread         | Primary            | application state, validation, reconciliation, commit, subscription |
| Modern Node.js              | Secondary          | 단일 프로세스 in-memory 상태 또는 테스트·CLI                        |
| Web Worker / worker_threads | Deferred           | 메시지 기반 사용은 가능하나 shared-object atomicity는 보장하지 않음 |
| Prisma + relational DB      | Boundary guidance  | DB가 state/transaction을 담당하고 DOP 계산만 재사용                 |
| Rust/WASM                   | Not planned for v1 | 실측 병목이 확인될 때만 diff/reconcile backend 후보                 |

## 3.2 사용하기 좋은 프로젝트
- 실험 설계기, 폼 빌더, 설정 편집기, 스케줄 편집기처럼 하나의 작업 상태를 반복 수정하는 앱
- preview, apply/cancel, undo 후보와 같은 immutable version의 장점을 활용하는 앱
- async 결과가 오래된 base data를 기준으로 도착할 수 있는 browser app
- 여러 하위 데이터가 하나의 system invariant를 함께 만족해야 하는 local-first 도구

## 3.3 사용하지 않는 편이 좋은 프로젝트
- API 요청을 거의 그대로 Prisma CRUD로 전달하는 단순 DB 서비스
- DB가 유일한 state이며 request마다 작은 context만 읽고 즉시 transaction으로 저장하는 서버
- 대규모 컬렉션을 전부 메모리에 올려야 하는 데이터 플랫폼
- 실시간 협업처럼 operation transformation, CRDT 또는 분산 consensus가 필요한 시스템

# 4. Top-level Architecture
## 4.1 시스템 컨텍스트
*그림 1. DOP Engine의 책임 경계*

```text
┌─────────────────────────────────────────────────────┐
│ Application │
│ │
│ domain data · schema · calculation · business rule │
└───────────────────────┬─────────────────────────────┘
│ previous / next
▼
┌─────────────────────────────────────────────────────┐
│ DOP Engine │
│ │
│ Commit Coordinator │
│ ├─ State Cell │
│ ├─ Consistency (diff / reconcile / conflict) │
│ ├─ Validation Port │
│ └─ Notification │
└───────────────────────┬─────────────────────────────┘
│ committed immutable data
▼
Browser / Node memory
DB-backed application:
Database ⇄ Prisma ⇄ generic data ⇄ domain calculation
(DOP Engine은 DB commit을 대체하지 않음)
```

## 4.2 핵심 컴포넌트
| **컴포넌트**       | **책임**                                                      | **상태 보유**        |
|--------------------|---------------------------------------------------------------|----------------------|
| Commit Coordinator | commit pipeline을 조합하고 결과를 반환한다.                   | 없음                 |
| State Cell         | 현재 versioned state를 보유하고 교체한다.                     | 있음                 |
| Consistency        | diff, path overlap, fast-forward, three-way merge를 수행한다. | 없음                 |
| Validation Port    | application validator를 실행하고 결과를 표준화한다.           | 없음                 |
| Notification       | 성공한 commit 이후 listener에 event를 전달한다.               | listener 목록만 보유 |
| Diagnostics        | revision, merged 여부, conflict paths, error code를 구성한다. | 없음                 |

## 4.3 Dependency rule
```text
application/domain ───────────────▶ engine public API
engine/commit ───────────────▶ state, consistency, validation
consistency ───────────────▶ data/path utilities
state ───────────────▶ data types only
validation ───────────────▶ validation types only
금지:
engine core ─X─▶ React / Prisma / Zod / Ajv / domain code
```

> [!IMPORTANT] **핵심 규칙**
> 의존성 방향은 항상 application → engine이다. 엔진 내부에서 application callback을 호출할 수는 있지만, 엔진이 application type이나 특정 schema library를 import하지 않는다.

# 5. 핵심 공개 인터페이스
## 5.1 목표 API
*코드 1. v1.0-personal public surface*

```ts
export interface DopEngine<T> {
  get(): T;
  commit(previous: T, next: T): CommitResult<T>;
  update(calculation: (current: T) => T): CommitResult<T>;
  subscribe(listener: (event: CommitEvent<T>) => void): () => void;
}
```

절대 핵심은 `get()`과 `commit(previous, next)`다. `update()`는 “현재 데이터를 읽고 순수 calculation을 실행한 뒤 commit”하는 편의 API이며, `subscribe()`는 browser integration을 위한 최소 기능이다. 공개 generic `T`에는 `DopData` bound를 두지 않는다. 지원 데이터 여부는 모든 engine boundary의 runtime guard가 최종 판정한다 ([ADR-002](docs/adr/0002-runtime-generic-data-boundary.md)).

## 5.2 Factory
```ts
export type FreezePolicy = "always" | "never";

export interface DopEngineOptions<T> {
  readonly initialData: T;
  readonly validate?: Validator<T>;
  readonly freeze?: FreezePolicy;
  readonly onListenerError?: (error: unknown) => void;
}

export function createDopEngine<T>(
  options: DopEngineOptions<T>,
): DopEngine<T>;
```

`freeze`의 기본값은 `"always"`다. `"never"`는 측정된 비용이 있을 때만 선택하는 runtime enforcement opt-out이며 mutation을 허용하는 의미가 아니다 ([ADR-005](docs/adr/0005-default-deep-freeze.md)).

## 5.3 결과 모델
```ts
export type CommitResult<T> =
  | CommittedResult<T>
  | ConflictResult<T>
  | InvalidResult<T>;

export interface CommittedResult<T> {
  readonly status: "committed";
  readonly data: T;
  readonly revision: number;
  readonly changed: boolean;
  readonly merged: boolean;
}

export interface ConflictResult<T> {
  readonly status: "conflict";
  readonly current: T;
  readonly revision: number;
  readonly conflicts: readonly [Conflict, ...Conflict[]];
}

export interface InvalidResult<T> {
  readonly status: "invalid";
  readonly current: T;
  readonly revision: number;
  readonly issues: readonly [ValidationIssue, ...ValidationIssue[]];
}
```

Conflict와 validation failure는 예상 가능한 결과이므로 exception이 아니라 discriminated union으로 반환한다. `committed`는 호출 성공을 나타내며 `changed`가 실제 data version 변경 여부를 나타낸다. 잘못된 API 사용, 지원하지 않는 데이터, validator 계약 위반과 내부 invariant 위반은 exception으로 처리한다 ([ADR-003](docs/adr/0003-validation-context-and-errors.md), [ADR-004](docs/adr/0004-commit-result-revision-and-events.md)).

## 5.4 기본 사용 예시
```ts
type AppData = {
  readonly reservations: Readonly<Record<string, Reservation>>;
};

const engine = createDopEngine<AppData>({
  initialData: { reservations: {} },
  validate: validateAppData,
});

const previous = engine.get();
const next = addReservation(previous, command);
const result = engine.commit(previous, next);

if (result.status === "committed" && result.changed) {
  render(result.data);
}
```

## 5.5 API 사용 규칙
- `get()`은 clone이 아니라 현재 immutable data reference를 반환하며 state-changing commit 전까지 같은 reference를 유지한다.
- calculation은 동기 함수여야 하며 Promise를 반환하지 않는다.
- calculation과 validator는 엔진 API를 재호출하지 않는다. 재진입은 usage error로 처리한다.
- calculation은 외부 I/O, logging, random ID 생성 같은 side effect를 수행하지 않는다.
- ID·시간·외부 응답은 command나 context에 명시적으로 넣어 전달한다.
- commit 이전에 previous를 mutation해서는 안 된다.
- `initialData`, 외부 `previous`와 `next`, calculation 결과 및 최종 candidate는 runtime data guard를 통과해야 한다.
- 결과가 conflict 또는 invalid면 application이 최신 데이터를 읽고 사용자 피드백·재계산 여부를 결정한다.

# 6. 데이터 계약과 불변성
## 6.1 지원 데이터
```ts
export type DopPrimitive = null | boolean | number | string;
export type DopData =
  | DopPrimitive
  | readonly DopData[]
  | { readonly [key: string]: DopData };
```

`DopData`는 명시적인 generic data를 작성할 때 선택적으로 사용하는 helper type이며 public API의 generic constraint가 아니다. TypeScript type만으로 prototype, descriptor, finite number, sparse array와 cycle을 판정할 수 없으므로 runtime guard가 권위 있는 경계다 ([ADR-002](docs/adr/0002-runtime-generic-data-boundary.md)).

| **범주**  | **허용**                                                          | **거부**                                                                       |
|-----------|-------------------------------------------------------------------|--------------------------------------------------------------------------------|
| Primitive | `null`, boolean, string, finite number                             | `undefined`, `NaN`, `Infinity`, bigint, symbol, function                       |
| Object    | 현재 realm의 plain object 또는 null-prototype record              | class instance, `Date`, `Map`, `Set`, `RegExp`, `Promise`, DOM object           |
| Record property | enumerable string-keyed own data property                  | accessor, custom non-enumerable property, symbol key                           |
| Array     | 표준 `length`와 enumerable index만 가진 dense array                 | sparse array, accessor index, symbol 또는 custom property가 있는 array          |
| Graph     | acyclic data, 순환하지 않는 동일 immutable subtree의 반복 reference | direct 또는 indirect cycle                                                     |
| Key       | 일반 application key                                              | `__proto__`, `prototype`, `constructor`                                         |

- optional property 자체가 없는 것은 허용하지만, 존재하는 property의 값이 `undefined`이면 거부한다.
- cross-realm object는 현재 realm의 generic data로 먼저 정규화해야 한다.
- guard는 engine invariant에 값이 들어오기 전에 전체 subtree를 검사하며 오류에 application data 전체를 포함하지 않는다.
- 지원하지 않는 값은 application validation issue가 아니라 `DopDataError`다.

## 6.2 불변성 정책
- 엔진은 deep clone을 수행하지 않는다. 구조 공유를 유지하기 위해 application이 새 version을 반환한다.
- 동일 reference는 동일 version의 fast path로 사용한다.
- 기본 `freeze: "always"`는 initial data, 외부 `previous`와 `next`, calculation 결과 및 최종 candidate를 validation 전에 in-place deep freeze한다.
- `freeze: "never"`는 명시적인 opt-out이다. runtime data guard, reconciliation과 validation은 그대로 실행한다.
- engine이 전체 subtree를 순회해 freeze한 object만 engine-owned `WeakSet`에 기록하며 structural sharing 시 재순회를 생략한다.
- 단순히 `Object.isFrozen()`인 외부 object는 깊이 동결되었다고 신뢰하지 않고 children을 확인한다.
- invalid, conflict 또는 exception으로 commit되지 않은 입력도 engine boundary를 통과하는 동안 이미 freeze될 수 있다.
- 엔진은 성공한 commit의 current data만 보유하고 history를 자동 보관하지 않는다.

> [!IMPORTANT] **중요한 한계**
> TypeScript의 readonly는 compile-time 보조다. `freeze: "never"`에서도 application은 새 version을 만들어야 한다. 직접 mutation으로 reference identity가 깨진 경우 diff와 no-op 결과는 보장하지 않으며, deep freeze는 persistent data structure나 copy-on-write를 제공하지 않는다 ([ADR-005](docs/adr/0005-default-deep-freeze.md)).

## 6.3 구조 공유 권장 형태
```ts
function renameUser(data: AppData, userId: string, name: string): AppData {
return {
...data,
usersById: {
...data.usersById,
[userId]: {
...data.usersById[userId],
name,
},
},
};
}
// 변경되지 않은 branches는 기존 reference를 유지한다.
```

# 7. Commit lifecycle
## 7.1 표준 흐름
```text
Application:
  previous = engine.get()
  next = calculate(previous, command)
  result = engine.commit(previous, next)

Engine:
  guardAndFreeze(previous, next)
  stateCell.swap(currentState => {
    candidate = reconcile(currentState.data, previous, next)
    guardAndFreeze(candidate)
    validate(candidate, commitContext)
    if Object.is(candidate, currentState.data): keep currentState
    else: return { data: candidate, revision: currentState.revision + 1 }
  })
  notify only after a state-changing commit
```

Engine 생성 시에는 `initialData`를 guard·freeze한 뒤 `{ phase: "initial" }` context로 검증하고 revision `0`의 State Cell을 만든다. commit validation은 reconciliation 이후의 최종 candidate에 정확히 한 번 실행한다 ([ADR-003](docs/adr/0003-validation-context-and-errors.md), [ADR-008](docs/adr/0008-state-cell-and-concurrency-boundary.md)).

## 7.2 상세 순서
| **단계** | **동작**             | **보장**                                                                                       |
|----------|----------------------|------------------------------------------------------------------------------------------------|
| 1        | 입력 guard/freeze    | 외부 `previous`와 `next`를 지원 data contract로 검사하고 선택한 정책에 따라 freeze한다.         |
| 2        | 현재 상태 읽기       | `StateCell.swap` 안에서 실제 `current`와 revision을 읽는다.                                    |
| 3        | Reconcile            | `Object.is(current, previous)`이면 `next`, 아니면 보수적 three-way reconciliation 결과를 쓴다. |
| 4        | Candidate guard/freeze | 최종 candidate가 engine invariant를 만족하도록 검사하고 freeze한다.                           |
| 5        | 최종 validation      | candidate와 phase가 명확한 context를 application validator에 정확히 한 번 전달한다.            |
| 6        | No-op 판정           | `Object.is(candidate, current)`이면 state, revision과 event를 그대로 유지한다.                  |
| 7        | Commit               | 실제 변경이면 `swap`이 data를 교체하고 revision을 정확히 1 증가시킨다.                          |
| 8        | Notification         | state-changing commit이 끝난 뒤 event queue를 통해 listener를 호출한다.                         |
| 9        | Result               | committed/conflict/invalid 중 하나를 반환한다.                                                  |

## 7.3 실패 시 불변식
> [!IMPORTANT] **Safety invariant**
> conflict, invalid, validator exception, calculation usage error, unsupported data와 internal error 중 어떤 실패가 발생해도 current data와 revision은 변경되지 않는다. no-op은 실패가 아니지만 동일하게 state를 교체하거나 revision을 증가시키지 않는다.

### No-op, revision과 event

- engine 생성 직후 revision은 `0`이다.
- no-op은 `status: "committed"`, `changed: false`, 기존 `data` reference와 기존 revision을 반환한다.
- 실제 변경은 `changed: true`이며 revision이 정확히 1 증가한다.
- stale base를 reconcile했지만 적용할 next-side change가 없으면 no-op이고 `merged: false`다.
- `merged: true`는 stale base의 non-empty next changes를 non-conflicting current changes와 실제로 결합해 state-changing commit을 만든 경우만 의미한다.
- no-op에는 `CommitEvent`가 없으며 `StateCell`의 data도 교체하지 않는다 ([ADR-004](docs/adr/0004-commit-result-revision-and-events.md)).

## 7.4 update() 의미
```text
update(calculation):
  assert not reentrant
  previous = get()
  next = calculation(previous)
  guard calculation result
  return commit(previous, next)
```

Browser main thread의 동기 calculation은 run-to-completion이므로 일반적으로 stale base가 생기지 않는다. `update()`는 가장 단순한 상태 변경 경로이며 같은 reference를 반환하면 commit과 같은 no-op 규칙을 적용한다. async 작업은 `get()`과 `commit()`을 분리해 사용한다.

# 8. Consistency와 reconciliation 규칙
## 8.1 기본 알고리즘
```text
reconcile(current, previous, next):
  if Object.is(current, previous):
    return committedCandidate(next, merged = false)
  currentChanges = diff(previous, current)
  nextChanges = diff(previous, next)
  if nextChanges is empty:
    return committedCandidate(current, merged = false)
  conflicts = overlappingPaths(currentChanges, nextChanges)
  if conflicts is not empty:
    return conflict(conflicts)
  candidate = applyChanges(current, nextChanges)
  return committedCandidate(candidate, merged = currentChanges is not empty)
```

## 8.2 Change 표현
```ts
type Path = readonly string[];
type Change =
  | { op: "add"; path: Path; after: DopData }
  | { op: "replace"; path: Path; before: DopData; after: DopData }
  | { op: "remove"; path: Path; before: DopData };
```

배열은 leaf/atomic value로 취급하므로 v1의 `Change.path`는 object key만 포함한다. validation issue path가 numeric segment를 허용하는 것과는 별도 계약이다.

## 8.3 Path 충돌 규칙
| **current 변경** | **next 변경**   | **결과**                     |
|------------------|-----------------|------------------------------|
| user.name        | settings.theme  | 자동 병합                    |
| user.name        | user.age        | 자동 병합                    |
| user.name        | user.name       | conflict                     |
| user             | user.name       | ancestor/descendant conflict |
| user.name 제거   | user.name 변경  | conflict                     |
| users 배열 변경  | users 배열 변경 | conflict                     |
| users 배열 변경  | settings.theme  | 자동 병합                    |
| root 전체 교체   | 어떤 다른 변경  | conflict                     |

## 8.4 보수적 정책
- 같은 path에 결과적으로 같은 값을 기록하더라도 v1에서는 conflict로 처리한다.
- 도메인별 custom resolver는 v1 public API에 포함하지 않는다.
- object key 순서는 의미가 없고, output은 deterministic한 change ordering을 사용한다.
- Object.is(previousBranch, targetBranch)가 true면 해당 subtree traversal을 생략한다.
- prototype pollution 위험이 있는 예약 key는 data contract 단계에서 거부한다.

### 배열 atomic 계약

- diff는 array 내부 index를 순회하지 않는다. `Object.is(previousArray, targetArray)`이면 change가 없고, 그 외에는 배열 전체 `replace`다.
- 새 배열의 깊은 값이 기존 배열과 같아도 reference가 다르면 `replace`로 취급한다.
- object property의 배열이 바뀌면 change와 conflict diagnostics의 path는 해당 property를 가리키고 operation은 `replace`다.
- 같은 배열 path를 current와 next가 모두 바꾸면 서로 다른 index를 의도했더라도 conflict다.
- 배열 path 변경과 sibling object path 변경은 자동 병합할 수 있다.
- 한쪽이 배열의 parent를 교체·제거하고 다른 쪽이 해당 배열 path를 바꾸면 ancestor/descendant conflict다.
- root data가 배열이면 양쪽의 root array 변경은 root path `[]` conflict다.
- patch application은 array element를 merge하지 않고 after array reference를 전체 교체한다.
- item 단위 merge가 필요한 application은 entity를 `byId` object로 정규화하고 표시 순서만 별도 array로 둔다 ([ADR-007](docs/adr/0007-atomic-arrays.md)).

## 8.5 반드시 만족해야 할 성질
| **Property**             | **기대 결과**                          |
|--------------------------|----------------------------------------|
| reconcile(A, A, A)       | A                                      |
| reconcile(A, A, B)       | B                                      |
| reconcile(B, A, A)       | B                                      |
| 독립 path 변경           | 양쪽 변경을 모두 보존                  |
| 겹치는 path 변경         | conflict이며 state 미변경              |
| 동일 입력 반복           | 항상 동일한 result와 conflict ordering |
| merge 후 validation 실패 | invalid이며 current 유지               |

# 9. Validation 모델
## 9.1 Validator contract
```ts
export type ValidationContext<T> =
  | { readonly phase: "initial" }
  | {
      readonly phase: "commit";
      readonly previous: T;
      readonly current: T;
      readonly merged: boolean;
    };

export type Validator<T> = (
  candidate: T,
  context: ValidationContext<T>,
) => ValidationResult;

export type ValidationResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly issues: readonly [ValidationIssue, ...ValidationIssue[]];
    };

export interface ValidationIssue {
  readonly code: string;
  readonly message: string;
  readonly path?: readonly (string | number)[];
}
```

Commit context의 `previous`는 호출자가 계산에 사용한 base이고 `current`는 실제 commit 직전 data다. `merged`는 7장의 결과 의미와 동일하다. revision은 application validation이 engine diagnostics에 의존하지 않도록 context에서 제외한다 ([ADR-003](docs/adr/0003-validation-context-and-errors.md)).

## 9.2 책임 분리
| **Application**                           | **Engine**                                                    |
|-------------------------------------------|---------------------------------------------------------------|
| schema 선택 및 정의                       | runtime data guard를 먼저 실행                                |
| schema validation과 domain invariant 구성 | frozen final candidate를 commit 전에 정확히 한 번 검증         |
| 비어 있지 않은 code·message와 path 정의   | validator result shape를 검사하고 표준 invalid result로 전달   |
| Zod/Ajv/직접 함수 선택                    | 특정 validation library에 의존하지 않음                        |

## 9.3 실행 시점
- `initialData`는 guard와 freeze 후 `{ phase: "initial" }` context로 한 번 검증한다.
- commit 시에는 reconciliation을 완료한 최종 candidate를 `{ phase: "commit", previous, current, merged }` context로 정확히 한 번 검증한다.
- async validation은 v1에서 지원하지 않는다.
- 외부 시스템 조회가 필요한 검증은 calculation 이전 application service에서 수행하고 결과를 command/context에 넣는다.
- initial validator가 invalid를 반환하면 issues를 가진 `InitialDataValidationError`를 throw하고 engine을 생성하지 않는다.
- commit validator가 invalid를 반환하면 current data, current revision과 issues를 가진 `status: "invalid"`를 반환한다.
- validator가 throw하면 `EngineExecutionError`로 감싸고 `cause`를 보존한다.
- Promise 또는 thenable, malformed result, 빈 issues나 잘못된 issue field는 validator 계약 위반 `EngineExecutionError`다.
- issue의 `code`와 `message`는 비어 있지 않은 string이어야 하고 path segment는 string 또는 finite non-negative integer여야 한다.
- validation issue와 exception에는 candidate나 전체 application data를 자동 포함하지 않는다.

> [!NOTE] **이유**
> 각 next가 개별적으로 valid해도 concurrent 변경과 병합된 candidate는 invariant를 깨뜨릴 수 있다. 따라서 validation의 안전한 기준점은 reconciliation 이후, commit 직전이다.

# 10. State Cell과 동시성 범위
## 10.1 내부 모델
```ts
interface VersionedState<T> {
  readonly data: T;
  readonly revision: number;
}

interface StateCell<T> {
  get(): VersionedState<T>;
  swap(
    update: (current: VersionedState<T>) => VersionedState<T>,
  ): VersionedState<T>;
}
```

State Cell의 변경 primitive는 `replace`가 아니라 공식 예제의 `Atom.swap`에 대응하는 `swap`이다 [S5]. coordinator는 swap callback 안에서 실제 current를 기준으로 commit 결과를 계산하며, failure와 no-op에서는 같은 `VersionedState`를 반환한다. Public API의 version identity는 previous data reference이고 numeric revision은 data version 진단값이다. 직렬화된 DB version과 동일한 개념으로 간주하지 않는다 ([ADR-008](docs/adr/0008-state-cell-and-concurrency-boundary.md)).

## 10.2 v1에서 보장하는 것
- Browser main thread와 하나의 JS isolate 안에서 lock을 사용하지 않는 optimistic commit semantics
- await 동안 오래된 previous를 사용한 commit의 conflict 또는 reconciliation
- 동기 update callback의 재진입 방지
- state-changing commit마다 revision 정확히 1 증가하고 no-op에서는 유지

## 10.3 v1에서 보장하지 않는 것
- 여러 Worker가 같은 JS object를 동시에 갱신하는 hardware-level CAS
- 여러 Node 프로세스 또는 서버 인스턴스 사이의 consistency
- DB transaction과 in-memory commit의 원자적 결합
- 분산 retry, lease, leader election, consensus

> [!NOTE] **용어 주의**
> v1을 “진짜 shared-memory lock-free engine”으로 홍보하지 않는다. 저자의 Atom.swap 구조를 반영한 swap abstraction과 optimistic reconciliation은 제공하지만, 실제 다중 스레드 atomic backend는 별도 연구 범위다.

# 11. 오류·진단·이벤트 모델
## 11.1 예상 결과와 exception
| **상황**                            | **처리**                                                   |
|-------------------------------------|------------------------------------------------------------|
| Concurrent path overlap             | `CommitResult.status = "conflict"`                        |
| Commit candidate invariant 실패     | `CommitResult.status = "invalid"`                         |
| Initial data invariant 실패         | `InitialDataValidationError`, issues 보존                   |
| Unsupported data                    | `DopDataError`                                             |
| Frozen data의 application mutation  | ESM strict mode의 native `TypeError`                        |
| Deep freeze 실행 실패               | `EngineExecutionError`, cause 보존                          |
| Reentrant update/commit              | `EngineUsageError`                                         |
| Validator throw 또는 계약 위반       | `EngineExecutionError`, 가능한 경우 cause 보존             |
| Internal impossible state           | `EngineInvariantError`                                     |

```ts
export declare class DopDataError extends TypeError {}

export declare class InitialDataValidationError extends Error {
  readonly issues: readonly [ValidationIssue, ...ValidationIssue[]];
}

export declare class EngineUsageError extends Error {}

export declare class EngineExecutionError extends Error {
  override readonly cause?: unknown;
}

export declare class EngineInvariantError extends Error {}
```

이 exception class의 `name`과 상속 관계, `InitialDataValidationError.issues`, `EngineExecutionError.cause`만 v1 public contract다. message 문구와 stack 형식은 안정 API로 간주하지 않는다.

## 11.2 Conflict diagnostics
```ts
export interface Conflict {
  readonly currentPath: readonly string[];
  readonly nextPath: readonly string[];
  readonly relation: "same" | "ancestor" | "descendant";
  readonly currentOperation: "add" | "replace" | "remove";
  readonly nextOperation: "add" | "replace" | "remove";
}
```

기본 diagnostics는 path와 operation만 제공한다. 민감하거나 큰 데이터를 error에 복제하지 않도록 full before/current/next value는 기본 포함하지 않는다.

## 11.3 Commit event
```ts
export interface CommitEvent<T> {
  readonly previous: T;
  readonly current: T;
  readonly revision: number;
  readonly merged: boolean;
}
```

- listener는 state-changing commit이 성공한 뒤에만 호출한다. no-op event는 없다.
- `previous`는 호출자가 전달한 base가 아니라 교체 직전 실제 current이고 `current`는 새 candidate다.
- no-op event가 없으므로 `CommitEvent`에는 `changed` field를 두지 않는다.
- listener exception은 이미 완료된 commit을 rollback하지 않는다.
- listener error는 `onListenerError` hook으로 전달한다.
- `onListenerError`가 없거나 hook 자체가 throw해도 commit result와 이후 listener dispatch에는 영향을 주지 않으며 engine이 그 오류를 다시 throw하지 않는다.
- listener 안의 reentrant update는 내부 FIFO event queue로 다음 dispatch cycle에 처리한다.

# 12. 사용하는 프로젝트의 개발 방식
## 12.1 프로젝트 기본 구조
```text
src/
├─ data/ # application data types and schemas
├─ domain/ # pure calculations
├─ commands/ # explicit input values
├─ engine.ts # createDopEngine configuration
├─ selectors/ # large state → operation context
├─ ui/ # framework-specific rendering
└─ boundaries/ # HTTP, file, browser storage
```

## 12.2 표준 개발 순서
1.  Application data를 plain immutable data로 정의한다.

2.  Schema와 system invariant validator를 별도 정의한다.

3.  사용자 동작을 command data로 정의한다.

4.  domain calculation을 (data, command) → nextData 순수 함수로 작성한다.

5.  engine.update() 또는 get() + commit()으로 연결한다.

6.  도메인 함수와 engine integration을 각각 테스트한다.

## 12.3 일반 동기 변경
```ts
const result = engine.update((current) =>
changeRule(current, command),
);
switch (result.status) {
case "committed":
break;
case "invalid":
showValidation(result.issues);
break;
case "conflict":
// sync update에서는 드물지만 명시적으로 처리한다.
showConflict(result.conflicts);
break;
}
```

## 12.4 async stale update
```ts
const previous = engine.get();
const response = await fetchRemoteSuggestion();
const next = applySuggestion(previous, response);
const result = engine.commit(previous, next);
if (result.status === "conflict") {
// 최신 data로 재계산하거나 사용자에게 선택을 요청한다.
}
```

## 12.5 큰 데이터의 사용 방식
```ts
const data = engine.get();
const context = selectReservationContext(data, command);
const decision = calculateReservation(context, command);
const next = applyReservationDecision(data, decision);
engine.commit(data, next);
```

DOP는 전체 데이터를 모든 함수에 넘기라는 뜻이 아니다. selector가 큰 system data에서 작업에 필요한 operation context를 구성하고, calculation은 작은 explicit data를 입력받도록 한다.

## 12.6 프로젝트 입장에서 기대되는 효용
| **효용**                 | **구체적인 변화**                                                                    | **효과가 큰 조건**             |
|--------------------------|--------------------------------------------------------------------------------------|--------------------------------|
| 반복 infrastructure 제거 | validation 시점, stale detection, reconcile, commit result를 매번 다시 설계하지 않음 | 상태 변경이 많은 browser app   |
| 도메인 로직 단순화       | DB/UI와 분리된 input → output 함수로 구현                                            | 규칙 변화와 테스트가 잦은 앱   |
| 프로젝트 패턴 표준화     | data → calculation → commit이라는 동일한 개발 흐름                                   | 여러 개인 프로젝트를 반복 개발 |
| 디버깅 안정성            | conflict와 invalid가 명시적 Result이며 silent overwrite를 차단                       | async update가 많은 앱         |
| 테스트 비용 감소         | 도메인 함수는 engine·DB 없이 값 비교로 테스트                                        | 복잡한 business calculation    |

## 12.7 냉정한 한계
- 단순 CRUD에서는 추상화 계층만 늘어날 수 있다.
- 개발자는 immutable update와 explicit data modeling에 익숙해져야 한다.
- 배열 병합 제한 때문에 일부 editor 도메인에서는 conflict가 자주 발생할 수 있다.
- 큰 state에서 구조 공유를 하지 않으면 diff가 전체 tree를 순회할 수 있다.
- 첫 프로젝트에서는 engine 자체 개발 비용 때문에 전체 개발 속도가 오히려 느릴 수 있다.

# 13. DB·Prisma 프로젝트에서의 적용
## 13.1 권장 구조
```text
Request
↓
Application Service
↓
Prisma로 필요한 context 조회
↓
plain generic data
↓
pure domain calculation + validation
↓
explicit changes
↓
Prisma $transaction
↓
Database
```

저자의 DB 예제는 JDBC ResultSet을 List\<Map\<String, Object\>\>로 변환해 generic data로 다룬다 [S6]. 따라서 DB를 메모리 engine으로 대체하기보다 DB 결과를 plain data로 변환하고 계산과 저장을 분리하는 해석이 자연스럽다.

## 13.2 Prisma 예시
```ts
const context = await loadReservationContext(prisma, command);
const decision = reserve(context, command); // pure
const validation = validateDecision(decision); // sync
if (!validation.ok) return validation;
await prisma.$transaction(async (tx) => {
await persistReservationDecision(tx, decision);
});
```

## 13.3 DOP Engine을 함께 쓰는 경우
| **경우**                                      | **판단**                                                              |
|-----------------------------------------------|-----------------------------------------------------------------------|
| 서버 global state를 engine과 DB에 동시에 유지 | 금지. 두 개의 source of truth가 된다.                                 |
| request-local 계산 단계의 임시 state          | 가능하지만 일반적으로 plain function만으로 충분하다.                  |
| frontend browser state                        | 적합. frontend engine과 backend Prisma의 책임이 분리된다.             |
| DB conflict 자동 해결                         | engine merge보다 reload → recalculate → transaction retry가 기본이다. |
| 공통 validator/result type 재사용             | 가능. 다만 실제 반복이 확인된 뒤 public export를 늘린다.              |

> [!NOTE] **프로젝트 판단**
> DB-backed backend에서 DOP의 효용은 높을 수 있지만 full in-memory engine의 효용은 중간 이하일 수 있다. Prisma가 persistence와 transaction을 충분히 담당한다면, engine을 억지로 끼우지 않고 DOP domain calculation만 적용한다.

# 14. 저장소와 개발 환경
## 14.1 기술 스택
| **영역**        | **선택**               | **원칙**                                                |
|-----------------|------------------------|---------------------------------------------------------|
| Language        | TypeScript strict mode | 웹 data와 경계 비용 없이 직접 통합                      |
| Module          | ESM                    | modern browser와 Node 소비                              |
| Package manager | pnpm, 버전 pin         | 재현 가능한 install과 lockfile                          |
| Build           | tsc + declaration emit | 작은 unbundled library, source map 포함                 |
| Unit test       | Vitest                 | TypeScript 테스트와 빠른 피드백 [S8]                  |
| Property test   | fast-check             | reconciliation 불변식을 generated input으로 검증 [S9] |
| Lint/format     | ESLint + Prettier      | 기계적 일관성                                           |
| CI              | GitHub Actions         | lint, typecheck, test, build, pack smoke                |
| Registry        | npm                    | `@sangyuk-raccoon/dop-engine`로 설치                    |
| Publishing auth | npm trusted publishing | 장기 token 없이 OIDC 기반 publish [S10]               |

## 14.2 권장 compiler 정책
```json
{
"compilerOptions": {
"target": "ES2022",
"module": "NodeNext",
"moduleResolution": "NodeNext",
"strict": true,
"noUncheckedIndexedAccess": true,
"exactOptionalPropertyTypes": true,
"useUnknownInCatchVariables": true,
"declaration": true,
"declarationMap": true,
"sourceMap": true,
"rootDir": "src",
"outDir": "dist"
}
}
```

TypeScript의 strict 옵션은 더 강한 correctness 보장을 활성화하며, declaration output은 npm library consumer의 type experience를 위해 필요하다 [S7]. M0 package scaffold 이슈 #2에서 당시 Node Active LTS의 정확한 version과 호환되는 pnpm version을 선택하고 `.node-version`, `packageManager`와 lockfile에 같은 값으로 pin한다. `latest`, major-only range와 실행 환경 추론은 허용하지 않는다.

## 14.3 저장소 구조
```text
dop-engine/
├─ docs/
│  └─ adr/
│     ├─ README.md
│     └─ 0001-....md
├─ src/
│ ├─ index.ts
│ ├─ data/
│ │ ├─ types.ts
│ │ ├─ assert-dop-data.ts
│ │ └─ deep-freeze.ts
│ ├─ consistency/
│ │ ├─ change.ts
│ │ ├─ diff.ts
│ │ ├─ path.ts
│ │ ├─ apply.ts
│ │ └─ reconcile.ts
│ ├─ validation/
│ │ └─ types.ts
│ ├─ state/
│ │ └─ memory-state-cell.ts
│ ├─ engine/
│ │ ├─ create-engine.ts
│ │ ├─ commit.ts
│ │ ├─ results.ts
│ │ └─ errors.ts
│ └─ observable/
│ └─ event-queue.ts
├─ tests/
│ ├─ unit/
│ ├─ property/
│ ├─ integration/
│ └─ fixtures/
├─ examples/
│ ├─ basic-browser/
│ └─ async-conflict/
├─ consumer-tests/
├─ package.json
├─ tsconfig.json
├─ tsconfig.build.json
├─ vitest.config.ts
├─ eslint.config.js
├─ pnpm-lock.yaml
├─ README.md
├─ CHANGELOG.md
├─ LICENSE                  # public release gate에서 추가
└─ .github/workflows/
```

## 14.4 package 정책
- 초기에는 단일 package와 단일 repository로 시작한다.
- package 이름과 import specifier는 `@sangyuk-raccoon/dop-engine`이다. unscoped `dop-engine` alias와 internal subpath는 지원하지 않는다.
- runtime dependency 0개를 목표로 한다. test/build dependency만 devDependencies에 둔다.
- root export만 공개하고 내부 path import를 package exports로 차단한다.
- sideEffects: false를 선언하고 import 시 전역 상태를 만들지 않는다.
- ESM만 지원하며 CommonJS dual package는 personal stable 범위에서 제외한다.
- private development 동안 `package.json`은 `"private": true`, `"license": "UNLICENSED"`이며 npm registry에 public 또는 private package를 게시하지 않는다.
- M0의 package 검증은 local tarball만 사용한다. private 단계 tarball에는 npm 필수 metadata와 승인된 `dist`, `README`만 포함하며 source, test와 repository 내부 문서를 제외한다.
- 별도 public release 승인 시 root `LICENSE`에 `SanGyuk-Raccoon`과 공개 연도를 포함한 MIT License 전문을 추가하고 `license`를 `"MIT"`로 바꾼다.
- public release에서는 `private` guard를 제거하고 `publishConfig.registry`를 `https://registry.npmjs.org/`, `publishConfig.access`를 `public`으로 고정한다. 이때 tarball에는 npm 필수 metadata, `dist`, `README`와 `LICENSE`만 포함한다 ([ADR-010](docs/adr/0010-package-identity-and-publication.md)).

## 14.5 개발 명령
```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm test:property
pnpm test:coverage
pnpm build
pnpm pack:check
pnpm ci
```

## 14.6 CI pipeline
```text
Pull request / push:
install --frozen-lockfile
→ lint
→ typecheck
→ unit + property tests
→ coverage
→ build
→ npm pack
→ consumer smoke test
Tag v*:
all CI gates
→ public release 승인을 확인
→ npm trusted publishing
→ GitHub Release + changelog
```

M0 완료나 tag 생성만으로 publish하지 않는다. repository visibility 변경, MIT 전환과 최초 npm publish는 별도의 public release 작업과 사용자 승인이 있어야 한다.

# 15. 테스트 전략
## 15.1 테스트 피라미드
| **층**              | **목적**                                   | **비중**     |
|---------------------|--------------------------------------------|--------------|
| Pure unit           | 작은 규칙과 error mapping                  | 높음         |
| Property-based      | diff/reconcile의 입력 공간과 불변식        | 매우 높음    |
| Engine integration  | state, validation, commit, event 조합      | 중간         |
| Consumer smoke      | 실제 npm package import와 type declaration | 필수         |
| Application dogfood | 개인 프로젝트에서 사용성·API 검증          | release gate |

## 15.2 Unit test 필수 목록
- [ ] DopData: primitive, nested object, array 허용
- [ ] DopData: undefined, non-finite number, descriptor, symbol key, sparse array, class instance, cycle, reserved key 거부
- [ ] Public generic: index signature 없는 중첩 application interface 허용
- [ ] diff: equal primitive/object fast path
- [ ] diff: add, replace, remove
- [ ] diff: nested object path
- [ ] diff: array를 하나의 replace로 처리
- [ ] path overlap: same, ancestor, descendant, independent
- [ ] reconcile: fast-forward
- [ ] reconcile: current-only / next-only change
- [ ] reconcile: independent nested change merge
- [ ] reconcile: exact/ancestor/delete conflict
- [ ] array: same-reference no-op, one-side replace, same-path conflict, sibling merge, parent/root conflict
- [ ] commit: initial validation context와 생성 실패
- [ ] commit: final candidate와 previous/current/merged context validation
- [ ] commit: invalid/conflict state unchanged
- [ ] commit: no-op은 changed false, 같은 reference/revision, event 없음
- [ ] commit: 실제 변경에서 revision이 정확히 한 번 증가
- [ ] freeze: always 기본값, never opt-out, structural-sharing subtree cache
- [ ] notification: state-changing success only, unsubscribe, listener error isolation
- [ ] usage error: reentrant update, async-like Promise 반환 방지

## 15.3 Property-based test
| **Property**        | **Assertion**                                                    |
|---------------------|------------------------------------------------------------------|
| Identity            | reconcile(A, A, A) = A                                           |
| Next-only           | reconcile(A, A, B) = B                                           |
| Current-only        | reconcile(B, A, A) = B                                           |
| Determinism         | 같은 previous/current/next는 같은 result와 conflict order를 반환 |
| Preservation        | 독립 change set은 두 변경을 모두 보존                            |
| No silent overwrite | 겹치는 path는 반드시 conflict                                    |
| Failure atomicity   | non-committed result는 state와 revision을 보존                   |
| Immutability        | engine operation은 input tree를 mutation하지 않음                |
| Round trip          | apply(previous, diff(previous, target)) = target                 |

## 15.4 Generated data 제한
- 기본 depth 0~6, object key 수 0~8, array length 0~8 범위에서 생성한다.
- reserved key와 unsupported data는 별도 negative arbitrary로 생성한다.
- 실패 seed와 counterexample을 CI artifact 또는 로그에 보존한다.
- property run 수는 local fast profile과 CI thorough profile로 구분한다.

## 15.5 Coverage 정책
| **대상**                         | **기준**                                         |
|----------------------------------|--------------------------------------------------|
| commit / reconcile / diff / path | branch coverage ≥ 90%                            |
| Result branch                    | 모든 status와 error code를 최소 1회 실행         |
| Public API                       | README example을 integration test로 실행         |
| 전체 package                     | coverage 숫자보다 critical invariant 통과를 우선 |

# 16. 성능·안정성·보안 기준
## 16.1 성능 전략
- Object.is reference equality로 변경되지 않은 subtree를 즉시 skip한다.
- 배열은 atomic 처리해 deep element diff 비용과 index 의미 문제를 피한다.
- engine은 clone하지 않고 application의 structural sharing을 활용한다.
- 기본 deep freeze는 engine-owned `WeakSet`에 기록된 subtree의 재순회를 생략한다.
- conflict diagnostics는 path 중심으로 유지해 큰 data 복사를 피한다.
- history를 자동 유지하지 않아 메모리 retention을 줄인다.

## 16.2 Benchmark fixture
| **Fixture**              | **작업**                                            |
|--------------------------|-----------------------------------------------------|
| 10 KB shallow object     | single leaf replace, independent merge              |
| 100 KB normalized object | deep leaf replace, add/remove                       |
| 1 MB mixed tree          | reference-shared shallow update, conflict detection |
| large array property     | array atomic replacement                            |

v1.0 이전에는 절대 시간 threshold를 CI gate로 삼지 않는다. 동일 머신/환경에서 baseline 대비 2배 이상의 지속적인 regression이 생기면 조사 대상으로 삼는다.

## 16.3 안정성 원칙
- silent data loss 금지
- conflict와 invalid의 state atomicity
- deterministic result
- 예상 오류와 programmer error 구분
- public API 입력과 결과에 readonly type 사용
- packaged artifact를 실제 consumer에서 검증

## 16.4 보안 기준
- prototype pollution 방지를 위해 \_\_proto\_\_, prototype, constructor key를 거부한다.
- patch 적용 시 object spread 또는 safe property definition을 사용하고 prototype chain을 탐색하지 않는다.
- 오류에 전체 application data를 자동 stringify하지 않는다.
- 런타임 dependency를 최소화해 supply-chain surface를 줄인다.
- npm publish는 OIDC trusted publishing을 사용하고 장기 token을 저장하지 않는다 [S10].

# 17. 구현 로드맵
버전은 기능의 양보다 안전성 검증 단계로 정의한다. 아래 명칭과 범위는 GitHub milestone을 그대로 따른다. 각 milestone은 다음 단계의 기능을 미리 넣지 않고 exit criteria를 만족한 뒤 종료한다.

| **GitHub milestone**                                | **범위**                                                     | **Exit criteria**                                                        |
|-----------------------------------------------------|--------------------------------------------------------------|--------------------------------------------------------------------------|
| M0 · Author Canon & Public Contract                 | 근거 분류, 공개 계약, package scaffold와 기본 품질 gate      | 설계 미결정 없음, consumer type fixture와 lint/typecheck/build/pack 동작 |
| v0.1 · Immutable Generic Data                       | runtime data guard, deep freeze, validator port              | mutation 차단, structural sharing 보존, schema library 독립              |
| v0.2 · Calculation / Commit Core                    | State Cell, get/update/commit, Result, revision과 no-op       | fast-forward와 invalid/exception atomicity 검증                          |
| v0.3 · Semantic Diff & Three-way Reconciliation     | semantic diff, path conflict, atomic arrays, property test    | independent merge와 no-silent-overwrite property 통과                    |
| v0.4 · Browser State Integration                    | subscribe, FIFO event, listener 격리와 browser smoke         | state-changing commit event와 실제 browser ESM 동작                      |
| v0.5 · Reusable Package                             | consumer fixture, coverage, benchmark, package 품질          | 독립 설치·타입·실행, critical coverage와 tarball 구성 검증                |
| v0.9 · DOP Dogfood                                  | browser 앱 2개와 DB boundary 적용                            | 두 번째 앱 이후 core API 변경 없음                                      |
| v1.0-personal · Stable Release                      | 최종 회귀, 문서, migration, 승인된 public release            | 18장의 승인 기준과 trusted publishing 완료                              |

## 17.1 M0 작업
- [Issue #1](https://github.com/SanGyuk-Raccoon/dop-engine/issues/1): 저자 근거 우선순위와 엔진 고유 ADR을 분리하고 public contract, package identity와 공개 정책을 확정한다.
- [Issue #2](https://github.com/SanGyuk-Raccoon/dop-engine/issues/2): 정확히 pin한 Node/pnpm, strict ESM 설정, compile-only public API와 일반 application interface consumer fixture를 만든다.
- [Issue #3](https://github.com/SanGyuk-Raccoon/dop-engine/issues/3): lint, baseline test, build, local pack consumer와 최소 권한 GitHub Actions를 하나의 `pnpm ci` gate로 연결한다.
- M0에서는 runtime commit behavior와 npm publish를 구현하지 않는다. #2는 #1, #3은 #2가 완료된 뒤 시작한다.

## 17.2 v0.1 작업
- unconstrained consumer generic을 유지하면서 모든 engine boundary에 runtime data guard를 구현한다.
- descriptor, sparse array, cycle, reserved key와 지원하지 않는 native object를 거부한다.
- 기본 `always` deep freeze, 명시적 `never`와 shared subtree cache를 구현한다.
- schema-library-independent validator port와 initial validation을 구현한다.

## 17.3 v0.2 작업
- `MemoryStateCell.swap`, `get`, `update`와 `commit`을 구현한다.
- fast-forward, validation context, Result와 exception hierarchy를 연결한다.
- no-op의 `changed: false`, revision 유지와 event 억제를 검증한다.
- invalid, exception과 stale abort에서 data와 revision을 보존한다.

## 17.4 v0.3 작업
- `Change`/`Path`, structural diff, safe patch와 path overlap을 구현한다.
- previous/current/next three-way reconciliation과 deterministic diagnostics를 구현한다.
- 배열 atomic 및 parent/root conflict fixture를 추가한다.
- identity, round-trip, preservation과 no-silent-overwrite property를 검증한다.

## 17.5 v0.4 작업
- `subscribe`/`unsubscribe`, FIFO event queue와 listener error hook을 구현한다.
- state-changing commit만 event를 발생시키고 listener 내부 update 순서를 검증한다.
- async stale commit example과 실제 Chromium browser smoke test를 추가한다.

## 17.6 v0.5 작업
- Node와 browser 독립 consumer fixture, declaration/source map 검증을 완성한다.
- README conformance example, critical branch coverage와 benchmark baseline을 추가한다.
- public release gate에 사용할 tarball allowlist, provenance와 trusted publishing 준비를 검증한다.

## 17.7 v0.9와 v1.0-personal 작업
- 서로 다른 browser-memory 앱 2개와 DB boundary 프로젝트에서 dogfood한다.
- 두 번째 browser 앱 이후 core API 변경이 필요 없는지 확인한다.
- 새 기능 없이 전체 회귀, 문서, changelog와 migration note를 정리한다.
- 별도 공개 승인을 받은 뒤 MIT 전환, repository 공개, `@sangyuk-raccoon/dop-engine` publish와 release artifact 검증을 수행한다.

# 18. 개인용 안정 버전 승인 기준
## 18.1 기능 승인
- [ ] get, commit, update, subscribe의 문서화된 동작이 구현되어 있다.
- [ ] fast-forward, independent merge, conflict, invalid의 네 경로가 안정적으로 동작한다.
- [ ] 배열 atomic 정책과 unsupported data 정책이 명확하게 오류 처리된다.
- [ ] initial data와 final candidate validation이 누락되지 않는다.
- [ ] conflict/invalid/exception에서 state와 revision이 보존된다.
- [ ] no-op의 changed/revision/event와 기본 deep freeze 계약이 검증된다.

## 18.2 품질 승인
- [ ] critical property tests가 CI에서 반복 실행된다.
- [ ] critical branch coverage 90% 이상이다.
- [ ] npm tarball consumer smoke가 통과한다.
- [ ] TypeScript declaration과 source map이 포함된다.
- [ ] runtime dependency 0개 또는 예외가 문서화되어 있다.
- [ ] README 예제가 실제 test에서 실행된다.
- [ ] known P0/P1 issue가 없다.

## 18.3 실사용 승인
- [ ] 서로 다른 browser-memory 앱 2개에서 실제 기능에 사용한다.
- [ ] 두 앱 모두에서 domain-specific code를 engine repository에 추가하지 않는다.
- [ ] 두 번째 앱 통합 이후 core public API를 변경하지 않는다.
- [ ] DB 기반 프로젝트 1개에서 “Prisma + pure DOP calculation” 경계를 시험하고 full engine이 불필요한 경우 사용하지 않는다.
- [ ] 실사용 중 발견된 conflict diagnostics가 문제 원인을 파악하기에 충분하다.

## 18.4 Release 승인
- [ ] CHANGELOG에 breaking change와 migration note가 기록되어 있다.
- [ ] v1.0-personal tag가 immutable하게 생성된다.
- [ ] 별도 public release 승인 후 repository 공개, MIT `LICENSE`와 package metadata 전환이 완료된다.
- [ ] CI trusted publishing으로 npm package가 배포된다.
- [ ] release tarball checksum/provenance를 확인한다.
- [ ] 사용 중인 프로젝트가 exact 또는 controlled range로 version을 고정한다.

# 19. 리스크와 대응
| **리스크**            | **영향**                            | **대응**                                                              |
|-----------------------|-------------------------------------|-----------------------------------------------------------------------|
| 과도한 일반화         | framework화, 개발 지연              | non-goals와 ADR로 기능 추가를 거부하고 실제 반복 후만 추출            |
| 배열 reconciliation   | false conflict 또는 잘못된 merge    | v1 atomic 정책, keyed strategy는 별도 실험                            |
| mutation              | reference identity와 diff 신뢰 훼손 | readonly convention, 기본 deep freeze, mutation tests                 |
| large state traversal | UI latency                          | structural sharing, reference fast path, benchmark                    |
| DB와 dual state       | 불일치와 data loss                  | DB가 source of truth일 때 global engine 금지                          |
| public API churn      | 여러 프로젝트 업데이트 비용         | v0.x dogfood 후 v1 고정, export surface 최소화                        |
| listener reentrancy   | event ordering 혼란                 | FIFO dispatch queue와 engine call guard                               |
| validation 과부하     | 매 commit 전체 tree validation 비용 | application이 schema scope를 조절; 실제 병목 후 incremental 전략 검토 |
| 저자 예제 과해석      | 철학과 구현의 혼동                  | 문서에서 author basis와 design decision 구분                          |

# 20. Architecture Decision Records
저자의 네 원칙은 이 프로젝트가 승인하거나 대체할 선택지가 아니므로 ADR로 만들지 않는다. 아래 기록은 저자 자료가 정의하지 않은 엔진·플랫폼 결정만 다룬다. 전체 index와 상태 규칙은 [`docs/adr/README.md`](docs/adr/README.md)에 있다.

| **ID**                                      | **결정**                                        | **상태** | **분류**   |
|---------------------------------------------|-------------------------------------------------|----------|------------|
| [ADR-001](docs/adr/0001-platform-and-module-boundary.md) | TypeScript, browser-memory first, ESM-only       | Accepted | Engine ADR |
| [ADR-002](docs/adr/0002-runtime-generic-data-boundary.md) | Unconstrained generic + runtime data boundary    | Accepted | Engine ADR |
| [ADR-003](docs/adr/0003-validation-context-and-errors.md) | Phase-aware synchronous validation contract      | Accepted | Engine ADR |
| [ADR-004](docs/adr/0004-commit-result-revision-and-events.md) | Result, no-op, revision과 event 의미          | Accepted | Engine ADR |
| [ADR-005](docs/adr/0005-default-deep-freeze.md) | Default always deep freeze                       | Accepted | Engine ADR |
| [ADR-006](docs/adr/0006-conservative-three-way-reconciliation.md) | Conservative three-way reconciliation      | Accepted | Engine ADR |
| [ADR-007](docs/adr/0007-atomic-arrays.md)   | Arrays are atomic in v1                         | Accepted | Engine ADR |
| [ADR-008](docs/adr/0008-state-cell-and-concurrency-boundary.md) | State Cell swap와 concurrency boundary      | Accepted | Engine ADR |
| [ADR-009](docs/adr/0009-db-transaction-boundary.md) | DB transaction excluded from engine          | Accepted | Engine ADR |
| [ADR-010](docs/adr/0010-package-identity-and-publication.md) | Scoped package와 private-to-MIT release     | Accepted | Engine ADR |
| [ADR-011](docs/adr/0011-deferred-optimizations.md) | Custom resolver와 Rust/WASM deferred            | Accepted | Engine ADR |

# 21. 구현 작업 목록
## 21.1 P0 · 안정성 필수
- [ ] Data guard와 reserved key 차단
- [ ] State Cell과 revision
- [ ] CommitResult / error hierarchy
- [ ] Validation context와 initial/final validation
- [ ] Fast-forward commit
- [ ] Structural diff
- [ ] Path overlap conflict
- [ ] Three-way reconciliation
- [ ] No-state-change failure tests
- [ ] Property-based safety tests
- [ ] Package consumer smoke

## 21.2 P1 · 개인용 DX
- [ ] update convenience API
- [ ] 기본 always deepFreeze와 never opt-out
- [ ] Conflict diagnostics
- [ ] subscribe/unsubscribe
- [ ] FIFO event queue
- [ ] README와 2개 examples
- [ ] coverage report
- [ ] benchmark baseline
- [ ] npm trusted publish workflow

## 21.3 P2 · v1 이후 검토
- [ ] history/undo adapter
- [ ] React useSyncExternalStore adapter
- [ ] keyed array reconciliation experiment
- [ ] custom conflict resolver experiment
- [ ] Worker/message adapter
- [ ] schema library adapter
- [ ] Rust/WASM reconciliation benchmark
- [ ] public core subpath exports

> [!NOTE] **기능 승격 규칙**
> P2 기능은 최소 두 프로젝트에서 동일한 요구가 반복되거나, 기존 core로 해결할 수 없는 실제 장애가 확인될 때만 구현 후보로 승격한다.

## 21.4 Definition of Done · 개별 변경
- [ ] public behavior와 edge case가 테스트로 먼저 또는 동시에 추가됨
- [ ] lint, typecheck, unit, property test 통과
- [ ] 새 public API라면 README와 type test 갱신
- [ ] breaking change라면 CHANGELOG와 migration note 작성
- [ ] failure path에서 state atomicity 확인
- [ ] 새 dependency가 있다면 필요성과 제거 대안 기록

# 22. 참고 자료
아래 자료는 설계의 근거와 개발 환경 선택을 확인하기 위해 사용했다. 웹 자료는 2026-08-29 확인 기준이다.

**[S1]** [Yehonathan Sharvit, “Principles of Data-Oriented Programming”](https://blog.klipse.tech/dop/2022/06/22/principles-of-dop.html) — DOP의 네 가지 원칙.

**[S2]** [Yehonathan Sharvit, “Separate code from data”](https://blog.klipse.tech/databook/2022/06/22/separate-code-from-data.html) — 재사용·독립 테스트·복잡도 감소와 비용.

**[S3]** [Official book source: chapter04/system-data-memo.js](https://github.com/viebel/data-oriented-programming/blob/main/src/chapter04/system-data-memo.js) — SystemState.get/commit과 validation 예제.

**[S4]** [Official book source: chapter05/consistency.js](https://github.com/viebel/data-oriented-programming/blob/main/src/chapter05/consistency.js) — diff, path overlap, fast-forward, three-way merge.

**[S5]** [Official book source: chapter08/atom.js](https://github.com/viebel/data-oriented-programming/blob/main/src/chapter08/atom.js) — swap와 compare-and-set retry 모델.

**[S6]** [Official book source: chapter10/jdbc.java](https://github.com/viebel/data-oriented-programming/blob/main/src/chapter10/jdbc.java) — DB result를 list of maps generic data로 변환.

**[S7]** [TypeScript TSConfig Reference](https://www.typescriptlang.org/tsconfig/) — strict, declaration, compiler configuration.

**[S8]** [Vitest Guide](https://vitest.dev/guide/) — TypeScript 기반 unit/integration test runner.

**[S9]** [fast-check: Property-Based Testing](https://fast-check.dev/docs/introduction/what-is-property-based-testing/) — 입력 예시보다 보편적인 behavior property 검증.

**[S10]** [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers/) — OIDC 기반 CI package publishing.

**[S11]** [pnpm Documentation](https://pnpm.io/) — package management와 lockfile.

**[S12]** [npm package.json: private](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#private) — `private: true`의 accidental publish 차단.

**[S13]** [Creating and publishing scoped public packages](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages/) — user scope와 scoped public package의 access 설정.

# 문서 종료
> [!IMPORTANT] **다음 구현 기준**
> 첫 구현은 M0 #1 → #2 → #3 순서로 완료한 뒤 v0.1로 진행하고 reconciliation, observable, DB 관련 확장을 동시에 시작하지 않는다. v1.0-personal의 품질은 기능 수가 아니라 safety invariant와 실제 프로젝트 재사용으로 판단한다.
