@echo off
setlocal

set "SSH_KEY=C:\Users\sigaj\.ssh\heartstore_tech"
set "SSH_HOST=root@heartstore.tech"
set "LOCAL_PORT=9346"
set "REMOTE_HOST=127.0.0.1"
set "REMOTE_PORT=9346"
set "ADMIN_URL=http://127.0.0.1:%LOCAL_PORT%"

echo Opening %ADMIN_URL% through SSH tunnel...
echo Keep this window open while you use the admin panel.

start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process '%ADMIN_URL%'"

ssh -i "%SSH_KEY%" -N -L %LOCAL_PORT%:%REMOTE_HOST%:%REMOTE_PORT% %SSH_HOST%

echo.
echo SSH tunnel closed.
pause
