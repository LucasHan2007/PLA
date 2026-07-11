@echo off
cd /d "%~dp0backend"
if not exist .venv\Scripts\uvicorn.exe (
  echo Creating venv and installing dependencies...
  python -m venv .venv
  .venv\Scripts\pip install -r requirements.txt
)
if not exist .env copy .env.example .env
.venv\Scripts\uvicorn app.main:app --reload --port 8001
