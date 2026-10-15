param(
  [Parameter(Mandatory = $true)][string]$Python,
  [ValidateRange(1, 32)][int]$Jobs = 4
)
$ErrorActionPreference = 'Stop'
$app = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$generated = Join-Path $app 'generated'
$source = Join-Path $generated 'v8-source'
$driver = Join-Path $generated 'v8-build-driver'
$target = Join-Path $generated 'v8-build-target'
New-Item -ItemType Directory -Path $generated -Force | Out-Null
$lock = [IO.File]::Open((Join-Path $generated 'v8-source-build.lock'), [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
$keys = @('V8_FROM_SOURCE', 'GN_ARGS', 'TRACE_KERNEL_SKIP_WINDOWS_DEBUGGER_COPY', 'PYTHON', 'PYTHONPATH', 'PYTHONUTF8', 'LIBCLANG_PATH', 'BINDGEN_EXTRA_CLANG_ARGS', 'PRINT_GN_ARGS')
$previous = @{}
foreach ($key in $keys) { $previous[$key] = [Environment]::GetEnvironmentVariable($key, 'Process') }
try {
  $metadataText = (& cargo metadata --offline --locked --filter-platform x86_64-pc-windows-msvc --format-version 1 --manifest-path (Join-Path $app 'Cargo.toml') | Out-String)
  if ($LASTEXITCODE -ne 0) { throw 'Cargo metadata failed' }
  $metadata = $metadataText | ConvertFrom-Json
  $package = $metadata.packages | Where-Object name -EQ 'v8'
  $features = @(($metadata.resolve.nodes | Where-Object id -EQ $package.id).features | Sort-Object)
  if ($package.version -ne '150.4.0' -or ($features -join ',') -ne 'simdutf,use_custom_libcxx') { throw 'V8 version/features changed: review this build profile before use' }
  if (!(Test-Path -LiteralPath $source)) {
    $packageRoot = [IO.Path]::GetDirectoryName($package.manifest_path)
    robocopy $packageRoot $source /E /COPY:DAT /DCOPY:T /R:0 /W:0 /MT:8 /NFL /NDL /NJH /NJS | Out-Null
    if ($LASTEXITCODE -ge 8) { throw 'V8 source copy failed' }
  }
  # Private build-only patch: the optional SDK debugger DLL copy is unnecessary
  # for the static library and build helpers can use system dbghelp diagnostics.
  $toolchainFile = Join-Path $source 'build/vs_toolchain.py'
  $toolchain = Get-Content -LiteralPath $toolchainFile -Raw
  if (!$toolchain.Contains('TRACE_KERNEL_SKIP_WINDOWS_DEBUGGER_COPY')) {
    $marker = '  msdia140.dll is needed for tools like symupload.exe and dump_syms.exe.'
    $position = $toolchain.IndexOf($marker, [StringComparison]::Ordinal)
    if ($position -lt 0) { throw 'Unexpected Windows build helper: review patch' }
    $end = $toolchain.IndexOf('  """', $position, [StringComparison]::Ordinal) + 5
    $toolchain = $toolchain.Insert($end, "`n  # Trace Kernel private static-library build: use system diagnostic DLLs.`n  if os.environ.get('TRACE_KERNEL_SKIP_WINDOWS_DEBUGGER_COPY') == '1':`n    return`n")
    [IO.File]::WriteAllText($toolchainFile, $toolchain, [Text.UTF8Encoding]::new($false))
  }
  # The Cargo tarball omits this data file. Restore the exact upstream blob.
  $icuPath = Join-Path $source 'third_party/icu/common/icudtl.dat'
  $icuHash = '1cf67874b5a87a8363a86fb3f81e3cbbed54d389062dab8fb52308d5cf8c8612'
  if (!(Test-Path -LiteralPath $icuPath)) {
    $encoded = (Invoke-WebRequest -Uri 'https://chromium.googlesource.com/chromium/deps/icu/+/ee5f27adc28bd3f15b2c293f726d14d2e336cbd5/common/icudtl.dat?format=TEXT').Content
    New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($icuPath)) -Force | Out-Null
    [IO.File]::WriteAllBytes($icuPath, [Convert]::FromBase64String($encoded))
  }
  if ((Get-FileHash -LiteralPath $icuPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $icuHash) { throw 'Pinned ICU data mismatch' }
  New-Item -ItemType Directory -Path (Join-Path $driver 'src') -Force | Out-Null
  @'
[package]
name = "trace-kernel-v8-source-build"
version = "0.0.0"
edition = "2021"
publish = false
[workspace]
[dependencies]
v8 = { version = "=150.4.0", default-features = false, features = ["simdutf", "use_custom_libcxx"] }
[patch.crates-io]
v8 = { path = "../v8-source" }
'@ | Set-Content -LiteralPath (Join-Path $driver 'Cargo.toml') -Encoding utf8NoBOM
  'fn main() {}' | Set-Content -LiteralPath (Join-Path $driver 'src/main.rs') -Encoding utf8NoBOM
  Copy-Item -LiteralPath (Join-Path $app 'Cargo.lock') -Destination (Join-Path $driver 'Cargo.lock')
  $env:V8_FROM_SOURCE = '1'
  $env:GN_ARGS = 'v8_use_libm_trig_functions=false v8_enable_temporal_support=false'
  $env:TRACE_KERNEL_SKIP_WINDOWS_DEBUGGER_COPY = '1'
  $env:PYTHON = [IO.Path]::GetFullPath($Python)
  $env:PYTHONPATH = [IO.Path]::GetDirectoryName($env:PYTHON)
  $env:PYTHONUTF8 = '1'
  $env:PRINT_GN_ARGS = $null
  $libclangRoot = [IO.Path]::GetFullPath((Join-Path $generated 'v8-libclang'))
  if (!$libclangRoot.StartsWith($generated + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unexpected libclang target' }
  $libclangDll = Join-Path $libclangRoot 'bin/libclang.dll'
  if (!(Test-Path -LiteralPath $libclangDll)) {
    & $env:PYTHON (Join-Path $source 'tools/clang/scripts/update.py') --package libclang --output-dir $libclangRoot
    if ($LASTEXITCODE -ne 0) { throw 'Pinned Chromium libclang download failed' }
  }
  $clangRevision = (Get-Content -LiteralPath (Join-Path $libclangRoot 'libclang_revision') -Raw).Trim()
  if ($clangRevision -ne 'llvmorg-23-init-10931-g20b6ec66-11') { throw 'Unexpected libclang revision' }
  $env:LIBCLANG_PATH = [IO.Path]::GetDirectoryName($libclangDll)
  # The separate libclang package has no builtin headers. Use the matching
  # compiler's resource directory instead of falling back to MSVC stddef.h.
  $resourceDir = Join-Path $target 'release/clang/lib/clang/23'
  $env:BINDGEN_EXTRA_CLANG_ARGS = '-resource-dir="' + $resourceDir.Replace('\', '/') + '"'
  $log = Join-Path $generated 'v8-no-libm-build.log'
  & cargo build --offline --release --jobs $Jobs --manifest-path (Join-Path $driver 'Cargo.toml') --target-dir $target > $log 2>&1
  if ($LASTEXITCODE -ne 0) { Get-Content -LiteralPath $log -Tail 50 | Where-Object { $_ -notmatch '^\s*cargo:rerun-if-changed=' }; throw "V8 source build failed. Log: $log" }
  $archive = Join-Path $target 'release/gn_out/obj/rusty_v8.lib'
  $gnArgs = Join-Path $target 'release/gn_out/args.gn'
  $receipt = Join-Path $generated 'v8-no-libm-library-receipt.json'
  & node (Join-Path $PSScriptRoot 'inspect-v8-archive.mjs') --archive $archive --gn-args $gnArgs --expect-no-libm --output $receipt
  if ($LASTEXITCODE -ne 0) { throw 'The built archive still contains glibc libm' }
  Write-Output "Verified no-libm V8 library: $archive"
} finally {
  foreach ($key in $keys) { [Environment]::SetEnvironmentVariable($key, $previous[$key], 'Process') }
  $lock.Dispose()
}
