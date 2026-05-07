FROM node:22-alpine

WORKDIR /app

COPY package.json yarn.lock ./
COPY prisma ./prisma
RUN yarn install --frozen-lockfile --production=false

COPY tsconfig.json nest-cli.json ./
COPY src ./src
RUN npx nest build

RUN yarn install --frozen-lockfile --production && yarn cache clean

CMD ["node", "dist/main"]
