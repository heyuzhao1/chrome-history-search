# 生成扩展图标（圆角蓝底 + 白色放大镜）
Add-Type -AssemblyName System.Drawing

$iconDir = Join-Path $PSScriptRoot 'icons'
if (-not (Test-Path $iconDir)) { New-Item -ItemType Directory -Path $iconDir | Out-Null }

function Get-RoundedRectPath($x, $y, $w, $h, $r) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = 2 * $r
  $path.AddArc($x, $y, $d, $d, 180, 90)
  $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  return $path
}

function New-Icon($size, $outPath) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::Transparent)

  # 背景：圆角矩形
  $pad = [int]($size * 0.06)
  $radius = [int]($size * 0.22)
  $bgPath = Get-RoundedRectPath $pad $pad ($size - 2 * $pad) ($size - 2 * $pad) $radius
  $bgBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 66, 133, 244))
  $g.FillPath($bgBrush, $bgPath)
  $bgBrush.Dispose(); $bgPath.Dispose()

  # 放大镜：圆环 + 手柄
  $penWidth = [float]($size * 0.11)
  $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), $penWidth
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $glassR = [int]($size * 0.20)
  $cx = [int]($size * 0.42)
  $cy = [int]($size * 0.42)
  $g.DrawEllipse($pen, $cx - $glassR, $cy - $glassR, 2 * $glassR, 2 * $glassR)
  $g.DrawLine($pen, ($cx + $glassR * 0.72), ($cy + $glassR * 0.72), ($size * 0.74), ($size * 0.74))
  $pen.Dispose()

  $g.Dispose()
  $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

New-Icon 16  (Join-Path $iconDir 'icon16.png')
New-Icon 48  (Join-Path $iconDir 'icon48.png')
New-Icon 128 (Join-Path $iconDir 'icon128.png')
Write-Output 'Icons generated.'
