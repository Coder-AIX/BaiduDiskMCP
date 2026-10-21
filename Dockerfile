# syntax=docker/dockerfile:1

FROM node:22-bookworm AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM deps AS build
COPY . .
RUN npm run build

FROM node:22-bookworm AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

FROM node:22-bookworm AS portable
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY package.json package-lock.json .env.example ./
COPY scripts/start-linux.sh ./start.sh
COPY scripts/README-portable.txt ./README.txt
RUN mkdir -p /out/data \
    && cp -a /app/build /out/build \
    && cp -a /app/node_modules /out/node_modules \
    && cp /app/package.json /app/package-lock.json /app/.env.example /out/ \
    && mv /out/.env.example /out/.env \
    && cp /app/start.sh /app/README.txt /out/ \
    && cp /usr/local/bin/node /out/node \
    && chmod +x /out/node /out/start.sh

FROM scratch AS export
COPY --from=portable /out /

FROM node:22-bookworm-slim AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    BODY_SIZE_LIMIT=3G \
    DB_PATH=./data/app.db
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY package.json ./
RUN mkdir -p /app/data && chown -R node:node /app
USER node
EXPOSE 3000
VOLUME ["/app/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "const p=process.env.PORT||3000;fetch('http://127.0.0.1:'+p+'/admin').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"
CMD ["node", "build"]
