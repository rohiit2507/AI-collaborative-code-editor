FROM node:22-alpine

WORKDIR /app
RUN apk add --no-cache docker-cli
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY migrations ./migrations

ENV NODE_ENV=production
EXPOSE 5000
CMD ["node", "src/server.js"]
