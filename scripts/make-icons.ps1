Add-Type -AssemblyName System.Drawing
$iconDir = Join-Path $PSScriptRoot '..\src-tauri\icons'
New-Item -ItemType Directory -Force -Path $iconDir | Out-Null
foreach ($size in @(32,128,256)) {
    $bitmap = New-Object System.Drawing.Bitmap($size,$size)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(237,28,36))
    $graphics.FillEllipse($brush,0,0,$size,$size)
    $white = [System.Drawing.Brushes]::White
    $graphics.FillRectangle($white,[int]($size*.28),[int]($size*.25),[int]($size*.44),[int]($size*.12))
    $graphics.FillRectangle($white,[int]($size*.28),[int]($size*.44),[int]($size*.28),[int]($size*.12))
    $graphics.FillEllipse($white,[int]($size*.28),[int]($size*.66),[int]($size*.12),[int]($size*.12))
    $bitmap.Save((Join-Path $iconDir "$($size)x$($size).png"),[System.Drawing.Imaging.ImageFormat]::Png)
    $graphics.Dispose()
    $bitmap.Dispose()
    $brush.Dispose()
}
# ICO containing the full-resolution PNG payload (supported by Windows Vista+).
$png = [System.IO.File]::ReadAllBytes((Join-Path $iconDir '256x256.png'))
$stream = [System.IO.File]::Create((Join-Path $iconDir 'icon.ico'))
$writer = New-Object System.IO.BinaryWriter($stream)
$writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]1)
$writer.Write([byte]0); $writer.Write([byte]0); $writer.Write([byte]0); $writer.Write([byte]0)
$writer.Write([uint16]1); $writer.Write([uint16]32); $writer.Write([uint32]$png.Length); $writer.Write([uint32]22)
$writer.Write($png); $writer.Dispose(); $stream.Dispose()
