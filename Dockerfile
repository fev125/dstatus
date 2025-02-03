FROM node:16 as build

WORKDIR /app
COPY package*.json ./
RUN npm install --registry=https://registry.npm.taobao.org
COPY . .

FROM node:16-buster-slim
WORKDIR /app
COPY --from=build /app /app

# 使用 node 直接启动
CMD ["node", "nekonekostatus.js"]