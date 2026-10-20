# --- build stage ---
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Path prefix the app is served under (e.g. /board/); the host proxy strips it before the container.
ARG VITE_BASE=/
ENV VITE_BASE=$VITE_BASE
RUN npm run build

# --- runtime stage ---
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
