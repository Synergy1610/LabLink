FROM node:26-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY src ./src
COPY views ./views
COPY public ./public
USER node
EXPOSE 8080
CMD ["node", "src/server.js", "--hosted-demo"]
