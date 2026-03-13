Add-Type -AssemblyName System.Drawing

# Source icon (icon128.png)
$sourcePath = "D:\personaldata\vibe-coding-projekte\amazon-extension-autset-prime\amazon-prime-sorter\icons\icon128.png"
$iconDir = "D:\personaldata\vibe-coding-projekte\amazon-extension-autset-prime\amazon-prime-sorter\icons"

# Load source image
$source = [System.Drawing.Image]::FromFile($sourcePath)

# Icon sizes to generate
$sizes = @(16, 32, 48, 96)

foreach ($size in $sizes) {
    # Create new bitmap with target size
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    
    # Set high-quality rendering
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    
    # Draw resized image
    $rect = New-Object System.Drawing.Rectangle(0, 0, $size, $size)
    $g.DrawImage($source, $rect)
    
    # Save with proper filename
    $outputPath = Join-Path $iconDir "icon${size}.png"
    $bmp.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    
    Write-Host "Created icon${size}.png ($size x $size)"
    
    # Cleanup
    $bmp.Dispose()
    $g.Dispose()
}

$source.Dispose()

Write-Host ""
Write-Host "All icons created successfully!"
Write-Host "Generated: icon16.png, icon32.png, icon48.png, icon96.png"
