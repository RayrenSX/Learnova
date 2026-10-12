param([Parameter(Mandatory=$true)][string]$CodePath,[int]$ClickX=0,[int]$ClickY=0,[switch]$TopContext,[switch]$Maximize)
# Real-course inspection only. Close the debugging connection after each test
# with tests/close-course-devtools.ps1; the platform periodically runs debugger.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public class CxDevToolsWindow {
 [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
 public delegate bool Callback(IntPtr h,IntPtr p);
 [DllImport("user32.dll")] public static extern bool EnumWindows(Callback cb,IntPtr p);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h,StringBuilder s,int n);
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h,int n);
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
 [DllImport("user32.dll")] public static extern void mouse_event(uint flags,uint x,uint y,uint data,UIntPtr extra);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint process);
 [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
 [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint a,uint b,bool attach);
 public static void Focus(IntPtr h) {
  uint process;
  uint foreground=GetWindowThreadProcessId(GetForegroundWindow(),out process);
  uint current=GetCurrentThreadId();
  if(foreground!=current)AttachThreadInput(current,foreground,true);
  ShowWindow(h,9);SetForegroundWindow(h);
  if(foreground!=current)AttachThreadInput(current,foreground,false);
 }
 public static IntPtr Find() {
  IntPtr result=IntPtr.Zero;
  EnumWindows((h,p)=>{var s=new StringBuilder(2048);GetWindowText(h,s,s.Capacity);
   if(s.ToString().StartsWith("Developer Tools - Vivaldi") && s.ToString().Contains("chaoxing.com")) result=h;
   return true;},IntPtr.Zero);
  return result;
 }
}
'@
$taskHandle = [CxDevToolsWindow]::Find()
[CxDevToolsWindow]::SetProcessDPIAware() | Out-Null
if ($taskHandle -eq [IntPtr]::Zero) { throw 'Open Vivaldi DevTools on the authorized Chaoxing course tab first.' }
$taskCode = (Get-Content -LiteralPath $CodePath -Raw).Trim()
Set-Clipboard -Value $taskCode
[CxDevToolsWindow]::Focus($taskHandle)
if ($Maximize) { [CxDevToolsWindow]::ShowWindow($taskHandle,3) | Out-Null }
Start-Sleep -Milliseconds 200
if ([CxDevToolsWindow]::GetForegroundWindow() -ne $taskHandle) {
  [System.Windows.Forms.SendKeys]::SendWait('%')
  [CxDevToolsWindow]::Focus($taskHandle)
  Start-Sleep -Milliseconds 200
}
if ([CxDevToolsWindow]::GetForegroundWindow() -ne $taskHandle) { throw 'DevTools did not receive focus; no keys sent.' }
if ($TopContext) {
 [CxDevToolsWindow]::SetCursorPos(1788,482) | Out-Null
 [CxDevToolsWindow]::mouse_event(2,0,0,0,[UIntPtr]::Zero)
 [CxDevToolsWindow]::mouse_event(4,0,0,0,[UIntPtr]::Zero)
 Start-Sleep -Milliseconds 100
 [System.Windows.Forms.SendKeys]::SendWait('{UP 60}{ENTER}')
 Start-Sleep -Milliseconds 100
}
if ($ClickX -and $ClickY) {
 [CxDevToolsWindow]::SetCursorPos($ClickX,$ClickY) | Out-Null
 [CxDevToolsWindow]::mouse_event(2,0,0,0,[UIntPtr]::Zero)
 [CxDevToolsWindow]::mouse_event(4,0,0,0,[UIntPtr]::Zero)
 Start-Sleep -Milliseconds 100
}
[System.Windows.Forms.SendKeys]::SendWait('^v')
[System.Windows.Forms.SendKeys]::SendWait('^{ENTER}')
Start-Sleep -Milliseconds 650
$taskResult = Get-Clipboard -Raw
if ($taskResult -eq $taskCode) { Write-Output 'Command sent; no clipboard result.' }
else { Write-Output $taskResult }
