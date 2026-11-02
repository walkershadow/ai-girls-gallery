(function () {
  "use strict";

  var PAGE = 60;
  var $ = function (id) { return document.getElementById(id); };
  var st = { site: "portrait", lang: "zh", sec: "face", filter: "all", cat: "all", q: "", top: false };
  var list = [], shown = 0, cur = -1, angIdx = 0;

  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  st.lang = store("lang") || "zh";
  if (!window.UI[st.lang]) st.lang = "zh";

  function group(items) {
    var m = {}, out = [];
    items.forEach(function (x) {
      var k = x.line + "/" + x.no;
      if (!m[k]) { m[k] = { id: x.id.replace(/_[^_]+$/, ""), line: x.line, no: x.no, cat: x.cat, name: x.name, angles: [] }; out.push(m[k]); }
      m[k].angles.push(x);
    });
    return out;
  }
  var groups = { pose: group(window.POSE), depth: group(window.DEPTH) };
  function isPose() { return !!groups[st.site]; }

  function u(k) { return window.UI[st.lang][k]; }
  function t(ja) {
    if (st.lang === "ja" || !ja) return ja;
    var e = window.T[ja];
    return e ? e[st.lang] : ja;
  }
  function kw(s) {
    if (st.lang === "en") return s;
    return s.toLowerCase().split(" ").map(function (w) { return window.W[w] ? window.W[w][st.lang] : w; }).join(st.lang === "zh" ? " " : "・");
  }
  function allT(ja) { var e = window.T[ja] || {}; return [ja, e.zh, e.en].join(" "); }
  function allKw(s) { return s.split(" ").map(function (w) { var e = window.W[w] || {}; return [w, e.zh, e.ja].join(" "); }).join(" "); }
  function remote(p) { return window.SITE[st.site].url + p.slice(p.indexOf("/") + 1); }
  function mb(n) { return (n / 1048576).toFixed(1) + " MB"; }
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; }

  function haystack(x) {
    if (x._h) return x._h;
    var h = st.site === "costume" ? x.id + " " + allT(x.cat) + " " + allKw(x.kw)
      : isPose() ? [x.id, x.no, allT(x.name), allT(x.cat), allT(x.line)].join(" ")
      : [x.id, allT(x.hair), allT(x.style)].join(" ");
    return (x._h = h.toLowerCase());
  }

  function source() {
    if (st.site === "costume") return window.COSTUME.filter(function (x) { return st.filter === "all" || x.cat === st.filter; });
    if (isPose()) return groups[st.site].filter(function (x) { return (st.filter === "all" || x.line === st.filter) && (st.cat === "all" || x.cat === st.cat); });
    if (st.top) {
      var key = st.filter === "all" ? window.RANKING.cats[0] : st.filter;
      var byId = {};
      window.PORTRAIT.forEach(function (x) { byId[x.id] = x; });
      return (window.RANKING.top[key] || []).map(function (id) { return byId[id]; }).filter(Boolean);
    }
    return window.PORTRAIT.filter(function (x) { return x.sec === st.sec && (st.filter === "all" || x.hair === st.filter); });
  }

  function render() {
    var q = st.q.trim().toLowerCase();
    var base = source();
    list = q ? base.filter(function (x) { return haystack(x).indexOf(q) >= 0; }) : base;
    $("grid").textContent = "";
    shown = 0;
    more();
    $("empty").hidden = list.length > 0;
    $("empty").textContent = u("empty");
    var c = $("count");
    if (c) c.textContent = u("countOf").replace("{a}", base.length).replace("{b}", list.length);
  }

  function chip(label, n, on, fn) {
    var b = el("button", "chip", label);
    b.type = "button";
    b.setAttribute("aria-pressed", on ? "true" : "false");
    if (n !== null) b.appendChild(el("small", "", n));
    b.addEventListener("click", fn);
    return b;
  }
  function pick(k, v) { st[k] = v; bar(); render(); }
  function tally(arr, k) { var c = {}; arr.forEach(function (x) { c[x[k]] = (c[x[k]] || 0) + 1; }); return c; }

  function searchBox() {
    var i = document.createElement("input");
    i.type = "search"; i.placeholder = u("search"); i.value = st.q; i.setAttribute("aria-label", u("search"));
    i.addEventListener("input", function () { st.q = i.value; render(); });
    return i;
  }

  function bar() {
    var b = $("bar");
    b.textContent = "";
    if (st.site === "portrait") {
      ["face", "styling"].forEach(function (s) {
        b.appendChild(chip(u(s), window.PORTRAIT.filter(function (x) { return x.sec === s; }).length, !st.top && st.sec === s, function () { st.sec = s; st.top = false; st.filter = "all"; bar(); render(); }));
      });
      b.appendChild(chip(u("top"), null, st.top, function () { st.top = !st.top; bar(); render(); }));
      var pool = window.PORTRAIT.filter(function (x) { return x.sec === st.sec; }), c = tally(pool, "hair");
      b.appendChild(chip(u("all"), st.top ? null : pool.length, st.filter === "all", function () { pick("filter", "all"); }));
      ["ショート", "ミディアム", "セミロング", "ロング"].forEach(function (h) {
        if (c[h]) b.appendChild(chip(t(h), st.top ? null : c[h], st.filter === h, function () { pick("filter", h); }));
      });
    } else if (st.site === "costume") {
      var cc = tally(window.COSTUME, "cat");
      b.appendChild(chip(u("all"), window.COSTUME.length, st.filter === "all", function () { pick("filter", "all"); }));
      Object.keys(cc).forEach(function (k) { b.appendChild(chip(t(k), cc[k], st.filter === k, function () { pick("filter", k); })); });
    } else {
      var poses = groups[st.site], lc = tally(poses, "line");
      b.appendChild(chip(u("all"), poses.length, st.filter === "all", function () { st.filter = "all"; st.cat = "all"; bar(); render(); }));
      Object.keys(lc).forEach(function (k) { b.appendChild(chip(t(k), lc[k], st.filter === k, function () { st.filter = k; st.cat = "all"; bar(); render(); })); });
      var s = document.createElement("select");
      s.setAttribute("aria-label", u("cat"));
      s.appendChild(new Option(u("allCats"), "all"));
      var pc = poses.filter(function (x) { return st.filter === "all" || x.line === st.filter; });
      Object.keys(tally(pc, "cat")).forEach(function (k) { s.appendChild(new Option(t(k), k)); });
      s.value = st.cat;
      s.addEventListener("change", function () { st.cat = s.value; render(); });
      b.appendChild(s);
    }
    b.appendChild(searchBox());
    var c2 = el("span", "count"); c2.id = "count"; b.appendChild(c2);
  }

  function imgOf(x) {
    return isPose() ? x.angles[0].thumb : x.thumb;
  }
  function titleOf(x) {
    if (st.site === "portrait") return x.style ? t(x.hair) + "・" + t(x.style) : t(x.hair);
    if (isPose()) return t(x.name);
    return x.id;
  }
  function subOf(x) {
    if (st.site === "portrait") return x.w + "×" + x.h;
    if (isPose()) return x.no + " ・ " + t(x.cat);
    return t(x.cat) + " ・ " + kw(x.kw);
  }

  function thumb(src, alt, box) {
    var i = document.createElement("img");
    i.loading = "lazy"; i.decoding = "async"; i.alt = alt; i.src = src;
    box.appendChild(i);
  }

  function more() {
    var end = Math.min(shown + PAGE, list.length), f = document.createDocumentFragment();
    for (var i = shown; i < end; i++) (function (x, idx) {
      var li = el("li", "card"), b = el("button");
      b.type = "button";
      var box = el("div", "thumb");
      thumb(imgOf(x), titleOf(x), box);
      b.appendChild(box);
      var cap = el("div", "cap", titleOf(x));
      cap.appendChild(el("small", "", subOf(x)));
      b.appendChild(cap);
      b.addEventListener("click", function () { open(idx); });
      li.appendChild(b);
      f.appendChild(li);
    })(list[i], i);
    $("grid").appendChild(f);
    shown = end;
  }

  function open(i) { cur = i; angIdx = 0; $("modal").hidden = false; document.body.style.overflow = "hidden"; show(); }
  function close() { $("modal").hidden = true; $("pic").textContent = ""; document.body.style.overflow = ""; }
  function step(d) { var n = cur + d; if (n >= 0 && n < list.length) { cur = n; angIdx = 0; show(); } }

  function show() {
    var x = list[cur], pic = $("pic"), side = $("side");
    pic.textContent = ""; side.textContent = "";
    var shot = isPose() ? x.angles[angIdx] : x;
    var src = st.site === "costume" ? x.img : shot.full;
    var d = el("a", "btn", u("download") + (x.bytes ? "（" + mb(x.bytes) + "）" : ""));
    d.href = shot.full; d.setAttribute("download", st.site === "depth" ? shot.id + "_depth.png" : shot.full.split("/").pop());
    /* Local images first; a clone without them (e.g. GitHub Pages) falls back to the source site, then to the thumbnail */
    var origin = remote(shot.full);
    function toOrigin() { d.href = origin; d.removeAttribute("download"); d.target = "_blank"; d.rel = "noopener noreferrer"; }
    var tries = [src, remote(src), shot.thumb], k = 0;
    var im = document.createElement("img");
    im.alt = titleOf(x);
    im.onerror = function () { if (++k < tries.length) im.src = tries[k]; };
    im.src = tries[0];
    var probe = new Image(); probe.onerror = toOrigin; probe.src = shot.full;
    pic.appendChild(im);
    side.appendChild(el("h2", "", titleOf(x)));
    side.appendChild(el("p", "", x.id));
    side.appendChild(el("p", "", subOf(x)));
    if (isPose()) {
      side.appendChild(el("p", "", u("line") + "：" + t(x.line)));
      var w = el("div", "acts");
      x.angles.forEach(function (a, i) {
        w.appendChild(chip(t(a.ang), null, i === angIdx, function () { angIdx = i; show(); }));
      });
      side.appendChild(w);
    }
    var acts = el("div", "acts");
    acts.appendChild(d);
    var mk = function (lab, fn) { var b = el("button", "btn", lab); b.type = "button"; b.addEventListener("click", fn); return b; };
    acts.appendChild(mk(u("prev"), function () { step(-1); }));
    acts.appendChild(mk(u("next"), function () { step(1); }));
    acts.appendChild(mk(u("close"), close));
    side.appendChild(acts);
  }

  function about() {
    var s = window.SITE[st.site], d = s[st.lang], a = $("about");
    a.textContent = "";
    a.appendChild(el("p", "", d.intro));
    [["tips", d.tips], ["rules", d.rules]].forEach(function (p) {
      a.appendChild(el("h3", "", u(p[0])));
      var ul = el("ul");
      p[1].forEach(function (l) { ul.appendChild(el("li", "", l)); });
      a.appendChild(ul);
    });
    var src = el("a", "", s.url); src.href = s.url; src.target = "_blank"; src.rel = "noopener noreferrer";
    a.appendChild(src);
    $("aboutT").textContent = u("about");
  }

  function head() {
    document.documentElement.lang = st.lang;
    $("brand").textContent = u("brand");
    document.title = u("brand");
    var ss = $("sites"), ls = $("langs");
    ss.textContent = ""; ls.textContent = "";
    ["portrait", "costume", "pose", "depth"].forEach(function (k) {
      var b = el("button", "", u(k));
      b.type = "button"; b.setAttribute("aria-pressed", st.site === k ? "true" : "false");
      b.addEventListener("click", function () {
        st.site = k; st.filter = "all"; st.cat = "all"; st.q = ""; st.top = false;
        all();
      });
      ss.appendChild(b);
    });
    [["zh", "中文"], ["en", "EN"], ["ja", "日本語"]].forEach(function (p) {
      var b = el("button", "", p[1]);
      b.type = "button"; b.setAttribute("aria-pressed", st.lang === p[0] ? "true" : "false");
      b.addEventListener("click", function () { st.lang = p[0]; store("lang", p[0]); all(); });
      ls.appendChild(b);
    });
  }

  function all() { head(); bar(); about(); render(); }

  $("modal").addEventListener("click", function (e) { if (e.target === $("modal")) close(); });
  document.addEventListener("keydown", function (e) {
    if ($("modal").hidden) return;
    if (e.key === "Escape") close();
    else if (e.key === "ArrowLeft") step(-1);
    else if (e.key === "ArrowRight") step(1);
  });
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (es) { if (es[0].isIntersecting && shown < list.length) more(); }, { rootMargin: "600px" }).observe($("sentinel"));
  }
  all();
})();
