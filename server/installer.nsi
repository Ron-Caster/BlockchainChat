; NSIS installer for Collab Server + Client
!define APP_NAME "CollabNet"
!define APP_EXE "collab-server.exe"
!define COMPANY "YourCompany"
!define VERSION "0.1.0"

OutFile "build\${APP_NAME}-Setup-${VERSION}.exe"
InstallDir "$PROGRAMFILES\${COMPANY}\${APP_NAME}"
RequestExecutionLevel admin

Page directory
Page instfiles

Section "Install"
  SetOutPath "$INSTDIR"
  File /r "build\collab-server.exe"
  ; Include static assets
  SetOutPath "$INSTDIR\public"
  File /r "public\*.*"

  ; Create shortcuts
  CreateDirectory "$SMPROGRAMS\${APP_NAME}"
  CreateShortCut "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk" "$INSTDIR\collab-server.exe"
  CreateShortCut "$DESKTOP\${APP_NAME}.lnk" "$INSTDIR\collab-server.exe"

  ; Add uninstall
  WriteUninstaller "$INSTDIR\Uninstall.exe"

  ; Start once after install
  ExecShell "open" "$INSTDIR\collab-server.exe"
SectionEnd

Section "Uninstall"
  Delete "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk"
  RMDir /r "$SMPROGRAMS\${APP_NAME}"
  RMDir /r "$INSTDIR"
SectionEnd
