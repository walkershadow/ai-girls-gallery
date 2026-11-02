(function () {
  "use strict";

  var DATA = Array.isArray(window.GALLERY_IMAGES) ? window.GALLERY_IMAGES : [];
  var SECS = ["face", "styling"];
  var SEC_INFO = {
    face: { ja: "フェイス", file: "ai-face-", note: "正面向き・無地背景の顔リファレンス。顔を揃えたいときに。" },
    styling: { ja: "スタイリング", file: "ai-styling-", note: "服装・髪の質感・雰囲気までわかる元画像。向きはさまざまです。" }
  };
  DATA.forEach(function (it) { if (SECS.indexOf(it.section) < 0) it.section = "face"; });
  var section = "face";
  var ALL = DATA;
  var HAIRS = ["ショート", "ミディアム", "セミロング", "ロング", "未分類"];
  var PAGE = 60;

  var grid = document.getElementById("grid");
  var countEl = document.getElementById("count");
  var filtersEl = document.getElementById("filters");
  var moreBtn = document.getElementById("more");
  var emptyEl = document.getElementById("empty");
  var sentinel = document.getElementById("sentinel");

  var lb = document.getElementById("lightbox");
  var lbImg = document.getElementById("lb-img");
  var lbLabel = document.getElementById("lb-label");
  var lbDl = document.getElementById("lb-dl");

  var current = "all";
  var filtered = [];
  var shown = 0;
  var lbIndex = -1;
  var lbList = null; /* ランキングから開いたときだけ使う（null ならギャラリーの並び） */
  var lastFocus = null;

  function fmt(n) { return Number(n).toLocaleString("ja-JP"); }
  function mb(bytes) { return (bytes / 1048576).toFixed(1) + " MB"; }
  function labelOf(it) { return it.style ? it.hair + "・" + it.style : it.hair; }

  /* 利用回数の計測（画像ID・操作の種類だけ送る。失敗しても無視し、ページ操作は邪魔しない） */
  function hit(ev, it) {
    try {
      if (!it || location.protocol.indexOf("http") !== 0) return;
      var body = JSON.stringify({ e: ev, s: it.section, id: it.id });
      if (navigator.sendBeacon && navigator.sendBeacon("/api/hit", body)) return;
      if (window.fetch) fetch("/api/hit", { method: "POST", body: body, keepalive: true }).catch(function () {});
    } catch (e) {}
  }

  function readSec() {
    var m = /(?:^#|&)sec=([^&]*)/.exec(location.hash);
    return m && SECS.indexOf(m[1]) >= 0 ? m[1] : "face";
  }

  function readHash() {
    var m = /(?:^#|&)hair=([^&]*)/.exec(location.hash);
    if (!m) return "all";
    var v;
    try { v = decodeURIComponent(m[1]); } catch (e) { return "all"; }
    return HAIRS.indexOf(v) >= 0 ? v : "all";
  }

  function writeHash() {
    var parts = [];
    if (section !== "face") parts.push("sec=" + section);
    if (current !== "all") parts.push("hair=" + encodeURIComponent(current));
    var h = parts.length ? "#" + parts.join("&") : "";
    if (h === location.hash) return;
    history.replaceState(null, "", h || location.pathname + location.search);
  }

  function secItems(sec) { return DATA.filter(function (it) { return it.section === sec; }); }

  function counts() {
    var c = { all: ALL.length };
    HAIRS.forEach(function (h) { c[h] = 0; });
    ALL.forEach(function (it) { if (c[it.hair] !== undefined) c[it.hair]++; });
    return c;
  }

  function buildFilters() {
    var c = counts();
    filtersEl.textContent = "";
    ["all"].concat(HAIRS).forEach(function (key) {
      if (key !== "all" && !c[key]) return;
      var b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.dataset.key = key;
      b.appendChild(document.createTextNode(key === "all" ? "すべて" : key));
      var s = document.createElement("small");
      s.textContent = fmt(c[key]);
      b.appendChild(s);
      b.addEventListener("click", function () { setFilter(key, true); });
      filtersEl.appendChild(b);
    });
  }

  function updateChips() {
    Array.prototype.forEach.call(filtersEl.children, function (b) {
      b.setAttribute("aria-pressed", b.dataset.key === current ? "true" : "false");
    });
  }

  function makeCard(it, idx) {
    var li = document.createElement("li");
    li.className = "card";

    var tb = document.createElement("button");
    tb.type = "button";
    tb.className = "thumb-btn";
    tb.setAttribute("aria-label", labelOf(it) + " を拡大");
    var img = document.createElement("img");
    img.src = it.thumb;
    img.width = it.thumb_w;
    img.height = it.thumb_h;
    img.loading = "lazy";
    img.decoding = "async";
    img.alt = "AI生成の架空の人物（" + labelOf(it) + "）";
    tb.appendChild(img);
    tb.addEventListener("click", function () { openLightbox(idx); });
    li.appendChild(tb);

    var meta = document.createElement("div");
    meta.className = "meta";
    var lab = document.createElement("span");
    lab.className = "label";
    lab.textContent = it.hair;
    var dl = document.createElement("a");
    dl.className = "dl";
    dl.href = it.full;
    dl.setAttribute("download", SEC_INFO[it.section].file + it.id + ".png");
    dl.setAttribute("aria-label", "PNGをダウンロード（" + mb(it.bytes) + "）");
    dl.title = "PNG " + mb(it.bytes);
    dl.addEventListener("click", function () { hit("download", it); });
    dl.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 19.5h14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg><span>PNG</span>';
    meta.appendChild(lab);
    meta.appendChild(dl);
    li.appendChild(meta);
    return li;
  }

  function updateCount() {
    countEl.textContent = SEC_INFO[section].ja + " 全" + fmt(ALL.length) + "枚 / 表示中 " + fmt(filtered.length) + "枚";
    emptyEl.hidden = filtered.length > 0;
    moreBtn.hidden = shown >= filtered.length;
  }

  function showMore() {
    var end = Math.min(shown + PAGE, filtered.length);
    var frag = document.createDocumentFragment();
    for (var i = shown; i < end; i++) frag.appendChild(makeCard(filtered[i], i));
    grid.appendChild(frag);
    shown = end;
    updateCount();
  }

  function setFilter(key, push) {
    current = key;
    filtered = key === "all" ? ALL : ALL.filter(function (it) { return it.hair === key; });
    grid.textContent = "";
    shown = 0;
    updateChips();
    if (push) writeHash();
    showMore();
  }

  moreBtn.addEventListener("click", showMore);

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting && shown < filtered.length) showMore();
    }, { rootMargin: "400px" }).observe(sentinel);
  }

  /* lightbox */
  function showLb(i) {
    var it = (lbList || filtered)[i];
    if (!it) return;
    lbIndex = i;
    lbImg.src = it.thumb;
    lbImg.alt = "AI生成の架空の人物（" + labelOf(it) + "）";
    lbLabel.textContent = labelOf(it) + "（" + mb(it.bytes) + "）";
    lbDl.href = it.full;
    lbDl.setAttribute("download", SEC_INFO[it.section].file + it.id + ".png");
    hit("view", it);
  }

  function openLightbox(i) {
    lastFocus = document.activeElement;
    showLb(i);
    lb.hidden = false;
    document.body.style.overflow = "hidden";
    document.getElementById("lb-close").focus();
  }

  function closeLightbox() {
    lb.hidden = true;
    lbIndex = -1;
    lbList = null;
    lbImg.removeAttribute("src");
    document.body.style.overflow = "";
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function step(d) {
    var n = lbIndex + d;
    var list = lbList || filtered;
    if (n < 0 || n >= list.length) return;
    while (!lbList && n >= shown && shown < filtered.length) showMore();
    showLb(n);
  }

  lbDl.addEventListener("click", function () { if (lbIndex >= 0) hit("download", (lbList || filtered)[lbIndex]); });
  document.getElementById("lb-close").addEventListener("click", closeLightbox);
  document.getElementById("lb-prev").addEventListener("click", function () { step(-1); });
  document.getElementById("lb-next").addEventListener("click", function () { step(1); });
  lb.addEventListener("click", function (e) { if (e.target === lb) closeLightbox(); });
  document.addEventListener("keydown", function (e) {
    if (lb.hidden) return;
    if (e.key === "Escape") closeLightbox();
    else if (e.key === "ArrowLeft") step(-1);
    else if (e.key === "ArrowRight") step(1);
  });

  /* sections */
  var secNote = document.getElementById("sec-note");
  var tabs = Array.prototype.slice.call(document.querySelectorAll("#sections .seg"));
  SECS.forEach(function (sec) {
    var n = document.getElementById("n-" + sec);
    if (n) n.textContent = fmt(secItems(sec).length);
  });
  tabs.forEach(function (t) {
    if (!secItems(t.dataset.sec).length) t.hidden = true;
    t.addEventListener("click", function () { setSection(t.dataset.sec, "all", true); });
  });

  function setSection(sec, hair, push) {
    if (!secItems(sec).length) sec = "face";
    section = sec;
    ALL = secItems(sec);
    tabs.forEach(function (t) {
      var on = t.dataset.sec === sec;
      t.setAttribute("aria-selected", on ? "true" : "false");
      t.tabIndex = on ? 0 : -1;
    });
    if (secNote) secNote.textContent = SEC_INFO[sec].note;
    buildFilters();
    if (hair !== "all" && !counts()[hair]) hair = "all";
    setFilter(hair, push);
  }

  window.addEventListener("hashchange", function () {
    var s2 = readSec(), k = readHash();
    if (s2 !== section) setSection(s2, k, false);
    else if (k !== current) setFilter(k, false);
  });

  /* hero */
  SECS.forEach(function (sec) {
    var st = document.getElementById("stat-" + sec);
    if (st) st.textContent = fmt(secItems(sec).length);
  });
  ALL = secItems("face");
  var heroEl = document.getElementById("hero-faces");
  if (heroEl && ALL.length) {
    var picks = [ALL[0]];
    ALL.filter(function (it) { return it.hero; })
      .sort(function (a, b) { return a.hero - b.hero; })
      .forEach(function (it) { if (picks.indexOf(it) < 0) picks.push(it); });
    ["ミディアム", "セミロング", "ロング"].forEach(function (h) {
      if (picks.length >= 3) return;
      for (var i = 0; i < ALL.length; i++) {
        if (ALL[i].hair === h && picks.indexOf(ALL[i]) < 0) { picks.push(ALL[i]); return; }
      }
    });
    picks.slice(0, 3).forEach(function (it, i) {
      var f = document.createElement("figure");
      f.className = "hf hf-" + (i + 1);
      var im = document.createElement("img");
      im.src = it.thumb;
      im.width = it.thumb_w;
      im.height = it.thumb_h;
      im.alt = "";
      if (i === 0) im.fetchPriority = "high";
      f.appendChild(im);
      var cap = document.createElement("figcaption");
      cap.textContent = it.hair;
      f.appendChild(cap);
      heroEl.appendChild(f);
    });
  }

  /* ダウンロードランキング */
  var rankEl = document.getElementById("ranking");
  var renderRanking = function (RANK) {
    if (!rankEl || !RANK || !Array.isArray(RANK.cats) || !RANK.top) return false;
    var byId = {};
    DATA.forEach(function (it) { byId[it.id] = it; });
    var rankTabs = document.getElementById("rank-tabs");
    var rankList = document.getElementById("rank-list");
    var rankItems = [];
    var cats = RANK.cats.filter(function (k) { return (RANK.top[k] || []).some(function (id) { return byId[id]; }); });
    var showRank = function (cat) {
      rankItems = RANK.top[cat].map(function (id) { return byId[id]; }).filter(Boolean);
      Array.prototype.forEach.call(rankTabs.children, function (b) {
        var on = b.dataset.cat === cat;
        b.setAttribute("aria-selected", on ? "true" : "false");
        b.tabIndex = on ? 0 : -1;
      });
      rankList.textContent = "";
      rankItems.forEach(function (it, i) {
        var li = document.createElement("li");
        li.className = "rank-item" + (i < 3 ? " rank-top" : "");
        var b = document.createElement("button");
        b.type = "button";
        b.className = "thumb-btn";
        b.setAttribute("aria-label", (i + 1) + "位 " + labelOf(it) + " を拡大");
        var img = document.createElement("img");
        img.src = it.thumb;
        img.width = it.thumb_w;
        img.height = it.thumb_h;
        img.loading = "lazy";
        img.decoding = "async";
        img.alt = "AI生成の架空の人物（" + labelOf(it) + "）";
        var no = document.createElement("span");
        no.className = "rank-no";
        no.setAttribute("aria-hidden", "true");
        no.textContent = i + 1;
        b.appendChild(img);
        b.appendChild(no);
        b.addEventListener("click", function () { lbList = rankItems.slice(); openLightbox(i); });
        li.appendChild(b);
        rankList.appendChild(li);
      });
      rankList.scrollLeft = 0;
    };
    cats.forEach(function (cat) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.setAttribute("role", "tab");
      b.dataset.cat = cat;
      b.textContent = cat;
      b.addEventListener("click", function () { showRank(cat); });
      rankTabs.appendChild(b);
    });
    if (cats.length) {
      showRank(cats[0]);
      rankEl.hidden = false;
    }
    return cats.length > 0;
  };
  /* /api/ranking を優先し、取れないとき（失敗・3秒以内に返らない・file://）はビルド時の ranking.js を使う */
  var rankDone = false;
  var rankFallback = function () {
    if (rankDone) return;
    rankDone = true;
    renderRanking(window.GALLERY_RANKING);
  };
  if (rankEl && location.protocol !== "file:" && window.fetch) {
    var rankTimer = setTimeout(rankFallback, 3000);
    fetch("/api/ranking", { credentials: "omit" })
      .then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then(function (live) {
        if (rankDone) return;
        clearTimeout(rankTimer);
        rankDone = true;
        if (!renderRanking(live)) renderRanking(window.GALLERY_RANKING);
      })
      .catch(function () { clearTimeout(rankTimer); rankFallback(); });
  } else {
    rankFallback();
  }

  setSection(readSec(), readHash(), false);
})();

// Nav links open the tips / rules sections in a dialog (the grid loads more images on scroll, so jumping to the bottom is unreliable)
(function () {
  var dlg = document.getElementById("info-dialog");
  var body = document.getElementById("info-body");
  if (!dlg || !body || typeof dlg.showModal !== "function") return;
  document.querySelectorAll('.nav a[href^="#"]').forEach(function (a) {
    a.addEventListener("click", function (e) {
      var sec = document.querySelector(a.getAttribute("href"));
      if (!sec) return;
      e.preventDefault();
      body.innerHTML = sec.innerHTML;
      dlg.showModal();
    });
  });
  document.getElementById("info-close").addEventListener("click", function () { dlg.close(); });
  dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close(); });
})();
