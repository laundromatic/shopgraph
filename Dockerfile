FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY dist/ ./dist/
COPY .env* ./
EXPOSE 3000
CMD ["node", "dist/http-server.js"]
