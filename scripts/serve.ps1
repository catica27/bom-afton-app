param(
    [string]$Root = "C:\Users\tanya\Claude\bom-afton-app",
    [int]$Port = 8420
)
Add-Type -AssemblyName System.Net.HttpListener -ErrorAction SilentlyContinue
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Output "Serving $Root on http://localhost:$Port/"

$mime = @{
    ".html" = "text/html; charset=utf-8"; ".js" = "application/javascript; charset=utf-8"
    ".css" = "text/css; charset=utf-8"; ".json" = "application/json; charset=utf-8"
    ".webmanifest" = "application/manifest+json; charset=utf-8"
    ".png" = "image/png"; ".svg" = "image/svg+xml"; ".ico" = "image/x-icon"
    ".xlsx" = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
}

while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $req = $ctx.Request
    $res = $ctx.Response
    try {
        $path = $req.Url.AbsolutePath
        if ($path -eq "/") { $path = "/index.html" }
        $full = Join-Path $Root ($path.TrimStart("/") -replace "/", "\")
        $full = [System.IO.Path]::GetFullPath($full)
        if (-not $full.StartsWith((Get-Item $Root).FullName)) {
            $res.StatusCode = 403; $res.Close(); continue
        }
        if (-not (Test-Path $full -PathType Leaf)) {
            $res.StatusCode = 404
            $bytes = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $path")
            $res.OutputStream.Write($bytes, 0, $bytes.Length)
            $res.Close(); continue
        }
        $ext = [System.IO.Path]::GetExtension($full).ToLower()
        $ct = $mime[$ext]
        if (-not $ct) { $ct = "application/octet-stream" }
        $res.ContentType = $ct
        $bytes = [System.IO.File]::ReadAllBytes($full)
        $res.ContentLength64 = $bytes.Length
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
        $res.Close()
    } catch {
        try { $res.StatusCode = 500; $res.Close() } catch {}
    }
}
