// Downloads the APK from this site (same origin) so the button can show
// progress, size and remaining time. Two things keep it fast: phones get
// the build for their processor (much smaller than the universal one),
// and the file comes down in parallel chunks. Anywhere else, or if the
// fetch fails, the link downloads the file the ordinary way.
(function () {
  var NAME = 'manhaj-hayah.apk';
  // The site root, wherever this script is included from (pages sit in folders).
  var ROOT = new URL('../', document.currentScript.src).href;
  var CHUNK = 4 * 1048576, PARALLEL = 6, RETRIES = 3;
  var hosted = /github\.io$/.test(location.hostname) || location.hostname === 'localhost';
  var nf = new Intl.NumberFormat('ar', { maximumFractionDigits: 1 });
  var nf0 = new Intl.NumberFormat('ar', { maximumFractionDigits: 0 });
  function mb(b) { return nf.format(b / 1048576); }
  function rate(bps) { return bps < 1048576 ? nf0.format(bps / 1024) + ' ك.ب/ث' : mb(bps) + ' م.ب/ث'; }
  function eta(s) {
    if (!isFinite(s)) return '';
    if (s < 60) return 'يتبقى نحو ' + nf0.format(Math.max(1, Math.round(s))) + ' ثانية';
    var m = Math.round(s / 60);
    return 'يتبقى نحو ' + (m === 1 ? 'دقيقة' : m === 2 ? 'دقيقتين' : nf0.format(m) + ' دقائق');
  }

  if (!hosted) return;

  // How many times the app was downloaded from this site. GitHub counts
  // each fetch of a tiny file (see the workflow); a visitor's finished
  // download fetches it once, at most once a day per browser.
  var REPO = 'AlaaBashirSaijary/manhaj-hayah';
  var COUNT_API = 'https://api.github.com/repos/' + REPO + '/releases/tags/counter';
  var COUNT_PING = 'https://github.com/' + REPO + '/releases/download/counter/download.txt';
  var count = null;
  function showCount() {
    if (count === null || count < 1) return;
    document.querySelectorAll('.dl-count').forEach(function (el) {
      el.textContent = 'حُمِّل التطبيق ' + nf0.format(count) + ' مرة';
      el.hidden = false;
    });
  }
  fetch(COUNT_API).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
    var a = j && (j.assets || []).filter(function (x) { return x.name === 'download.txt'; })[0];
    if (a) { count = a.download_count; showCount(); }
  }).catch(function () {});
  function countDownload() {
    try {
      var last = +localStorage.getItem('mh-counted') || 0;
      if (Date.now() - last < 864e5) return;
      localStorage.setItem('mh-counted', Date.now());
    } catch (e) {}
    fetch(COUNT_PING, { mode: 'no-cors', cache: 'no-store' }).catch(function () {});
    if (count !== null) { count++; showCount(); }
  }

  // Which build this device needs. Unknown → the universal one, which
  // installs everywhere.
  var variant = Promise.resolve('universal');
  if (/Android/i.test(navigator.userAgent) && navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) {
    variant = navigator.userAgentData.getHighEntropyValues(['architecture', 'bitness']).then(function (h) {
      if (/arm/i.test(h.architecture) && h.bitness === '64') return 'arm64-v8a';
      if (/arm/i.test(h.architecture) && h.bitness === '32') return 'armeabi-v7a';
      return 'universal';
    }).catch(function () { return 'universal'; });
  }
  var manifest = fetch(ROOT + 'download/latest.json', { cache: 'no-store' })
    .then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  var pick = Promise.all([manifest, variant]).then(function (v) {
    var info = v[0], want = v[1];
    if (!info) return null;
    var files = info.files || {};
    var f = files[want] || files.universal ||
      (info.size ? { file: NAME, size: info.size } : null);
    return f ? { version: info.version, file: f.file, size: f.size, sha: f.sha256, small: want !== 'universal' && !!files[want] } : null;
  });
  pick.then(function (p) {
    if (!p) return;
    if (p.sha) {
      document.querySelectorAll('.sha').forEach(function (el) { el.textContent = p.sha; });
      document.querySelectorAll('.sha-name').forEach(function (el) { el.textContent = p.file; });
      document.querySelectorAll('.verify').forEach(function (el) { el.hidden = false; });
    }
    document.querySelectorAll('.dl-meta').forEach(function (el) {
      el.textContent = ' · الإصدار ' + p.version + ' · الحجم ' + mb(p.size) + ' م.ب' +
        (p.small ? ' (نسخة مخصّصة لمعالج هاتفك)' : '');
    });
  });

  var busy = false;
  document.querySelectorAll('a.dl').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      if (!window.fetch || !window.AbortController) return;
      e.preventDefault();
      if (!busy) start(btn);
    });
  });

  function panel(btn) {
    var host = btn.closest('.cta');
    var box = host.nextElementSibling;
    if (!box || !box.classList.contains('dl-status')) {
      box = document.createElement('div');
      box.className = 'dl-status';
      box.setAttribute('role', 'status');
      box.setAttribute('aria-live', 'polite');
      box.innerHTML = '<div class="dl-track"><div class="dl-fill"></div></div>' +
        '<div class="dl-row"><span class="dl-pct"></span><span class="dl-info"></span></div>' +
        '<div class="dl-row"><span class="dl-eta"></span><button type="button" class="dl-cancel">إلغاء</button></div>';
      host.insertAdjacentElement('afterend', box);
      if (host.parentElement.classList.contains('final')) box.style.marginInline = 'auto';
    }
    box.hidden = false;
    return box;
  }

  // Fetches bytes [from, to] and reports each piece as it arrives; retries
  // a dropped chunk from where it stopped.
  function getRange(url, from, to, signal, onBytes) {
    var parts = [], have = 0, tries = 0;
    function attempt() {
      return fetch(url, { signal: signal, headers: { Range: 'bytes=' + (from + have) + '-' + to } }).then(function (res) {
        if (res.status !== 206 || !res.body) throw new Error('range ' + res.status);
        var reader = res.body.getReader();
        function pump() {
          return reader.read().then(function (s) {
            if (s.done) return;
            parts.push(s.value); have += s.value.length; onBytes(s.value.length);
            return pump();
          });
        }
        return pump();
      }).then(function () {
        if (have < to - from + 1) throw new Error('short');
        return new Blob(parts);
      }).catch(function (err) {
        if (signal.aborted || ++tries > RETRIES) throw err;
        return new Promise(function (r) { setTimeout(r, 800 * tries); }).then(attempt);
      });
    }
    return attempt();
  }

  // Whole file on one connection, for servers that ignore Range.
  function getWhole(res, onBytes) {
    var parts = [], reader = res.body.getReader();
    function pump() {
      return reader.read().then(function (s) {
        if (s.done) return new Blob(parts);
        parts.push(s.value); onBytes(s.value.length);
        return pump();
      });
    }
    return pump();
  }

  function start(btn) {
    busy = true;
    var box = panel(btn);
    var fill = box.querySelector('.dl-fill'), pct = box.querySelector('.dl-pct'),
        info = box.querySelector('.dl-info'), left = box.querySelector('.dl-eta'),
        cancel = box.querySelector('.dl-cancel');
    var ctrl = new AbortController();
    btn.setAttribute('aria-busy', 'true');
    box.classList.add('indeterminate');
    fill.style.width = '';
    pct.textContent = 'جارٍ بدء التحميل…'; info.textContent = ''; left.textContent = '';
    cancel.hidden = false;
    cancel.onclick = function () { ctrl.abort(); };

    var total = 0, got = 0, t0 = 0, samples = [], shown = 0;
    function onBytes(n) {
      got += n;
      var now = performance.now();
      if (!t0) t0 = now;
      samples.push([now, got]);
      while (samples.length > 2 && now - samples[0][0] > 4000) samples.shift();
      if (now - shown < 200) return;
      shown = now;
      var span = (now - samples[0][0]) / 1000;
      var speed = span > 0.5 ? (got - samples[0][1]) / span : 0;
      if (total) {
        var p = Math.min(1, got / total);
        fill.style.width = (p * 100).toFixed(1) + '%';
        pct.textContent = nf0.format(Math.floor(p * 100)) + '٪';
        info.textContent = mb(got) + ' من ' + mb(total) + ' م.ب' + (speed ? ' · ' + rate(speed) : '');
        left.textContent = speed && now - t0 > 1500 ? eta((total - got) / speed) : 'جارٍ حساب الوقت المتبقي…';
      } else {
        pct.textContent = mb(got) + ' م.ب';
        info.textContent = speed ? rate(speed) : '';
      }
    }
    function finish() { busy = false; btn.removeAttribute('aria-busy'); }

    pick.then(function (p) {
      var url = ROOT + 'download/' + (p ? p.file : NAME);
      // The first chunk also tells us whether the server takes ranges.
      return fetch(url, { signal: ctrl.signal, headers: { Range: 'bytes=0-' + (CHUNK - 1) } }).then(function (res) {
        if (!res.ok || !res.body) throw new Error('http ' + res.status);
        var cr = res.headers.get('Content-Range');
        if (res.status !== 206 || !cr) {
          total = +res.headers.get('Content-Length') || 0;
          if (total) box.classList.remove('indeterminate');
          return getWhole(res, onBytes);
        }
        total = +cr.split('/')[1];
        box.classList.remove('indeterminate');
        var first = getWhole(res, onBytes);
        var ranges = [];
        for (var at = CHUNK; at < total; at += CHUNK) ranges.push([at, Math.min(total, at + CHUNK) - 1]);
        var blobs = new Array(ranges.length), next = 0;
        function worker() {
          if (next >= ranges.length) return Promise.resolve();
          var i = next++;
          return getRange(url, ranges[i][0], ranges[i][1], ctrl.signal, onBytes)
            .then(function (b) { blobs[i] = b; return worker(); });
        }
        var workers = [];
        for (var w = 0; w < PARALLEL - 1; w++) workers.push(worker());
        return Promise.all([first].concat(workers)).then(function (r) {
          return new Blob([r[0]].concat(blobs));
        });
      });
    }).then(function (blob) {
      if (total && blob.size !== total) throw new Error('size');
      var url = URL.createObjectURL(new Blob([blob], { type: 'application/vnd.android.package-archive' }));
      var a = document.createElement('a');
      a.href = url; a.download = NAME;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
      countDownload();
      var secs = (performance.now() - t0) / 1000;
      box.classList.remove('indeterminate');
      fill.style.width = '100%';
      pct.textContent = 'اكتمل التحميل ✓';
      info.textContent = mb(blob.size) + ' م.ب' + (secs > 0 ? ' · ' + rate(blob.size / secs) : '');
      left.textContent = 'افتح الملف من إشعار التنزيل أو من مجلد «التنزيلات» لتثبيته.';
      cancel.hidden = true;
      finish();
    }).catch(function (err) {
      finish();
      box.classList.remove('indeterminate');
      if (ctrl.signal.aborted) {
        fill.style.width = '0';
        pct.textContent = 'أُلغي التحميل';
        info.textContent = ''; left.textContent = '';
        cancel.hidden = true;
        return;
      }
      ctrl.abort();
      // Let the browser download the file the ordinary way.
      box.hidden = true;
      countDownload();
      location.href = btn.href;
    });
  }
})();
