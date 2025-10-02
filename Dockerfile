# Use official Node.js LTS image
FROM node:22-alpine
 
# Set working directory
WORKDIR /app
 
# Copy package files
COPY package*.json ./
 
# Install dependencies
RUN npm ci --only=production
 
# Copy application code
COPY . .
 
# Expose the port your app runs on
EXPOSE 3000
 
# Start the application
CMD ["npm", "start"]