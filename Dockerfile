# Google Cloud Run & Docker Deployment
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy all project files
COPY . .

# Set production environment
ENV NODE_ENV=production
ENV PORT=8080

# Expose port
EXPOSE 8080

# Start server
CMD ["node", "server.js"]
