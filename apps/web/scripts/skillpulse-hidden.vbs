Option Explicit
Dim shell, files, wrapper, result
Set shell = CreateObject("WScript.Shell")
Set files = CreateObject("Scripting.FileSystemObject")
wrapper = files.BuildPath(files.GetParentFolderName(WScript.ScriptFullName), "skillpulse-hourly.cmd")
result = shell.Run("cmd.exe /d /c """ & wrapper & """", 0, True)
WScript.Quit result
