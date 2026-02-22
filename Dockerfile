# -- Build stage --
FROM node:20-alpine AS build
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build && npm run build:server

# -- Deps stage (production only) --
FROM node:20-alpine AS deps
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# -- Production stage --
FROM node:20-alpine
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
COPY package.json ./
ENV PORT=3000 DB_PATH=./data/cloudnotepad.db
VOLUME ["/app/data"]
EXPOSE 3000
CMD ["node", "dist-server/index.js"]
