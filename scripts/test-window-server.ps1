param([Parameter(Mandatory=$true)][string]$AppPath)
$ErrorActionPreference='Stop'
$serverRoot=Split-Path $PSScriptRoot -Parent
$allowedRoot=[IO.Path]::GetFullPath((Join-Path $serverRoot '.tooling\install-tests'))+[IO.Path]::DirectorySeparatorChar
$verifiedApp=[IO.Path]::GetFullPath($AppPath)
if(-not $verifiedApp.StartsWith($allowedRoot,[StringComparison]::OrdinalIgnoreCase)){throw 'Only project test installations may be controlled'}
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
[Console]::InputEncoding=[Text.UTF8Encoding]::new($false)
'{"ready":true}'
while($serverLine=[Console]::ReadLine()){
  try{
    $request=$serverLine | ConvertFrom-Json
    $windows=@(Get-Process qingtu -ErrorAction SilentlyContinue | Where-Object {$_.Path -eq $verifiedApp})
    if($request.operation -eq 'count'){@{ok=$true;pids=@($windows.Id)} | ConvertTo-Json -Compress;continue}
    if($request.operation -eq 'association'){$className=-join ([char[]](0x8F7B,0x56FE,0x601D,0x7EF4,0x5BFC,0x56FE));@{ok=$true;command=(Get-Item -LiteralPath "HKCU:\Software\Classes\$className\shell\open\command").GetValue('')} | ConvertTo-Json -Compress;continue}
    if($request.operation -eq 'launch' -or $request.operation -eq 'open-project'){
      if($windows.Count -ne 1){throw 'Expected one existing test application'}
      $launchTarget=$verifiedApp
      if($request.operation -eq 'open-project'){
        $launchTarget=[IO.Path]::GetFullPath([string]$request.path)
        $projectRoot=[IO.Path]::GetFullPath((Join-Path $serverRoot '.tooling\benchmark-native'))+[IO.Path]::DirectorySeparatorChar
        if(-not $launchTarget.StartsWith($projectRoot,[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetExtension($launchTarget) -ne '.qmap'){throw 'Only benchmark project files may be opened'}
      }
      $secondary=Start-Process -FilePath $launchTarget -WindowStyle Hidden -PassThru
      if($secondary -and -not $secondary.WaitForExit(10000)){throw 'Secondary launch did not exit'}
      @{ok=$true;secondaryExitCode=if($secondary){$secondary.ExitCode}else{$null}} | ConvertTo-Json -Compress;continue
    }
    if($request.operation -ne 'close' -or $windows.Count -ne 1){throw 'Expected one test application and a close operation'}
    $target=$windows[0]
    $null=$target.Handle
    if(-not $target.CloseMainWindow()){throw 'Normal close request failed'}
    if(-not $target.WaitForExit(10000)){throw 'Test application did not exit normally'}
    @{ok=$true;closedProcessId=$target.Id;exitCode=$target.ExitCode} | ConvertTo-Json -Compress
  }catch{@{ok=$false;error=[string]$_} | ConvertTo-Json -Compress}
}
