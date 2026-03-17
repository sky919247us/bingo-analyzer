const https = require('https');
const fs = require('fs');

async function fetchPage(date, page) {
    return new Promise((resolve, reject) => {
        const url = `https://api.taiwanlottery.com/TLCAPIWeB/Lottery/BingoResult?openDate=${date}&pageNum=${page}&pageSize=50`;
        https.get(url, { headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' } }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(JSON.parse(data)));
        }).on('error', reject);
    });
}

async function backfill() {
    console.log('Fetching today draws from TLC...');
    const date = '2026-03-17';
    let results = [];
    let page = 1;
    let totalSize = 999;

    while (results.length < totalSize && page <= 5) {
        console.log(`Fetching page ${page}...`);
        const data = await fetchPage(date, page);
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

    console.log(`Total fetched: ${results.length}`);
    if (results.length === 0) return;

    // Sort descending by period
    results.sort((a, b) => Number(b.period) - Number(a.period));

    const latest = results[0];

    fs.writeFileSync('today_draws.json', JSON.stringify(results));
    fs.writeFileSync('latest_draw.json', JSON.stringify(latest));
    fs.writeFileSync('last_updated.txt', new Date().toISOString());
    fs.writeFileSync('today_date.txt', date);

    console.log('successfully saved JSON files.');
}

backfill();
