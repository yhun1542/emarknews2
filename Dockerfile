# --- Stage 1: Dependencies ---
FROM node:20-alpine AS deps
WORKDIR /app

# Set robust npm networking (optional but helpful on CI)
RUN npm config set fetch-timeout 600000 && npm config set fetch-retries 5

# Copy manifest & lockfile first to leverage layer caching
COPY package.json package-lock.json ./

# Install only production deps for lean final image
RUN npm ci --omit=dev

# --- Stage 2: Runtime ---
FROM node:20-alpine
WORKDIR /app

# Copy installed node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy application source
COPY backend_final_merged_jpy100.js frontend_final_merged.html ./

# Environment
ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

# Healthcheck (optional)
# HEALTHCHECK --interval=30s --timeout=5s --retries=5 CMD wget -qO- http://localhost:${PORT}/healthz || exit 1

CMD ["node", "backend_final_merged_jpy100.js"]

