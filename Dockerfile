FROM node:18-alpine

RUN mkdir -p /usr/src/media-cache
WORKDIR /usr/src/media-cache

COPY package.json package-lock.json ./

RUN --mount=type=cache,target=/root/.npm \
    npm ci

# Issue with prisma nuxt module https://github.com/prisma/nuxt-prisma/issues/12
RUN echo "" > node_modules/@prisma/nuxt/dist/runtime/server/utils/prisma.d.ts

COPY . .
RUN npx prisma generate && npm run build

ENV NUXT_HOST=0.0.0.0
ENV NUXT_PORT=3000

EXPOSE 3000

ENTRYPOINT ["sh", "-c", "npx prisma migrate deploy && node .output/server/index.mjs"]