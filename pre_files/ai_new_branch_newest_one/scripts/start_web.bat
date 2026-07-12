@echo off
cd /d "C:\Users\29787\Desktop\新建文件夹\pre_files\ai_new_branch_newest_one"

echo Stopping existing AI IDE server...
taskkill /F /IM python.exe 2>nul

echo Starting AI IDE server...
start "AI IDE Server" "C:\Users\29787\AppData\Local\Programs\Python\Python311\python.exe" backend\app_server.py

echo Waiting for server...
timeout /t 2 /nobreak >nul

echo Opening browser...
start "" "http://127.0.0.1:8501/"
