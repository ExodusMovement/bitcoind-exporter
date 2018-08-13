FROM node:10.8.0-alpine AS builder

ENV NODE_ENV production

COPY . ./build
WORKDIR /build
RUN yarn install --production
RUN ls -A1 | egrep -v "node_modules|index.js|LICENSE|package.json|yarn.lock" | xargs rm -r

FROM node:10.8.0-alpine

ENV NODE_ENV production
COPY --chown=node:node --from=builder /build /home/node/bitcoind-exporter
RUN ln -s /home/node/bitcoind-exporter/index.js /usr/local/bin/bitcoind-exporter
USER node
CMD bitcoind-exporter
