# نشر «وصل» على Netlify

العنوان المعتمد: `https://wusl.netlify.app`.

## قبل النشر

1. شغّل `npm run verify` محلياً، وتأكد من نجاحه.
2. طبّق ملفات قاعدة البيانات الجديدة: `npm run db -- migrate`.
3. أنشئ نسخة احتياطية: `npm run db -- backup`.

## متغيرات البيئة على Netlify

أضفها من Site configuration ← Environment variables. لا تضعها في ملفات المشروع.

| المتغير | القيمة |
|---|---|
| `MEDIA_APP_ORIGIN` | `https://wusl.netlify.app` |
| `SUPABASE_URL` | عنوان مشروع Supabase |
| `SUPABASE_DB_PASSWORD` | كلمة مرور قاعدة البيانات |
| `SUPABASE_DB_PORT` | `6543` (منفذ المعاملات المناسب للدوال قصيرة العمر) |
| `WASL_DB_POOL_SIZE` | `2` |
| `SUPABASE_SECRET_KEY` | مفتاح الخادم في Supabase، لحفظ الملفات قبل ربط Drive |
| `WASL_SESSION_SECRET` | مفتاح عشوائي طويل لتوقيع الجلسات |
| `WASL_ENCRYPTION_KEY` | مفتاح 32 بايت بترميز base64 لتشفير رمز Google. يجب أن يطابق المفتاح المستخدم عند الربط، وإلا أعد ربط Drive |
| `CRON_SECRET` | مفتاح عشوائي لتشغيل المهام المجدولة |
| `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` | بيانات عميل OAuth «Wasl Web» |
| `GOOGLE_PICKER_API_KEY` / `GOOGLE_CLOUD_PROJECT_NUMBER` | مفتاح Picker ورقم المشروع |
| `SMTP_HOST` `SMTP_PORT` `SMTP_USER` `SMTP_PASS` `SMTP_FROM` | بريد الإشعارات عبر Microsoft 365 |
| `WASL_EMAIL_ENABLED` | `true` لتفعيل إرسال البريد، ويبقى معطلاً ما لم يُضبط |
| `WASL_REQUIRE_ADMIN_MFA` | يترك فارغاً: التحقق بخطوتين إلزامي لمديري النظام في الإنتاج. اضبطه `false` لإيقاف الإلزام |

## المهام المجدولة

`netlify/functions/wasl-jobs.mjs` دالة مجدولة كل 15 دقيقة. تستدعي `/api/jobs/archive` بمفتاح `CRON_SECRET`، فتنفّذ:

- مهام الأرشفة المعلقة.
- التذكيرات اليومية.
- تنظيف الملفات اليتيمة.
- النسخة الاحتياطية اليومية إلى مجلد «نسخ احتياطية للنظام» داخل مجلد الأرشيف، مع حذف ما مضى عليه 30 يوماً.
- إرسال البريد إن كان مفعّلاً.

ويستكمل النظام المهام أيضاً بعد التسليم مباشرة، وأثناء تحديث الواجهة.

## Google Cloud

في مشروع `wasl-platform-511215` سُجّل `https://wusl.netlify.app` في ثلاثة أماكن:

- العناوين المسموحة (Authorized JavaScript origins).
- عنوان الرجوع `https://wusl.netlify.app/api/integrations/google/callback`.
- قيود مفتاح Picker.

قبل التشغيل الفعلي:

1. أضف في Branding رابط الصفحة الرئيسية `https://wusl.netlify.app`، ورابط سياسة الخصوصية `https://wusl.netlify.app/privacy`.
2. انقل التطبيق من وضع Testing إلى Production. صلاحية `drive.file` لا تحتاج مراجعة، والنقل يلغي انتهاء الربط كل 7 أيام.
3. أعد ربط Drive من حساب root بعد النقل.

## الاستعادة من نسخة احتياطية

```sh
npm run db -- restore wasl-backup-YYYY-MM-DD.json.gz
```

تعمل الاستعادة على قاعدة بيانات فارغة طُبّقت عليها ملفات `supabase/migrations`، ولا تخلط البيانات بقاعدة فيها أعضاء.

## تهيئة نظام جديد

```sh
read -rs 'p?كلمة مرور المالك: '; printf '%s' "$p" | npm run db -- bootstrap-root --name 'اسم المالك'; unset p
```

تنشئ حساب root والشركات والتصنيفات فقط، دون أي بيانات تجريبية. وترفض العمل على قاعدة فيها أعضاء.
