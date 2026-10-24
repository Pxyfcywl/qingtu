param([Parameter(Mandatory=$true)][string]$Archive,[Parameter(Mandatory=$true)][string]$Output)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$qingtuZip = [IO.Compression.ZipFile]::OpenRead((Resolve-Path -LiteralPath $Archive).Path)
$qingtuSha = [Security.Cryptography.SHA256]::Create()
try {
  $qingtuManifestEntry = @($qingtuZip.Entries | Where-Object { $_.FullName -match '(^|/)source-manifest.json$' })
  if ($qingtuManifestEntry.Count -ne 1) { throw 'Expected one manifest' }
  $qingtuReader = [IO.StreamReader]::new($qingtuManifestEntry[0].Open())
  try { $qingtuManifest = $qingtuReader.ReadToEnd() | ConvertFrom-Json } finally { $qingtuReader.Dispose() }
  $qingtuPrefix = $qingtuManifestEntry[0].FullName.Substring(0,$qingtuManifestEntry[0].FullName.Length - 'source-manifest.json'.Length)
  $qingtuRows = @()
  foreach ($qingtuFile in $qingtuManifest.files) {
    $qingtuEntry = $qingtuZip.GetEntry($qingtuPrefix + $qingtuFile.path)
    if (!$qingtuEntry -or $qingtuEntry.Length -ne $qingtuFile.bytes) { throw ('Missing or wrong size: ' + $qingtuFile.path) }
    $qingtuStream = $qingtuEntry.Open()
    try { $qingtuHash = [BitConverter]::ToString($qingtuSha.ComputeHash($qingtuStream)).Replace('-','').ToLowerInvariant() } finally { $qingtuStream.Dispose() }
    if ($qingtuHash -ne $qingtuFile.sha256) { throw ('Hash mismatch: ' + $qingtuFile.path) }
    if ($qingtuFile.production) { $qingtuRows += $qingtuFile.path + [char]0 + $qingtuHash + "`n" }
  }
  # The manifest already records ordinal sorted source paths, matching the
  # Node fingerprint. Do not apply culture-sensitive PowerShell sorting.
  $qingtuFingerprint = [BitConverter]::ToString($qingtuSha.ComputeHash([Text.Encoding]::UTF8.GetBytes(($qingtuRows -join '')))).Replace('-','').ToLowerInvariant()
  if ($qingtuFingerprint -ne $qingtuManifest.sourceSnapshotSha256) { throw 'Production fingerprint mismatch' }
  $qingtuActualFiles = @($qingtuZip.Entries | Where-Object { !$_.FullName.EndsWith('/') }).Count
  if ($qingtuActualFiles -ne $qingtuManifest.files.Count + 1) { throw 'Unexpected archive files' }
  $qingtuResult = [ordered]@{status='passed';version=$qingtuManifest.version;archive=$Archive;archiveSha256=(Get-FileHash -LiteralPath $Archive -Algorithm SHA256).Hash.ToLowerInvariant();files=$qingtuManifest.files.Count;productionFiles=$qingtuRows.Count;sourceSnapshotSha256=$qingtuFingerprint;method='Independent .NET ZipArchive streaming SHA256 and production fingerprint reconstruction'}
  $qingtuResult | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $Output -Encoding utf8
  $qingtuResult | ConvertTo-Json
} finally { $qingtuSha.Dispose();$qingtuZip.Dispose() }
