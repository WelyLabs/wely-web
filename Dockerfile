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

CMD ["nginx", "-g", "daemon off;"]
