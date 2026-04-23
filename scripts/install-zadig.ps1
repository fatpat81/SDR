# Automatically download and run Zadig with a preset for RTL-SDR
# This script configures the WinUSB driver required for WebUSB to access the SDR

$ZadigUrl = "https://github.com/pbatard/libwdi/releases/download/v1.5.1/zadig-2.9.exe"
$ZadigExe = "$PSScriptRoot\zadig.exe"
$ZadigIni = "$PSScriptRoot\zadig.ini"

Write-Host "Downloading Zadig (v2.9)..."
Invoke-WebRequest -Uri $ZadigUrl -OutFile $ZadigExe

Write-Host "Creating Zadig Preset for RTL-SDR (VID 0x0BDA, PID 0x2838)..."
$iniContent = @"
[device]
Description = "Bulk-In, Interface (Interface 0)"
VID = 0x0BDA
PID = 0x2838
MI = 0x00
"@
Set-Content -Path $ZadigIni -Value $iniContent

Write-Host "Opening Zadig! Please verify the device is selected and click 'Install Driver' or 'Replace Driver'..."
Start-Process $ZadigExe
