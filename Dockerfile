FROM node:18-alpine
WORKDIR /app

# Install production dependencies using the lockfile
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application source
COPY . .

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node","app.js"]
