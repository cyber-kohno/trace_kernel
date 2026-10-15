param([string]$Archive = (Join-Path $PSScriptRoot '../generated/releases/trace-kernel-cli-0.1.0-windows-x64-internal.zip'))
$ErrorActionPreference = 'Stop'
$Archive = [IO.Path]::GetFullPath($Archive)
$expected = (Get-Content -LiteralPath ($Archive + '.sha256') -Raw).Split(' ', [StringSplitOptions]::RemoveEmptyEntries)[0]
if ((Get-FileHash -LiteralPath $Archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) { throw 'ZIP checksum mismatch' }
$zip = [IO.Compression.ZipFile]::OpenRead($Archive)
try {
  $names = @($zip.Entries | Where-Object { $_.Name } | ForEach-Object { $_.FullName })
  foreach ($name in $names) {
    if (!$name.StartsWith('trace-kernel-cli/', [StringComparison]::Ordinal) -or $name.Contains('\') -or $name.Split('/').Contains('..')) { throw "Unsafe ZIP entry: $name" }
  }
  $manifestEntry = $zip.GetEntry('trace-kernel-cli/package-manifest.json')
  $reader = [IO.StreamReader]::new($manifestEntry.Open(), [Text.Encoding]::UTF8)
  try { $manifest = $reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }
  if ($manifest.status -ne 'internal-preview') { throw 'Unexpected package status' }
  if ($names.Count -ne $manifest.files.Count + 1) { throw 'Unexpected ZIP file count' }
  $unique = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
  foreach ($file in $manifest.files) {
    if (!$unique.Add($file.path)) { throw "Duplicate package path: $($file.path)" }
    $entry = $zip.GetEntry('trace-kernel-cli/' + $file.path)
    if (!$entry -or $entry.Length -ne $file.bytes) { throw "Missing/changed ZIP file: $($file.path)" }
    $stream = $entry.Open()
    try { $sha = [Security.Cryptography.SHA256]::HashData($stream); $hash = [Convert]::ToHexString($sha).ToLowerInvariant() } finally { $stream.Dispose() }
    if ($hash -ne $file.sha256) { throw "Entry checksum mismatch: $($file.path)" }
  }
  $exeEntry = @($manifest.files | Where-Object path -EQ 'trace-kernel-cli.exe')
  if ($exeEntry.Count -ne 1 -or $exeEntry[0].sha256 -ne $manifest.binarySha256) { throw 'Executable file hash differs from package identity' }
  $proofEntry = $zip.GetEntry('trace-kernel-cli/build-provenance/v8-no-libm.json')
  if (!$proofEntry) { throw 'Missing verified V8 build provenance' }
  $proofReader = [IO.StreamReader]::new($proofEntry.Open(), [Text.Encoding]::UTF8)
  try { $proof = $proofReader.ReadToEnd() | ConvertFrom-Json } finally { $proofReader.Dispose() }
  if ($proof.noLibmRequested -ne $true -or $proof.forbiddenMembers.Count -ne 0 -or $proof.tableCheck.locatedAt -ne -1 -or $proof.tableCheck.binarySha256 -ne $manifest.binarySha256 -or $proof.gnConfiguration.v8_enable_temporal_support -ne $false) { throw 'ZIP V8 build proof differs from its executable/profile' }
  if (@($names | Where-Object { $_ -match '(^|/)(license\.json|cancel-license\.json|node_modules|target|verify-[^/]*|\.git)(/|$)' }).Count) { throw 'Development/private input leaked into ZIP' }
} finally { $zip.Dispose() }
$app = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$destination = Join-Path $app ('generated/package-verification/' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $destination -Force | Out-Null
[IO.Compression.ZipFile]::ExtractToDirectory($Archive, $destination)
$exe = Join-Path $destination 'trace-kernel-cli/trace-kernel-cli.exe'
$sample = Join-Path $destination 'trace-kernel-cli/examples/cli-test.trk'
function Run-Extracted([string]$ArgumentLine) {
  $start = [Diagnostics.ProcessStartInfo]::new()
  $start.FileName = $exe; $start.Arguments = $ArgumentLine; $start.WorkingDirectory = $destination
  $start.UseShellExecute = $false; $start.CreateNoWindow = $true
  $start.RedirectStandardOutput = $true; $start.RedirectStandardError = $true
  $start.StandardOutputEncoding = [Text.Encoding]::UTF8; $start.StandardErrorEncoding = [Text.Encoding]::UTF8
  $start.Environment['PATH'] = ''
  $process = [Diagnostics.Process]::Start($start)
  try {
    $stdoutTask = $process.StandardOutput.ReadToEndAsync(); $stderrTask = $process.StandardError.ReadToEndAsync()
    if (!$process.WaitForExit(30000)) { $process.Kill($true); $process.WaitForExit(); throw 'Extracted CLI timeout' }
    $stdout = $stdoutTask.GetAwaiter().GetResult(); $stderr = $stderrTask.GetAwaiter().GetResult()
    return @{ code = $process.ExitCode; stdout = $stdout; stderr = $stderr }
  } finally { $process.Dispose() }
}
$version = Run-Extracted '--version'
if ($version.code -ne 0 -or $version.stdout -notmatch [regex]::Escape($manifest.version)) { throw 'Extracted version probe failed' }
$check = Run-Extracted ('--check "' + $sample + '" cli-test')
if ($check.code -ne 0 -or $check.stdout -ne '') { throw "Extracted --check failed: $($check.stderr)" }
$run = Run-Extracted ('"' + $sample + '" cli-test')
if ($run.code -ne 0 -or $run.stdout -ne "cli test!`n") { throw "Extracted sample failed: $($run.stderr)" }
$missing = Run-Extracted ('"' + $sample + '" missing')
if ($missing.code -ne 3 -or $missing.stderr -notmatch 'Work not found') { throw 'Extracted missing Work diagnostic failed' }
Write-Output "PASS ZIP: $($manifest.files.Count) manifest entries; full SHA-256 verification, clean file inventory, extracted --version/--check/Work/error with empty PATH."
Write-Output "Extracted: $destination"
