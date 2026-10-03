// Visit counting and "wrong browser" help, shared by every page.
//
// Counting: GitHub counts how many times each tiny file in the "counter"
// release is fetched, and the /stats/ page reads those numbers. Nothing
// personal is sent or stored; a visitor is counted once per browser session.
//
// Help: Instagram, Facebook and other apps open links in their own built-in
// browser, which usually cannot save an APK. When we detect one (or an
// iPhone, which cannot install the app) we say so at the top of the page.
(function () {
  var ROOT = new URL('../', document.currentScript.src).href;
  var COUNTER = 'https://github.com/AlaaBashirSaijary/manhaj-hayah/releases/download/counter/';
  var ua = navigator.userAgent || '';
  var env = {
    ios: /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
    android: /Android/i.test(ua),
    // Apps' built-in browsers, and Android's generic WebView ("; wv)").
    iab: /Instagram|FBAN|FBAV|FB_IAB|FBIOS|Messenger|LinkedInApp|Snapchat|TikTok|musical_ly|Bytedance|Telegram|MicroMessenger|; wv\)/i.test(ua)
  };

  var SOURCES = { ig: 1, fb: 1, li: 1, tg: 1 };
  var src = 'other';
  try {
    var s = (new URLSearchParams(location.search).get('s') || '').toLowerCase();
    if (SOURCES[s]) sessionStorage.setItem('mh-src', s);
    src = sessionStorage.getItem('mh-src') || 'other';
  } catch (e) {}

  function once(key, file) {
    try {
      if (sessionStorage.getItem('mh-t-' + key)) return;
      sessionStorage.setItem('mh-t-' + key, '1');
    } catch (e) {}
    try { fetch(COUNTER + file, { mode: 'no-cors', cache: 'no-store' }).catch(function () {}); } catch (e) {}
  }

  var pageUrl = location.origin + location.pathname;
  var shareText = 'منهج حياة: تطبيق مجاني للقرآن والصلاة والأذكار دون إعلانات (لأندرويد). ' + ROOT;

  function copy(text, done) {
    function fallback() {
      var t = document.createElement('textarea');
      t.value = text; t.style.position = 'fixed'; t.style.opacity = '0';
      document.body.appendChild(t); t.select();
      try { document.execCommand('copy'); } catch (e) {}
      t.remove(); done();
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback);
    else fallback();
  }

  function button(label, onclick) {
    var b = document.createElement('button');
    b.type = 'button'; b.textContent = label; b.onclick = onclick;
    b.style.cssText = 'font:inherit;font-size:15px;font-weight:600;padding:8px 16px;margin:6px 0 0 8px;border-radius:10px;border:1px solid #c9a54c;background:#c9a54c;color:#1c1606;cursor:pointer';
    return b;
  }

  function banner(kind, scroll) {
    var el = document.getElementById('mh-env-banner');
    if (!el) {
      el = document.createElement('div');
      el.id = 'mh-env-banner';
      el.setAttribute('role', 'status');
      el.style.cssText = 'margin:14px 0;padding:14px 16px;border:1px solid #c9a54c;border-radius:14px;background:rgba(201,165,76,.14);color:#f3ecd8;font-size:16px;line-height:1.9';
      var host = document.querySelector('main') || document.body;
      host.insertBefore(el, host.firstChild);
    }
    el.textContent = '';
    var p = document.createElement('p');
    p.style.margin = '0';
    if (kind === 'ios') {
      p.textContent = 'تطبيق «منهج حياة» لأندرويد فقط حالياً، ولا يمكن تثبيته على آيفون. يمكنك إرسال الرابط لصديق أو قريب يستخدم أندرويد.';
      el.appendChild(p);
      var wa = document.createElement('a');
      wa.href = 'https://wa.me/?text=' + encodeURIComponent(shareText);
      wa.target = '_blank'; wa.rel = 'noopener'; wa.textContent = 'إرسال الرابط عبر واتساب';
      wa.style.cssText = 'display:inline-block;margin-top:8px;color:#e0c27a;font-weight:600';
      el.appendChild(wa);
    } else {
      p.textContent = 'أنت تتصفح من داخل تطبيق (مثل إنستغرام أو فيسبوك)، وهذه المتصفحات المدمجة غالباً لا تحفظ ملفات التثبيت. افتح الصفحة في متصفح هاتفك (Chrome): اضغط على ⋮ أو ⋯ أعلى الشاشة ثم اختر «فتح في المتصفح»، أو انسخ الرابط والصقه في Chrome.';
      el.appendChild(p);
      el.appendChild(button('نسخ رابط الصفحة', function () {
        var self = this;
        copy(pageUrl, function () { self.textContent = 'تم النسخ ✓'; });
      }));
      var d = document.createElement('a');
      d.href = ROOT + 'download/manhaj-hayah.apk'; d.setAttribute('download', '');
      d.textContent = 'أو جرّب التنزيل المباشر من هنا';
      d.style.cssText = 'display:inline-block;margin:10px 0 0 8px;color:#e0c27a';
      el.appendChild(d);
    }
    if (scroll && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  window.MH = {
    env: env, source: src, root: ROOT, banner: banner, copy: copy, shareText: shareText,
    click: function () { once('click', 'click.txt'); }
  };

  // Count the visit, and the visitors who cannot download here.
  once('visit', 'visit-' + src + '.txt');
  if (env.ios) { once('ios', 'ios.txt'); banner('ios'); }
  else if (env.iab) { once('iab', 'iab.txt'); banner('iab'); }
})();
