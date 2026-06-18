param(
  [string]$Name = "GamePresence"
)
$regPath = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
if (Get-ItemProperty -Path $regPath -Name $Name -ErrorAction SilentlyContinue) {
  Remove-ItemProperty -Path $regPath -Name $Name
  Write-Host "Removed autostart entry: $Name"
} else {
  Write-Host "No autostart entry named $Name found."
}
