# 관리자 운영 콘솔 (Next.js) — 컨테이너 이미지
#
# **정적 서빙이 안 되는 앱이다.** app/api/v1/* 이 Route Handler 라 Node 런타임이
# 필요하다. nginx 로 파일만 뿌리는 방식으로는 못 띄운다.
#
# 3단계로 나눈 이유는 재빌드 시간이다. 소스 한 줄 고쳤을 때 npm ci 를 다시
# 돌리면 매번 1분 넘게 기다린다. package*.json 만 먼저 복사해 두면 의존성이
# 안 바뀌는 한 그 레이어가 캐시된다.

# syntax=docker/dockerfile:1

FROM node:22-alpine AS deps
WORKDIR /src
COPY package.json package-lock.json ./
# npm 캐시를 레이어 밖에 두면 레이어가 깨져도 네트워크를 다시 타지 않는다.
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

FROM node:22-alpine AS build
WORKDIR /src
COPY --from=deps /src/node_modules ./node_modules
COPY . .
# 빌드 시점에는 backend 를 부르지 않는다. 실제 주소는 런타임 env 로 들어온다.
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# standalone 산출물만 옮긴다. node_modules 를 통째로 넣지 않아 이미지가 작다.
COPY --from=build /src/.next/standalone ./
COPY --from=build /src/.next/static ./.next/static
COPY --from=build /src/public ./public

# root 로 돌리지 않는다. node 이미지에 이미 있는 계정을 쓴다.
USER node

EXPOSE 3000
CMD ["node", "server.js"]
