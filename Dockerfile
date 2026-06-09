FROM node:22.22.3-alpine3.23 AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .

ARG VITE_API_BASE_URL=""
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

RUN npm run build


FROM nginx:1.30.2-alpine3.23 AS runtime

RUN apk add --no-cache gettext \
    && rm -f /etc/nginx/conf.d/default.conf \
    && mkdir -p /var/cache/nginx /tmp/nginx \
    && chown -R nginx:nginx /var/cache/nginx /tmp/nginx /etc/nginx

COPY --chown=nginx:nginx nginx.conf /etc/nginx/nginx.conf.template
COPY --chown=nginx:nginx entrypoint.sh /entrypoint.sh
COPY --from=builder --chown=nginx:nginx /app/dist /usr/share/nginx/html

RUN chmod +x /entrypoint.sh

USER nginx

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1

ENTRYPOINT ["/entrypoint.sh"]
