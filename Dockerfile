# Backend do gamefps p/ EasyPanel (VPS): Node 22, Fastify + WS na porta 3001.
# Monte um volume em /app/data (company.json) e informe as envs do .env.example.
FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . ./
ENV NODE_ENV=production PORT=3001
EXPOSE 3001
VOLUME ["/app/data"]
CMD ["npx", "tsx", "server/index.ts"]
