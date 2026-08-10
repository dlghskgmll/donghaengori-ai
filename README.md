# 동행고리AI (Donghaeng-i / CareBridge)

전남 군 단위 고령자의 병원동행 요청을 사회복지사가 빠르게 검토하도록 돕는 Phase 2 Intake AI 프로토타입입니다. AI는 대상자·병원·일정 후보와 근거·확인 질문만 제시하며, 대상자 식별·접수 확정·안전 확인은 항상 사회복지사가 수행합니다.

현재는 가상 대상자·케어 프로필·방문 이력만 사용합니다. 실제 개인정보를 입력하거나 운영 데이터에 연결하면 안 됩니다.

## Phase 2 흐름

```text
텍스트 입력
  → 가상 대상자·케어 프로필·최근 방문 이력 조회
  → 날짜·시간·위험 표현의 결정론적 전처리
  → provider 선택(mock | openai | auto)
  → OpenAI 사용 시 최소화한 문맥으로 Responses API structured output 호출
  → evidence ref 허용 목록 검사와 서버 후처리
  → 최종 Zod schema 검증
  → provider·처리시간·fallback 메타데이터와 AI 접수카드 표시
  → 사회복지사 검토·수정·로컬 확정
```

OpenAI에는 발신번호, 전체 주소, 출생연도, 보호자 연락처를 보내지 않으며 원문의 전화번호·주민번호·이메일·알려진 전체 주소·API 키 형태도 전송 전에 마스킹합니다. 원문 발화 자체는 분석 입력이므로 이 프로토타입에는 실제 개인정보가 포함된 발화를 넣지 마세요.

## 실행과 환경 설정

요구 환경은 Node.js 22.13 이상입니다.

```bash
npm install
cp .env.example .env.local
npm run dev
```

`.env.local`은 사용자가 로컬에서 직접 만들고 관리합니다. 실제 `OPENAI_API_KEY`는 `.env.local`에만 넣고, 코드·문서·로그에 적거나 Git에 커밋하지 마세요. `.env.example`에는 키 값을 넣지 않습니다.

기본 환경변수:

```dotenv
AI_PROVIDER=mock
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5-mini
OPENAI_TIMEOUT_MS=15000
OPENAI_MAX_RETRIES=1
AI_FALLBACK_TO_MOCK=true
```

provider 모드:

- `mock`: 기본값. 외부 API를 호출하지 않고 규칙 기반 provider를 사용합니다.
- `openai`: `OPENAI_API_KEY`가 있을 때 실제 OpenAI provider를 사용합니다.
- `auto`: 키가 있으면 OpenAI, 없으면 mock을 사용합니다.

## 검증 명령

```bash
npm test
npm run typecheck
npm run lint
npm run build
npm run test:openai
```

`npm test`는 mock CASE 회귀, provider routing, structured output 후처리, evidence 검증, 오류·fallback 안전성 등을 네트워크 없이 검사합니다. `npm run test:openai`는 실제 API smoke test이며, `OPENAI_API_KEY`가 없으면 네트워크 호출 없이 skip됩니다.

## Fallback과 화면 메타데이터

`AI_FALLBACK_TO_MOCK=true`이면 OpenAI timeout, 네트워크·호출 한도 오류, refusal, incomplete, 잘못된 structured output 또는 evidence 위반 시 mock provider로 안전하게 재처리합니다. 화면에는 다음이 표시됩니다.

- 실제 사용된 provider 또는 `Fallback`
- 전체 처리시간
- fallback 시 `실제 AI 연결에 실패하여 기본 분석 모드로 처리했습니다.` 안내

API 응답의 `meta`에는 `requested_provider`, `provider_used`, `model`, `fallback_used`, provider/전체 latency와 내부 warning 코드가 포함됩니다. 원본 OpenAI 응답이나 API 키는 클라이언트에 반환하지 않습니다.

`AI_FALLBACK_TO_MOCK=false`이고 실제 AI 분석이 실패하면 API는 안전한 일반 오류 메시지와 503을 반환합니다.

## 안전·근거 규칙

- `CONFIRMED_BY_INPUT`: 원문에서 직접 확인한 정보
- `INFERRED`: 제공된 가상 과거 이력과 발화를 결합한 후보
- `NEEDS_CONFIRMATION`: 근거가 부족해 담당자 확인이 필요한 정보
- 모든 결과는 `human_review_required: true`, `medical_judgement: false`를 유지합니다.
- 날짜·시간 계산은 서버의 결정론적 결과가 우선하며 LLM이 덮어쓰지 않습니다.
- 허용되지 않은 evidence ref는 제거·경고되며 반복 위반은 결과를 거절합니다.
- 위험 표현은 사람의 즉시 확인 신호일 뿐, 응급 여부·진단·치료·복약 판단이 아닙니다.
- 과거 이력이 없는 “저번 병원” 표현에는 병원을 임의 생성하지 않습니다.

실제 데이터 사용 전에는 개인정보 처리, 보안, 접근권한, 보관·삭제, 감사 로그, 의료·기관 정책에 대한 별도 검토와 기관 승인이 필요합니다.

## API

`POST /api/v1/intakes/analyze`

```json
{
  "caller_phone": "010-1111-1111",
  "transcript": "나 모레 저번에 무릎 봐준 데 가야겄어."
}
```

발신번호는 서버의 가상 대상자 후보 검색에만 사용하며 사람을 확정하지 않습니다. 성공 응답은 기존 `IntakeAnalysis` 필드를 최상위에 유지하고 `intake_id`, `status: DRAFT_AI`, optional `meta`를 추가합니다.

## 현재 범위 밖

전화망, 마이크, STT, 인증, 실제 개인정보 저장, 실제 병원 조회·예약, SMS, 담당자 자동 배정, 의료 판단은 구현하지 않았습니다. STT 연계는 Phase 3 계획 항목이며 현재 코드에는 포함되어 있지 않습니다.
