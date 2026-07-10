@echo off
cd /d "%~dp0frontend"
if not exist node_modules (
  echo Installing npm dependencies...
  call npm install
)
npm run dev
