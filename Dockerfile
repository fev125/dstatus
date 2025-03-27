FROM node:18 as builder

WORKDIR /app
COPY . ./
RUN npm install

FROM debian:bullseye-slim

# 安装 Node.js 和必要的依赖
RUN apt-get update && apt-get install -y \
    curl \
    && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# 创建 node 用户和组
RUN groupadd -r node && useradd -r -g node -m node

WORKDIR /app

# 从构建阶段复制文件
COPY --from=builder /app ./

# 创建目录并设置权限（分步执行以便于调试）
RUN mkdir -p /database && \
    mkdir -p /logs && \
    touch /tokens.json 

# 设置所有权和权限
RUN chown -R node:node /app && \
    chown node:node /database && \
    chown node:node /logs && \
    chown node:node /tokens.json && \
    chmod 755 /database && \
    chmod 755 /logs && \
    chmod 644 /tokens.json

# 设置数据卷
VOLUME ["/database", "/logs"]

USER node

EXPOSE 5555

CMD ["node", "nekonekostatus.js"]