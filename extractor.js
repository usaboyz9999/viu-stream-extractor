// extractor.js - سكريبت استخراج روابط البث من Viu.com
// 📍 مصحح ليعمل مع Puppeteer v22+ (بدون waitForTimeout)

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

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
];

const OUTPUT_FILE = path.join(process.env.GITHUB_WORKSPACE || __dirname, 'viu_links.json');
const CONFIG = {
  pageLoadTimeout: 50000,
  waitAfterLoad: 20000,
  delayBetweenEpisodes: 5000
};

// ✅ دالة مساعدة بديلة لـ waitForTimeout
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function extractStreamUrl(pageUrl) {
  let browser = null;
  try {
    console.log('🔍 [1/5] جاري فتح المتصفح...');
    
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    
    const page = await browser.newPage();
    
    // 🎭 محاكاة متصفح حقيقي
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9,ar;q=0.8',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none'
    });

    const allRequests = [];
    const streamCandidates = [];
    
    // ✅ اعتراض وتسجيل كل طلب شبكة
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const url = request.url();
      allRequests.push(url);
      
      // 🔍 أنماط بحث أوسع
      if (
        url.includes('.m3u8') || 
        url.includes('.mpd') || 
        url.includes('manifest') ||
        (url.includes('video') && url.includes('.json')) ||
        (url.includes('api') && url.includes('stream')) ||
        (url.includes('cdn') && (url.includes('video') || url.includes('media')))
      ) {
        console.log(`🎯 [مرشح] ${url.substring(0, 100)}...`);
        streamCandidates.push(url);
      }
      
      request.continue();
    });

    console.log(`🔗 [2/5] تحميل الصفحة: ${pageUrl}`);
    await page.goto(pageUrl, { 
      waitUntil: 'networkidle2',
      timeout: CONFIG.pageLoadTimeout 
    });
    
    // 🖱️ محاكاة تفاعل المستخدم
    console.log('🖱️ [3/5] محاكاة تفاعل المستخدم...');
    await page.mouse.move(100, 100);
    
    // ✅ استخدام الدالة البديلة بدلاً من page.waitForTimeout
    await wait(2000);
    
    try {
      await page.evaluate(() => {
        const video = document.querySelector('video');
        if (video) { 
          video.muted = true; 
          video.play().catch(() => {}); 
          video.click();
        }
        const playBtn = document.querySelector('[data-testid*="play"], .play-button, button[class*="play"]');
        if (playBtn) playBtn.click();
      });
      console.log('▶️ تم محاولة التشغيل');
    } catch (e) {}
    
    console.log(`⏱️ [4/5] انتظار ${CONFIG.waitAfterLoad/1000} ثوانٍ...`);
    await wait(CONFIG.waitAfterLoad);
    
    // 🔎 البحث داخل محتوى الصفحة
    console.log('🔎 [5/5] البحث داخل محتوى الصفحة...');
    const pageContent = await page.content();
    
    const pagePatterns = [
      /["']?(https?:\/\/[^\s"']+\.m3u8[^\s"']*)["']?/gi,
      /["']?(https?:\/\/[^\s"']+\.mpd[^\s"']*)["']?/gi,
      /["']?(https?:\/\/[^\s"']+manifest[^\s"']*)["']?/gi,
      /"file"\s*:\s*["']([^"']+\.m3u8[^"']*)["']/gi,
      /"src"\s*:\s*["']([^"']+\.m3u8[^"']*)["']/gi,
      /videoUrl["']?\s*[:=]\s*["']([^"']+)["']/gi
    ];
    
    for (const pattern of pagePatterns) {
      const matches = pageContent.match(pattern);
      if (matches) {
        console.log(`📄 [من الصفحة] ${matches.length} تطابق`);
        matches.forEach(m => {
          const clean = m.replace(/["']?(:\s*)?["']?/, '').trim();
          if (clean.startsWith('http') && !streamCandidates.includes(clean)) {
            streamCandidates.push(clean);
            console.log(`   └─ ${clean.substring(0, 80)}...`);
          }
        });
      }
    }
    
    await browser.close();
    
    // 📊 عرض إحصائيات للتصحيح
    console.log(`\n📊 إحصائيات الطلبات: ${allRequests.length} طلب إجمالي`);
    if (streamCandidates.length === 0) {
      console.log('⚠️ لم يتم العثور على أي مرشح. عينة من الطلبات:');
      allRequests.slice(0, 10).forEach((r, i) => console.log(`   ${i+1}. ${r}`));
    }
    
    // 🏆 اختيار أفضل رابط
    if (streamCandidates.length > 0) {
      const bestUrl = streamCandidates.reduce((a, b) => a.length > b.length ? a : b);
      console.log(`✅ أفضل مرشح: ${bestUrl.substring(0, 80)}...`);
      return bestUrl;
    }
    
    console.log('❌ لم يتم العثور على أي رابط بث صالح');
    return null;
    
  } catch (err) {
    console.error(`💥 خطأ: ${err.message}`);
    if (browser) await browser.close();
    return null;
  }
}

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
    console.log(`📁 ✅ تم الحفظ: ${outputFile}`);
    return true;
  } catch (err) {
    console.error(`❌ فشل الحفظ: ${err.message}`);
    return false;
  }
}

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
      await wait(CONFIG.delayBetweenEpisodes);
    }
  }
  
  console.log(`\n🎬 ════════════════════════════════════════`);
  console.log(`🎬   النتيجة: ${successCount} / ${EPISODES_TO_EXTRACT.length}`);
  console.log(`🎬 ════════════════════════════════════════`);
  
  process.exit(successCount === EPISODES_TO_EXTRACT.length ? 0 : 1);
}

main().catch(err => { console.error(err); process.exit(1); });
