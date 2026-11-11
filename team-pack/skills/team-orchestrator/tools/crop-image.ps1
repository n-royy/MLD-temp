# Enlarged crop of an input image (a voucher, scan, chart or diagram) for reading numbers and marks.
# 1.5.28, from 45CVHIIC TASK-11 (48/80): four 8-digit amounts were read from the whole image with 7 digits.
# Needs nothing but Windows PowerShell 7 (System.Drawing); no package, no network.
#
#   pwsh -NoProfile -File crop-image.ps1 -Image data/x.png                      -> prints {"width":..,"height":..}
#   pwsh -NoProfile -File crop-image.ps1 -Image data/x.png -Out .mtm-tmp/<ID>/c1.png -X 560 -Y 190 -Width 200 -Height 290
#
# Coordinates are pixels of the original image. -Scale (default 3) enlarges the crop; the output keeps it under
# 2000 px on its longest side.
param(
  [Parameter(Mandatory = $true)][string]$Image,
  [string]$Out,
  [int]$X = 0, [int]$Y = 0, [int]$Width = 0, [int]$Height = 0,
  [double]$Scale = 3
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$src = [System.Drawing.Image]::FromFile((Resolve-Path -LiteralPath $Image).Path)
try {
  if (-not $Out) { [ordered]@{ width = $src.Width; height = $src.Height } | ConvertTo-Json -Compress; return }
  if ($Width -le 0) { $Width = $src.Width - $X }
  if ($Height -le 0) { $Height = $src.Height - $Y }
  $X = [Math]::Max(0, [Math]::Min($X, $src.Width - 1)); $Y = [Math]::Max(0, [Math]::Min($Y, $src.Height - 1))
  $Width = [Math]::Min($Width, $src.Width - $X); $Height = [Math]::Min($Height, $src.Height - $Y)
  $k = [Math]::Min($Scale, 2000 / [Math]::Max($Width, $Height))
  $w = [int][Math]::Round($Width * $k); $h = [int][Math]::Round($Height * $k)
  $dst = New-Object System.Drawing.Bitmap $w, $h
  $g = [System.Drawing.Graphics]::FromImage($dst)
  try {
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.DrawImage($src, (New-Object System.Drawing.Rectangle 0, 0, $w, $h), (New-Object System.Drawing.Rectangle $X, $Y, $Width, $Height), [System.Drawing.GraphicsUnit]::Pixel)
    $full = [System.IO.Path]::GetFullPath($Out)
    New-Item -ItemType Directory -Force -Path ([System.IO.Path]::GetDirectoryName($full)) | Out-Null
    $dst.Save($full, [System.Drawing.Imaging.ImageFormat]::Png)
    [ordered]@{ out = $full; region = @($X, $Y, $Width, $Height); size = @($w, $h) } | ConvertTo-Json -Compress
  } finally { $g.Dispose(); $dst.Dispose() }
} finally { $src.Dispose() }
