$date = (Get-Date).ToString("yyyy-MM-dd") # today's date, 2026-03-17
$results = @()
$page = 1
$pageSize = 50
$totalSize = 999

while ($results.Count -lt $totalSize -and $page -le 5) {
    Write-Host "Fetching page $page..."
    $url = "https://api.taiwanlottery.com/TLCAPIWeB/Lottery/BingoResult?openDate=$date&pageNum=$page&pageSize=$pageSize"
    $response = Invoke-RestMethod -Uri $url -Headers @{"Accept"="application/json"; "User-Agent"="Mozilla/5.0"}
    
    if ($response.rtCode -ne 0) {
        Write-Host "API Error: $($response.rtCode)"
        break
    }
    
    $contentResults = $response.content.bingoQueryResult
    if ($null -eq $contentResults -or $contentResults.Count -eq 0) {
        break
    }
    
    foreach ($item in $contentResults) {
        $numbers = @()
        foreach ($n in $item.bigShowOrder) {
            $numbers += [int]$n
        }
        
        $superNum = 0
        if ($null -ne $item.bullEyeTop -and $item.bullEyeTop -ne "") {
            $superNum = [int]$item.bullEyeTop
        }
        
        $obj = @{
            period = [string]$item.drawTerm
            drawTime = if ($null -ne $item.dDate) { $item.dDate } else { $date }
            numbers = $numbers
            superNumber = $superNum
        }
        $results += $obj
    }
    
    if ($null -ne $response.content.totalSize) {
        $totalSize = $response.content.totalSize
    }
    $page++
}

Write-Host "Total fetched: $($results.Count)"
if ($results.Count -eq 0) {
    Write-Host "No data found."
    exit
}

# Sort descending by period
$results = $results | Sort-Object -Property @{Expression={[int]$_.period}; Descending=$true}
$latest = $results[0]


$resultsJson = $results | ConvertTo-Json -Depth 5 -Compress
$latestJson = $latest | ConvertTo-Json -Depth 5 -Compress
$lastUpdated = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")

# Save to files (UTF8 without BOM for wrangler compatibility)
[System.IO.File]::WriteAllText("today_draws.json", $resultsJson)
[System.IO.File]::WriteAllText("latest_draw.json", $latestJson)
[System.IO.File]::WriteAllText("last_updated.txt", $lastUpdated)
[System.IO.File]::WriteAllText("today_date.txt", $date)

Write-Host "Saved local files. Uploading to KV..."

npx wrangler kv:key put --binding BINGO_KV "today_draws" --path today_draws.json
npx wrangler kv:key put --binding BINGO_KV "latest_draw" --path latest_draw.json
npx wrangler kv:key put --binding BINGO_KV "last_updated" --path last_updated.txt
npx wrangler kv:key put --binding BINGO_KV "today_date" --path today_date.txt

Write-Host "KV Upload successful!"
