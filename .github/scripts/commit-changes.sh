#!/bin/bash
# .github/scripts/commit-changes.sh
# سكربت بسيط لرفع التغييرات (يتجنب تعقيدات YAML)

set -e  # إيقاف السكربت عند أي خطأ

# التحقق من وجود الملف
if [ ! -f viu_links.json ]; then
  echo "⚠️ viu_links.json غير موجود"
  exit 0
fi

# التحقق من وجود محتوى
if [ ! -s viu_links.json ]; then
  echo "⚠️ viu_links.json فارغ"
  exit 0
fi

# إعداد هوية الـ commit
git config --local user.email "github-actions[bot]@users.noreply.github.com"
git config --local user.name "github-actions[bot]"

# إضافة الملف
git add viu_links.json

# التحقق من وجود تغييرات فعلية
if git diff --staged --quiet; then
  echo "ℹ️ لا توجد تغييرات جديدة في viu_links.json"
  exit 0
fi

# إنشاء الـ commit برسالة بسيطة (بدون أسطر متعددة)
git commit -m "🔄 auto-update: viu_links.json [run:${GITHUB_RUN_ID}]"

# رفع التغييرات
git push

echo "✅ تم رفع viu_links.json بنجاح"
