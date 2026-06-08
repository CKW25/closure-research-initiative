[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)]
    [ValidateSet('csm','ccw','cfsg','scc','rc','fe','rie')]
    [string]$Paper,

    [Parameter(Mandatory=$true)]
    [ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })]
    [string]$NewPdf,

    [ValidateScript({ [string]::IsNullOrWhiteSpace($_) -or (Test-Path -LiteralPath $_ -PathType Leaf) })]
    [string]$NewLatexZip,

    [ValidateRange(1, 999)]
    [int]$Version,

    [switch]$Commit,
    [switch]$Push
)

$ErrorActionPreference = 'Stop'

if ($Push -and -not $Commit) {
    throw '-Push requires -Commit so the pushed state is explicit.'
}

$Base = Split-Path -Parent $MyInvocation.MyCommand.Path
$ArchiveDir = Join-Path $Base "archive\$Paper"
$RootPdf = Join-Path $Base "$Paper.pdf"
$RootZip = Join-Path $Base "$Paper-latex.zip"
$PaperPage = Join-Path $Base "$Paper\index.html"
$AllPapersZip = Join-Path $Base 'all-papers.zip'

function Get-CurrentVersion {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        return 0
    }

    $Html = Get-Content -LiteralPath $Path -Raw -Encoding UTF8
    $Match = [regex]::Match($Html, 'v(?<version>\d+)\s*&middot;')

    if ($Match.Success) {
        return [int]$Match.Groups['version'].Value
    }

    return 0
}

function Copy-IfMissing {
    param(
        [string]$Source,
        [string]$Destination
    )

    if ((Test-Path -LiteralPath $Source) -and -not (Test-Path -LiteralPath $Destination)) {
        Copy-Item -LiteralPath $Source -Destination $Destination
        Write-Host "Archived: $Destination"
    }
}

function Rebuild-AllPapersZip {
    param([string]$Destination)

    $Items = @(
        'ccw.pdf','ccw-latex.zip',
        'csm.pdf','csm-latex.zip',
        'cfsg.pdf','cfsg-latex.zip',
        'scc.pdf','scc-latex.zip',
        'rc.pdf','rc-latex.zip',
        'fe.pdf','fe-latex.zip',
        'rie.pdf','rie-latex.zip'
    ) | ForEach-Object { Join-Path $Base $_ }

    $Missing = $Items | Where-Object { -not (Test-Path -LiteralPath $_) }
    if ($Missing) {
        throw "Cannot rebuild all-papers.zip; missing files:`n$($Missing -join "`n")"
    }

    Remove-Item -LiteralPath $Destination -Force -ErrorAction SilentlyContinue
    Compress-Archive -LiteralPath $Items -DestinationPath $Destination -CompressionLevel Optimal
    Write-Host "Rebuilt: $Destination"
}

$CurrentVersion = Get-CurrentVersion -Path $PaperPage
$NewVersion = if ($Version) { $Version } else { $CurrentVersion + 1 }

if ($CurrentVersion -gt 0 -and $NewVersion -le $CurrentVersion) {
    throw "New version v$NewVersion must be greater than current version v$CurrentVersion."
}

New-Item -ItemType Directory -Force -Path $ArchiveDir | Out-Null

if ($CurrentVersion -gt 0) {
    Copy-IfMissing -Source $RootPdf -Destination (Join-Path $ArchiveDir "$Paper-v$CurrentVersion.pdf")
    Copy-IfMissing -Source $RootZip -Destination (Join-Path $ArchiveDir "$Paper-v$CurrentVersion-latex.zip")
}

Copy-Item -LiteralPath $NewPdf -Destination $RootPdf -Force
Write-Host "Updated: $RootPdf"

if ($NewLatexZip) {
    Copy-Item -LiteralPath $NewLatexZip -Destination $RootZip -Force
    Write-Host "Updated: $RootZip"
} else {
    Write-Host "Source ZIP unchanged: $RootZip"
}

Rebuild-AllPapersZip -Destination $AllPapersZip

Write-Host ''
Write-Host "Manual checks before publishing v${NewVersion}:"
Write-Host "  - Update $Paper/index.html with version, date, abstract/change notes, and BibTeX."
Write-Host "  - Update preprints/index.html, feed.xml, and sitemap.xml if public metadata changed."
Write-Host "  - Verify /dl/$Paper.pdf and /dl/$Paper-latex.zip after deploy."

if ($Commit) {
    Set-Location -LiteralPath $Base
    git add -- "$Paper.pdf" "$Paper-latex.zip" 'all-papers.zip' "archive/$Paper"
    git commit -m "Update $Paper to v$NewVersion"

    if ($Push) {
        git push origin main
    }
} else {
    Write-Host ''
    Write-Host 'No commit was created. Review the site, then commit and push when ready.'
}
