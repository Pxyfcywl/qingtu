$ErrorActionPreference = 'Stop'
$qingtuRoot = Split-Path $PSScriptRoot -Parent
$env:CARGO_HOME = Join-Path $qingtuRoot '.tooling\cargo'
$env:RUSTUP_HOME = Join-Path $qingtuRoot '.tooling\rustup'
$env:TEMP = Join-Path $qingtuRoot '.tooling\temp'
$env:TMP = $env:TEMP
New-Item -ItemType Directory -Force $env:TEMP | Out-Null
$qingtuMsvc = Get-ChildItem (Join-Path $qingtuRoot '.tooling\msvc\VC\Tools\MSVC') -Directory | Sort-Object Name -Descending | Select-Object -First 1
$qingtuSdk = Join-Path $qingtuRoot '.tooling\msvc\Windows Kits\10'
$qingtuSdkVersion = (Get-ChildItem (Join-Path $qingtuSdk 'Lib') -Directory | Sort-Object Name -Descending | Select-Object -First 1).Name
$env:PATH = "$env:CARGO_HOME\bin;$($qingtuMsvc.FullName)\bin\Hostx64\x64;$qingtuSdk\bin\$qingtuSdkVersion\x64;$env:PATH"
$env:INCLUDE = "$($qingtuMsvc.FullName)\include;$qingtuSdk\Include\$qingtuSdkVersion\ucrt;$qingtuSdk\Include\$qingtuSdkVersion\shared;$qingtuSdk\Include\$qingtuSdkVersion\um;$qingtuSdk\Include\$qingtuSdkVersion\winrt"
$env:LIB = "$($qingtuMsvc.FullName)\lib\x64;$qingtuSdk\Lib\$qingtuSdkVersion\ucrt\x64;$qingtuSdk\Lib\$qingtuSdkVersion\um\x64"
$env:VCToolsInstallDir = "$($qingtuMsvc.FullName)\"
$env:VCToolsVersion = $qingtuMsvc.Name
$env:WindowsSdkDir = "$qingtuSdk\"
$env:WindowsSDKVersion = "$qingtuSdkVersion\"
$env:CARGO_TARGET_DIR = Join-Path $qingtuRoot '.tooling\target'
