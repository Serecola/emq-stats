#!/usr/bin/env pwsh
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$port = 3125
$base = "http://localhost:$port"

# Retry loop in case the server is still booting
$ok = $false
for ($i = 1; $i -le 8; $i++) {
    Start-Sleep -Seconds 2
    try {
        $r = Invoke-WebRequest -Uri "$base/" -UseBasicParsing -TimeoutSec 5
        if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) { $ok = $true; break }
    } catch {
        Write-Verbose "retry $i : $($_.Exception.Message)"
    }
}
if (-not $ok) {
    Write-Host "server not reachable after retries"
    exit 1
}

function Get-Page([string]$path) {
    $r = Invoke-WebRequest -Uri "$base$path" -UseBasicParsing -TimeoutSec 10
    $raw = $r.Content
    $plain = $raw -replace '<script[\s\S]*?</script>','' -replace '<[^>]+>',' ' -replace '\s+',' '
    return @{
        StatusCode = $r.StatusCode
        RawLen     = $raw.Length
        Raw        = $raw
        Plain      = $plain
    }
}

Write-Host "=== /admin/new ==="
$p = Get-Page '/admin/new'
Write-Host "status: $($p.StatusCode)"
Write-Host "len: $($p.RawLen)"
Write-Host "has New tournament: $($p.Plain -match 'New tournament')"
Write-Host "has Paste teams: $($p.Plain -match 'Paste teams')"
Write-Host "has Auto-draft teams: $($p.Plain -match 'Auto-draft teams')"
Write-Host "has Generate teams: $($p.Plain -match 'Generate teams')"
Write-Host "has Teams label: $($p.Plain -match 'Teams')"

# Also confirm server is not throwing during render by checking error markers in raw HTML
$hasErrorMarker = $p.RawLen -gt 0 -and ($p.Raw -match 'data-dgst="BAILOUT_TO_CLIENT_SIDE_RENDERING"')
Write-Host "has BAILOUT marker (client-side render fallback): $hasErrorMarker"

Write-Host "done"
