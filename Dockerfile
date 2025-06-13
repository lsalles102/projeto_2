# Use Node.js 20 as base image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build:prod

# Remove devDependencies to reduce image size
RUN npm ci --only=production && npm cache clean --force

# Create public directory for static files
RUN mkdir -p public

# Copy built frontend files to public directory
RUN cp -r dist/client/* public/ 2>/dev/null || echo "No client files to copy"

# Expose port
EXPOSE 5000

# Set environment to production
ENV NODE_ENV=production

# Start the application
CMD ["npm", "run", "start:prod"]