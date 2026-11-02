/* Mix tab: one face + one outfit + one pose, picked from the galleries or rolled at random, turned into a prompt and a numbered reference board */
(function () {
  "use strict";

  var A, box, booted = false, hist = [];
  var S = {
    f: "", c: "", p: "", ang: "正面", v: "line",
    lock: { f: false, c: false, p: false },
    range: { f: "face|all", c: "all", p: "全身1人・標準系" },
    target: "chat", mode: "multi", plang: "", aspect: "3:4", framing: "auto", extra: ""
  };
  var SIZE = { "3:4": [896, 1152], "2:3": [832, 1248], "4:5": [896, 1120], "9:16": [768, 1344], "1:1": [1024, 1024] };
  var ANG_SD = { "正面": "front view", "上から": "from above", "下から": "from below", "横": "from side", "斜め": "three-quarter view" };
  var CREATOR = "https://ai-creator.xprismai.com/";
  var by = {};

  function m() { return window.MIXT[A.lang()]; }
  function pl() { return S.plang || A.lang(); }
  function tr(ja, L) { if (L === "ja" || !ja) return ja; var e = window.T[ja]; return e ? e[L] : ja; }
  function kwL(s, L) {
    if (L === "en") return s;
    return s.split(" ").map(function (w) { return window.W[w] ? window.W[w][L] : w; }).join(L === "zh" ? " " : "・");
  }
  function fmt(s, o) { return s.replace(/\{(\w+)\}/g, function (_, k) { return o[k]; }); }
  function paren(s, L) { return L === "en" ? " (" + s + ")" : "（" + s + "）"; }

  function boot() {
    if (booted) return;
    booted = true;
    by.f = {}; window.PORTRAIT.forEach(function (x) { by.f[x.id] = x; });
    by.c = {}; window.COSTUME.forEach(function (x) { by.c[x.id] = x; });
    by.p = {}; A.groups.pose.forEach(function (x) { by.p[x.id] = x; });
    by.d = {}; A.groups.depth.forEach(function (x) { by.d[x.id] = x; });
    try { var o = JSON.parse(A.store("mix") || "{}"); Object.keys(o).forEach(function (k) { if (k in S) S[k] = o[k]; }); } catch (e) { /* keep defaults */ }
    var h = location.hash.match(/^#mix\?(.*)$/);
    if (h) h[1].split("&").forEach(function (kv) {
      var p = kv.split("="), k = p[0], v = decodeURIComponent(p[1] || "");
      if (k === "a") S.ang = v; else if (k === "f" || k === "c" || k === "p" || k === "v") S[k] = v;
    });
    if (["line", "depth", "both"].indexOf(S.v) < 0) S.v = "line";
    ["f", "c", "p"].forEach(function (k) { if (!by[k][S[k]]) roll(k); });
  }

  function pool(k) {
    var r = S.range[k];
    if (k === "f") {
      var q = r.split("|");
      return window.PORTRAIT.filter(function (x) { return x.sec === q[0] && (q[1] === "all" || x.hair === q[1]); });
    }
    if (k === "c") return window.COSTUME.filter(function (x) { return r === "all" || x.cat === r; });
    return A.groups.pose.filter(function (x) { return r === "all" || x.line === r; });
  }
  function roll(k) {
    var arr = pool(k), x, n = 0;
    if (!arr.length) return;
    do { x = arr[Math.floor(Math.random() * arr.length)]; } while (x.id === S[k] && arr.length > 1 && ++n < 9);
    S[k] = x.id;
  }
  function snap() { return JSON.stringify({ f: S.f, c: S.c, p: S.p, ang: S.ang, v: S.v }); }
  function remember() { hist.push(snap()); if (hist.length > 50) hist.shift(); }
  function rollAll() { remember(); ["f", "c", "p"].forEach(function (k) { if (!S.lock[k]) roll(k); }); changed(); }
  function back() {
    var h = hist.pop();
    if (!h) return;
    var o = JSON.parse(h);
    Object.keys(o).forEach(function (k) { S[k] = o[k]; });
    changed();
  }
  function query() { return "#mix?f=" + S.f + "&c=" + S.c + "&p=" + S.p + "&a=" + encodeURIComponent(S.ang) + "&v=" + S.v; }
  function save() {
    A.store("mix", JSON.stringify(S));
    if (A.site() === "mix") try { history.replaceState(null, "", query()); } catch (e) { /* file:// in some browsers */ }
  }
  function changed() { save(); draw(); A.rebar(); }

  /* Called from a gallery's detail view: put that item in its slot and lock it */
  function put(site, x, ai) {
    boot();
    remember();
    if (site === "portrait") { S.f = x.id; S.lock.f = true; }
    else if (site === "costume") { S.c = x.id; S.lock.c = true; }
    else {
      S.p = x.id; S.ang = x.angles[ai].ang; S.lock.p = true;
      if (site === "depth" && S.v === "line") S.v = "depth";
      if (site === "pose" && S.v === "depth") S.v = "line";
    }
    save();
  }

  function cur() { return { f: by.f[S.f], c: by.c[S.c], p: by.p[S.p], d: by.d[S.p] }; }
  function shot(g) {
    for (var i = 0; i < g.angles.length; i++) if (g.angles[i].ang === S.ang) return g.angles[i];
    return g.angles[0];
  }
  /* Reference images in prompt order; n is the number used in the prompt and on the board */
  function refs() {
    var x = cur(), out = [
      { k: "f", site: "portrait", id: x.f.id, mid: x.f.full, full: x.f.full, thumb: x.f.thumb },
      { k: "c", site: "costume", id: x.c.id, mid: x.c.img, full: x.c.full, thumb: x.c.thumb }
    ];
    if (S.v !== "depth") { var a = shot(x.p); out.push({ k: "p", site: "pose", id: a.id, mid: a.full, full: a.full, thumb: a.thumb }); }
    if (S.v !== "line") { var b = shot(x.d); out.push({ k: "d", site: "depth", id: b.id + "_depth", mid: b.full, full: b.full, thumb: b.thumb }); }
    out.forEach(function (r, i) { r.n = i + 1; });
    return out;
  }
  function frame() {
    if (S.framing !== "auto") return S.framing;
    return cur().p.line === "上半身1人" ? "upper" : "full";
  }

  function descF(L) { var f = cur().f; return [window.UI[L][f.sec], tr(f.hair, L), tr(f.style, L)].filter(Boolean).join(" · "); }
  function descC(L) { var c = cur().c; return tr(c.cat, L) + " · " + kwL(c.kw, L); }
  function descP(L) { var p = cur().p; return tr(p.name, L) + paren([tr(p.line, L), tr(p.cat, L), tr(S.ang, L)].join(" · "), L); }

  function chat(L) {
    var P = window.MIXT[L].p, R = refs(), x = cur(), num = {};
    var lines = [P.head, "", S.mode === "board" ? P.refsBoard : P.refsMulti];
    R.forEach(function (r) {
      num[r.k] = r.n;
      var d = r.k === "f" ? descF(L) : r.k === "c" ? descC(L) : r.k === "p" ? descP(L) + P.sep + P.lineArt
        : (num.p ? fmt(P.dSame, { n: num.p }) : descP(L)) + P.sep + P.depthArt;
      lines.push(fmt(P.img, { n: r.n }) + " " + P[r.k] + P.colon + d);
    });
    var a = tr(S.ang, L), req = [P.adult, fmt(P.rf, { n: num.f }), fmt(P.rc, { n: num.c })];
    if (num.p) req.push(fmt(P.rp, { n: num.p, a: a }));
    if (num.d) req.push(num.p ? fmt(P.rd, { n: num.d }) : fmt(P.rpd, { n: num.d, a: a }));
    if (x.p.line === "2人絡み") req.push(P.two);
    req.push(fmt(P.out, { r: S.aspect, fr: P[frame()] }));
    req.push(P.no);
    if (S.mode === "board") req.push(P.noBoard);
    lines.push("", P.req);
    req.forEach(function (s, i) { lines.push((i + 1) + ". " + s); });
    if (S.extra.trim()) lines.push("", P.extra + S.extra.trim());
    lines.push("", P.ids + P.colon + R.map(function (r) { return r.id; }).join(" / "));
    return lines.join("\n");
  }

  /* Tag prompts stay in English (that is what SD models read); only the setup notes follow the prompt language */
  function sd(L) {
    var P = window.MIXT[L].p, R = refs(), x = cur(), two = x.p.line === "2人絡み";
    var low = function (ja) { return (tr(ja, "en") || "").toLowerCase(); };
    var pos = [two ? "two adults" : "1 adult woman, solo", low(x.f.hair) + " hair", low(x.f.style),
      "wearing " + x.c.kw, low(x.p.name), ANG_SD[S.ang],
      { full: "full body", knee: "cowboy shot", upper: "upper body" }[frame()],
      "plain studio background, soft lighting, photorealistic, detailed skin, sharp focus"];
    if (S.extra.trim()) pos.push(S.extra.trim());
    var neg = "text, watermark, logo, " + (two ? "" : "extra people, ") + "extra fingers, deformed hands, bad anatomy, mannequin, line art, grey skin, lowres, blurry";
    var wh = SIZE[S.aspect], lines = ["Positive:", pos.filter(Boolean).join(", "), "", "Negative:", neg, "", P.setup];
    R.forEach(function (r) { lines.push("- " + fmt(P["s" + r.k], { n: r.n })); });
    lines.push("- " + fmt(P.size, { w: wh[0], h: wh[1], r: S.aspect }));
    lines.push("", P.ids + P.colon + R.map(function (r) { return r.id; }).join(" / "));
    return lines.join("\n");
  }
  function prompt() { return S.target === "sd" ? sd(pl()) : chat(pl()); }

  /* Board: originals side by side at their own aspect, a small number badge on each and no captions, so models don't copy text into the result */
  function img1(src, cors) {
    return new Promise(function (ok, no) {
      var im = new Image();
      if (cors) im.crossOrigin = "anonymous";
      im.onload = function () { ok(im); };
      im.onerror = no;
      im.src = src;
    });
  }
  function first(list) {
    var i = 0;
    function next() { if (i >= list.length) return Promise.resolve(null); var s = list[i++]; return img1(s[0], s[1]).catch(next); }
    return next();
  }
  function board() {
    var R = refs(), file = location.protocol === "file:";
    return Promise.all(R.map(function (r) {
      var rem = [A.remote(r.site, r.mid), true], loc = [r.mid, false];
      /* file:// pages can't export canvases holding local files, so they try the CORS-enabled source site first */
      return first(file ? [rem, loc, [r.thumb, false]] : [loc, rem, [r.thumb, false]]);
    })).then(function (ims) {
      var H = 1024, G = 16, PAD = 24, W = PAD * 2 - G;
      var ws = ims.map(function (im) { var w = im ? Math.round(im.naturalWidth * H / im.naturalHeight) : H * 3 / 4; W += w + G; return w; });
      var c = document.createElement("canvas"), g = c.getContext("2d"), x = PAD;
      c.width = W; c.height = H + PAD * 2;
      g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
      ims.forEach(function (im, i) {
        if (im) g.drawImage(im, x, PAD, ws[i], H); else { g.fillStyle = "#e5e5e5"; g.fillRect(x, PAD, ws[i], H); }
        g.fillStyle = "rgba(20,20,24,.78)"; g.beginPath(); g.arc(x + 44, PAD + 44, 28, 0, Math.PI * 2); g.fill();
        g.fillStyle = "#fff"; g.font = "700 30px system-ui,sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
        g.fillText(String(i + 1), x + 44, PAD + 46);
        x += ws[i] + G;
      });
      return new Promise(function (ok, no) {
        try { c.toBlob(function (b) { if (b) ok(b); else no(new Error("blob")); }, "image/png"); } catch (e) { no(e); }
      });
    });
  }
  function boardName() { return "mix_" + refs().map(function (r) { return r.id; }).join("_") + ".png"; }

  function flash(b, txt, ms) { var o = b.textContent; b.textContent = txt; b.disabled = true; setTimeout(function () { b.textContent = o; b.disabled = false; }, ms || 1600); }
  function copyText(text, b) {
    function legacy() {
      var ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
      ta.remove();
      flash(b, ok ? m().copied : m().failed, ok ? 1600 : 2600);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { flash(b, m().copied); }, legacy);
    else legacy();
  }
  function saveBlob(blob) {
    var url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = boardName();
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 3000);
  }
  function boardAction(b, copy) {
    var o = b.textContent;
    b.textContent = m().making; b.disabled = true;
    board().then(function (blob) {
      if (copy && navigator.clipboard && window.ClipboardItem) {
        return navigator.clipboard.write([new window.ClipboardItem({ "image/png": blob })]).then(function () { return m().copied; });
      }
      saveBlob(blob);
      return m().saved;
    }).then(function (msg) {
      b.textContent = o; b.disabled = false; flash(b, msg);
    }, function () {
      b.textContent = o; b.disabled = false;
      $note().textContent = m().boardFail;
    });
  }
  function $note() { return box.querySelector(".mix-note"); }

  /* ---------- UI ---------- */
  function btn(label, cls, fn) { var b = A.el("button", cls, label); b.type = "button"; b.addEventListener("click", fn); return b; }
  function select(label, opts, val, fn) {
    var s = document.createElement("select");
    s.setAttribute("aria-label", label);
    opts.forEach(function (o) { s.appendChild(new Option(o[1], o[0])); });
    s.value = val;
    s.addEventListener("change", function () { fn(s.value); });
    return s;
  }
  function field(label, node) { var l = A.el("div", "mix-f"); l.appendChild(A.el("span", "", label)); l.appendChild(node); return l; }
  function seg(opts, val, fn) {
    var w = A.el("div", "seg");
    opts.forEach(function (o) {
      var b = btn(o[1], "", function () { fn(o[0]); });
      b.setAttribute("aria-pressed", o[0] === val ? "true" : "false");
      w.appendChild(b);
    });
    return w;
  }

  function ranges(k) {
    var L = A.lang(), U = window.UI[L];
    if (k === "f") {
      var o = [["face|all", U.face + " · " + U.all]];
      ["ショート", "ミディアム", "セミロング", "ロング"].forEach(function (h) { o.push(["face|" + h, U.face + " · " + tr(h, L)]); });
      return o.concat([["styling|all", U.styling]]);
    }
    var keys = {}, src = k === "c" ? window.COSTUME : A.groups.pose, fld = k === "c" ? "cat" : "line";
    src.forEach(function (x) { keys[x[fld]] = 1; });
    return [["all", U.all]].concat(Object.keys(keys).map(function (x) { return [x, tr(x, L)]; }));
  }

  function slot(k, title, thumb, site, full, desc, id, extra) {
    var M = m(), s = A.el("section", "slot" + (S.lock[k] ? " on" : "")), h = A.el("div", "slot-h");
    h.appendChild(A.el("b", "", title));
    h.appendChild(select(M.range, ranges(k), S.range[k], function (v) { S.range[k] = v; remember(); roll(k); changed(); }));
    var lk = btn(S.lock[k] ? M.locked : M.lock, "chip", function () { S.lock[k] = !S.lock[k]; changed(); });
    lk.setAttribute("aria-pressed", S.lock[k] ? "true" : "false");
    h.appendChild(lk);
    h.appendChild(btn(M.one, "chip", function () { remember(); roll(k); changed(); }));
    s.appendChild(h);
    var a = A.el("a", "ph");
    a.title = M.open;
    A.full(a, site, full);
    var im = document.createElement("img");
    im.src = thumb; im.alt = desc;
    a.appendChild(im);
    s.appendChild(a);
    var p = A.el("p", "slot-d", desc);
    p.appendChild(A.el("small", "", id));
    s.appendChild(p);
    if (extra) s.appendChild(extra);
    return s;
  }

  function draw() {
    if (!box) return;
    var M = m(), L = A.lang(), x = cur(), R = refs();
    box.textContent = "";

    var po = A.el("div", "slot-x"), angs = A.el("div", "acts");
    shot(x.p) && x.p.angles.forEach(function (g) {
      var b = btn(tr(g.ang, L), "chip", function () { remember(); S.ang = g.ang; changed(); });
      b.setAttribute("aria-pressed", g.ang === shot(x.p).ang ? "true" : "false");
      angs.appendChild(b);
    });
    po.appendChild(angs);
    po.appendChild(field(M.view, seg([["line", M.line], ["depth", M.depth], ["both", M.both]], S.v, function (v) { remember(); S.v = v; changed(); })));
    var ps = shot(S.v === "depth" ? x.d : x.p);

    var slots = A.el("div", "slots");
    slots.appendChild(slot("f", M.face, x.f.thumb, "portrait", x.f.full, descF(L), x.f.id));
    slots.appendChild(slot("c", M.costume, x.c.thumb, "costume", x.c.full, descC(L), x.c.id));
    slots.appendChild(slot("p", M.pose, ps.thumb, S.v === "depth" ? "depth" : "pose", ps.full, descP(L), ps.id, po));
    box.appendChild(slots);

    var pr = A.el("section", "mix-p"), row = A.el("div", "mix-row");
    pr.appendChild(A.el("h2", "", M.promptH));
    row.appendChild(field(M.target, seg([["chat", M.chat], ["sd", M.sd]], S.target, function (v) { S.target = v; changed(); })));
    if (S.target === "chat") row.appendChild(field(M.mode, seg([["multi", M.multi], ["board", M.board]], S.mode, function (v) { S.mode = v; changed(); })));
    row.appendChild(field(M.plang, select(M.plang, [["", M.auto], ["zh", "中文"], ["en", "English"], ["ja", "日本語"]], S.plang, function (v) { S.plang = v; changed(); })));
    row.appendChild(field(M.aspect, select(M.aspect, Object.keys(SIZE).map(function (k) { return [k, k]; }), S.aspect, function (v) { S.aspect = v; changed(); })));
    row.appendChild(field(M.framing, select(M.framing, [["auto", M.fAuto], ["full", M.full], ["knee", M.knee], ["upper", M.upper]], S.framing, function (v) { S.framing = v; changed(); })));
    pr.appendChild(row);

    var ex = document.createElement("input");
    ex.type = "text"; ex.value = S.extra; ex.placeholder = M.extraPh;
    ex.addEventListener("input", function () { S.extra = ex.value; ta.value = prompt(); save(); });
    var exf = field(M.extra, ex); exf.className = "mix-f mix-wide";
    pr.appendChild(exf);

    var ta = document.createElement("textarea");
    ta.value = prompt(); ta.rows = 14; ta.setAttribute("aria-label", M.promptH); ta.spellcheck = false;
    pr.appendChild(ta);
    pr.appendChild(A.el("p", "mix-hint", M.editHint));

    var acts = A.el("div", "acts");
    acts.appendChild(btn(M.copy, "btn pri", function () { copyText(ta.value, this); }));
    acts.appendChild(btn(M.saveBoard, "btn", function () { boardAction(this, false); }));
    if (window.ClipboardItem) acts.appendChild(btn(M.copyBoard, "btn", function () { boardAction(this, true); }));
    var cr = A.el("a", "btn", M.creator);
    cr.href = CREATOR; cr.target = "_blank"; cr.rel = "noopener";
    acts.appendChild(cr);
    pr.appendChild(acts);

    var ol = A.el("p", "mix-hint", M.originals);
    R.forEach(function (r) {
      var a = A.el("a", "", " " + r.n + " ");
      A.full(a, r.site, r.full);
      ol.appendChild(a);
    });
    pr.appendChild(ol);
    pr.appendChild(A.el("p", "mix-note", M.boardNote));
    box.appendChild(pr);
  }

  function bar(b) {
    var M = m();
    b.appendChild(btn(M.roll, "chip pri", rollAll));
    var pv = btn(M.prev, "chip", back);
    pv.disabled = !hist.length;
    b.appendChild(pv);
    b.appendChild(btn(M.link, "chip", function () { copyText(location.href.split("#")[0] + query(), this); }));
    b.appendChild(A.el("span", "count", M.rollHint));
  }

  function key(e) {
    var tg = e.target && e.target.tagName;
    if (e.key !== " " || /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(tg)) return;
    e.preventDefault();
    rollAll();
  }

  window.Mix = {
    init: function (app) { A = app; },
    show: function (el) { box = el; boot(); save(); draw(); },
    bar: function (b) { boot(); bar(b); },
    put: put,
    key: key
  };
})();
