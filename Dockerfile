# Stage 1: Build
FROM node:20-alpine AS build

WORKDIR /app

# Install dependencies first (better caching)
COPY package*.json ./
RUN npm ci --legacy-peer-deps

# Copy source and build
COPY . .
RUN npm run build -- --configuration production

# Stage 2: Serve
FROM nginx:stable-alpine

# Copy Nginx configuration as a template for envsubst
COPY nginx.conf /etc/nginx/templates/default.conf.template

# Copy build output to Nginx's serve directory
COPY --from=build /app/dist/calendar-app/browser /usr/share/nginx/html

EXPOSE 80

# Use shell form to set DNS_RESOLVER and replace KEYCLOAK_URL in index.html before starting Nginx
CMD export DNS_RESOLVER=$(grep nameserver /etc/resolv.conf | awk '{print $2}' | head -n 1); \
    echo "Discovered DNS resolver: $DNS_RESOLVER"; \
    sed -i "s|\${KEYCLOAK_URL}|$KEYCLOAK_URL|g" /usr/share/nginx/html/index.html; \
    /docker-entrypoint.sh nginx -g 'daemon off;'
