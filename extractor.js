// extractor.js - سكريبت استخراج روابط البث من Viu.com
// 📍 مصمم للتشغيل على GitHub Actions (سحابة مجانية)
// ✅ لا يحتاج جهاز محلي - يعمل تلقائياً على خوادم GitHub

// 📦 استيراد المكتبات
const puppeteer = require('puppeteer-core');
const chrome = require('chrome-aws-lambda');
const fs = require('fs');
const path = require('path');
const core = require('@actions/core');

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
  // ➕ لإضافة حلقة جديدة، انسخ الكائن {} وأضفه هنا:
  // {
  //   id: 3,
  //   title: "اسم الحلقة",
  //   pageUrl: "رابط_صفحة_الحلقة",
  //   seriesId: 310
  // },
];

// 📁 مسار ملف الخرج (سيُحفظ في مجلد المشروع على GitHub)
const OUTPUT_FILE = path.join(process.env.GITHUB_WORKSPACE || __dirname, 'viu_links.json');

// ⏱️ إعدادات الانتظار (بالمللي ثانية)
const CONFIG = {
  pageLoadTimeout: 30000,
  waitAfterLoad: 10000,
  delayBetweenEpisodes: 3000
};

/**
 * 🎯 استخراج رابط بث من صفحة معينة
 */
async function extractStreamUrl(pageUrl) {
  let browser = null;
  
  try {
    log('🔍 [1/4] جاري فتح المتصفح الخفي على سحابة GitHub...');
    
    // 🚀 تشغيل متصفح كروم في بيئة GitHub Actions
    browser = await puppeteer.launch({
      args: chrome.args,
      executablePath: await chrome.executablePath,
      headless: chrome.headless,
      defaultViewport: { width: 1920, height: 1080 }
    });
    
    const page = await browser.newPage();
    
    // 🎭 محاكاة متصفح حقيقي
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9,ar;q=0.8',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate'
    });

    const capturedUrls = [];
    
    // ✅ اعتراض طلبات الشبكة
    await page.setRequestInterception(true);
    
    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('.m3u8') || url.includes('.mpd') || url.includes('manifest')) {
        log(`🎯 [اعتراض] تم اكتشاف رابط بث: ${url.substring(0, 80)}...`);
        capturedUrls.push(url);
      }
      request.continue();
    });

    log(`🔗 [2/4] جاري تحميل الصفحة: ${pageUrl}`);
    
    await page.goto(pageUrl, { 
      waitUntil: 'networkidle2',
      timeout: CONFIG.pageLoadTimeout 
    });
    
    // ▶️ محاولة تشغيل الفيديو
    try {
      await page.evaluate(() => {
        const video = document.querySelector('video');
        if (video) {
          video.muted = true;
          video.play().catch(() => {});
        }
      });
      log('▶️ [3/4] تم محاولة تشغيل الفيديو تلقائياً');
    } catch (e) {
      log('⚠️ تعذر تشغيل الفيديو تلقائياً');
    }
    
    log(`⏱️ [4/4] انتظار ${CONFIG.waitAfterLoad/1000} ثوانٍ...`);
    await new Promise(resolve => setTimeout(resolve, CONFIG.waitAfterLoad));
    
    await browser.close();
    
    if (capturedUrls.length > 0) {
      const bestUrl = capturedUrls.reduce((a, b) => a.length > b.length ? a : b);
      log(`✅ تم العثور على ${capturedUrls.length} رابط، الأفضل: ${bestUrl.substring(0, 60)}...`);
      return bestUrl;
    }
    
    log('❌ لم يتم العثور على أي رابط بث');
    return null;
    
  } catch (err) {
    logError(`💥 خطأ أثناء الاستخراج: ${err.message}`);
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
    
    // قراءة الملف الحالي إذا وجد (من المستودع)
    if (fs.existsSync(outputFile)) {
      const content = fs.readFileSync(outputFile, 'utf8');
      if (content.trim()) {
        data = JSON.parse(content);
      }
    }
    
    const key = `${seriesId}_${episodeId}`;
    
    data[key] = {
      url: streamUrl,
      extractedAt: new Date().toISOString(),
      source: 'github-actions-cloud',
      episodeTitle: EPISODES_TO_EXTRACT.find(e => e.id === episodeId)?.title || 'Unknown',
      workflowRun: process.env.GITHUB_RUN_ID || 'manual'
    };
    
    // حفظ بتنسيق منسق
    fs.writeFileSync(outputFile, JSON.stringify(data, null, 2), 'utf8');
    
    log(`📁 ✅ تم الحفظ في: ${outputFile}`);
    log(`🔑 المفتاح: "${key}"`);
    
    return true;
  } catch (err) {
    logError(`❌ فشل الحفظ: ${err.message}`);
    return false;
  }
}

/**
 * 📝 دالة تسجيل (متوافقة مع GitHub Actions)
 */
function log(message) {
  console.log(message);
  // إرسال للـ GitHub Actions log أيضاً
  if (core?.info) core.info(message);
}

function logError(message) {
  console.error(message);
  if (core?.error) core.error(message);
}

/**
 * 🚀 الدالة الرئيسية
 */
async function main() {
  log('🎬 ════════════════════════════════════════');
  log('🎬   Viu Cloud Extractor - بدء التشغيل على GitHub Actions');
  log('🎬 ════════════════════════════════════════\n');
  
  let successCount = 0;
  
  for (const episode of EPISODES_TO_EXTRACT) {
    log(`\n📺 ─────────────────────────────────────`);
    log(`📺 الحلقة #${episode.id}: ${episode.title}`);
    log(`📺 ─────────────────────────────────────\n`);
    
    const streamUrl = await extractStreamUrl(episode.pageUrl);
    
    if (streamUrl) {
      const saved = await saveLinkToJson(episode.seriesId, episode.id, streamUrl, OUTPUT_FILE);
      if (saved) successCount++;
    } else {
      log(`⚠️ فشل استخراج رابط للحلقة #${episode.id}`);
    }
    
    // تأخير لتجنب الحظر
    if (episode !== EPISODES_TO_EXTRACT[EPISODES_TO_EXTRACT.length - 1]) {
      await new Promise(resolve => setTimeout(resolve, CONFIG.delayBetweenEpisodes));
    }
  }
  
  log(`\n🎬 ════════════════════════════════════════`);
  log(`🎬   اكتمل الاستخراج!`);
  log(`🎬   النجاح: ${successCount} / ${EPISODES_TO_EXTRACT.length}`);
  log(`🎬   الملف: ${OUTPUT_FILE}`);
  log(`🎬 ════════════════════════════════════════`);
  
  // إرجاع النتيجة لـ GitHub Actions
  if (core?.setOutput) {
    core.setOutput('success_count', successCount);
    core.setOutput('total_count', EPISODES_TO_EXTRACT.length);
  }
  
  return successCount === EPISODES_TO_EXTRACT.length;
}

// 🏁 تشغيل السكريبت
main()
  .then(success => {
    if (!success && core?.setFailed) {
      core.setFailed('بعض الحلقات فشلت في الاستخراج');
    }
    process.exit(success ? 0 : 1);
  })
  .catch(err => {
    logError(`💥 خطأ غير متوقع: ${err.message}`);
    if (core?.setFailed) core.setFailed(err.message);
    process.exit(1);
  });
