@echo off
chcp 65001 >nul
echo ========================================
echo       背单词 - 内网穿透版
echo ========================================
echo.
echo 正在启动服务器和内网穿透...
echo.

start "服务器" cmd /c "cd /d %~dp0 && python server.py"

timeout /t 2 /nobreak >nul

echo 正在获取ngrok公网地址...
echo 请将下方链接发送到手机Safari
echo ========================================
echo.

where ngrok >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未找到ngrok，请先安装:
    echo 1. 下载: https://ngrok.com/download
    echo 2. 解压后放到 PATH 或当前目录
    echo 3. 运行: ngrok config add-authtoken YOUR_TOKEN
    echo.
    echo 或使用手机开热点，电脑连接后运行 run.bat
    pause
    exit /b 1
)

ngrok http 8000

pause