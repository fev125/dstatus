FROM node:16 as build

WORKDIR /app
COPY package*.json ./
RUN npm install --registry=https://registry.npm.taobao.org
COPY . .

FROM node:16-buster-slim
WORKDIR /app
COPY --from=build /app /app
RUN npm install -g nodemon

# 默认使用 nodemon 启动
CMD [ "nodemon", "nekonekostatus.js" ]