param([string]$Keys, [string]$Url, [switch]$Minimize, [switch]$Maximize)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public class CxCourseWindow {
 public delegate bool Callback(IntPtr h,IntPtr p);
 [DllImport("user32.dll")] public static extern bool EnumWindows(Callback cb,IntPtr p);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h,StringBuilder s,int n);
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h,int n);
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint process);
 [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
 [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint a,uint b,bool attach);
 public static IntPtr Find() { IntPtr result=IntPtr.Zero; EnumWindows((h,p)=>{var s=new StringBuilder(2048);GetWindowText(h,s,s.Capacity); if(s.ToString().EndsWith(" - Vivaldi") && !s.ToString().StartsWith("Developer Tools")) result=h;return true;},IntPtr.Zero);return result; }
 public static void Focus(IntPtr h) { uint process; uint foreground=GetWindowThreadProcessId(GetForegroundWindow(),out process); uint current=GetCurrentThreadId(); if(foreground!=current)AttachThreadInput(current,foreground,true);ShowWindow(h,9);SetForegroundWindow(h);if(foreground!=current)AttachThreadInput(current,foreground,false); }
}
'@
$taskWindow = [CxCourseWindow]::Find()
if ($taskWindow -eq [IntPtr]::Zero) { throw 'Vivaldi main window not found' }
[CxCourseWindow]::Focus($taskWindow)
Start-Sleep -Milliseconds 100
if ([CxCourseWindow]::GetForegroundWindow() -ne $taskWindow) { throw 'Vivaldi did not receive focus; no keys sent' }
if ($Minimize) { [CxCourseWindow]::ShowWindow($taskWindow, 6) | Out-Null; Write-Output 'Vivaldi minimized.'; return }
if ($Maximize) { [CxCourseWindow]::ShowWindow($taskWindow, 3) | Out-Null; Write-Output 'Vivaldi maximized.'; return }
if ($Url) {
 Set-Clipboard -Value $Url
 [System.Windows.Forms.SendKeys]::SendWait('^t')
 [System.Windows.Forms.SendKeys]::SendWait('^l')
 [System.Windows.Forms.SendKeys]::SendWait('^v')
 [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
} elseif ($Keys) { [System.Windows.Forms.SendKeys]::SendWait($Keys) }
Write-Output 'Action sent to verified Vivaldi window.'
