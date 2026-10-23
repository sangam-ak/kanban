# The Project Management web app

## Business Requirements

This project is building a Project Management App. Key features:
- Users can register, sign in and out, change their password and delete their account
- A user has any number of Kanban boards and can create, rename, delete and switch between them
- Board columns can be added, renamed, reordered and (when empty) deleted
- Cards can be moved with drag and drop and edited, including priority, due date and labels
- Cards can be searched and filtered by text, priority and overdue
- Each board shows a summary (card, overdue and high-priority counts) and an activity log of recent changes
- There is an AI chat feature in a sidebar; the AI can create / edit / move / delete cards and manage columns on the current board

## Limitations

A demo account `user` / `password` is created on startup if it does not exist.

Boards are private to their owner; there is no sharing between users.

This runs locally (in a docker container).

## Technical Decisions

- NextJS frontend
- Python FastAPI backend, including serving the static NextJS site at /
- Everything packaged into a Docker container
- Use "uv" as the package manager for python in the Docker container
- Use OpenRouter for the AI calls. An OPENROUTER_API_KEY is in .env in the project root
- Use `openai/gpt-oss-120b` as the model
- Use SQLLite local database for the database, creating a new db if it doesn't exist
- Start and Stop server scripts for Mac, PC, Linux in scripts/

## Starting Point

A working MVP of the frontend has been built and is already in frontend. This is not yet designed for the Docker setup. It's a pure frontend-only demo.

## Color Scheme

- Accent Yellow: `#ecad0a` - accent lines, highlights
- Blue Primary: `#209dd7` - links, key sections
- Purple Secondary: `#753991` - submit buttons, important actions
- Dark Navy: `#032147` - main headings
- Gray Text: `#888888` - supporting text, labels

## Coding standards

1. Use latest versions of libraries and idiomatic approaches as of today
2. Keep it simple - NEVER over-engineer, ALWAYS simplify, NO unnecessary defensive programming. No extra features - focus on simplicity.
3. Be concise. Keep README minimal. IMPORTANT: no emojis ever
4. When hitting issues, always identify root cause before trying a fix. Do not guess. Prove with evidence, then fix the root cause.

## Working documentation

All documents for planning and executing this project will be in the docs/ directory.
Please review the docs/PLAN.md document before proceeding.