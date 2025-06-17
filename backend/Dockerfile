# Stage 1: Use an official Node.js runtime as a parent image
# Using a specific LTS version is good practice, e.g., node:18-alpine or node:20-alpine
# Alpine versions are smaller. For broader compatibility, non-alpine can be used.
FROM node:18-slim

# Set the working directory in the container
WORKDIR /usr/src/app/backend

# Copy package.json and package-lock.json (or npm-shrinkwrap.json)
# Prefer copying only these first to leverage Docker cache for dependencies
COPY package*.json ./

# Install app dependencies
# Using --omit=dev to skip development dependencies in production
# Use 'ci' for faster, more reliable builds if you have a package-lock.json
# Ensure clean install if node_modules was accidentally copied
RUN rm -rf node_modules && npm ci --omit=dev

# Bundle app source
# Copy all files from the backend directory in the host to the current directory in the image
COPY . .

# Ensure the data directory for SQLite exists within the image,
# and set permissions for the 'node' user.
# The application (database.js) will create the dashboard.db file within this directory.
# The 'node' user is the default non-root user in many official Node images.
RUN mkdir -p data && chown -R node:node data
# If running subsequent commands as 'node' user (e.g., with USER node),
# this step ensures the application can write to the data directory.

# Expose the port the app runs on
# This should match the PORT environment variable used in index.js (default 3001)
EXPOSE 3001

# Define the command to run the application
# The 'node' user is often the default user in official Node images for CMD/ENTRYPOINT
# if no USER directive is specified. If issues arise, explicitly use 'USER node' before CMD.
CMD [ "node", "index.js" ]
