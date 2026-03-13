Add-Type -AssemblyName System.Drawing

# Create 128x128 bitmap
$bmp = New-Object System.Drawing.Bitmap(128, 128)
$g = [System.Drawing.Graphics]::FromImage($bmp)

# Clear with dark blue background
$g.Clear([System.Drawing.Color]::FromArgb(35, 47, 62))

# Create font for letter A
$font = New-Object System.Drawing.Font('Arial', 72, [System.Drawing.FontStyle]::Bold)
$brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 153, 0))

# Draw centered 'A'
$stringFormat = New-Object System.Drawing.StringFormat
$stringFormat.Alignment = [System.Drawing.StringAlignment]::Center
$stringFormat.LineAlignment = [System.Drawing.StringAlignment]::Center
$rect = New-Object System.Drawing.Rectangle(0, 0, 128, 128)
$g.DrawString('A', $font, $brush, $rect, $stringFormat)

# Save
$bmp.Save('D:\personaldata\vibe-coding-projekte\amazon-extension-autset-prime\amazon-prime-sorter\icons\icon128.png')
$bmp.Dispose()
$g.Dispose()

Write-Host 'Icon created successfully!'
