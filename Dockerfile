FROM node:20-slim

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency files
COPY package*.json ./

# Install all dependencies
RUN npm install

# Copy application source
COPY . .

# Build client bundle
RUN npm run build

# Expose server port
EXPOSE 3000

# Start server daemon
CMD ["npm", "run", "start"]
