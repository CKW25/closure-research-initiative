param(
    [Parameter(Mandatory=$true)]
    [string]$Paper,
    [Parameter(Mandatory=$true)]
    [string]$NewPdf,
    [string]$NewLatexZip
)

$base = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootPdf = "$base\$Paper.pdf"
$rootZip = "$base\$Paper-latex.zip"

# Read current version
$html = Get-Content "$base\index.html" -Raw
$versionMatch = [regex]::Match($html, '(?<=v)(\d+)(?= \. June \d+, 2026)')
$globalVersionMatch = [regex]::Match($html, 'v(\d+) \. June \d+, 2026')
if ($globalVersionMatch.Success) {
    # Check per-paper if there's a specific pattern
    # For now use global counter
}

# Determine next version number for this paper
$archiveDir = "$base\archive\$Paper"
$version = 1
$existing = Get-ChildItem -Path $archiveDir -Filter "$Paper-v*" | Select-Object -ExpandProperty Name
if ($existing) {
    $maxVer = $existing | ForEach-Object { [regex]::Match($_, 'v(\d+)').Groups[1].Value } | Measure-Object -Maximum | Select-Object -ExpandProperty Maximum
    $version = [int]$maxVer + 1
}

# Check if current PDF exists (meaning we're updating an existing paper)
if (Test-Path $rootPdf) {
    # Archive current version
    $archivedPdf = "$archiveDir\$Paper-v$version.pdf"
    Copy-Item $rootPdf $archivedPdf -Force
    Write-Host "Archived: $archivedPdf"
    $version++
}

if (Test-Path $rootZip -and $NewLatexZip) {
    $archivedZip = "$archiveDir\$Paper-v$version-latex.zip"
    Copy-Item $rootZip $archivedZip -Force
    Write-Host "Archived: $archivedZip"
}

# Copy new PDF
if (Test-Path $NewPdf) {
    Copy-Item $NewPdf $rootPdf -Force
    Write-Host "Updated: $rootPdf"
}
if ($NewLatexZip -and (Test-Path $NewLatexZip)) {
    Copy-Item $NewLatexZip $rootZip -Force
    Write-Host "Updated: $rootZip"
}

# Update version in index.html
$newVersion = $version
$html = $html -replace "(?<=/$Paper\.pdf"")[^<]*<div class=""meta"">[^<]*v\d+", "`$1<div class=""meta"">Chast K. Wolfe &middot; v$newVersion"
# Simpler approach: find the paper card and update its version
$pattern = '(paper-title"><a href="/' + $Paper + '\.pdf">.*?</a></div>\s*<div class="meta">[^v]*v)\d+'
$html = $html -replace $pattern, "`${1}$newVersion"
Set-Content "$base\index.html" $html
Write-Host "Version updated to v$newVersion in index.html"

# Rebuild all-papers.zip
Write-Host "Rebuilding all-papers.zip..."
$allPapers = @(
    "$base\ccw.pdf","$base\ccw-latex.zip",
    "$base\csm.pdf","$base\csm-latex.zip",
    "$base\cfsg.pdf","$base\cfsg-latex.zip",
    "$base\fe.pdf","$base\fe-latex.zip",
    "$base\scc.pdf","$base\scc-latex.zip",
    "$base\rc.pdf","$base\rc-latex.zip",
    "$base\rie.pdf","$base\rie-latex.zip"
)
$allZip = "$base\all-papers.zip"
Remove-Item $allZip -Force -ErrorAction SilentlyContinue
Compress-Archive -Path $allPapers -DestinationPath $allZip

# Git commit and push
Write-Host "Committing to git..."
Set-Location -LiteralPath $base
git add -A
git commit -m "Update $Paper to v$newVersion"
git push
Write-Host "Done! Pushed to GitHub. Cloudflare will auto-deploy shortly."
