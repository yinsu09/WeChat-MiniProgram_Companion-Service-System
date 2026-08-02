@echo off
chcp 65001 >nul
cd /d %~dp0
echo ========================================
echo   陪伴服务系统 - 报告图表生成
echo ========================================

if not exist plantuml.jar (
  echo 正在下载 PlantUML...
  powershell -Command "Invoke-WebRequest -Uri 'https://github.com/plantuml/plantuml/releases/download/v1.2024.8/plantuml-1.2024.8.jar' -OutFile plantuml.jar"
)

if not exist png mkdir png

echo 正在渲染 PlantUML 图表...
java -jar plantuml.jar -charset UTF-8 -tpng -o "%~dp0png" "%~dp0plantuml\*.puml"

echo.
echo 生成完成，输出目录: %~dp0png
dir /b png\*.png
echo.
pause
