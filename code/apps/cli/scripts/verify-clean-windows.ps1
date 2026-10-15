param(
  [Parameter(Mandatory = $true)][string]$Archive,
  [ValidateSet('BeforeRuntime', 'Ready')][string]$Stage = 'Ready',
  [Parameter(Mandatory = $true)][string]$ReportPath
)
# Keep this script ASCII and compatible with stock Windows PowerShell 5.1.
$ErrorActionPreference = 'Stop'
$Archive = [IO.Path]::GetFullPath($Archive)
$ReportPath = [IO.Path]::GetFullPath($ReportPath)
if ($ReportPath -eq $Archive -or $ReportPath -eq ($Archive + '.sha256')) { throw 'Report must not overwrite the ZIP or checksum' }
$reportRoot = [IO.Path]::GetDirectoryName($ReportPath)
New-Item -ItemType Directory -Path $reportRoot -Force | Out-Null
if (Test-Path -LiteralPath $ReportPath) { throw 'Report already exists; choose a new report path' }
$report = [ordered]@{
  formatVersion = 1
  recordedAtUtc = [DateTime]::UtcNow.ToString('o')
  stage = $Stage
  status = 'running'
  environmentFreshness = 'requires-user-confirmation'
  powershell = $PSVersionTable.PSVersion.ToString()
  os64Bit = [Environment]::Is64BitOperatingSystem
  toolsOnPath = @()
  checks = @()
}
$failure = $null
try {
  if (![Environment]::Is64BitOperatingSystem) { throw 'Windows x64 is required' }
  $os = Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion'
  $report.os = @{ productName = $os.ProductName; build = $os.CurrentBuildNumber; displayVersion = $os.DisplayVersion }
  $report.toolsOnPath = @(@('node.exe', 'cargo.exe', 'rustc.exe', 'devenv.exe') | Where-Object { Get-Command $_ -CommandType Application -ErrorAction SilentlyContinue })
  $report.desktopLicenseStorePresent = Test-Path -LiteralPath (Join-Path ([Environment]::GetFolderPath('ApplicationData')) 'jp.hkdev.tk/license.json')
  $registry = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::LocalMachine, [Microsoft.Win32.RegistryView]::Registry64)
  try {
    $runtime = $registry.OpenSubKey('SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64')
    if ($runtime) {
      try { $report.vcRuntime = @{ installed = $runtime.GetValue('Installed'); version = $runtime.GetValue('Version') } } finally { $runtime.Dispose() }
    } else { $report.vcRuntime = $null }
  } finally { $registry.Dispose() }
  $expected = (Get-Content -LiteralPath ($Archive + '.sha256') -Raw).Trim().Split(' ')[0].ToLowerInvariant()
  $archiveHash = (Get-FileHash -LiteralPath $Archive -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($expected -notmatch '^[a-f0-9]{64}$' -or $archiveHash -ne $expected) { throw 'ZIP checksum mismatch' }
  $report.archive = @{ name = [IO.Path]::GetFileName($Archive); sha256 = $archiveHash }
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $zip = [IO.Compression.ZipFile]::OpenRead($Archive)
  $destination = Join-Path $reportRoot ('cli-check-' + [Guid]::NewGuid().ToString('N'))
  try {
    $names = @($zip.Entries | Where-Object { $_.Name } | ForEach-Object { $_.FullName })
    $uniqueNames = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    foreach ($entry in $zip.Entries) {
      $name = $entry.FullName
      $resolved = [IO.Path]::GetFullPath((Join-Path $destination $name))
      if (!$name.StartsWith('trace-kernel-cli/', [StringComparison]::Ordinal) -or $name.Contains('\') -or $name.Contains(':') -or $name.Split('/').Contains('..') -or !$resolved.StartsWith($destination + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -or !$uniqueNames.Add($name)) { throw 'Unsafe or duplicate ZIP entry' }
    }
    function Read-ZipJson([string]$Name) {
      $entry = $zip.GetEntry('trace-kernel-cli/' + $Name)
      if (!$entry) { throw "Missing ZIP JSON: $Name" }
      $reader = [IO.StreamReader]::new($entry.Open(), [Text.Encoding]::UTF8)
      try { return ($reader.ReadToEnd() | ConvertFrom-Json) } finally { $reader.Dispose() }
    }
    $manifest = Read-ZipJson 'package-manifest.json'
    if ($manifest.target -ne 'x86_64-pc-windows-msvc' -or $names.Count -ne $manifest.files.Count + 1) { throw 'Unexpected package target or file count' }
    $uniqueFiles = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    foreach ($file in $manifest.files) {
      if (!$uniqueFiles.Add($file.path)) { throw 'Duplicate manifest file' }
      $entry = $zip.GetEntry('trace-kernel-cli/' + $file.path)
      if (!$entry -or $entry.Length -ne $file.bytes) { throw "Missing or changed ZIP file: $($file.path)" }
      $sha = [Security.Cryptography.SHA256]::Create()
      $stream = $entry.Open()
      try { $hash = [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() } finally { $stream.Dispose(); $sha.Dispose() }
      if ($hash -ne $file.sha256) { throw "ZIP file hash mismatch: $($file.path)" }
    }
    $exeFile = @($manifest.files | Where-Object path -EQ 'trace-kernel-cli.exe')
    if ($exeFile.Count -ne 1 -or $exeFile[0].sha256 -ne $manifest.binarySha256) { throw 'Executable hash differs from package identity' }
    $proof = Read-ZipJson 'build-provenance/v8-no-libm.json'
    if ($proof.noLibmRequested -ne $true -or $proof.forbiddenMembers.Count -ne 0 -or $proof.tableCheck.locatedAt -ne -1 -or $proof.tableCheck.binarySha256 -ne $manifest.binarySha256 -or $proof.gnConfiguration.v8_enable_temporal_support -ne $false) { throw 'V8 build verification mismatch' }
    $report.binarySha256 = $manifest.binarySha256
    $report.verifiedPackageFiles = $manifest.files.Count
  } finally { $zip.Dispose() }
  New-Item -ItemType Directory -Path $destination | Out-Null
  [IO.Compression.ZipFile]::ExtractToDirectory($Archive, $destination)
  $report.extractedTo = $destination
  $exe = Join-Path $destination 'trace-kernel-cli/trace-kernel-cli.exe'
  $sample = Join-Path $destination 'trace-kernel-cli/examples/cli-test.trk'
  if (!(('TraceKernelCleanWindows.Native' -as [type]))) {
    Add-Type -TypeDefinition @'
using System.Runtime.InteropServices;
namespace TraceKernelCleanWindows {
  public static class Native {
    [DllImport("kernel32.dll")] public static extern uint SetErrorMode(uint mode);
  }
}
'@
  }
  function Run-Probe([string]$File, [string]$Arguments) {
    $start = [Diagnostics.ProcessStartInfo]::new()
    $start.FileName = $File; $start.Arguments = $Arguments; $start.WorkingDirectory = $destination
    $start.UseShellExecute = $false; $start.CreateNoWindow = $true
    $start.RedirectStandardOutput = $true; $start.RedirectStandardError = $true
    $start.StandardOutputEncoding = [Text.Encoding]::UTF8; $start.StandardErrorEncoding = [Text.Encoding]::UTF8
    $start.EnvironmentVariables['PATH'] = ''
    $oldMode = [TraceKernelCleanWindows.Native]::SetErrorMode(0x8003)
    try {
      $process = [Diagnostics.Process]::Start($start)
      try {
        $stdoutTask = $process.StandardOutput.ReadToEndAsync(); $stderrTask = $process.StandardError.ReadToEndAsync()
        if (!$process.WaitForExit(30000)) { $process.Kill(); $process.WaitForExit(); throw 'CLI probe timed out' }
        return @{ code = $process.ExitCode; stdout = $stdoutTask.GetAwaiter().GetResult(); stderr = $stderrTask.GetAwaiter().GetResult() }
      } finally { $process.Dispose() }
    } finally { [void][TraceKernelCleanWindows.Native]::SetErrorMode($oldMode) }
  }
  $version = Run-Probe $exe '--version'
  $report.checks += @{ name = 'version'; result = $version }
  if ($Stage -eq 'BeforeRuntime' -and $version.code -eq -1073741515) {
    $report.status = 'native-dependency-missing'
    $report.next = 'Install the official VC v14 x64 runtime inside the test environment, then run Stage Ready. The loader code alone does not identify a particular missing DLL.'
  } else {
    if ($version.code -ne 0 -or $version.stdout.Trim() -ne "trace-kernel-cli $($manifest.version) (Workspace $($manifest.generation.workspace), API $($manifest.generation.api))") { throw 'Version probe failed' }
    $check = Run-Probe $exe ('--check "' + $sample + '" cli-test')
    $report.checks += @{ name = 'check'; result = $check }
    if ($check.code -ne 0 -or $check.stdout -ne '') { throw 'Check-only probe failed' }
    $work = Run-Probe $exe ('"' + $sample + '" cli-test')
    $report.checks += @{ name = 'work'; result = $work }
    if ($work.code -ne 0 -or $work.stdout -ne "cli test!`n") { throw 'Work execution probe failed' }
    $missing = Run-Probe $exe ('"' + $sample + '" missing')
    $report.checks += @{ name = 'missing-work'; result = $missing }
    if ($missing.code -ne 3 -or $missing.stderr -notmatch 'Work not found') { throw 'Missing Work probe failed' }
    $cmd = Run-Probe (Join-Path $env:WINDIR 'System32/cmd.exe') ('/d /s /c ""' + $exe + '" "' + $sample + '" cli-test"')
    $report.checks += @{ name = 'cmd-work'; result = $cmd }
    if ($cmd.code -ne 0 -or $cmd.stdout -ne "cli test!`n") { throw 'Command Prompt Work probe failed' }
    $report.status = if ($Stage -eq 'BeforeRuntime') { 'runtime-already-available' } else { 'passed' }
  }
} catch {
  $failure = $_.Exception.Message
  $report.status = 'failed'; $report.error = $failure
} finally {
  [IO.File]::WriteAllText($ReportPath, ($report | ConvertTo-Json -Depth 15), [Text.UTF8Encoding]::new($false))
}
Write-Output "CLI verification: $($report.status)"
Write-Output "Report: $ReportPath"
Write-Output 'Environment freshness requires a separate user confirmation; tool detection is informational.'
if ($failure) { throw $failure }
