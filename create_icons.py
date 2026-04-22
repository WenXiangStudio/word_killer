import pathlib
import subprocess
import sys


ROOT = pathlib.Path(__file__).resolve().parent

ICON_SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#4A90D9" rx="86"/>
  <text x="256" y="318" font-size="280" font-family="Segoe UI, Arial, sans-serif" font-weight="700" text-anchor="middle" fill="white">W</text>
</svg>
"""


def write_svg():
    svg_path = ROOT / "icon.svg"
    svg_path.write_text(ICON_SVG, encoding="utf-8")
    return svg_path


def write_pngs_with_powershell():
    script = rf"""
Add-Type -AssemblyName System.Drawing
function New-WordKillerIcon {{
    param(
        [int]$Size,
        [string]$Path
    )

    $bitmap = New-Object System.Drawing.Bitmap $Size, $Size
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $graphics.Clear([System.Drawing.Color]::FromArgb(0x4A, 0x90, 0xD9))

    $shadowBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(45, 0, 0, 0))
    $font = New-Object System.Drawing.Font('Segoe UI', ($Size * 0.5), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $format = New-Object System.Drawing.StringFormat
    $format.Alignment = [System.Drawing.StringAlignment]::Center
    $format.LineAlignment = [System.Drawing.StringAlignment]::Center

    $shadowRect = New-Object System.Drawing.RectangleF ($Size * 0.02), ($Size * 0.03), $Size, $Size
    $centerRect = New-Object System.Drawing.RectangleF 0, 0, $Size, $Size

    $graphics.DrawString('W', $font, $shadowBrush, $shadowRect, $format)
    $graphics.DrawString('W', $font, [System.Drawing.Brushes]::White, $centerRect, $format)

    $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)

    $format.Dispose()
    $shadowBrush.Dispose()
    $font.Dispose()
    $graphics.Dispose()
    $bitmap.Dispose()
}}

New-WordKillerIcon -Size 192 -Path '{(ROOT / "icon-192.png").as_posix()}'
New-WordKillerIcon -Size 512 -Path '{(ROOT / "icon-512.png").as_posix()}'
"""

    subprocess.run(
        ["powershell", "-NoProfile", "-Command", script],
        check=True,
        cwd=ROOT,
    )


def main():
    svg_path = write_svg()
    print(f"Created {svg_path.name}")

    if sys.platform.startswith("win"):
        write_pngs_with_powershell()
        print("Created icon-192.png and icon-512.png")
    else:
        print("PNG generation currently requires Windows PowerShell.")


if __name__ == "__main__":
    main()
