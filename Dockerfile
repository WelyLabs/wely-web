# Stage 1: build
FROM node:20-alpine AS build
WORKDIR /app

# Manifests first, so the dependency layer survives a source-only change.
COPY package*.json ./
# --legacy-peer-deps papers over a peer-dependency conflict in the RSocket packages;
# removing it is tracked as a known limitation.
RUN npm ci --legacy-peer-deps

COPY . .
RUN npm run build -- --configuration production

# Stage 2: serve
# The unprivileged nginx image runs as uid 101 and listens on 8080, rather than
# needing root to bind port 80. The Service keeps exposing 80 externally.
FROM nginxinc/nginx-unprivileged:stable-alpine

# nginx.conf is a template: entrypoint.sh substitutes the DNS resolver into it at
# start, because the resolver address is only known inside the cluster.
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --chown=101:101 --from=build /app/dist/calendar-app/browser /usr/share/nginx/html
COPY entrypoint.sh /entrypoint.sh

USER root
RUN chmod +x /entrypoint.sh
USER 101

EXPOSE 8080

ENTRYPOINT ["/entrypoint.sh"]
