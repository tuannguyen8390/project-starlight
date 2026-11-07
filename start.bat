@echo off
cd /d "%~dp0"
if not exist frontend\dist\index.html (
  echo Building the frontend...
  pushd frontend
  call npm install
  call npm run build
  popd
)
echo.
echo === Project Starlight ===  http://localhost:8504
cd backend
python -m uvicorn main:app --host 0.0.0.0 --port 8504
