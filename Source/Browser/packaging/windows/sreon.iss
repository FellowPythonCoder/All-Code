; Sreon Browser — Windows installer (Inno Setup 6)
; Builds Sreon-Setup.exe from the PyInstaller output in dist\Sreon\
; Paths are relative to this file.

#define AppName "Sreon"
#define AppVersion "0.5.0"
#define AppPublisher "Sreon"
#define ExeName "Sreon.exe"
#define RepoRoot "..\.."

[Setup]
AppId={{8E4B6C2A-52D9-4B77-9F3E-51C30A6E1D42}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
LicenseFile={#RepoRoot}\packaging\windows\LICENSE.rtf
OutputDir={#RepoRoot}\dist
OutputBaseFilename=Sreon-Setup
SetupIconFile={#RepoRoot}\assets\icon.ico
UninstallDisplayIcon={app}\{#ExeName}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
WizardImageFile=wizard\sidebar.png
WizardSmallImageFile=wizard\header.png
PrivilegesRequiredOverridesAllowed=dialog commandline
MinVersion=10.0
CloseApplications=yes
RestartApplications=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"
Name: "startmenu"; Description: "Add a Start Menu shortcut"; GroupDescription: "{cm:AdditionalIcons}"; Flags: checkedonce

[Files]
Source: "{#RepoRoot}\dist\Sreon\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\{#ExeName}"; Tasks: startmenu
Name: "{group}\Uninstall {#AppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#ExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#ExeName}"; Description: "Launch {#AppName}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: filesandordirs; Name: "{localappdata}\Sreon"
