# Single-service image: builds the frontend, then the API serves it alongside /api (for Render, Fly, etc.).
# docker-compose.yml still uses the two-container layout (backend/Dockerfile + frontend/Dockerfile).

# --- frontend build ---
FROM node:22-alpine AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ .
ARG VITE_BASE=/
ENV VITE_BASE=$VITE_BASE
RUN npm run build

# --- runtime ---
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 STATIC_DIR=/app/static
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
COPY backend/requirements.txt .
RUN pip install -r requirements.txt
COPY backend/pyproject.toml backend/entrypoint.sh ./
COPY backend/app ./app
COPY backend/migrations ./migrations
COPY --from=web /web/dist ./static
RUN useradd -m appuser && chown -R appuser /app
USER appuser
EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 CMD curl -fsS "http://localhost:${PORT:-8000}/api/health" || exit 1
ENTRYPOINT ["./entrypoint.sh"]
