ARG NODE_IMAGE=node:24-bookworm-slim
ARG NGINX_IMAGE=nginx:1.28-alpine

FROM ${NODE_IMAGE} AS build
WORKDIR /workspace
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY index.html vite.config.js ./
COPY config ./config
COPY src ./src
COPY public ./public

# CorpId 是公开标识；实际 .env 和开发固定凭据不进入构建上下文。
ARG VITE_DINGTALK_CORP_ID
RUN test -n "$VITE_DINGTALK_CORP_ID" || (echo 'VITE_DINGTALK_CORP_ID is required for production authentication' >&2; exit 1)
RUN VITE_AUTH_MODE=production npm run build

FROM ${NGINX_IMAGE} AS runtime
ENV BACKEND_UPSTREAM=knowledge-backend:8000 \
    NGINX_ENVSUBST_FILTER="^BACKEND_UPSTREAM$"
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /workspace/dist /usr/share/nginx/html/knowledge-accumulation
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1
CMD ["nginx", "-g", "daemon off;"]
