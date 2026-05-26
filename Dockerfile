FROM node:22-bookworm-slim AS base
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS dev
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
CMD ["npm", "run", "dev"]
