param([Parameter(Mandatory=$true)][string]$AppPath)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
[Console]::InputEncoding=[Text.UTF8Encoding]::new($false)
$samplerRoot=Split-Path $PSScriptRoot -Parent
$allowed=[IO.Path]::GetFullPath((Join-Path $samplerRoot '.tooling\install-tests'))+[IO.Path]::DirectorySeparatorChar
$verified=[IO.Path]::GetFullPath($AppPath)
if(-not $verified.StartsWith($allowed,[StringComparison]::OrdinalIgnoreCase)){throw 'Only the owned test installation may be measured'}
$ledger=@{};$handles=@{};$cores=[Environment]::ProcessorCount
'{"ready":true}'
while($line=[Console]::ReadLine()){
 try{
  $request=$line|ConvertFrom-Json
  if($request.operation -ne 'sample'){throw 'Unknown sampling operation'}
  $roots=@(Get-Process qingtu -ErrorAction SilentlyContinue|Where-Object {$_.Path -eq $verified})
  if($roots.Count -ne 1){throw 'Expected one owned application process'}
  $ids=@($roots[0].Id);$snapshot=@(Get-CimInstance Win32_Process -Filter "Name='msedgewebview2.exe'")
  do{$added=$false;foreach($child in $snapshot){if($ids -contains $child.ParentProcessId -and $ids -notcontains $child.ProcessId){$ids+=$child.ProcessId;$added=$true}}}while($added)
  $rows=@();$private=0L;$working=0L
  foreach($processId in $ids){$process=Get-Process -Id $processId -ErrorAction SilentlyContinue;if(-not $process){continue};$identity="$processId-$($process.StartTime.ToUniversalTime().Ticks)";if(-not $handles.ContainsKey($identity)){$null=$process.Handle;$handles[$identity]=$process}else{$process.Dispose();$process=$handles[$identity];$process.Refresh()};$cpu=$process.TotalProcessorTime.TotalSeconds;$ledger[$identity]=$cpu;$private+=$process.PrivateMemorySize64;$working+=$process.WorkingSet64;$command=($snapshot|Where-Object {$_.ProcessId -eq $processId}|Select-Object -First 1).CommandLine;$role=if($processId -eq $roots[0].Id){'host'}elseif($command -match '--type=([^ ]+)'){$Matches[1]}else{'webview-browser'};$rows+=@{pid=$processId;name=$process.ProcessName;role=$role;privateBytes=$process.PrivateMemorySize64;cpuSeconds=$cpu}}
  foreach($identity in @($handles.Keys)){if($handles[$identity].HasExited){$ledger[$identity]=$handles[$identity].TotalProcessorTime.TotalSeconds;$handles[$identity].Dispose();$handles.Remove($identity)}}
  $totalCpu=($ledger.Values|Measure-Object -Sum).Sum
  @{ok=$true;utc=[DateTime]::UtcNow.ToString('o');monotonic=[Diagnostics.Stopwatch]::GetTimestamp()/[double][Diagnostics.Stopwatch]::Frequency;logicalCores=$cores;privateBytes=$private;workingSetBytes=$working;cpuSeconds=$totalCpu;processes=$rows}|ConvertTo-Json -Depth 5 -Compress
 }catch{@{ok=$false;error=[string]$_}|ConvertTo-Json -Compress}
}
foreach($handle in $handles.Values){$handle.Dispose()}
