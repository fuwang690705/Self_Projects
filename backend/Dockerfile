FROM node:24-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV FFMPEG_PATH=/usr/bin/ffmpeg

COPY package*.json ./
RUN apk add --no-cache ffmpeg
RUN npm ci --omit=dev

COPY src ./src

EXPOSE 3001

CMD ["node", "src/server.js"]
