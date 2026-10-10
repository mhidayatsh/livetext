const fs = require('fs');
const https = require('https');
const path = require('path');

const KEY = '9c4e2a8742b64d1ea020c6819a5fb291';
const HOST = 'shareli.online';
const SITEMAP_PATH = path.join(__dirname, '..', 'public', 'sitemap.xml');

function extractUrlsFromSitemap() {
  const content = fs.readFileSync(SITEMAP_PATH, 'utf8');
  const urls = [];
  const regex = /<loc>(https:\/\/[^<]+)<\/loc>/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    urls.push(match[1]);
  }
  return urls;
}

async function submitIndexNow() {
  const urlList = extractUrlsFromSitemap();
  console.log(`Found ${urlList.length} URLs in sitemap.xml to submit to IndexNow:`);
  urlList.forEach((url) => console.log(` - ${url}`));

  const payload = JSON.stringify({
    host: HOST,
    key: KEY,
    keyLocation: `https://${HOST}/${KEY}.txt`,
    urlList: urlList,
  });

  const endpoints = ['api.indexnow.org', 'www.bing.com'];

  for (const endpoint of endpoints) {
    await new Promise((resolve) => {
      const options = {
        hostname: endpoint,
        port: 443,
        path: '/indexnow',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Length': Buffer.byteLength(payload),
        },
      };

      console.log(`\nSubmitting to https://${endpoint}/indexnow ...`);
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode === 200 || res.statusCode === 202) {
            console.log(`✅ Success (${res.statusCode}) on ${endpoint}: URLs accepted for fast indexing!`);
          } else {
            console.log(`ℹ️ Response from ${endpoint}: HTTP ${res.statusCode} ${res.statusMessage || ''} ${data}`);
          }
          resolve();
        });
      });

      req.on('error', (err) => {
        console.error(`❌ Error submitting to ${endpoint}:`, err.message);
        resolve();
      });

      req.write(payload);
      req.end();
    });
  }
}

submitIndexNow();
