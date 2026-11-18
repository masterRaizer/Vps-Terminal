FROM node:22.11.0-alpine3.20
WORKDIR /app
COPY server.mjs ./
RUN mkdir /data && chown node:node /data
USER node
ENV DATA_DIR=/data PORT=8787 HOST=0.0.0.0
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8787/healthz || exit 1
CMD ["node", "server.mjs"]
