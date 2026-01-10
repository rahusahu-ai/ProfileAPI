# ProfileAPI

This repository contains the Profile API (Node.js). This README shows how to push to GitHub and publish a Docker image to GitHub Container Registry (GHCR).

## Quick local run

Install and run:

```bash
npm install
npm run dev
```

Or with Docker Compose:

```bash
docker-compose up --build
```

API defaults to port 3000.

## Push to GitHub

1. Create a GitHub repository (example name: `ProfileAPI`).
2. Push your local repo:

```bash
git init
git remote add origin https://github.com/<your-user>/ProfileAPI.git
git add .
git commit -m "Initial commit"
git branch -M main
git push -u origin main
```

When you push to `main`, the GitHub Action will build and publish a Docker image to GHCR: `ghcr.io/<your-user>/profileapi:latest`.

## Repository secrets and permissions

The workflow uses the automatically provided `GITHUB_TOKEN` to publish to GHCR. Ensure Actions are enabled for the repo. If you want to push to Docker Hub or another registry, create `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` secrets and update the workflow.

If you plan to deploy the container to a host (Render, Azure App Service, AWS ECS, etc.), configure the host to pull the image from GHCR and set required environment variables (`PG_*`, `ENV_USEDB`, `PORT`, etc.).

## Run published image locally

```bash
docker run -p 3000:3000 ghcr.io/<your-user>/profileapi:latest
```

## Frontend integration

Call the API endpoints from your profile frontend using the deployed host URL. Example using fetch:

```js
fetch('https://api.example.com/api/posts', {
  headers: { Authorization: 'Bearer ' + localStorage.getItem('token') }
})
  .then(r => r.json())
  .then(data => console.log(data));
```

## Next steps / Optional

- Configure CI tests in the workflow before build.
- Connect the GitHub repo to a hosting provider (Render/Heroku/Azure) for automatic deploys from the repo or from GHCR.


-- How the Login and JWT is working in my app
┌─────────────────────────────────────────────────────────────────┐
│ 1. UI (POSTMAN)                                                 │
│    POST /api/auth/login                                         │
│    { username: "john", password: "password123" }               │
└───────────────────────┬─────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. BACKEND - authController.login()                            │
│    - Extract username & password from request                  │
└───────────────────────┬─────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. DATABASE - Query User                                        │
│    SELECT id, username, passwordHash FROM users                │
│    WHERE username = 'john'                                     │
│    ↓                                                             │
│    Returns: { id: 5, username: "john", passwordHash: "$2b..." }│
└───────────────────────┬─────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────────┐
│ 4. BACKEND - Verify Password                                    │
│    bcrypt.compare("password123", "$2b$10$...")                 │
│    ↓                                                             │
│    Result: true ✓                                               │
└───────────────────────┬─────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────────┐
│ 5. BACKEND - Generate JWT Token                                │
│    jwt.sign({ sub: 5, username: "john" })                      │
│    ↓                                                             │
│    Returns: "eyJhbGc..."                                        │
└───────────────────────┬─────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────────┐
│ 6. UI (POSTMAN) Receives Token                                 │
│    Response: { token: "eyJhbGc..." }                            │
│    Store it: localStorage.setItem('token', response.token)      │
└─────────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────────┐
│ 7. UI Makes Protected Request                                  │
│    GET /api/tests                                               │
│    Headers: Authorization: Bearer eyJhbGc...                    │
└───────────────────────┬─────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────────┐
│ 8. BACKEND - authMiddleware Verifies Token                     │
│    - Extract token from Authorization header                   │
│    - jwt.verify(token, SECRET_KEY)                             │
│    - Check signature & expiration                              │
│    ↓                                                             │
│    Valid? → req.user = { sub: 5, username: "john" }            │
└───────────────────────┬─────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────────┐
│ 9. BACKEND - testController.testMethod() Executes             │
│    - Access req.user (authenticated user info)                │
│    - Query database safely with user context                  │
└───────────────────────┬─────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────────┐
│ 10. UI Receives Protected Data                                  │
│     Response: { message: "...", user: {...}, data: [...] }      │
└─────────────────────────────────────────────────────────────────┘

