# Scripts

Start and stop the app in Docker. Run from anywhere; scripts switch to the project root.

- `start.sh` / `start.ps1` - build image `pm`, replace any running `pm` container, run it on port 8000 with `.env` and `./data` mounted at `/app/data`
- `stop.sh` / `stop.ps1` - remove the `pm` container

Mac/Linux: `./scripts/start.sh`. Windows (PowerShell): `powershell -ExecutionPolicy Bypass -File scripts\start.ps1` (default Windows execution policy blocks unsigned scripts). The `.sh` scripts are for Mac/Linux; under Git Bash on Windows the volume path gets mangled.
