const { execSync } = require('child_process');

async function backfill() {
    console.log('Fetching today draws from TLC...');
    const date = '2026-03-17';
    let results = [];
    let page = 1;
    let totalSize = 999;

    while (results.length < totalSize && page <= 5) {
        const url = `https://api.taiwanlottery.com/TLCAPIWeB/Lottery/BingoResult?openDate=${date}&pageNum=${page}&pageSize=50`;
        console.log(\`Fetching page ${page}...\`);
        const resp = await fetch(url, { headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' } });
        if (!resp.ok) {
            console.error('Failed to fetch', resp.status);
            break;
        }
        const data = await resp.json();
        if (data.rtCode !== 0) break;
        
        const contentResults = data.content?.bingoQueryResult || [];
        if (contentResults.length === 0) break;

        for (const item of contentResults) {
            results.push({
                period: String(item.drawTerm),
                drawTime: item.dDate || date,
                numbers: item.bigShowOrder.map(n => parseInt(n, 10)),
                superNumber: parseInt(item.bullEyeTop || '0', 10),
            });
        }
        
        totalSize = data.content?.totalSize || 0;
        page++;
    }

    console.log(\`Total fetched: ${results.length}\`);
    if (results.length === 0) return;

    // Sort descending by period
    results.sort((a, b) => Number(b.period) - Number(a.period));

    const latest = results[0];

    const fs = require('fs');
    fs.writeFileSync('today_draws.json', JSON.stringify(results));
    fs.writeFileSync('latest_draw.json', JSON.stringify(latest));
    fs.writeFileSync('last_updated.txt', new Date().toISOString());
    fs.writeFileSync('today_date.txt', date);

    console.log('Wrote to local JSON files. Now uploading to KV...');
    try {
        execSync('npx wrangler kv:key put --binding BINGO_KV today_draws --path today_draws.json', { stdio: 'inherit' });
        execSync('npx wrangler kv:key put --binding BINGO_KV latest_draw --path latest_draw.json', { stdio: 'inherit' });
        execSync('npx wrangler kv:key put --binding BINGO_KV last_updated --path last_updated.txt', { stdio: 'inherit' });
        execSync('npx wrangler kv:key put --binding BINGO_KV today_date --path today_date.txt', { stdio: 'inherit' });
        console.log('KV Upload successful!');
    } catch (err) {
        console.error('KV Upload Failed:', err);
    }
}

backfill();
