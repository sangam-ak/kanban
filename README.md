# Kanban Studio

Project management app: user accounts, multiple Kanban boards, card priorities, due dates and labels, search and filters, an activity log, and an AI chat sidebar that can change the board. FastAPI backend serving a static Next.js frontend, in Docker.

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

App runs at http://localhost:8000. Create an account, or sign in with the demo account `user` / `password`.
