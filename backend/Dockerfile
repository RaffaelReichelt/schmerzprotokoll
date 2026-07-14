FROM node:22-alpine AS deps

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev


FROM node:22-alpine

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY server.js ./

EXPOSE 3000

CMD ["node", "server.js"]
