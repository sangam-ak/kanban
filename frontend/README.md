# Kanban Studio frontend

The app needs the backend, so run it with Docker from the project root (see the root README). It is served at http://localhost:8000.

## Tests

```bash
npm install
npm run test:unit
npm run test:e2e
```

E2E tests run against the running Docker container on port 8000.
