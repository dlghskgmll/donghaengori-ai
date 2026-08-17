# 동행고리AI — Frontend Integration Handoff

관리자 운영 콘솔(Next.js)을 Team FastAPI · ClawOps · GPU STT · 실제 전화망과 최종 연결하기 위한 인수인계 문서.

| 항목 | 값 |
|---|---|
| Repository | `dlghskgmll/donghaengori-ai` |
| Branch | `feature/ui-integration` |
| Frontend SHA | `1e491dc661e3f5d5d95dc240a2ea2100598fd086` |
| Team backend 참고 main | `6e93907` |
| 검증 | 30 files / 322 tests PASS · typecheck · lint · build PASS |

---

## 0. 5분 요약

**끝난 것** — 사회복지사가 쓰는 화면 6개(홈·요청·일정·어르신·사후기록·로그인)가 실제 Team API를 읽어서 동작한다. 조회·인증·상태 표시는 완성됐다.

**안 끝난 것** — **쓰기(write)가 두 개 비어 있다.** 접수 확정(`/confirm`)과 통화 확인(`/verify`)은 **의도적으로 연결하지 않았다.** 버튼은 있지만 전부 `disabled`이고 화면에 그 이유를 적어 뒀다.

**당신이 할 일** — 아래 [Backend TODO](#backend-todo--김도형) 17개. 그중 앞의 5개가 데모 성패를 가른다.

**건드리면 안 되는 것** — `components/design/*` 와 `.dc-*` CSS. 발표용 최종 UI다. [Design Guardrails](#design-guardrails) 참고.

---

## 1. Known Execution Condition — 먼저 읽을 것

**이 frontend는 단독 실행되는 앱이 아니다.**

clone 해서 `npm run dev`만 하면 화면은 뜨지만 **데이터는 하나도 안 뜬다.** 요청·일정·어르신·사후기록은 전부 Team FastAPI에서 읽어 온다.

동작 조건 세 가지:

1. Team FastAPI가 실행 중일 것
2. frontend의 `TEAM_AI_BASE_URL`이 그 backend를 가리킬 것
3. 브라우저에서 **직원 로그인**을 했을 것 (Team이 `intake.view` 권한을 요구한다)

셋 중 하나라도 빠지면 화면에 "직원 로그인이 필요합니다" 또는 "요청 목록에 연결하지 못했습니다"가 뜬다. 이건 버그가 아니라 의도된 안내다.

---

## 2. Run

```bash
npm install
npm run dev
```

Node `>=22.13.0` (package.json engines). Next 16.3.0 / React 19.2.6.

| 명령 | 용도 |
|---|---|
| `npm run dev` | 개발 서버 |
| `npm run build` | 프로덕션 빌드 |
| `npm start` | 빌드 결과 실행 |
| `npm test` | 전체 테스트 (vitest, 네트워크 호출 없음) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | eslint |
| `npm run test:openai` | 실제 OpenAI 호출 smoke test (평소엔 불필요) |

---

## 3. Environment

`.env.local`에 설정한다. **이 문서에는 실제 값을 적지 않는다.**

### Team 연동 (필수)

| 이름 | 기본값 | 설명 |
|---|---|---|
| `TEAM_AI_BASE_URL` | `http://localhost:8000` | Team FastAPI 주소. 끝 슬래시는 자동 제거된다 |
| `TEAM_AI_TIMEOUT_MS` | `30000` | Team 호출 timeout. 범위 1000~120000. GPU 모델 warmup 때문에 OpenAI와 따로 둔다 |
| `AI_PROVIDER` | `mock` | `team`으로 설정해야 분석이 Team으로 간다. `mock` \| `openai` \| `auto` \| `team` |
| `STT_PROVIDER` | (미설정 시 OpenAI) | `team`으로 설정하면 Team `/api/stt`(faster-whisper) 사용 |

**데모 설정은 이 두 줄이 핵심이다.**
```
AI_PROVIDER=team
STT_PROVIDER=team
TEAM_AI_BASE_URL=<Team FastAPI 주소>
```

### OpenAI (rollback 경로, 선택)

`OPENAI_API_KEY` · `OPENAI_MODEL`(기본 `gpt-5-mini`) · `OPENAI_TRANSCRIBE_MODEL` · `OPENAI_TIMEOUT_MS` · `OPENAI_MAX_RETRIES` · `AI_FALLBACK_TO_MOCK`

Team이 죽었을 때 `AI_PROVIDER=openai`로 되돌릴 수 있게 남겨 둔 경로다. 데모에서는 쓰지 않는다.

### 전화 webhook (ClawOps)

`PHONE_PROVIDER` · `PHONE_WEBHOOK_SECRET` · `CLAWOPS_ACCOUNT_ID` · `APP_BASE_URL` · `DEMO_CALLER_PHONE` · `DEMO_CALLER_PATIENT_ID`

> ⚠️ `PHONE_WEBHOOK_SECRET`은 서명 검증 키다. 절대 커밋하지 않는다.

---

## 4. Frontend Architecture

```
components/IntakeWorkspace.tsx   전체 shell. 탭 전환·세션·polling·상태를 여기서 쥔다
components/design/*              화면 컴포넌트 (.dc-* CSS 사용). 발표용 최종 UI
lib/ui/*                         화면이 쓰는 순수 로직 (렌더링과 분리 → 테스트 가능)
lib/ai/*                         Team/OpenAI 어댑터. zod로 응답 계약 검증
app/api/v1/*                     Next Route Handler. 브라우저 ↔ Team 사이 proxy
```

**중요한 구조 규칙 하나** — 브라우저는 Team backend를 직접 호출하지 않는다. 항상 `app/api/v1/*` proxy를 거친다. 그래서 브라우저는 `TEAM_AI_BASE_URL`을 모른다.

```
브라우저 → /api/v1/... (Next, 서버) → Team FastAPI
```

---

## 5. Implemented Screens

| 화면 | 우리 proxy | Team API |
|---|---|---|
| **홈** | `GET /api/v1/intakes` | `GET /api/intakes` |
| **요청** (목록·상세) | `GET /api/v1/intakes`, `GET /api/v1/intakes/{id}` | `GET /api/intakes`, `GET /api/intakes/{id}` |
| **요청** (분석) | `POST /api/v1/intakes/analyze` | `POST /api/intakes` (`save:false`) |
| **요청** (음성) | `POST /api/v1/transcriptions` | `POST /api/stt` |
| **일정** | 목록 + 각 건 상세 | 위와 동일 |
| **어르신** | `GET /api/v1/profiles`, `GET /api/v1/profiles/{phone}` | `GET /api/profiles`, `GET /api/profiles/{phone}` |
| **사후기록** | `GET /api/v1/post-records`, `POST /api/v1/post-records/{id}/approve` | 동일 경로 |
| **처리 이력** | `GET /api/v1/audit` | `GET /api/audit` |
| **로그인** | `POST /api/v1/auth/login`, `POST /api/v1/auth/logout` | `POST /api/auth/login`, `POST /api/auth/logout` |

`POST /api/v1/post-records`(초안 생성) proxy는 존재하지만 **브라우저 UI에서 호출하지 않는다.** 초안은 전화/매니저 경로에서 만들어지고, 이 화면은 검토·승인 전용이다.

---

## 6. Browser Voice Flow

브라우저에서 마이크로 접수하는 실제 흐름:

```
MediaRecorder (최대 30초)
  → POST /api/v1/transcriptions → Team POST /api/stt (faster-whisper)
  → transcript를 textarea에 채운다
  → 사회복지사가 읽고 고친다              ← 여기가 핵심
  → [분석] 버튼을 사람이 누른다            ← 자동 분석 아님
  → POST /api/v1/intakes/analyze → Team POST /api/intakes (save:false)
  → 미리보기 카드 표시 (아직 저장 안 됨)
```

- **오디오는 저장하지 않는다.** 변환 후 버린다.
- **자동 분석하지 않는다.** STT 결과를 사람이 확인한 뒤 직접 누른다.
- **`save:false`** — 브라우저 분석은 미리보기다. DB에 접수를 만들지 않는다.

### Team `/api/intakes/from-audio`를 쓰지 않는 이유

`/from-audio`는 오디오 → STT → 분석 → 저장을 한 번에 처리한다. 편하지만 **transcript를 사람이 볼 기회가 사라진다.**

어르신 발화는 사투리·잡음·말끊김이 많아 STT가 틀리는 일이 흔하다. 틀린 transcript가 그대로 분석되어 저장되면, 화면에는 그럴듯한 접수카드가 뜨고 사회복지사는 원문이 틀렸다는 걸 알 방법이 없다. 그래서 브라우저 경로는 **STT 결과 사람 검토**를 반드시 거치게 나눠 뒀다.

전화 경로는 사람이 개입할 수 없으므로 다르게 취급한다 — 전화로 들어온 접수는 화면에서 **원문과 함께** 보여 주고 확인 상태를 붙인다.

---

## 7. Saved Intake

- **조회 전용.** 이 화면은 접수를 만들거나 고치지 않는다.
- **Bearer 인증 필수.** Team이 `/api/intakes` 계열에 `intake.view` 권한을 요구한다.
- **요청 탭에서 5초 polling.** 홈·일정은 진입할 때 한 번만 읽는다.
- **미리보기와 저장 접수를 분리한다.** 미리보기는 `preview-*`, 저장분은 `saved-*` id를 쓴다. polling 결과가 미리보기를 지우지 않는다.
- **`detail.gate`는 서버 값을 그대로 쓴다.** frontend가 확정 가능 여부를 계산하지 않는다.

polling 안전장치(이미 구현·테스트됨): 겹쳐 호출하지 않음 · 늦게 도착한 응답 무시 · 실패해도 기존 목록 유지 · 보고 있던 항목 선택 유지 · **미로그인이면 아예 polling 시작 안 함**(네트워크 0건).

---

## 8. Auth

```
로그인 폼 → POST /api/v1/auth/login → Team POST /api/auth/login  {user_id, password}
  → {token, user} → sessionStorage["donghaengori.team.session"]
  → 이후 모든 조회에 Authorization: Bearer <token>
  → Next proxy가 헤더를 읽어 Team으로 전달
```

- 토큰은 **Authorization 헤더로만** 나간다. URL·query·cookie·DOM에 넣지 않는다.
- **sessionStorage** 사용 — 탭을 닫으면 사라진다.
- 로그인 진입점은 **sidebar 하단 한 곳**. 어느 탭에 있든 그 자리에서 로그인하고, 로그인 후에도 보던 탭에 남는다.
- Team이 401을 주면 세션을 지우고 로그인 필요 상태로 돌린다. **자동 재시도하지 않는다.**
- 401(로그인 필요) · 403(권한 없음) · 502(backend 연결 실패)를 화면이 각각 다르게 안내한다. 뭉개지 않는다.

---

## 9. Intentionally NOT Connected

**아래 두 write는 의도적으로 연결하지 않았다. 그냥 이어 붙이지 말 것.**

### `POST /api/intakes/{id}/verify`

Team에서 이 엔드포인트는 **"통화로 확인함"** 을 뜻한다. 호출하면 감사 로그에 `항목확인`이 남고 카드 근거에 "통화로 확인함"이 붙는다. 즉 **사회복지사가 어르신에게 전화를 걸어 직접 확인했다는 기록**이다.

그런데 현재 화면의 `이 값 사용` / `수정`(U2-A)은 **직원이 화면에서 값을 고른 것**일 뿐이다. 전화를 건 적이 없다.

이 둘을 그대로 연결하면, 사무실에서 버튼 한 번 누른 것이 "통화로 확인함"으로 기록된다. 나중에 사고가 났을 때 **누가 실제로 확인했는지 답할 수 없게 된다.** 그래서 막아 뒀다.

→ 연결하려면 먼저 **generic 직원 수정**과 **통화 확인**을 서로 다른 의미로 나누는 계약이 필요하다. (TODO 4)

### `POST /api/intakes/{id}/confirm`

최종 확정. shell은 만들어져 있고 server gate도 실제로 읽지만 **버튼은 전부 `disabled`** 이고 화면에 "확정 API가 연결되지 않아 두 행동 모두 비활성화되어 있습니다"라고 적어 뒀다.

연결 전 정리할 것: 긴급 접수 차단, 중복 호출 방지, `acknowledge`(미확인 확정) 별도 흐름. (TODO 5·8·9)

**둘 다 우리 저장소에 route 파일 자체가 없다.** 실수로 호출될 경로가 없다.

---

## 10. Safety Invariants

**이 12가지는 제품의 존재 이유다. integration 중에 하나라도 깨지면 그건 리팩터링이 아니라 사고다.**

| # | 불변식 | 지금 코드에서 |
|---|---|---|
| 1 | AI 추정 ≠ 확정 | 상태를 3단계로 나눠 표시 |
| 2 | 확인됨 / 추정 / 확인 필요를 섞지 않는다 | `EvidenceStatus` 3종 |
| 3 | 과거 이력만 있는 병원은 직원 확인 전까지 **추정** | Team이 "확인됨"을 줘도, 발화에 병원명이 직접 없으면 `INFERRED`로 강등 |
| 4 | 발신번호로 대상자를 확정하지 않는다 | 프로필이 일치해도 대상자는 확인 필요 |
| 5 | 대상자(target)는 항상 확인 필요 | 저장값이 무엇이든 `NEEDS_CONFIRMATION` 고정 |
| 6 | 화면에서 값 고른 것 ≠ backend verify | U2-A는 local 작업값. 하단에 그렇게 적혀 있다 |
| 7 | server gate가 없으면 추측하지 않는다 | `gate: null` → "확정 가능 여부를 판단하지 않습니다" |
| 8 | 긴급은 일반 확정 경로로 보내지 않는다 | urgent면 finalization shell 자체를 렌더링하지 않음 |
| 9 | 긴급 확신도가 없으면 true로 올리지 않는다 | `urgent_confident` 없으면 `null` 유지 |
| 10 | 사후기록 초안 ≠ Care Profile 반영 | 승인 응답의 `applied=true`일 때만 "실제 반영" 표시 |
| 11 | 최종 확정은 사람이 한다 | AI 자동 확정 경로 없음 |
| 12 | AI가 의료 판단을 하지 않는다 | 진단·처방·확진 표현 0건 |

추가로 U10에서 정리한 것:
- **확정 여부는 배지가 아니라 서버의 `confirmed` 값으로만 판단한다.** (배지 없음 = 확인할 게 없다는 뜻이지 확정됐다는 뜻이 아니다)
- 미리보기는 확정 목록에 들어가지 않는다.
- 로딩 · 오류 · 검색 결과 없음 · 데이터 없음을 서로 다른 문구로 구분한다.

---

## 11. Design Guardrails

`components/design/*` 와 `.dc-*` CSS는 **발표용 최종 Presentation UI**다. integration 중에 건드리지 말 것.

### 고정 치수

| 항목 | 값 | selector |
|---|---|---|
| Sidebar | **188px** | `.dc-nav` |
| 요청 목록 | **272px** | `.dc-list`, `.dc-elder-list` |
| 상세 좌측 | **300px** | `.dc-detail-left` |

최소 지원 폭 1240px 기준으로 QA 완료. 1600px에서도 확인함.

### 브랜드

| 항목 | 값 |
|---|---|
| 심볼 | 투명 배경 (`public/brand/donghaengori-logo.png`) |
| 텍스트 | `동행고리AI` (AI 앞 공백 없음) |
| 로고 크기 | 30 × 30px |
| 텍스트 | 17px / 700 |
| 로고–텍스트 간격 | 9px |
| **공식 accent** | **`#F94704`** |
| primary CTA 라벨 | **`#1F1D1A`** (본문·제목과 같은 ink) |
| primary 버튼 hover | **`#E75413`** (hover 전용 보조색) |

**`#F94704`가 동행고리AI 공식 brand accent다.** 코드 전체(19곳)가 이 값으로 정규화되어 있다.

이 accent가 쓰이는 곳: primary CTA 배경 · 선택된 행 표시 · active 상태 테두리 · focus ring · 신규 도착 점.

**`#E75413`은 primary 버튼 hover에만 쓰는 보조색이다.** 브랜드 색이 두 개라는 뜻이 아니다 — 공식 primary는 `#F94704` 하나이고, 이 값은 hover 한 곳에서만 등장한다. 다른 곳에 쓰지 말 것.

### primary CTA 대비 — 이 세 값은 함께 움직인다

| 상태 | 배경 | 라벨 | 대비 | WCAG AA (4.5:1) |
|---|---|---|---|---|
| default | `#F94704` | `#1F1D1A` | **4.75:1** | 통과 |
| hover | `#E75413` | `#1F1D1A` | **4.54:1** | 통과 |

라벨이 흰색이 아닌 이유: `#F94704` 위의 흰 글자는 **3.54:1**로 AA에 미달한다. 본문·제목에 쓰는 ink `#1F1D1A`를 얹어야 4.75:1이 된다.

hover가 크게 어둡지 않은 이유: 라벨을 `#1F1D1A`로 고정하면 배경 휘도가 **L ≥ 0.231** 이어야 AA가 유지된다. 그래서 `#E75413`은 **휘도를 거의 유지한 채 채도만 낮춘다** — 눈에는 또렷하게 바뀌지만(ΔE 12.3) 대비는 깨지지 않는다.

> ⚠️ **셋 중 하나만 바꾸면 접근성이 깨진다.** 라벨을 흰색으로 되돌리거나, hover를 더 어둡게(예: `#D43C03` → 3.56:1) 만들면 AA를 잃는다. 바꿔야 한다면 세 값을 함께 재계산할 것.

> ⚠️ **integration 중 다른 orange로 바꾸지 말 것.** `#F97316`·`#EA580C` 등 이전 값이나 임의의 주황으로 되돌리면 화면마다 색이 섞인다. 브랜드 색을 바꿔야 한다면 19곳을 한 번에 바꾸는 별도 작업으로 처리한다.

### orange 계열이지만 accent가 아닌 값 (건드리지 말 것)

| 값 | 역할 |
|---|---|
| `#9A3412` · `#C2410C` | 강조 텍스트 (미확인 확정, 일정 kicker 등) |
| `#D97706` · `#B45309` · `#92400E` | **경고(amber)** — 확인 필요·blocker |
| `#FFF7ED` · `#FFFAF5` · `#FFFDF5` · `#FED7AA` · `#FDE68A` | 경고·참고 배경/테두리 |

경고(amber)·긴급(빨강 `#B91C1C`)·성공(초록 `#047857`)·중립(회색)은 **상태 의미를 가진 색**이다. accent와 섞지 않는다.

상태 chip은 **연한 배경 + 어두운 텍스트**로, accent는 **채운 고채도 면**으로 그린다. 이 렌더링 차이가 둘을 구분하는 장치이므로 유지할 것.

### 금지

- 전면 redesign
- UI framework 교체 / Tailwind · shadcn · MUI · Bootstrap 임의 도입
- orange 남발 (현재 채운 주황 버튼은 화면당 1개 이하)
- **confirmed 배지 추가** (확정 표시는 서버 값 기준으로만)
- **AI confidence % 표시** (숫자 확신도는 근거 없는 신뢰를 만든다)

---

## 12. Backend TODO — 김도형

### 데모 성패를 가르는 것 (먼저)

- [ ] **1. 실제 Team backend URL 결정** — GPU 노트북 주소 / 터널 / 고정 IP 중 무엇으로 갈지
- [ ] **2. frontend `TEAM_AI_BASE_URL` 설정** — `.env.local`에 1번 결과 반영
- [ ] **3. 실제 runtime backend SHA 기록** — 데모 당일 Team backend가 어느 커밋으로 도는지. 계약이 바뀌면 frontend가 502를 낸다
- [ ] **16. ClawOps public reachability** — ClawOps가 우리 webhook에 실제로 도달하는지
- [ ] **17. 실제 전화 → STT → AI → DB → frontend E2E** — 끝에서 끝까지 한 번은 돌려 볼 것

### write 연결 (계약 정리 후)

- [ ] **4. `/verify` 의미 계약 정리** — generic 직원 수정과 통화 확인을 분리 ([9절](#9-intentionally-not-connected) 참고)
- [ ] **5. `/confirm` 최종 연결** — 8·9번 해결 후
- [ ] **6. 사람이 확인한 hospital/target normalization** — 확인 후 상태를 무엇으로 올릴지

### backend 쪽 알려진 문제 (감사 중 실측 확인됨)

- [ ] **8. 긴급 접수가 일반 `/confirm`으로 확정된다** — 긴급은 카드가 없어서 gate가 `allowed=true`로 통과한다. 확정하면 `status`가 `긴급` → `확정`으로 덮여 **긴급 표시가 사라진다**. frontend는 막고 있지만 backend가 뚫려 있다
- [ ] **9. `/confirm` 재호출이 멱등이 아니다** — 같은 건을 두 번 확정하면 감사 로그가 두 번 쌓인다 (실측 2건 → 4건). write 연결 시 중복 클릭 차단 필수
- [ ] **10. `/api/audit`에 target filter·pagination이 없다** — 지금은 전체를 받아 frontend가 걸러 쓴다. 로그가 500건을 넘으면 오래된 접수 이력이 조회 범위 밖으로 밀린다
- [ ] **11. Post Record create에 idempotency가 없다** — 같은 요청 2번 = 레코드 2개. 현재 UI에 생성 진입점이 없어 노출은 안 되지만, 전화 경로에서 재시도가 생기면 문제가 된다
- [ ] **12. Post Record create에 permission 검사가 없다** — approve는 `post.approve`를 보는데 create는 인증만 확인하고 권한을 안 본다
- [ ] **13. 검토 대기 → 거절이 no-op** — 승인된 적 없는 초안을 거절하면 상태 전이가 없어 **감사 로그도 안 남는다**. 그래서 frontend의 거절 버튼을 막아 뒀다
- [ ] **14. 전화 callback duplicate/idempotency** — 같은 통화 이벤트가 두 번 오면 접수가 두 건 생기지 않는지
- [ ] **15. PR #55 safety 상태 확인** — history-only hospital을 추정으로 내리는 수정. merge 여부 확인

### 7번

- [ ] **7. 실제 Audit 최종 연결 검증** — 접수 상세의 처리 이력은 현재 "아직 연결되지 않았습니다" 상태다. 인증된 audit read를 붙인 뒤 실제 이벤트가 뜨는지 확인

---

## 13. Final Demo Flow

```
어르신이 전화를 건다
  → ClawOps 수신
  → GPU 노트북의 Team FastAPI로 webhook
  → faster-whisper STT
  → AI 분석 + Care Memory 조회 (과거 동행 이력)
  → DB 저장
  → frontend 요청 탭이 5초 polling으로 감지
  → "새 요청" 표시와 함께 목록에 등장
  → 사회복지사가 클릭
      · 원문 발화 그대로
      · 접수카드 (대상자·병원·날짜·시각·진료과)
      · 각 항목에 확인됨 / 추정 / 확인 필요 상태와 근거
  → 사회복지사가 검토하고 필요하면 어르신에게 확인 전화
  → 처리 이력(Audit)에 누가 무엇을 했는지 남는다
```

**데모에서 말할 것** — "AI가 접수를 대신 처리하는 게 아니라, **사회복지사가 판단할 재료를 정리해 주는 것**입니다. 확정은 사람이 합니다."

**현재 시연 가능 범위** — 위 흐름에서 `사회복지사가 검토`까지는 동작한다. **최종 확정 버튼은 비활성 상태**다(계약 정리 전). 시연 시 이 점을 미리 말해 두면 오해가 없다.

---

## 14. Demo Data

- **실제 환자·보호자 데이터를 쓰지 않는다.** synthetic data만 사용한다.
- Team 저장소의 시드 프로필(강덕례·박순자 등)은 합성 데이터다. 그대로 써도 된다.
- 화면에서 전화번호는 항상 마스킹된다 (`010-••••-5678`).
- 스크린샷·녹화를 남길 때도 합성 데이터인지 한 번 더 확인할 것.

---

## 15. Tests

```bash
npm test          # 30 files / 322 tests PASS  (네트워크 호출 없음)
npm run typecheck # PASS
npm run lint      # PASS (0 error / 0 warning)
npm run build     # PASS
```

테스트는 전부 오프라인이다. Team backend 없이도 돌아간다.

**integration 중 규칙** — 테스트가 깨지면 테스트를 고치지 말고 원인을 찾을 것. 특히 `lib/ai/savedIntakeView.ts`·`lib/ai/teamIntakeRead.ts`의 상태 정규화 테스트가 깨지면 [10절 안전 불변식](#10-safety-invariants)이 깨졌다는 뜻이다.

계약이 실제로 바뀌어서 테스트를 고쳐야 한다면, **무엇이 왜 바뀌었는지 커밋 메시지에 남길 것.**

---

## 16. 연락 / 질문

- frontend 코드 관련: 이 문서 4~11절
- 무엇을 연결해야 하는지: 12절 체크리스트
- 왜 연결하지 않았는지: 9절
- UI를 바꿔도 되는지: 11절 (대부분 답은 "아니오")
