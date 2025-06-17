# Stage 1: Build the React application
FROM node:18-slim AS build

# Set the working directory
WORKDIR /usr/src/app/frontend

# Copy package.json and package-lock.json (or yarn.lock)
# Prefer copying only these first to leverage Docker cache for dependencies
COPY package*.json ./

# Install dependencies
# Using 'ci' for cleaner installs if lock file is present
# Ensure clean install if node_modules was accidentally copied
RUN rm -rf node_modules && npm ci

# Copy the rest of the application source code
COPY . .

# Build the application for production
# This command should match your package.json build script (usually 'npm run build')
RUN npm run build

# Stage 2: Serve the built application with Nginx
FROM nginx:1.25-alpine-slim # Using a slim alpine version of Nginx

# Remove default Nginx website
RUN rm -rf /usr/share/nginx/html/*

# Copy built assets from the 'build' stage to Nginx's web root directory
# The 'dist' directory is the default output for Vite builds.
COPY --from=build /usr/src/app/frontend/dist /usr/share/nginx/html

# Copy the custom Nginx configuration for single-page applications (SPA)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80 (default Nginx port)
EXPOSE 80

# Start Nginx when the container launches
CMD ["nginx", "-g", "daemon off;"]
