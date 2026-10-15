param(
  [switch]$InternalPreview,
  [string]$Binary = (Join-Path $PSScriptRoot '../target/release/trace-kernel-cli.exe'),
  [string]$OutputDirectory = (Join-Path $PSScriptRoot '../generated/releases')
)
$ErrorActionPreference = 'Stop'
if (!$InternalPreview) { throw 'Public package creation is gated: finalize product terms and unresolved upstream notices first. Use -InternalPreview for the review artifact.' }
$app = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$generated = Join-Path $app 'generated'
$latest = Get-Content -LiteralPath (Join-Path $generated 'release-inputs/latest.json') -Raw | ConvertFrom-Json
$noticeRoot = [IO.Path]::GetFullPath((Join-Path $generated $latest.root))
$allowedRoot = [IO.Path]::GetFullPath((Join-Path $generated 'release-inputs')) + [IO.Path]::DirectorySeparatorChar
if (!$noticeRoot.StartsWith($allowedRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Notice root escaped generated release inputs' }
$thirdPartyManifestFile = Join-Path $noticeRoot 'third-party-manifest.json'
$thirdParty = Get-Content -LiteralPath $thirdPartyManifestFile -Raw | ConvertFrom-Json
$Binary = [IO.Path]::GetFullPath($Binary)
$hash = (Get-FileHash -LiteralPath $Binary -Algorithm SHA256).Hash.ToLowerInvariant()
if ($hash -ne $thirdParty.binary.sha256) { throw 'Binary differs from the inspected notice manifest; collect notices again' }
$v8Component = $thirdParty.components | Where-Object id -EQ 'v8-v8'
if ($v8Component.buildVerification -ne 'build-provenance/v8-no-libm.json') { throw 'Packaging requires a matching verified no-libm V8 build; rebuild the CLI and collect notices again' }
$v8Proof = Get-Content -LiteralPath (Join-Path $noticeRoot $v8Component.buildVerification) -Raw | ConvertFrom-Json
if ($v8Proof.noLibmRequested -ne $true -or $v8Proof.forbiddenMembers.Count -ne 0 -or $v8Proof.tableCheck.locatedAt -ne -1 -or $v8Proof.tableCheck.binarySha256 -ne $hash -or $v8Proof.gnConfiguration.v8_enable_temporal_support -ne $false) { throw 'The V8 build verification does not match this executable/profile' }
$versionText = (& $Binary --version | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $versionText -ne $thirdParty.binary.version) { throw 'CLI version probe failed or changed' }
if ($versionText -notmatch '^trace-kernel-cli (?<version>[0-9]+\.[0-9]+\.[0-9]+) \(Workspace (?<workspace>[0-9]+), API (?<api>[0-9]+)\)$') { throw 'Unsupported version format' }
$version = $Matches.version
$workspaceGeneration = $Matches.workspace
$apiGeneration = $Matches.api
$stage = Join-Path $generated ('packages/package-' + [Guid]::NewGuid().ToString('N'))
$content = Join-Path $stage 'trace-kernel-cli'
New-Item -ItemType Directory -Path $content -Force | Out-Null
function Copy-VerifiedInput([string]$Relative, [string]$ExpectedHash) {
  $source = [IO.Path]::GetFullPath((Join-Path $noticeRoot $Relative))
  $destination = [IO.Path]::GetFullPath((Join-Path $content $Relative))
  if (!$source.StartsWith($noticeRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -or !$destination.StartsWith($content + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Notice path escaped staging root' }
  if ((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant() -ne $ExpectedHash) { throw "Notice/source changed: $Relative" }
  New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($destination)) -Force | Out-Null
  Copy-Item -LiteralPath $source -Destination $destination
}
foreach ($item in $thirdParty.files) { Copy-VerifiedInput $item.path $item.sha256 }
Copy-Item -LiteralPath $thirdPartyManifestFile -Destination (Join-Path $content 'third-party-manifest.json')
Copy-Item -LiteralPath $Binary -Destination (Join-Path $content 'trace-kernel-cli.exe')
$readme = Get-Content -LiteralPath (Join-Path $app 'distribution/README.md') -Raw
$review = @($thirdParty.components | Where-Object { $_.noticeReview } | ForEach-Object { "$($_.name) $($_.version): $($_.noticeReview)" })
$previewHeading = "# INTERNAL PREVIEW — 外部公開前の確認用`n`n本体利用条件・上流noticeの確認・クリーンWindows検証は未完了です。公開用配布物として扱わないでください。`n`n"
$previewHeading + $readme | Set-Content -LiteralPath (Join-Path $content 'README.md') -Encoding utf8NoBOM
@"
INTERNAL PREVIEW / NOT A PUBLIC RELEASE

Trace Kernel本体の利用条件は確定前です。このファイルは正式な利用許諾文ではありません。
正式な本体利用条件を作成し、第三者noticeの未確認事項を解消してから公開してください。
Third-party components retain their respective licenses. See THIRD-PARTY-NOTICES.txt and licenses/.

Unresolved notice review:
$($review -join "`n")
"@ | Set-Content -LiteralPath (Join-Path $content 'LICENSE.txt') -Encoding utf8NoBOM
New-Item -ItemType Directory -Path (Join-Path $content 'examples') -Force | Out-Null
$workspace = @{ gen = @{ workspace = $workspaceGeneration; api = $apiGeneration }; envs = @(); resources = @(); datasets = @(); processes = @(); logics = @(); declare = @{ source = '' }; works = @(@{ name = 'cli-test'; method = 'plain'; source = '$println(''cli test!'');' }) }
$stream = [IO.MemoryStream]::new()
$gzip = [IO.Compression.GZipStream]::new($stream, [IO.Compression.CompressionLevel]::Optimal, $true)
$bytes = [Text.Encoding]::UTF8.GetBytes(($workspace | ConvertTo-Json -Depth 20 -Compress))
$gzip.Write($bytes, 0, $bytes.Length); $gzip.Dispose()
[Convert]::ToBase64String($stream.ToArray()) | Set-Content -LiteralPath (Join-Path $content 'examples/cli-test.trk') -Encoding utf8NoBOM
$stream.Dispose()
$entries = @(Get-ChildItem -LiteralPath $content -File -Recurse | ForEach-Object { @{ path = [IO.Path]::GetRelativePath($content, $_.FullName).Replace('\', '/'); bytes = $_.Length; sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant() } } | Sort-Object { $_.path })
@{ formatVersion = 1; target = 'x86_64-pc-windows-msvc'; status = 'internal-preview'; version = $version; generation = @{ workspace = $workspaceGeneration; api = $apiGeneration }; binarySha256 = $hash; pending = @('Finalize product distribution terms', 'Resolve/review upstream license notices', 'Validate clean Windows with/without VC runtime'); files = $entries } | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath (Join-Path $content 'package-manifest.json') -Encoding utf8NoBOM
$releases = [IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Path $releases -Force | Out-Null
$archive = Join-Path $releases ("trace-kernel-cli-$version-windows-x64-internal.zip")
if (Test-Path -LiteralPath $archive) { throw "Archive already exists; preserve or rename it before packaging again: $archive" }
[IO.Compression.ZipFile]::CreateFromDirectory($stage, $archive, [IO.Compression.CompressionLevel]::Optimal, $false)
$archiveHash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
"$archiveHash  $([IO.Path]::GetFileName($archive))" | Set-Content -LiteralPath ($archive + '.sha256') -Encoding utf8NoBOM
Write-Output "Created internal ZIP: $archive"
Write-Output "SHA-256: $archiveHash"
