param([string]$Binary = (Join-Path $PSScriptRoot '../target/release/trace-kernel-cli.exe'))
$ErrorActionPreference = 'Stop'
$Binary = [IO.Path]::GetFullPath($Binary)
$app = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$fixtureRoot = Join-Path $app ('generated/verify-cancel-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $fixtureRoot -Force | Out-Null
$ready = Join-Path $fixtureRoot 'ready.txt'
$never = Join-Path $fixtureRoot 'never.txt'
$license = Join-Path $fixtureRoot 'license.json'
$workspaceFile = Join-Path $fixtureRoot 'cancel.trk'
$keySource = Get-Content -LiteralPath (Join-Path $app '../../packages/runtime-core/src/license/license-util.ts') -Raw
$key = [regex]::Match($keySource, 'v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+').Value
if (!$key) { throw 'Missing public verification license key' }
@{ key = $key } | ConvertTo-Json -Compress | Set-Content -LiteralPath $license -Encoding utf8NoBOM
$source = '$fs.useTransaction().saveText(' + (ConvertTo-Json -InputObject $never -Compress) + ',"never");await $fs.saveText(' + (ConvertTo-Json -InputObject $ready -Compress) + ',"ready");while(true){}'
$workspace = @{ gen = @{ workspace = '0'; api = '1' }; envs = @(); resources = @(); datasets = @(); processes = @(); logics = @(); declare = @{ source = '' }; works = @(@{ name = 'Cancel'; method = 'plain'; source = $source }) }
$bytes = [Text.Encoding]::UTF8.GetBytes(($workspace | ConvertTo-Json -Depth 20 -Compress))
$stream = [IO.MemoryStream]::new()
$gzip = [IO.Compression.GZipStream]::new($stream, [IO.Compression.CompressionLevel]::Optimal, $true)
$gzip.Write($bytes, 0, $bytes.Length)
$gzip.Dispose()
[Convert]::ToBase64String($stream.ToArray()) | Set-Content -LiteralPath $workspaceFile -Encoding utf8NoBOM
$stream.Dispose()

# Give the CLI its own hidden console. Sending Ctrl+C into the tool's parent
# terminal can stop that shell and does not reliably report the child's exit code.
Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Text;
using System.Threading;
using System.ComponentModel;
using System.Runtime.InteropServices;
public static class CliConsoleProbe {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  struct Startup { public uint cb; public string reserved, desktop, title; public uint x,y,xSize,ySize,xChars,yChars,fill,flags; public ushort show,reservedSize; public IntPtr reservedBytes,input,output,error; }
  [StructLayout(LayoutKind.Sequential)] struct ProcessInfo { public IntPtr process,thread; public uint pid,tid; }
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool CreateProcessW(string app,StringBuilder command,IntPtr pa,IntPtr ta,bool inherit,uint flags,IntPtr env,string cwd,ref Startup startup,out ProcessInfo process);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetHandleInformation(IntPtr handle,uint mask,uint flags);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool AttachConsole(uint pid);
  [DllImport("kernel32.dll")] static extern bool FreeConsole();
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetConsoleCtrlHandler(IntPtr handler,bool add);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool GenerateConsoleCtrlEvent(uint evt,uint group);
  [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr handle,uint ms);
  [DllImport("kernel32.dll")] static extern bool GetExitCodeProcess(IntPtr process,out uint code);
  [DllImport("kernel32.dll")] static extern bool TerminateProcess(IntPtr process,uint code);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  static void Require(bool value) { if(!value)throw new Win32Exception(Marshal.GetLastWin32Error()); }
  public static uint Run(string exe,string command,string ready,string directory) {
    using(var stdout=new FileStream(Path.Combine(directory,"stdout.txt"),FileMode.Create,FileAccess.Write,FileShare.Read))
    using(var stderr=new FileStream(Path.Combine(directory,"stderr.txt"),FileMode.Create,FileAccess.Write,FileShare.Read)) {
      var si=new Startup();si.cb=(uint)Marshal.SizeOf(si);si.flags=0x101;si.show=0;
      si.output=stdout.SafeFileHandle.DangerousGetHandle();si.error=stderr.SafeFileHandle.DangerousGetHandle();
      Require(SetHandleInformation(si.output,1,1));Require(SetHandleInformation(si.error,1,1));
      ProcessInfo pi;Require(CreateProcessW(exe,new StringBuilder(command),IntPtr.Zero,IntPtr.Zero,true,0x10,IntPtr.Zero,directory,ref si,out pi));
      try {
        for(int i=0;i<300&&!File.Exists(ready);i++){if(WaitForSingleObject(pi.process,50)==0)throw new Exception("CLI exited before ready; see stderr.txt");}
        if(!File.Exists(ready))throw new Exception("CLI did not reach Work body");
        Thread.Sleep(100);FreeConsole();Require(AttachConsole(pi.pid));
        Require(SetConsoleCtrlHandler(IntPtr.Zero,true));Require(GenerateConsoleCtrlEvent(0,0));
        if(WaitForSingleObject(pi.process,10000)!=0)throw new Exception("Ctrl+C did not stop CLI");
        uint code;Require(GetExitCodeProcess(pi.process,out code));return code;
      } finally {
        FreeConsole();if(WaitForSingleObject(pi.process,0)!=0){TerminateProcess(pi.process,1);WaitForSingleObject(pi.process,5000);}CloseHandle(pi.thread);CloseHandle(pi.process);
      }
    }
  }
}
'@
$command = '"' + $Binary + '" "' + $workspaceFile + '" Cancel --commit --license-file "' + $license + '" --timeout 30'
$code = [CliConsoleProbe]::Run($Binary, $command, $ready, $fixtureRoot)
$errorText = Get-Content -LiteralPath (Join-Path $fixtureRoot 'stderr.txt') -Raw
if ($code -ne 130) { throw "Expected code 130, got $code. $errorText" }
if (Test-Path -LiteralPath $never) { throw 'Cancellation applied the staged transaction' }
if ($errorText -notmatch 'Execution cancelled') { throw "Missing cancellation diagnostic: $errorText" }
Write-Output "PASS CLI: Windows Ctrl+C interrupts CPU Work, returns 130 and prevents VFS apply. Fixtures: $fixtureRoot"
