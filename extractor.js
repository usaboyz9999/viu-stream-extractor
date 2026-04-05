// extractor.js - سكريبت استخراج روابط البث من Viu.com
// 📍 مصمم ليعمل على GitHub Actions بدون أي تبعيات خارجية معقدة

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// 🔗 ==========================================
// 📝 منطقة إعداد الروابط - عدّل هنا لإضافة حلقات جديدة
// 🔗 ==========================================
const EPISODES_TO_EXTRACT = [
  {
    id: 1,
    title: "بداية اللعبة",
    pageUrl: "https://www.viu.com/ott/sa/en/vod/2960577/Ali-Klay",
    seriesId: 310
  },
  {
    id: 2,
    title: "الضربة الأولى",
    pageUrl: "https://www.viu.com/ott/sa/en/vod/2961646/Ali-Klay",
    seriesId: 310
  }
  // ➕ أضف حلقات جديدة هنا بنفس الهيكل
];

// 📁 مسار ملف الخرج
const OUTPUT_FILE = path.join(process.env.GITHUB_WORKSPACE || __dirname, 'viu_links.json');

// ⏱️ إعدادات الانتظار
const CONFIG = {
  pageLoadTimeout: 40000,
  waitAfterLoad: 12000,
  delayBetweenEpisodes: 3000
};

/**
 * 🎯 استخراج رابط بث من صفحة معينة
 */
async function extractStreamUrl(pageUrl) {
  let browser = null;
  try {
    console.log('🔍 [1/4] جاري فتح المتصفح على سحابة GitHub...');
    
    // 🚀 تشغيل متصفح Chromium المدمج (يعمل تلقائياً على GitHub)
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'] // مطلوب للخوادم السحابية
    });
    
    const page = await browser.newPage();
    
    // 🎭 محاكاة متصفح حقيقي
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9,ar;q=0.8',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
    });

    const capturedUrls = [];
    
    // ✅ اعتراض طلبات الشبكة
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('.m3u8') || url.includes('.mpd') || url.includes('manifest')) {
        console.log(`🎯 [اعتراض] تم اكتشاف رابط بث: ${url.substring(0, 80)}...`);
        capturedUrls.push(url);
      }
      request.continue();
    });

    console.log(`🔗 [2/4] تحميل الصفحة: ${pageUrl}`);
    await page.goto(pageUrl, { 
      waitUntil: 'networkidle2',
      timeout: CONFIG.pageLoadTimeout 
    });
    
    // ▶️ محاولة تشغيل الفيديو لتحفيز تحميل رابط البث
    try {
      await page.evaluate(() => {
        const video = document.querySelector('video');
        if (video) { video.muted = true; video.play().catch(() => {}); }
      });
      console.log('▶️ [3/4] تم تشغيل الفيديو تلقائياً');
    } catch (e) {}
    
    console.log(`⏱️ [4/4] انتظار ${CONFIG.waitAfterLoad/1000} ثوانٍ...`);
    await new Promise(resolve => setTimeout(resolve, CONFIG.waitAfterLoad));
    
    await browser.close();
    
    if (capturedUrls.length > 0) {
      const bestUrl = capturedUrls.reduce((a, b) => a.length > b.length ? a : b);
      console.log(`✅ تم العثور على ${capturedUrls.length} رابط، الأفضل: ${bestUrl.substring(0, 60)}...`);
      return bestUrl;
    }
    
    console.log('❌ لم يتم العثور على أي رابط بث');
    return null;
    
  } catch (err) {
    console.error(`💥 خطأ أثناء الاستخراج: ${err.message}`);
    if (browser) await browser.close();
    return null;
  }
}

/**
 * 💾 حفظ الرابط في ملف JSON
 */
async function saveLinkToJson(seriesId, episodeId, streamUrl, outputFile) {
  try {
    let data = {};
    if (fs.existsSync(outputFile)) {
      const content = fs.readFileSync(outputFile, 'utf8');
      if (content.trim()) data = JSON.parse(content);
    }
    
    const key = `${seriesId}_${episodeId}`;
    data[key] = {
      url: streamUrl,
      extractedAt: new Date().toISOString(),
      source: 'github-actions-cloud',
      episodeTitle: EPISODES_TO_EXTRACT.find(e => e.id === episodeId)?.title || 'Unknown'
    };
    
    fs.writeFileSync(outputFile, JSON.stringify(data, null, 2), 'utf8');
    console.log(`📁 ✅ تم الحفظ في: ${outputFile}`);
    console.log(`🔑 المفتاح: "${key}"`);
    return true;
  } catch (err) {
    console.error(`❌ فشل الحفظ: ${err.message}`);
    return false;
  }
}

/**
 * 🚀 الدالة الرئيسية
 */
async function main() {
  console.log('🎬 ════════════════════════════════════════');
  console.log('🎬   Viu Cloud Extractor - بدء التشغيل');
  console.log('🎬 ════════════════════════════════════════\n');
  
  let successCount = 0;
  for (const episode of EPISODES_TO_EXTRACT) {
    console.log(`\n📺 ─────────────────────────────────────`);
    console.log(`📺 الحلقة #${episode.id}: ${episode.title}`);
    console.log(`📺 ─────────────────────────────────────\n`);
    
    const streamUrl = await extractStreamUrl(episode.pageUrl);
    if (streamUrl && await saveLinkToJson(episode.seriesId, episode.id, streamUrl, OUTPUT_FILE)) {
      successCount++;
    } else {
      console.log(`⚠️ فشل استخراج رابط للحلقة #${episode.id}`);
    }
    
    if (episode !== EPISODES_TO_EXTRACT[EPISODES_TO_EXTRACT.length - 1]) {
      await new Promise(resolve => setTimeout(resolve, CONFIG.delayBetweenEpisodes));
    }
  }
  
  console.log(`\n🎬 ════════════════════════════════════════`);
  console.log(`🎬   اكتمل الاستخراج! النجاح: ${successCount} / ${EPISODES_TO_EXTRACT.length}`);
  console.log(`🎬 ════════════════════════════════════════`);
  
  process.exit(successCount === EPISODES_TO_EXTRACT.length ? 0 : 1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
