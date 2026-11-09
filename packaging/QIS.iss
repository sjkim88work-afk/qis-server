; QIS 윈도우 설치 프로그램 (Inno Setup 6.3+)
;   ISCC.exe /DAppVersion=1.3.8 /DSrcDir=..\dist\QIS /DOutDir=..\ [/DIconFile=QIS.ico] packaging\QIS.iss
;   코드 서명이 있으면: /DSign /Sqissign="signtool.exe sign ... $f"
; · 관리자 권한 없이 사용자 폴더(%LOCALAPPDATA%\Programs\QIS)에 설치 — 회사 PC 에서 관리자 승인 없이 설치 가능
; · 데이터(%LOCALAPPDATA%\QIS)는 건드리지 않음: 업데이트 · 제거해도 기록은 남음
; · 실행 중인 QIS 가 있으면 닫도록 안내, 시작 메뉴 · (선택) 바탕 화면 바로 가기

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif
#ifndef SrcDir
  #define SrcDir "..\dist\QIS"
#endif
#ifndef OutDir
  #define OutDir ".."
#endif

[Setup]
AppId={{7D3C2B9E-5C1A-4F7E-9B8D-2A6F1C0E9B41}
AppName=QIS 품질정보시스템
AppVersion={#AppVersion}
AppVerName=QIS {#AppVersion}
AppPublisher=김선중
AppCopyright=© 2026 김선중. All rights reserved.
DefaultDirName={userpf}\QIS
DefaultGroupName=QIS
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
OutputDir={#OutDir}
OutputBaseFilename=QIS-Setup-{#AppVersion}
#ifdef IconFile
SetupIconFile={#IconFile}
#endif
UninstallDisplayIcon={app}\QIS.exe
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
ArchitecturesInstallIn64BitMode=x64compatible
CloseApplications=yes
CloseApplicationsFilter=QIS.exe
RestartApplications=no
MinVersion=10.0
ShowLanguageDialog=no
#ifdef Sign
SignTool=qissign
SignedUninstaller=yes
#endif

[Languages]
Name: "ko"; MessagesFile: "compiler:Languages\Korean.isl"

[Tasks]
Name: "desktopicon"; Description: "바탕 화면에 바로 가기 만들기"; GroupDescription: "추가 작업:"

[Files]
Source: "{#SrcDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\QIS 품질정보시스템"; Filename: "{app}\QIS.exe"
Name: "{group}\QIS 제거"; Filename: "{uninstallexe}"
Name: "{userdesktop}\QIS 품질정보시스템"; Filename: "{app}\QIS.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\QIS.exe"; Description: "지금 QIS 실행"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; 프로그램 폴더의 찌꺼기만. 데이터 폴더(%LOCALAPPDATA%\QIS)는 남긴다.
Type: filesandordirs; Name: "{app}\_internal"

[Code]
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if (CurUninstallStep = usPostUninstall) and not UninstallSilent then
    MsgBox('QIS 프로그램을 제거했습니다.' + #13#10 + '기록 · 사진 · 백업은 데이터 폴더(%LOCALAPPDATA%\QIS)에 그대로 남아 있습니다. 다시 설치하면 그대로 이어집니다.', mbInformation, MB_OK);
end;
