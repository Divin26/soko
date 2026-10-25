# setup-soko.ps1 — SOKO file-split setup
$ErrorActionPreference = 'Stop'
$root = Get-Location
Write-Host ""
Write-Host "SOKO split — working in $root" -ForegroundColor Cyan
Write-Host ""

function Write-Utf8NoBom([string]$relPath, [string]$content) {
    $full = Join-Path $root $relPath
    $enc  = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($full, $content, $enc)
}

# 1. Backup original soko.html
if (-not (Test-Path "soko.original.html")) {
    Copy-Item "soko.html" "soko.original.html"
    Write-Host "[OK] Backed up soko.html -> soko.original.html" -ForegroundColor Green
} else {
    Write-Host "[--] soko.original.html already exists (kept)" -ForegroundColor Yellow
}

# 2. Create folders
'css','js','api' | ForEach-Object {
    New-Item -ItemType Directory -Force -Path $_ | Out-Null
}
Write-Host "[OK] Ensured css\, js\, api\" -ForegroundColor Green

# 3. Read original HTML
$html = Get-Content "soko.original.html" -Raw -Encoding UTF8
if ([string]::IsNullOrWhiteSpace($html)) { throw "soko.original.html is empty or unreadable" }

# 4. Extract <style> block
$cssMatch = [regex]::Match($html, '(?s)<style>(.*?)</style>')
if (-not $cssMatch.Success) { throw "No <style> block found in soko.original.html" }
$css = $cssMatch.Groups[1].Value.Trim()
Write-Utf8NoBom "css/_combined.css" $css
Write-Host "[OK] css\_combined.css  ($($css.Length) chars)" -ForegroundColor Green

# 5. Extract inline <script> block(s)
$jsMatches = [regex]::Matches($html, '(?s)<script>(.*?)</script>')
if ($jsMatches.Count -lt 1) { throw "No inline <script> block found in soko.original.html" }

$bigJsMatch = $jsMatches | Sort-Object { $_.Groups[1].Value.Length } -Descending | Select-Object -First 1
$js = $bigJsMatch.Groups[1].Value.Trim()
Write-Utf8NoBom "js/_combined.js" $js
Write-Host "[OK] js\_combined.js    ($($js.Length) chars)" -ForegroundColor Green

# 6. Create placeholder files
$cssFiles = @(
    '01-tokens','02-base','03-auth','04-nav','05-home','06-shop',
    '07-cart-checkout','08-orders','09-seller','10-modals',
    '11-responsive','12-ai-chat','13-late-overrides'
)
$cssCreated = 0
foreach ($f in $cssFiles) {
    $p = "css/$f.css"
    if (-not (Test-Path (Join-Path $root $p))) {
        Write-Utf8NoBom $p "/* $f.css — placeholder. Content will be moved here from css/_combined.css. */`r`n"
        $cssCreated++
    }
}
Write-Host "[OK] Created $cssCreated of $($cssFiles.Count) CSS files" -ForegroundColor Green

$jsFiles = @(
    '01-config','02-data','03-utils','04-state','05-supabase',
    '06-auth','07-buyer-home','08-buyer-nav','09-shop','10-product',
    '11-cart','12-checkout','13-orders','14-seller',
    '15-location-images','16-ai','17-main'
)
$jsCreated = 0
foreach ($f in $jsFiles) {
    $p = "js/$f.js"
    if (-not (Test-Path (Join-Path $root $p))) {
        Write-Utf8NoBom $p "// $f.js — placeholder. Content will be moved here from js/_combined.js.`r`n"
        $jsCreated++
    }
}
Write-Host "[OK] Created $jsCreated of $($jsFiles.Count) JS files" -ForegroundColor Green

# 7. Rewrite soko.html
$newHtml = $html -replace '(?s)<style>.*?</style>', '<link rel="stylesheet" href="css/_combined.css">'
$bigJsFullText = $bigJsMatch.Value
if ($newHtml.Contains($bigJsFullText)) {
    $newHtml = $newHtml.Replace($bigJsFullText, '<script src="js/_combined.js"></script>')
} else {
    throw "Safety check failed; soko.html not modified"
}

Write-Utf8NoBom "soko.html" $newHtml
Write-Host "[OK] Rewrote soko.html to reference css/_combined.css + js/_combined.js" -ForegroundColor Green

Write-Host ""
Write-Host "════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Setup complete." -ForegroundColor Cyan
Write-Host "════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next:"
Write-Host "  1. Deploy (or open soko.html locally) and click around."
Write-Host "  2. If everything is fine, reply 'go'."
Write-Host ""