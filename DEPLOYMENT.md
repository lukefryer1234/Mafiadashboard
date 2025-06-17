## Deployment using Docker

This project is configured to run using Docker and Docker Compose, simplifying deployment and environment setup.

### Prerequisites

*   **Docker**: Ensure Docker is installed on your system. Visit [Docker's official website](https://www.docker.com/get-started) for installation instructions.
*   **Docker Compose**: Ensure Docker Compose (usually included with Docker Desktop, or installable as a plugin or standalone binary) is installed. See [Docker Compose documentation](https://docs.docker.com/compose/install/).

### Environment Configuration

Before building or running the application, you need to configure environment variables. A `.env` file in the project root is used by `docker-compose.yml` to supply these variables.

1.  **Create/Update `.env` file**:
    If a `.env` file does not exist in the project root, create one. You can copy an example file if provided (e.g., `.env.example`) or create it manually. The setup scripts for this project may have created a default `.env` file with placeholder values.

2.  **Required Environment Variables for `.env`**:

    ```env
    # Backend Configuration
    NODE_ENV=production       # Set to 'development' for local dev, 'production' for deployment
    PORT=3001                 # Port the backend server will listen on inside its container
    PULSECHAIN_RPC_URL=https://rpc.pulsechain.com # Your PulseChain RPC endpoint

    # JWT Authentication (CRITICAL FOR SECURITY)
    # Generate a strong, random secret key (at least 32 characters long) for production.
    JWT_SECRET=YOUR_VERY_STRONG_RANDOM_SECRET_KEY_HERE
    JWT_EXPIRES_IN=1h         # How long tokens should be valid (e.g., 1h, 7d, 30d)

    # Frontend (Vite environment variables, if needed at build time, would be prefixed with VITE_)
    # Example: If frontend needed to know the backend URL during its build process:
    # VITE_API_BASE_URL=http://localhost:3001/api
    # (Note: The current frontend is configured to make API calls to the same origin
    #  or a relative path when served by Nginx, or uses a hardcoded http://localhost:3001
    #  during local 'npm run dev'. For Docker Compose, the Nginx proxy for frontend will handle
    #  API requests if configured, or frontend will call backend on its exposed port,
    #  potentially requiring the frontend to know the backend's address if they are on different domains/ports
    #  from the browser's perspective after deployment.)
    ```

    **IMPORTANT**: Replace `YOUR_VERY_STRONG_RANDOM_SECRET_KEY_HERE` with a cryptographically strong random string for any production or security-sensitive environment. You can generate one using a password manager or a command like `openssl rand -base64 32` (or longer). The setup script might have created a `.env` file with a placeholder value like `THIS_IS_A_DEV_SECRET_REPLACE_IT_FOR_PRODUCTION...`; **this must be changed.**

### Building the Application

To build the Docker images for both the backend and frontend services:

```bash
docker-compose build
```

This command will read the `docker-compose.yml` file and execute the build process defined in `backend/Dockerfile` and `frontend/Dockerfile`.

### Running the Application

Once the images are built, you can start the application stack using:

```bash
docker-compose up
```

This will start both the backend and frontend services.
*   The **Frontend** (React app served by Nginx) will typically be accessible at `http://localhost:3000`.
*   The **Backend** API server will be listening on port `3001` (as mapped in `docker-compose.yml`) and is primarily accessed by the frontend.

To run the application in detached mode (in the background):

```bash
docker-compose up -d
```

### Accessing the Application

*   **Dashboard UI**: Open your web browser and navigate to `http://localhost:3000`.
*   **Backend API**: (If you need to access it directly for testing, though not typical for users) `http://localhost:3001/api/...`.

### Managing the Application

*   **Viewing Logs**:
    *   If running in attached mode (`docker-compose up`), logs will be streamed to your terminal.
    *   If running in detached mode, use: `docker-compose logs -f` (for all services) or `docker-compose logs -f backend` / `docker-compose logs -f frontend`.

*   **Stopping the Application**:
    *   If running in attached mode, press `Ctrl+C` in the terminal.
    *   If running in detached mode, use: `docker-compose down`
    *   The `docker-compose down` command will stop and remove the containers. If you also want to remove volumes (like the SQLite database if it were a named Docker volume), you can use `docker-compose down -v`. For the current setup, which uses a host-mounted directory (`./backend/data`), the SQLite data persists on your host machine.

*   **Rebuilding Images**:
    If you make changes to the source code or Dockerfiles, you'll need to rebuild the images:
    ```bash
    docker-compose build
    ```
    Then, restart the application, ensuring the containers are recreated with the new images:
    ```bash
    docker-compose up -d --force-recreate
    ```

### Data Persistence (SQLite Database)

The `docker-compose.yml` is configured to mount the `./backend/data` directory from your host machine into the backend container at `/usr/src/app/backend/data`. This means the SQLite database file (`dashboard.db`) created by the application will persist on your host system in `./backend/data`, even if the Docker containers are stopped or removed. Ensure this directory can be created or exists if necessary before the first run (the backend Dockerfile includes `RUN mkdir -p data && chown -R node:node data` to prepare the path within the container).

### Production Considerations

*   **JWT_SECRET**: Ensure `JWT_SECRET` in your production `.env` file (or equivalent environment variable management system) is extremely strong and kept confidential. **Do not use the default development secret.**
*   **NODE_ENV**: Ensure `NODE_ENV=production` is set for the backend service in production environments. This is already configured in the `docker-compose.yml` for the backend service.
*   **HTTPS**: For production deployments, the application should be run behind a reverse proxy (e.g., Nginx, Traefik, Caddy, or a cloud load balancer) that handles HTTPS/TLS termination, providing secure connections.
*   **Database Backups**: Regularly back up the SQLite database file (located in `./backend/data` on the host if using the provided docker-compose setup) or consider using a more robust managed database service for production.
*   **Resource Limits**: Configure appropriate CPU and memory limits for your containers in a production environment (e.g., within `docker-compose.yml` or your orchestration platform).
*   **Logging**: Implement a more robust and centralized logging solution (e.g., ELK stack, Grafana Loki, cloud provider logging services) for production monitoring and troubleshooting.
*   **Frontend API URL**: If the frontend and backend are deployed to different domains or subdomains in production, the frontend will need to know the backend's API URL. This might involve:
    *   Configuring Nginx in the frontend container to proxy API requests to the backend service (common in Docker Compose setups).
    *   Setting a build-time environment variable (e.g., `VITE_API_BASE_URL`) in the frontend's Dockerfile during the `npm run build` stage, so Axios calls use the correct production API endpoint. The current `AuthContext.jsx` uses a hardcoded `/api` relative path for auth, which implies the frontend expects to be served from the same domain as the API or have a proxy set up.
