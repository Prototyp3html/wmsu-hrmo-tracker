$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$desktop = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktop 'WMSU HRMO.lnk'
$legacyShortcutPath = Join-Path $desktop 'WMSU HRMO Tracker.lnk'
$targetPath = Join-Path $root 'start-web-app.cmd'
$sealPath = Join-Path $root 'frontend\public\wmsu-seal.png'
$iconPath = Join-Path $root 'wmsu-logo.ico'

if (-not (Test-Path $targetPath)) {
  throw "Launcher not found: $targetPath"
}

if (Test-Path $legacyShortcutPath) {
  Remove-Item $legacyShortcutPath -Force
}

if (Test-Path $sealPath) {
  Add-Type -AssemblyName System.Drawing

  $bitmapSource = [System.Drawing.Bitmap]::FromFile($sealPath)
  try {
    $left = $bitmapSource.Width
    $top = $bitmapSource.Height
    $right = -1
    $bottom = -1

    for ($y = 0; $y -lt $bitmapSource.Height; $y++) {
      for ($x = 0; $x -lt $bitmapSource.Width; $x++) {
        $pixel = $bitmapSource.GetPixel($x, $y)
        if ($pixel.A -gt 0) {
          if ($x -lt $left) { $left = $x }
          if ($y -lt $top) { $top = $y }
          if ($x -gt $right) { $right = $x }
          if ($y -gt $bottom) { $bottom = $y }
        }
      }
    }

    $sourceBitmap = $bitmapSource
    if ($right -ge $left -and $bottom -ge $top) {
      $cropRect = New-Object System.Drawing.Rectangle($left, $top, ($right - $left + 1), ($bottom - $top + 1))
      $sourceBitmap = $bitmapSource.Clone($cropRect, $bitmapSource.PixelFormat)
    }

    $size = 256
    $canvas = New-Object System.Drawing.Bitmap $size, $size
    try {
      $graphics = [System.Drawing.Graphics]::FromImage($canvas)
      try {
        $graphics.Clear([System.Drawing.Color]::Transparent)
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

        $scale = [Math]::Min($size / $sourceBitmap.Width, $size / $sourceBitmap.Height)
        $drawWidth = [int]([Math]::Round($sourceBitmap.Width * $scale))
        $drawHeight = [int]([Math]::Round($sourceBitmap.Height * $scale))
        $drawX = [int](($size - $drawWidth) / 2)
        $drawY = [int](($size - $drawHeight) / 2)

        $graphics.DrawImage($sourceBitmap, $drawX, $drawY, $drawWidth, $drawHeight)
      } finally {
        $graphics.Dispose()
      }

      $iconHandle = $canvas.GetHicon()
      try {
        $icon = [System.Drawing.Icon]::FromHandle($iconHandle)
        try {
          $iconStream = New-Object System.IO.FileStream($iconPath, [System.IO.FileMode]::Create)
          try {
            $icon.Save($iconStream)
          } finally {
            $iconStream.Dispose()
          }
        } finally {
          $icon.Dispose()
        }
      } finally {
        Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class IconInterop {
  [DllImport("user32.dll", CharSet = CharSet.Auto)]
  public static extern bool DestroyIcon(IntPtr handle);
}
"@
        [IconInterop]::DestroyIcon($iconHandle) | Out-Null
      }
    } finally {
      $canvas.Dispose()
    }

    if ($sourceBitmap -ne $bitmapSource) {
      $sourceBitmap.Dispose()
    }
  } finally {
    $bitmapSource.Dispose()
  }
}

$wshShell = New-Object -ComObject WScript.Shell
$shortcut = $wshShell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = 'C:\Windows\System32\cmd.exe'
$shortcut.Arguments = "/c `"$targetPath`""
$shortcut.WorkingDirectory = $root
if (Test-Path $iconPath) {
  $shortcut.IconLocation = "$iconPath,0"
}
$shortcut.Description = 'WMSU HRMO'
$shortcut.Save()

Write-Host "Created desktop shortcut: $shortcutPath"