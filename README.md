# Kanban Studio

Project management Kanban app with an AI chat sidebar. FastAPI backend serving a static Next.js frontend, in Docker.

## Run

Requires Docker and an `.env` file in the project root with `OPENROUTER_API_KEY`.

Mac/Linux:

```bash
./scripts/start.sh
./scripts/stop.sh
```

Windows (PowerShell):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\start.ps1
powershell -ExecutionPolicy Bypass -File scripts\stop.ps1
```

App runs at http://localhost:8000. Sign in with `user` / `password`.
