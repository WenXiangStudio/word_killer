@echo off
echo 启动背单词服务器...
echo.
echo 在电脑上打开: http://localhost:8000
echo.
echo 在iPhone上打开:
echo 1. 确保iPhone和电脑在同一WiFi
echo 2. 查找电脑IP: ipconfig
echo 3. 在iPhone Safari打开: http://[电脑IP]:8000
echo.
python -m http.server 8000
pause