# Gera os ícones PNG do PWA a partir de formas vetoriais.
# Uso (PowerShell, na pasta frontend):
#   powershell -ExecutionPolicy Bypass -File .\scripts\generate-icons.ps1

Add-Type -AssemblyName System.Drawing

function New-AppIcon {
    param(
        [int]$Size,
        [string]$Destination,
        [switch]$Maskable
    )

    $bitmap = New-Object System.Drawing.Bitmap($Size, $Size)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

    $rect = New-Object System.Drawing.Rectangle(0, 0, $Size, $Size)
    $background = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        $rect,
        [System.Drawing.Color]::FromArgb(255, 47, 127, 209),
        [System.Drawing.Color]::FromArgb(255, 8, 61, 122),
        45.0
    )
    $graphics.FillRectangle($background, $rect)

    # Círculos decorativos discretos.
    $glowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(28, 125, 211, 252))
    $glowSize = [int]($Size * 0.62)
    $graphics.FillEllipse($glowBrush, [int]($Size * 0.55), [int](-$Size * 0.10), $glowSize, $glowSize)
    $graphics.FillEllipse($glowBrush, [int](-$Size * 0.18), [int]($Size * 0.62), $glowSize, $glowSize)
    $glowBrush.Dispose()

    if ($Maskable) {
        $graphics.TranslateTransform($Size / 2, $Size / 2)
        $graphics.ScaleTransform(0.72, 0.72)
        $graphics.TranslateTransform(-$Size / 2, -$Size / 2)
    }

    $white = [System.Drawing.Color]::White
    $whiteSoft = [System.Drawing.Color]::FromArgb(38, 255, 255, 255)
    $whiteLine = [System.Drawing.Color]::FromArgb(110, 255, 255, 255)
    $rain = [System.Drawing.Color]::FromArgb(255, 125, 211, 252)

    # Escudo.
    $shield = New-Object System.Drawing.Drawing2D.GraphicsPath
    $shield.AddLine([float]($Size * 0.50), [float]($Size * 0.13), [float]($Size * 0.79), [float]($Size * 0.23))
    $shield.AddLine([float]($Size * 0.79), [float]($Size * 0.23), [float]($Size * 0.79), [float]($Size * 0.47))
    $shield.AddBezier(
        [float]($Size * 0.79), [float]($Size * 0.47),
        [float]($Size * 0.79), [float]($Size * 0.68),
        [float]($Size * 0.65), [float]($Size * 0.80),
        [float]($Size * 0.50), [float]($Size * 0.87)
    )
    $shield.AddBezier(
        [float]($Size * 0.50), [float]($Size * 0.87),
        [float]($Size * 0.35), [float]($Size * 0.80),
        [float]($Size * 0.21), [float]($Size * 0.68),
        [float]($Size * 0.21), [float]($Size * 0.47)
    )
    $shield.AddLine([float]($Size * 0.21), [float]($Size * 0.47), [float]($Size * 0.21), [float]($Size * 0.23))
    $shield.CloseFigure()

    $shieldFill = New-Object System.Drawing.SolidBrush($whiteSoft)
    $shieldPen = New-Object System.Drawing.Pen($whiteLine, [float]($Size * 0.012))
    $graphics.FillPath($shieldFill, $shield)
    $graphics.DrawPath($shieldPen, $shield)

    # Nuvem.
    $cloudBrush = New-Object System.Drawing.SolidBrush($white)
    $graphics.FillEllipse($cloudBrush, [float]($Size * 0.28), [float]($Size * 0.42), [float]($Size * 0.26), [float]($Size * 0.18))
    $graphics.FillEllipse($cloudBrush, [float]($Size * 0.38), [float]($Size * 0.34), [float]($Size * 0.30), [float]($Size * 0.25))
    $graphics.FillEllipse($cloudBrush, [float]($Size * 0.50), [float]($Size * 0.43), [float]($Size * 0.26), [float]($Size * 0.17))
    $graphics.FillRectangle($cloudBrush, [float]($Size * 0.30), [float]($Size * 0.48), [float]($Size * 0.44), [float]($Size * 0.11))

    # Gotas de chuva.
    $rainPen = New-Object System.Drawing.Pen($rain, [float]($Size * 0.032))
    $rainPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $rainPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    foreach ($x in @(0.39, 0.50, 0.61)) {
        $graphics.DrawLine(
            $rainPen,
            [float]($Size * $x), [float]($Size * 0.66),
            [float]($Size * ($x - 0.035)), [float]($Size * 0.75)
        )
    }

    $rainPen.Dispose()
    $cloudBrush.Dispose()
    $shieldPen.Dispose()
    $shieldFill.Dispose()
    $shield.Dispose()
    $background.Dispose()
    $graphics.Dispose()

    $directory = Split-Path -Parent $Destination
    if (-not (Test-Path $directory)) {
        New-Item -ItemType Directory -Path $directory -Force | Out-Null
    }

    $bitmap.Save($Destination, [System.Drawing.Imaging.ImageFormat]::Png)
    $bitmap.Dispose()
    Write-Host "Gerado: $Destination"
}

$root = Split-Path -Parent $PSScriptRoot
$icons = Join-Path $root 'public\icons'

New-AppIcon -Size 192 -Destination (Join-Path $icons 'icon-192.png')
New-AppIcon -Size 512 -Destination (Join-Path $icons 'icon-512.png')
New-AppIcon -Size 512 -Destination (Join-Path $icons 'icon-512-maskable.png') -Maskable
New-AppIcon -Size 180 -Destination (Join-Path $icons 'apple-touch-icon.png')
