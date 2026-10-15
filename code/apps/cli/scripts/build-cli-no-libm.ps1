param(
  [switch]$UseExistingV8Build,
  [string]$Python,
  [string]$TargetDir = (Join-Path $PSScriptRoot '../target')
)
$ErrorActionPreference = 'Stop'
$app = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$generated = Join-Path $app 'generated'
if (!$UseExistingV8Build) {
  if (!$Python) { throw 'Specify -Python <Python3.exe> or -UseExistingV8Build' }
  & (Join-Path $PSScriptRoot 'build-v8-no-libm.ps1') -Python $Python
}
$target = Join-Path $generated 'v8-build-target'
$archive = Join-Path $target 'release/gn_out/obj/rusty_v8.lib'
$gnArgs = Join-Path $target 'release/gn_out/args.gn'
$receipt = Join-Path $generated 'v8-no-libm-library-receipt.json'
& node (Join-Path $PSScriptRoot 'inspect-v8-archive.mjs') --archive $archive --gn-args $gnArgs --expect-no-libm --output $receipt
if ($LASTEXITCODE -ne 0) { throw 'Unverified V8 archive' }
$libraryInspection = Get-Content -LiteralPath $receipt -Raw | ConvertFrom-Json
if ($libraryInspection.gnConfiguration.v8_enable_temporal_support -ne $false -or $libraryInspection.gnConfiguration.use_custom_libcxx -ne $true -or $libraryInspection.gnConfiguration.rusty_v8_enable_simdutf -ne $true) { throw 'The V8 archive does not match the approved CLI build profile' }
$binding = Get-Item -LiteralPath (Join-Path $target 'release/gn_out/src_binding.rs')
$referenceArchive = Join-Path $generated 'v8-reference/rusty_v8.lib'
if (!(Test-Path -LiteralPath $referenceArchive)) {
  $prebuiltArchive = Join-Path $app 'target/release/gn_out/obj/rusty_v8.lib'
  if (!(Test-Path -LiteralPath $prebuiltArchive)) { throw 'Preserve the original prebuilt archive in generated/v8-reference/rusty_v8.lib before relinking; first run the development cargo build if necessary' }
  $referenceReceipt = Join-Path $generated 'v8-reference-check.json'
  & node (Join-Path $PSScriptRoot 'inspect-v8-archive.mjs') --archive $prebuiltArchive --output $referenceReceipt
  if ($LASTEXITCODE -ne 0 -or (Get-Content -LiteralPath $referenceReceipt -Raw | ConvertFrom-Json).forbiddenMembers.Count -eq 0) { throw 'The reference must be the original prebuilt archive containing glibc libm' }
  New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($referenceArchive)) -Force | Out-Null
  Copy-Item -LiteralPath $prebuiltArchive -Destination $referenceArchive
}
$archiveHash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
$bindingHash = (Get-FileHash -LiteralPath $binding.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
$immutableRoot = Join-Path $generated ('v8-libraries/' + $archiveHash)
New-Item -ItemType Directory -Path $immutableRoot -Force | Out-Null
$immutableArchive = Join-Path $immutableRoot 'rusty_v8.lib'
$immutableBinding = Join-Path $immutableRoot ($bindingHash + '.rs')
if (!(Test-Path -LiteralPath $immutableArchive)) { Copy-Item -LiteralPath $archive -Destination $immutableArchive }
if (!(Test-Path -LiteralPath $immutableBinding)) { Copy-Item -LiteralPath $binding.FullName -Destination $immutableBinding }
if ((Get-FileHash -LiteralPath $immutableArchive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $archiveHash -or (Get-FileHash -LiteralPath $immutableBinding -Algorithm SHA256).Hash.ToLowerInvariant() -ne $bindingHash) { throw 'Immutable V8 input hash mismatch' }
$keys = @('V8_FROM_SOURCE', 'RUSTY_V8_ARCHIVE', 'RUSTY_V8_SRC_BINDING_PATH')
$previous = @{}
foreach ($key in $keys) { $previous[$key] = [Environment]::GetEnvironmentVariable($key, 'Process') }
try {
  $env:V8_FROM_SOURCE = $null
  # Hash-addressed input paths invalidate Cargo's environment-based cache when
  # an archive/binding is rebuilt, even if its source build directory is reused.
  $env:RUSTY_V8_ARCHIVE = $immutableArchive
  $env:RUSTY_V8_SRC_BINDING_PATH = $immutableBinding
  & cargo build --offline --locked --release --manifest-path (Join-Path $app 'Cargo.toml') --target-dir ([IO.Path]::GetFullPath($TargetDir))
  if ($LASTEXITCODE -ne 0) { throw 'CLI no-libm build failed' }
  $binary = Join-Path ([IO.Path]::GetFullPath($TargetDir)) 'release/trace-kernel-cli.exe'
  $binaryReceipt = Join-Path $generated 'cli-no-libm-receipt.json'
  & node (Join-Path $PSScriptRoot 'inspect-v8-archive.mjs') --archive $archive --gn-args $gnArgs --binary $binary --reference-library $referenceArchive --expect-no-libm --output $binaryReceipt
  if ($LASTEXITCODE -ne 0) { throw 'The new CLI still contains the old glibc table' }
  $manifest = Get-Content -LiteralPath $binaryReceipt -Raw | ConvertFrom-Json
  $manifest | Add-Member -NotePropertyName bindingSha256 -NotePropertyValue (Get-FileHash -LiteralPath $binding.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
  $manifest | Add-Member -NotePropertyName icuDataSha256 -NotePropertyValue (Get-FileHash -LiteralPath (Join-Path $generated 'v8-source/third_party/icu/common/icudtl.dat') -Algorithm SHA256).Hash.ToLowerInvariant()
  $manifest | Add-Member -NotePropertyName libclangSha256 -NotePropertyValue (Get-FileHash -LiteralPath (Join-Path $generated 'v8-libclang/bin/libclang.dll') -Algorithm SHA256).Hash.ToLowerInvariant()
  $manifest | Add-Member -NotePropertyName buildProfile -NotePropertyValue @{ rustyV8Version = '150.4.0'; rustyV8Revision = '5c15a6995c9bb4bacd3e341b59fff32c909c80bf'; v8Revision = 'ac1e23989121713ca642f6650b34deff7b686896'; features = @('simdutf', 'use_custom_libcxx'); gnOverrides = @{ v8_use_libm_trig_functions = $false; v8_enable_temporal_support = $false }; privateBuildPatch = 'Skip optional Windows SDK debugger DLL copy'; icuRevision = 'ee5f27adc28bd3f15b2c293f726d14d2e336cbd5' }
  $manifest | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $binaryReceipt -Encoding utf8NoBOM
  Write-Output "Verified no-libm CLI: $binary"
} finally {
  foreach ($key in $keys) { [Environment]::SetEnvironmentVariable($key, $previous[$key], 'Process') }
}
