const express = require("express");
const bodyParser = require("body-parser");
const puppeteer = require("puppeteer");
const path = require("path");

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(express.static("public"));

// Thêm route kiểm tra health cho Render
app.get("/", (req, res) => {
  res.send("✅ Server is running on Render");
});

// Các regex tìm userId numeric trong HTML
const PATTERNS = [
  /"entity_id":"(\d+)"/g,
  /"profile_id":"(\d+)"/g,
  /fb:\/\/profile\/(\d+)/g,
  /profile\.php\?id=(\d+)/g,
  /"owner"\s*:\s*{\s*"id"\s*:\s*"(\d+)"/g,
];

// Tìm tất cả userId numeric trong đoạn text
function findAllIds(text) {
  const ids = new Set();
  for (const re of PATTERNS) {
    let m;
    while ((m = re.exec(text)) !== null) {
      if (m[1] && m[1] !== "0") ids.add(m[1]);
    }
  }
  return [...ids];
}

// Tách postId từ URL dạng /posts/123456 hoặc /videos/123456 hoặc /photos/123456
function extractPostId(url) {
  const match = url.match(/\/(posts|videos|photos)\/(\d+)/);
  return match ? match[2] : null;
}

// Tách profile URL từ URL đầy đủ
function extractProfileUrl(postUrl) {
  // Match facebook.com/100054296960041/ or facebook.com/username
  const match = postUrl.match(
    /^(?:https?:\/\/)?(?:www\.)?(facebook\.com\/[^\/]+)/
  );
  return match ? "https://" + match[1] : null;
}

// Tạo trang puppeteer với chặn tài nguyên không cần thiết để tăng tốc
async function setupPage(browser) {
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    const resourceType = req.resourceType();
    if (
      ["image", "stylesheet", "font", "media", "script"].includes(resourceType)
    ) {
      req.abort();
    } else {
      req.continue();
    }
  });
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)");
  await page.setViewport({ width: 1200, height: 800 });
  return page;
}

// Lấy userId từ trang profile Facebook bằng Puppeteer
async function getUserIdFromProfile(url, browser) {
  let page;
  try {
    page = await setupPage(browser);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
    const html = await page.content();
    let ids = findAllIds(html);
    if (ids.length > 0) {
      await page.close();
      return ids[0];
    }
    const hrefIds = await page.evaluate(() => {
      const found = new Set();
      Array.from(document.querySelectorAll("a")).forEach((a) => {
        const m = a.href.match(/profile\.php\?id=(\d+)/);
        if (m && m[1] !== "0") found.add(m[1]);
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

// Xử lý concurrency với worker giới hạn số tabs Puppeteer chạy song song
async function processUrls(arrayUrls, browser, concurrency = 5) {
  const results = [];
  let index = 0;

  // Chuẩn hóa đầu vào thành mảng URLs
  const urls = [];
  arrayUrls.forEach((line) => {
    // Loại bỏ dấu ngoặc không cần thiết
    let cleanLine = line.replace(/\[|\]/g, "");
    // Tách theo khoảng trắng
    const parts = cleanLine.split(/\s+/);
    parts.forEach((url) => {
      urls.push(url);
    });
  });

  async function worker() {
    while (index < urls.length) {
      const i = index++;
      const postUrl = urls[i];
      const postId = extractPostId(postUrl);
      const profileUrl = extractProfileUrl(postUrl);
      if (!profileUrl) {
        results[i] = { url: postUrl, error: "Không tách được profile" };
        continue;
      }

      if (postId) {
        // Nếu có postId, xử lý userId + postId
        const numericIdMatch = postUrl.match(
          /^(?:https?:\/\/)?(?:www\.)?facebook\.com\/(\d+)\/posts\/(\d+)\/?/
        );
        if (numericIdMatch) {
          results[i] = {
            url: postUrl,
            result: `${numericIdMatch[1]}_${numericIdMatch[2]}`,
          };
          continue;
        }

        let userId = await getUserIdFromProfile(profileUrl, browser);
        if (userId) {
          results[i] = { url: postUrl, result: `${userId}_${postId}` };
        } else {
          results[i] = {
            url: postUrl,
            error: "Không tìm thấy userId từ profile",
          };
        }
      } else {
        // Trường hợp chỉ là profile url (không có postId)
        let userId = await getUserIdFromProfile(profileUrl, browser);
        if (userId) {
          results[i] = { url: postUrl, result: userId };
        } else {
          results[i] = {
            url: postUrl,
            error: "Không tìm thấy userId từ profile",
          };
        }
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
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
    ],
  });

  app.post("/process", async (req, res) => {
    const urls = req.body.urls;
    if (!Array.isArray(urls) || urls.length === 0) {
      return res
        .status(400)
        .json({ error: "Vui lòng gửi mảng URLs không rỗng" });
    }
    try {
      const results = await processUrls(urls, browserInstance, 5);
      res.json(results);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Lỗi server khi xử lý" });
    }
  });

  app.use("/images", express.static(path.join(__dirname, "public/images")));

  const host = "0.0.0.0";
  app.listen(port, host, () => {
    console.log(`Server đang chạy trên http://${host}:${port}`);
  });
})();

process.on("exit", () => {
  if (browserInstance) browserInstance.close();
});
process.on("SIGINT", () => process.exit());
process.on("SIGTERM", () => process.exit());
