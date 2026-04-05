const express = require("express");
const puppeteer = require("puppeteer");

const app = express();
const PORT = process.env.PORT || 3000;

// 🔥 ضع رابط الفيديو هنا
const VIDEO_PAGE = "https://www.viu.com/ott/sa/en/vod/2960577/Ali-Klay";

app.get("/get-video", async (req, res) => {
  let browser;

  try {
    browser = await puppeteer.launch({
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      headless: true
    });

    const page = await browser.newPage();

    let m3u8Url = null;

    page.on("request", (request) => {
      const url = request.url();

      if (url.includes(".m3u8")) {
        console.log("m3u8:", url);
        m3u8Url = url;
      }
    });

    await page.goto(VIDEO_PAGE, {
      waitUntil: "networkidle2"
    });

    // ⏳ انتظار تحميل الفيديو
    await new Promise((resolve) => setTimeout(resolve, 10000));

    await browser.close();

    if (!m3u8Url) {
      return res.json({
        success: false,
        message: "لم يتم العثور على m3u8"
      });
    }

    res.json({
      success: true,
      url: m3u8Url
    });

  } catch (error) {
    if (browser) await browser.close();

    res.json({
      success: false,
      error: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log("Server running...");
});
