# 동행고리AI (Donghaeng-i / CareBridge)

전남 군 단위 고령자의 병원동행 요청을 사회복지사가 빠르게 검토할 수 있도록 돕는 Phase 1 운영 Copilot입니다.

어르신에게 새 앱 사용법을 요구하지 않으며, AI는 대상자·병원·일정 후보와 근거·확인 질문만 제시합니다. 대상자 식별, 접수 확정, 안전 확인은 항상 사회복지사가 수행합니다.

## Phase 1 범위

구현한 흐름은 다음과 같습니다.

```text
텍스트 입력
  → 가상 대상자·케어 프로필 조회
  → 과거 동행 이력 조회
  → mock 분석 provider
  → JSON schema 검증
  → AI 접수카드
  → 사회복지사 수정·접수 확정(브라우저 로컬 상태)
```

포함하지 않는 기능: 전화망, STT, 실제 개인정보, 실제 병원 예약, 의료 판단, 인증, 자동 담당자 배정, 복잡한 RAG.

## 실행 방법

요구 환경: Node.js 22.13 이상

```bash
npm install
cp .env.example .env.local
npm run dev
```

브라우저에서 개발 서버가 출력한 로컬 주소(기본값 `http://localhost:3000`)를 엽니다.

검증 명령:

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

## 화면 사용

1. 왼쪽 입력 영역에 발신번호(선택)와 원문 발화를 입력합니다.
2. `AI 접수카드 만들기`를 누릅니다.
3. 오른쪽 카드에서 대상자 후보, 날짜·시간, 병원 후보, 진료과, 근거, 확인 질문, 이동 주의사항, Safety를 검토합니다.
4. 필요한 경우 `수정`으로 접수 필드를 로컬에서 고친 뒤 `접수 확정`을 누릅니다.

왼쪽의 CASE 1~5 Quick Fill 버튼으로 필수 시나리오를 바로 실행할 수 있습니다.

## 테스트 시나리오

| Case | 핵심 검증 |
| --- | --- |
| 1 | 김영자 후보, 명확한 날짜·시간·병원·진료과를 `CONFIRMED_BY_INPUT`으로 표시 |
| 2 | 박순자 후보, 모레 날짜 계산, 과거 3회 방문과 무릎 통증을 근거로 병원을 `INFERRED` 처리 |
| 3 | 과거 이력이 없는 문정자에 대해 병원 후보를 만들지 않고 확인 질문 생성 |
| 4 | “내일 아니고 모레”의 마지막 날짜 의도를 반영 |
| 5 | 호흡 곤란·어지러움 표현을 의료 판단 없이 사람 확인 신호로 표시 |
| 6 | 데이터에 없는 광주새봄병원을 직접 발화 병원으로 확인 |
| 7 | 병원이 없어도 직접 말한 날짜와 진료과를 확인 상태로 유지 |
| 8 | 날짜 자기 수정 후 최종 날짜를 직접 발화 상태로 유지 |

`tests/intake.test.ts`가 여덟 Case를 모두 자동 검증하며, CASE 1은 결과 전체가 출력 JSON schema를 통과하는지도 확인합니다.

## 상태 규칙

- `CONFIRMED_BY_INPUT`: 원문에서 직접 확인한 정보
- `INFERRED`: 과거 이력 또는 AI 추론으로 만든 후보
- `NEEDS_CONFIRMATION`: 근거가 부족해 담당자 질문이 필요한 정보
- `DRAFT_AI`: AI가 생성한 검토 전 접수카드
- `CONFIRMED`: 사회복지사가 로컬 UI에서 확정한 상태

발신번호는 후보 검색에만 사용하며 사람을 확정하지 않습니다. 과거 이력이 없는 “저번 데” 표현에는 병원 후보를 임의로 생성하지 않습니다. 모든 분석 결과는 `human_review_required: true`, `medical_judgement: false`를 유지합니다.

## API

`POST /api/v1/intakes/analyze`

요청 예시:

```json
{
  "caller_phone": "010-1111-1111",
  "transcript": "나 모레 저번에 무릎 봐준 데 가야겄어."
}
```

서버는 입력을 검증하고 mock provider 결과를 `IntakeAnalysisSchema`로 다시 검증한 후에만 UI로 반환합니다. 형식이 틀리면 400, 분석 과정이 실패하면 500 오류를 반환합니다.

## 구조

```text
app/
  api/v1/intakes/analyze/route.ts   # 분석 API Route
  page.tsx                          # 운영 화면 진입점
components/
  IntakeForm.tsx                    # 입력 및 CASE 1~5 Quick Fill
  IntakeCard.tsx                    # 구조화 접수카드와 로컬 수정/확정
  StatusBadge.tsx                   # 상태 시각화
  EvidenceList.tsx                  # 후보 판단 근거
lib/
  ai/analyzeIntake.ts               # repository 조회와 schema validation
  ai/mockProvider.ts                # Phase 1 규칙 기반 mock 분석기
  ai/provider.ts                    # 실제 AI 연결용 provider abstraction
  ai/schema.ts                      # Zod 입력·출력 schema
  data/                             # JSON repository layer
  date/parseRelativeDate.ts         # 오늘/내일/모레 및 자기 수정 처리
  domain/                           # 도메인 타입
data/                               # 5명 가상 프로필과 방문 이력
tests/                              # CASE 자동 테스트
```

JSON 접근은 repository layer 뒤에 두어 이후 Supabase/PostgreSQL 구현체로 교체할 수 있습니다. AI 분석도 `IntakeAnalysisProvider` 인터페이스 뒤에 두었으며 현재는 `mock`만 허용합니다.

## 현재 mock인 부분

- 자연어 분석은 외부 LLM 호출이 아닌 명시적 규칙과 가상 이력을 사용합니다.
- 날짜는 서버의 Asia/Seoul 기준일로 오늘/내일/모레, 월·일, 다음 주 요일을 계산합니다.
- 수정 및 접수 확정은 브라우저 메모리 상태이며 새로고침하면 초기화됩니다.
- 병원과 진료과는 가상 데이터이며 실제 예약이나 조회를 수행하지 않습니다.

## 다음 Phase 후보

1. `IntakeAnalysisProvider`를 구현하는 실제 AI adapter 추가 및 환경변수 기반 선택
2. 실제 AI 출력에도 동일 Zod schema validation과 실패 격리 적용
3. JSON repository를 Supabase/PostgreSQL repository로 교체
4. 개인정보·권한·감사 로그 정책이 확정된 뒤 인증과 영속 접수 이력 도입
5. 별도 검토를 거쳐 전화/STT 연계 가능성 평가

실제 의료 판단, 응급 여부 확정, 치료·복약 지시, 자동 병원 예약은 다음 Phase에서도 별도 승인 없이 도입하지 않습니다.
