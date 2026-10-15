param([string]$Root,[string]$Output,[int]$OwnedPid)
$ErrorActionPreference='Stop';$records=@();$reason=$null;$binding=$null;$sampler='';$quiet=0;$quietWritten=$false
$env:TEMP="$Root\temp";$env:TMP=$env:TEMP
function Write-OwnedJson($Value,[string]$Path,[int]$Depth=5){$tempPath=$Path+'.owned-'+$OwnedPid+'.tmp';[IO.File]::WriteAllText($tempPath,($Value|ConvertTo-Json -Depth $Depth),[Text.UTF8Encoding]::new($false));[VenueSharedCpuMeter]::ReplaceFile($tempPath,$Path)}
try{
 $identity=Get-CimInstance Win32_Process -Filter "ProcessId=$OwnedPid" -OperationTimeoutSec 8
 if(!$identity -or $identity.Name -ne 'node.exe' -or $identity.CommandLine -notlike '*venue-booking-shared-app-20261016*app-burst-control.cjs*'){throw 'Owned controller binding mismatch'}
 $owned=[Diagnostics.Process]::GetProcessById($OwnedPid)
 if([Math]::Abs(($owned.StartTime.ToUniversalTime()-$identity.CreationDate.ToUniversalTime()).TotalSeconds) -gt 2){throw 'Owned process start mismatch'}
 $binding=@{pid=$OwnedPid;parentPid=$identity.ParentProcessId;startedUTC=$owned.StartTime.ToUniversalTime().ToString('o');operation='app-burst-control.cjs'}
 Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public sealed class VenueSharedCpuMeter {
 [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] private static extern bool MoveFileEx(string from,string to,uint flags);
 public static void ReplaceFile(string from,string to){if(!MoveFileEx(from,to,9))throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());}
 [StructLayout(LayoutKind.Sequential)] private struct FT { public uint Low; public uint High; public ulong Value { get { return ((ulong)High << 32) | Low; } } }
 [DllImport("kernel32.dll",SetLastError=true)] private static extern bool GetSystemTimes(out FT idle,out FT kernel,out FT user);
 [DllImport("kernel32.dll")] private static extern ushort GetActiveProcessorGroupCount();
 private ulong idle,kernel,user;
 public VenueSharedCpuMeter(){if(GetActiveProcessorGroupCount()!=1)throw new NotSupportedException("Multiple CPU groups need the full-machine CIM fallback");Read(out idle,out kernel,out user);}
 private static void Read(out ulong i,out ulong k,out ulong u){FT fi,fk,fu;if(!GetSystemTimes(out fi,out fk,out fu))throw new InvalidOperationException("GetSystemTimes failed");i=fi.Value;k=fk.Value;u=fu.Value;}
 public double Sample(){ulong i,k,u;Read(out i,out k,out u);ulong total=(k-kernel)+(u-user),free=i-idle;idle=i;kernel=k;user=u;if(total==0)throw new InvalidOperationException("CPU interval unavailable");return Math.Round(Math.Max(0,Math.Min(100,100.0*(1.0-(double)free/total))),1);}
}
'@
 $meter=$null;try{$meter=New-Object VenueSharedCpuMeter;$sampler='GetSystemTimes all processors, 1s interval'}catch{$sampler='CIM full-machine fallback, bounded 8s query'}
 Start-Sleep -Seconds 1
 while(Test-Path -LiteralPath "$Root\burst-client.pid"){
  if($owned.HasExited){break}
  if($meter){$v=$meter.Sample()}else{$v=(Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor -Filter "Name='_Total'" -OperationTimeoutSec 8).PercentProcessorTime}
  if($null -eq $v -or [double]::IsNaN([double]$v) -or $v -lt 0 -or $v -gt 100){throw 'CPU unavailable'}
  $records+=@{utc=[DateTime]::UtcNow.ToString('o');cpu=$v}
  if($records.Count -eq 1){Write-OwnedJson @{pid=$OwnedPid;cpu=$v;sampler=$sampler;binding=$binding;utc=[DateTime]::UtcNow.ToString('o')} "$Root\burst-monitor-ready.json"}
  if($v -lt 50){$quiet++}else{$quiet=0}
  if(!$quietWritten -and $quiet -ge 45){Write-OwnedJson @{pid=$OwnedPid;seconds=45;ceiling=50;sampler=$sampler;utc=[DateTime]::UtcNow.ToString('o')} "$Root\burst-load-admitted.json";$quietWritten=$true}
  Write-OwnedJson @{samples=$records;peak=($records.cpu|Measure-Object -Maximum).Maximum;stopReason=$reason;sampler=$sampler;binding=$binding} $Output
  if($v -ge 70){$reason='CPU >= 70';[IO.File]::WriteAllText("$Root\burst.abort",$reason);break}
  Start-Sleep -Seconds 1
 }
}catch{$reason='CPU/process sampling unavailable: '+$_.Exception.Message;[IO.File]::WriteAllText("$Root\burst.abort",$reason)}finally{Write-OwnedJson @{samples=$records;peak=($records.cpu|Measure-Object -Maximum).Maximum;stopReason=$reason;sampler=$sampler;binding=$binding} $Output}
