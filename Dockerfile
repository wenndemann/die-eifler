# Die Eifeler im Container: das gebaute Spiel, die Weltdaten und der Vermittlungs-Server für den Mehrspieler aus einem
# Node-Prozess (server/vermittlung.mjs mit STATISCH und WELT_DATEN).
#
#   docker build -t die-eifeler .                              # mit Weltdaten der ganzen Eifel
#   docker build --build-arg WELT_GEBIET=nideggen -t … .       # kleineres Gebiet (mehrere: "nideggen nordeifel")
#   docker build --build-arg WELT_GEBIET= -t … .               # ohne Weltdaten im Image
#   docker run -p 8787:8787 die-eifeler                        # http://localhost:8787
#   docker run -p 8787:8787 -v ./welt-daten:/welt:ro die-eifeler   # eigene Weltdaten aus einem Ordner (gehen vor)

ARG NODE_VERSION=22

# ------------------------------------------------------------------ Spiel bauen
FROM node:${NODE_VERSION}-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# ------------------------------------------------------------------ Weltdaten aus dem GitHub-Release (tools/welt-laden.sh)
# Auch allein nutzbar, um ein Volume zu füllen: docker compose --profile welt run --rm welt-laden nideggen
FROM debian:bookworm-slim AS welt
RUN apt-get update && apt-get install -y --no-install-recommends bash ca-certificates curl python3 tar gzip \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY tools/welt-laden.sh tools/welt-laden.sh
ENV WELT_DATEN=/app/welt-daten
ARG WELT_GEBIET=eifel
RUN mkdir -p "$WELT_DATEN" && if [ -n "$WELT_GEBIET" ]; then tools/welt-laden.sh $WELT_GEBIET; fi
ENTRYPOINT ["tools/welt-laden.sh"]
CMD ["eifel"]

# ------------------------------------------------------------------ Laufzeit: nur Node, ws und die gebauten Dateien
FROM node:${NODE_VERSION}-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY server server
COPY data data
COPY --from=build /app/dist dist
COPY --from=welt --chown=node:node /app/welt-daten welt-daten
# Weltdaten: ein nach /welt eingehängter Ordner mit versions.json geht vor, sonst die im Image (server/docker-start.sh).
# Weitere Umgebung beim Start (docker run -e …): TURN_URLS, TURN_SECRET, STUN_URLS für das Notfall-Relais (server/coturn/)
ENV PORT=8787 \
    STATISCH=/app/dist
EXPOSE 8787
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/vermittlung/status').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["sh", "server/docker-start.sh"]
