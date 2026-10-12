$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class CxCloseCourseDevTools {
 public delegate bool Callback(IntPtr h, IntPtr p);
 [DllImport("user32.dll")] public static extern bool EnumWindows(Callback callback, IntPtr parameter);
 [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder text, int capacity);
 [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint message, IntPtr w, IntPtr l);
 public static int Close() {
  int count = 0;
  EnumWindows((h,p) => {
   var text = new StringBuilder(4096); GetWindowText(h,text,text.Capacity);
   var title = text.ToString();
   if (title.StartsWith("Developer Tools - Vivaldi") && title.Contains("chaoxing.com")) {
    if (PostMessage(h, 0x0010, IntPtr.Zero, IntPtr.Zero)) count++;
   }
   return true;
  }, IntPtr.Zero);
  return count;
 }
}
'@
Write-Output ("Closed course DevTools windows: " + [CxCloseCourseDevTools]::Close())
