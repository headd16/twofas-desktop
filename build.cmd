@echo off
set PATH=%USERPROFILE%\.cargo\bin;%PATH%
if exist C:\BuildTools\VC\Auxiliary\Build\vcvars64.bat call C:\BuildTools\VC\Auxiliary\Build\vcvars64.bat
call npm.cmd run tauri -- build
exit /b %errorlevel%
