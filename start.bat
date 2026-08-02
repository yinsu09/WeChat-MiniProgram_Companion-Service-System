@echo off
chcp 65001 >nul
echo ========================================
echo   陪伴服务 - 一键启动
echo ========================================

echo [1/3] 检查 MySQL...
sc query mysql80 | findstr /i "RUNNING" >nul
if errorlevel 1 (
  echo MySQL80 未运行，正在启动...
  net start MySQL80
  if errorlevel 1 (
    echo 启动 MySQL 失败，请以管理员身份运行，或手动启动 MySQL80 服务
    pause
    exit /b 1
  )
) else (
  echo MySQL80 已在运行
)

echo [2/3] 检查后端端口 3001...
netstat -ano | findstr ":3001.*LISTENING" >nul
if not errorlevel 1 (
  echo 端口 3001 已被占用，后端可能已在运行
) else (
  echo 正在启动后端...
  start "陪伴服务后端" cmd /k "cd /d %~dp0backend && node app.js"
  timeout /t 2 /nobreak >nul
)

echo [3/3] 测试 API...
powershell -Command "try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:3001/api/services/types' -UseBasicParsing -TimeoutSec 5; if ($r.StatusCode -eq 200) { Write-Host 'API 正常' -ForegroundColor Green } } catch { Write-Host 'API 未响应，请检查后端窗口' -ForegroundColor Yellow }"

echo.
echo ========================================
echo 后端地址: http://127.0.0.1:3001
echo.
echo 请用微信开发者工具打开本目录（陪伴服务 根目录）
echo 详情 - 本地设置 - 勾选「不校验合法域名」
echo 然后点击「编译」
echo ========================================
pause
