const express = require('express');
const bodyParser = require('body-parser');
const puppeteer = require('puppeteer');

const app = express();
const port = 3000;

// Middleware
app.use(bodyParser.json());
app.use(express.static('public'));

// Regex patterns để tìm userId numeric
const PATTERNS = [
  /"entity_id":"(\d+)"/g,
  /"profile_id":"(\d+)"/g,
  /fb:\/\/profile\/(\d+)/g,
  /profile\.php\?id=(\d+)/g,
  /"owner"\s*:\s*{\s*"id"\s*:\s*"(\d+)"/g,
];

function findAllIds(text) {
  const ids = new Set();
  for (const re of PATTERNS) {
    let m;
    while ((m = re.exec(text)) !== null) {
      if (m[1] && m[1] !== '0') ids.add(m[1]);
    }
  }
  return [...ids];
}

function extractPostId(url) {
  const match = url.match(/\/posts\/(\d+)/);
  return match ? match[1] : null;
}

function extractProfileUrl(postUrl) {
  const match = postUrl.match(/(https:\/\/www\.facebook\.com\/[^\/]+)(\/posts\/\d+)?/);
  return match ? match[1] : null;
}

// Chặn tài nguyên không cần thiết để tăng tốc trang
async function setupPage(browser) {
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', req => {
    const resourceType = req.resourceType();
    if (['image', 'stylesheet', 'font', 'media', 'script'].includes(resourceType)) {
      req.abort();
    } else {
      req.continue();
    }
  });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
  await page.setViewport({ width: 1200, height: 800 });
  return page;
}

async function getUserIdFromProfile(url, browser) {
  let page;
  try {
    page = await setupPage(browser);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const html = await page.content();
    let ids = findAllIds(html);
    if (ids.length > 0) {
      await page.close();
      return ids[0];
    }
    const hrefIds = await page.evaluate(() => {
      const found = new Set();
      Array.from(document.querySelectorAll('a')).forEach(a => {
        const m = a.href.match(/profile\.php\?id=(\d+)/);
        if (m && m[1] !== '0') found.add(m[1]);
      });
      return [...found];
    });
    await page.close();
    if (hrefIds.length > 0) {
      return hrefIds[0];
    }
    return null;
  } catch (e) {
    if (page) await page.close();
    return null;
  }
}

// Xử lý concurrency 5 tabs chạy song song
async function processUrls(urls, browser, concurrency = 5) {
  const results = [];
  let index = 0;
  async function worker() {
    while (index < urls.length) {
      const i = index++;
      const postUrl = urls[i];
      const postId = extractPostId(postUrl);
      const profileUrl = extractProfileUrl(postUrl);
      if (!profileUrl || !postId) {
        results[i] = { url: postUrl, error: 'Không tách được profile hoặc postId' };
        continue;
      }
      const userId = await getUserIdFromProfile(profileUrl, browser);
      if (userId) {
        results[i] = { url: postUrl, result: `${userId}_${postId}` };
      } else {
        results[i] = { url: postUrl, error: 'Không tìm thấy userId từ profile' };
      }
    }
  }
  const workers = [];
  for (let i = 0; i < concurrency; i++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results;
}

let browserInstance = null;

(async () => {
  browserInstance = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  app.post('/process', async (req, res) => {
    const urls = req.body.urls;
    if (!Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ error: 'Vui lòng gửi mảng URLs không rỗng' });
    }
    try {
      const results = await processUrls(urls, browserInstance, 5);
      res.json(results);
    } catch (err) {
      res.status(500).json({ error: 'Lỗi server khi xử lý' });
    }
  });

  // Phục vụ file tĩnh từ thư mục public
const path = require('path');
app.use('/images', express.static(path.join(__dirname, 'public/images')));

  app.listen(port, () => {
    console.log(`Server chạy trên http://localhost:${port}`);
  });
})();

// Đóng browser khi Node.js dừng
process.on('exit', () => {
  if (browserInstance) browserInstance.close();
});
process.on('SIGINT', () => process.exit());
process.on('SIGTERM', () => process.exit());
