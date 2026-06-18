# Adds an entry to current user's Run registry key to autostart the app
param(
  [string]$ExePath = "C:\\Path\\To\\GamePresence.exe",
  [string]$Name = "GamePresence"
)

$regPath = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
Set-ItemProperty -Path $regPath -Name $Name -Value "`"$ExePath`""
Write-Host "Autostart added for user: $Name -> $ExePath"
