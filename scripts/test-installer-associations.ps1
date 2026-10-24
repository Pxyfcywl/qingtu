$ErrorActionPreference='Stop'
$testRoot=Split-Path $PSScriptRoot -Parent
$testPackage=Join-Path $testRoot '.tooling\install-tests\hooks-setup.exe'
$testInstall=Join-Path $testRoot '.tooling\install-tests\关联回归 安装位置'
$extensionKey='HKCU:\Software\Classes\.qmap'
$programKey='HKCU:\Software\Classes\轻图思维导图'
if ((Test-Path -LiteralPath $extensionKey) -or (Test-Path -LiteralPath $programKey)) {throw 'Existing file association found; refusing to alter it'}
$testChecks=@()
function Install-TestPackage {
  $setup=Start-Process -FilePath $testPackage -ArgumentList "/S /D=$testInstall" -WindowStyle Hidden -PassThru -Wait
  if($setup.ExitCode -ne 0 -or -not(Test-Path -LiteralPath (Join-Path $testInstall 'qingtu.exe'))){throw 'Test installation failed'}
  if((Get-Item -LiteralPath $extensionKey).GetValue('') -ne '轻图思维导图'){throw 'File association missing after installation'}
}
function Uninstall-TestPackage {
  $uninstall=Start-Process -FilePath (Join-Path $testInstall 'uninstall.exe') -ArgumentList '/S' -WindowStyle Hidden -PassThru -Wait
  if($uninstall.ExitCode -ne 0){throw 'Test uninstall failed'}
  $deadline=[DateTime]::UtcNow.AddSeconds(10)
  while(Test-Path -LiteralPath (Join-Path $testInstall 'qingtu.exe')){if([DateTime]::UtcNow -gt $deadline){throw 'Installed executable remains'};Start-Sleep -Milliseconds 100}
  if(Test-Path -LiteralPath $programKey){throw 'Program class remains after uninstall'}
}
function Remove-SyntheticAssociation([string]$expected) {
  $key=Get-Item -LiteralPath $extensionKey
  if($key.GetValue('') -ne $expected -or $key.SubKeyCount -ne 0 -or $key.ValueCount -ne 1){throw 'Unexpected association state; preserving it'}
  Remove-Item -LiteralPath $extensionKey
}
try {
  Install-TestPackage
  Install-TestPackage
  Uninstall-TestPackage
  if(Test-Path -LiteralPath $extensionKey){throw 'Cold install/reinstall left extension association'}
  $testChecks+='No previous handler: reinstall and uninstall leave no association'

  New-Item -Path $extensionKey -Force | Out-Null
  Set-Item -LiteralPath $extensionKey -Value 'Qingtu.Test.Previous'
  Install-TestPackage
  Install-TestPackage
  Uninstall-TestPackage
  if((Get-Item -LiteralPath $extensionKey).GetValue('') -ne 'Qingtu.Test.Previous'){throw 'Previous handler was not restored'}
  Remove-SyntheticAssociation 'Qingtu.Test.Previous'
  $testChecks+='Previous handler: reinstall retains original backup and uninstall restores it'

  Install-TestPackage
  Set-Item -LiteralPath $extensionKey -Value 'Qingtu.Test.ChangedAfterInstall'
  Uninstall-TestPackage
  if((Get-Item -LiteralPath $extensionKey).GetValue('') -ne 'Qingtu.Test.ChangedAfterInstall'){throw 'A handler selected after installation was overwritten'}
  Remove-SyntheticAssociation 'Qingtu.Test.ChangedAfterInstall'
  $testChecks+='Handler changed after install: uninstall preserves the new selection'
  $testStatus='passed'
}catch{$testStatus='failed';$testFailure=[string]$_;throw}
finally {
  [pscustomobject]@{Time=[DateTime]::Now.ToString('o');Status=$testStatus;Checks=$testChecks;Error=$testFailure;InstallerSha256=(Get-FileHash -LiteralPath $testPackage -Algorithm SHA256).Hash;ExtensionRemaining=(Test-Path -LiteralPath $extensionKey);ProgramClassRemaining=(Test-Path -LiteralPath $programKey)} | ConvertTo-Json -Depth 4 | Set-Content (Join-Path $testRoot '.tooling\install-tests\association-regression.json') -Encoding utf8
}
