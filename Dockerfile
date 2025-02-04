FROM node:18-slim as builder

WORKDIR /app
COPY package*.json ./
RUN npm install --registry=https://registry.npm.taobao.org

COPY . .

FROM node:18-slim
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd -r dstatus && useradd -r -g dstatus dstatus

COPY --from=builder /app /app
RUN chown -R dstatus:dstatus /app

USER dstatus

EXPOSE 5555 9999

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:5555', res => res.statusCode === 200 ? process.exit(0) : process.exit(1))"

CMD ["node", "nekonekostatus.js"]