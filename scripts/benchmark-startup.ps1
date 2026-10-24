param([int]$Runs=20,[string]$AppPath,[string]$ConfigPath,[string]$OutputPath)
$ErrorActionPreference = 'Stop'
$benchRoot = Split-Path $PSScriptRoot -Parent
$benchDir = if($OutputPath){$OutputPath}else{Join-Path $benchRoot '.tooling\startup-benchmark'}
New-Item -ItemType Directory -Force $benchDir | Out-Null
$benchApp = if($AppPath){$AppPath}else{Join-Path $benchRoot '.tooling\target\release\qingtu.exe'}
$env:QINGTU_CONFIG_DIR = if($ConfigPath){$ConfigPath}else{Join-Path $benchRoot '.tooling\release-tests\config'}
$benchSamples = @()
for ($benchIndex=0; $benchIndex -lt $Runs; $benchIndex++) {
  $benchReady = Join-Path $benchDir "ready-$benchIndex.json"
  if (Test-Path -LiteralPath $benchReady) { Remove-Item -LiteralPath $benchReady }
  $env:QINGTU_READY_FILE=$benchReady
  $env:QINGTU_START_TOKEN=[guid]::NewGuid().ToString()
  $benchWatch=[System.Diagnostics.Stopwatch]::StartNew()
  $benchProcess=Start-Process -FilePath $benchApp -WindowStyle Hidden -PassThru
  $benchDeadline=[DateTime]::UtcNow.AddSeconds(15)
  while (-not (Test-Path -LiteralPath $benchReady)) {
    if ($benchProcess.HasExited) {throw 'Application exited before ready'}
    if ([DateTime]::UtcNow -gt $benchDeadline) {throw 'Application did not reach ready state in 15 seconds'}
    Start-Sleep -Milliseconds 10
  }
  $benchWatch.Stop()
  $benchRecord=Get-Content -LiteralPath $benchReady -Raw | ConvertFrom-Json
  if ($benchRecord.token -ne $env:QINGTU_START_TOKEN) {throw 'Startup token mismatch'}
  $benchTree=@($benchProcess.Id)
  $benchProcesses=@(Get-CimInstance Win32_Process -Filter "Name='msedgewebview2.exe'")
  do {$benchAdded=$false;foreach($benchChild in $benchProcesses){if($benchTree -contains $benchChild.ParentProcessId -and $benchTree -notcontains $benchChild.ProcessId){$benchTree+=$benchChild.ProcessId;$benchAdded=$true}}}while($benchAdded)
  if (-not $benchProcess.CloseMainWindow()) {throw 'Could not request a normal application exit'}
  if (-not $benchProcess.WaitForExit(10000)) {throw 'Application did not exit normally'}
  $benchExitDeadline=[DateTime]::UtcNow.AddSeconds(10)
  while(@(Get-Process -Id $benchTree -ErrorAction SilentlyContinue).Count -gt 0){if([DateTime]::UtcNow -gt $benchExitDeadline){throw 'Application WebView2 processes remained after normal exit'};Start-Sleep -Milliseconds 50}
  $benchSamples += [pscustomobject]@{Run=$benchIndex+1;Milliseconds=[math]::Round($benchWatch.Elapsed.TotalMilliseconds,2);Kind='process restart with OS cache warm';ChildProcessesAtReady=$benchTree.Count-1;RemainingAfterExit=0}
  Start-Sleep -Milliseconds 300
}
$benchSorted=@($benchSamples.Milliseconds | Sort-Object)
$benchCpu=(Get-CimInstance Win32_Processor | Select-Object -First 1 -ExpandProperty Name)
$benchMedian=if($Runs%2 -eq 0){($benchSorted[$Runs/2-1]+$benchSorted[$Runs/2])/2}else{$benchSorted[[math]::Floor($Runs/2)]}
$benchResult=[pscustomobject]@{Time=[DateTime]::Now.ToString('o');CPU=$benchCpu;OS=(Get-CimInstance Win32_OperatingSystem).Caption;App=$benchApp;ExeSha256=(Get-FileHash -LiteralPath $benchApp -Algorithm SHA256).Hash;ConfigPath=$env:QINGTU_CONFIG_DIR;Kind='Warm process restart only; no OS cold-boot claim';Count=$Runs;Median=$benchMedian;P95=$benchSorted[[math]::Ceiling(.95*$Runs)-1];Maximum=$benchSorted[-1];Samples=$benchSamples}
$benchResult | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $benchDir 'result.json') -Encoding utf8
$benchResult | Select-Object CPU,Kind,Count,Median,P95,Maximum | ConvertTo-Json
