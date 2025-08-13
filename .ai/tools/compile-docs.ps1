$reportDir = "gemini_reports"
$outputFile = "docs/summary-all.md"

$frontmatter = @"
---
title: "LingoLinq Strategic Summary"
version: "$(Get-Date -Format 'yyyy.MM.dd')"
author: "Scot Wahlquist"
summary_type: "Merged Gemini Reports"
use_cases: ["Investor Pitch", "Dev Hand-off"]
---
"@

$files = Get-ChildItem "$reportDir" -Filter "*.md" | Sort-Object Name
$tocHeader = "## Table of Contents`n"
$toc = ""
$content = ""

foreach ($file in $files) {
    $name = ($file.BaseName -replace '^\d+-', '') -replace '-', ' '
    $anchor = $file.BaseName -replace '^\d+-', ''
    $toc += "1. [$name](#$($anchor.ToLower()))`n"
    $content += "`n---`n## $name`n"
    $content += Get-Content $file.FullName -Raw
    $content += "`n---`n"
}

Set-Content -Path $outputFile -Value ($frontmatter + "`n" + $tocHeader + "`n" + $toc + "`n" + $content)
Write-Host "✅ Merged summary saved to: $outputFile"
