$port = 8080
$path = $PSScriptRoot
if ([string]::IsNullOrEmpty($path)) {
    $path = "h:\shaxsiy\kuntartibi"
}

# Local Wi-Fi / Ethernet IP detection
$localIp = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.InterfaceAlias -notlike "*Loopback*" -and $_.IPAddress -notlike "169.254*" } | Select-Object -ExpandProperty IPAddress -First 1)

$started = $false
$listener = $null
$phoneUrl = $null

# Try port 8080 first, if busy try next ports up to 8085
for ($p = $port; $p -le ($port + 5); $p++) {
    try {
        $tempListener = New-Object System.Net.HttpListener
        $tempListener.Prefixes.Add("http://localhost:$p/")
        if ($localIp) {
            try {
                $tempListener.Prefixes.Add("http://$($localIp):$p/")
                $phoneUrl = "http://$($localIp):$p"
            } catch {}
        }
        $tempListener.Start()
        $listener = $tempListener
        $port = $p
        $started = $true
        break
    } catch {
        if ($tempListener) {
            try { $tempListener.Close() } catch {}
        }
        # Try localhost only on port $p
        try {
            $tempListener = New-Object System.Net.HttpListener
            $tempListener.Prefixes.Add("http://localhost:$p/")
            $tempListener.Start()
            $listener = $tempListener
            $port = $p
            $phoneUrl = $null
            $started = $true
            break
        } catch {
            if ($tempListener) {
                try { $tempListener.Close() } catch {}
            }
        }
    }
}

if (-not $started) {
    Write-Host "Xatolik: Serverni ishga tushirib bo'lmadi (Barcha portlar band)." -ForegroundColor Red
    exit 1
}

Clear-Host
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "   IntelliDay - Aqlli Kun Tartibi Serveri Ishga Tushdi!     " -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Kompyuterda ochish:  http://localhost:$port" -ForegroundColor Yellow
if ($phoneUrl) {
    Write-Host "  Telefonda ochish:    $phoneUrl" -ForegroundColor Magenta
    Write-Host "  (Telefoningiz va kompyuter bitta Wi-Fi tarmog'ida bo'lsin)" -ForegroundColor Gray
} elseif ($localIp) {
    Write-Host "  Telefonda ochish:    http://$($localIp):$port" -ForegroundColor Magenta
}
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Serverni to'xtatish uchun: Ctrl + C bosing.`n" -ForegroundColor DarkGray

$mimeTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".webmanifest" = "application/manifest+json; charset=utf-8"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".svg"  = "image/svg+xml"
    ".ico"  = "image/x-icon"
}

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $urlPath = $request.Url.LocalPath.TrimStart('/')
        if ([string]::IsNullOrEmpty($urlPath)) {
            $urlPath = "index.html"
        }

        $localFilePath = Join-Path $path $urlPath

        if (Test-Path $localFilePath -PathType Leaf) {
            $ext = [System.IO.Path]::GetExtension($localFilePath).ToLower()
            $contentType = "application/octet-stream"
            if ($mimeTypes.ContainsKey($ext)) {
                $contentType = $mimeTypes[$ext]
            }

            $response.ContentType = $contentType
            $bytes = [System.IO.File]::ReadAllBytes($localFilePath)
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $response.StatusCode = 404
            $msg = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
            $response.ContentLength64 = $msg.Length
            $response.OutputStream.Write($msg, 0, $msg.Length)
        }
        $response.OutputStream.Close()
    }
} finally {
    if ($listener -and $listener.IsListening) {
        try { $listener.Stop() } catch {}
        try { $listener.Close() } catch {}
    }
}
