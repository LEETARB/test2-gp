@echo off
setlocal
cd /d "%~dp0"

echo ======================================
echo ITPC Management System - Setup and Run
echo ======================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is not installed or not added to PATH.
  echo Please install Node.js LTS first, then run this file again.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm is not installed or not added to PATH.
  echo Please install Node.js LTS first, then run this file again.
  pause
  exit /b 1
)

where py >nul 2>nul
if errorlevel 1 (
  where python >nul 2>nul
  if errorlevel 1 (
    echo [ERROR] Python is not installed or not added to PATH.
    echo Please install Python 3.10+ first, then run this file again.
    pause
    exit /b 1
  ) else (
    set PY_CMD=python
  )
) else (
  set PY_CMD=py
)

echo [1/5] Installing frontend dependencies...
call npm install
if errorlevel 1 (
  echo [ERROR] npm install failed.
  pause
  exit /b 1
)

echo.
echo [2/5] Installing backend dependencies...
call %PY_CMD% -m pip install -r requirements.txt
if errorlevel 1 (
  echo [ERROR] pip install failed.
  pause
  exit /b 1
)

echo.
echo [3/5] Initializing database...
call %PY_CMD% src\database.py
if errorlevel 1 (
  echo [ERROR] Database initialization failed.
  pause
  exit /b 1
)

echo.
echo [4/5] Starting Flask backend on http://127.0.0.1:5000 ...
start "ITPC Backend" cmd /k "%PY_CMD% src\app.py"

timeout /t 3 /nobreak >nul

echo.
echo [5/5] Starting Vite frontend on http://localhost:5173 ...
start "ITPC Frontend" cmd /k "npm run dev"

echo.
echo Project started.
echo Backend:  http://127.0.0.1:5000
echo Frontend: http://localhost:5173
echo.
echo Close the opened terminal windows to stop the project.
pause
