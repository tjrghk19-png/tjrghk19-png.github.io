/* 지농 퀴즈 — 지역농협·공기업 대비 4천 문제 */
(function () {
  'use strict';

  var CAT = {
    lang: { name: '국어', full: '국어 · 맞춤법·사자성어·어휘', emoji: '📖', color: '#2563eb' },
    sisa: { name: '시사·경제', full: '시사·경제·금융·농협 상식', emoji: '🌾', color: '#0f9d58' },
    ncs:  { name: 'NCS 수리', full: 'NCS 수리·자료해석·추리', emoji: '🧮', color: '#7c3aed' }
  };
  var DAILY_PLAN = [['lang', 6], ['sisa', 6], ['ncs', 8]];
  var KEY = 'jq_v1';

  var S = {
    data: { lang: [], sisa: [], ncs: [] },
    index: {},
    store: null,
    tab: 'home',
    quiz: null,
    filter: 'all'
  };

  var shell, toastEl, toastTimer;

  /* ───────── 저장소 ───────── */
  function freshStore() {
    return { v: 1, wrong: {}, book: {}, stats: { answered: 0, correct: 0, byCat: {} }, history: {} };
  }
  function loadStore() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return freshStore();
      var o = JSON.parse(raw);
      if (!o || typeof o !== 'object') return freshStore();
      o.wrong = o.wrong || {}; o.book = o.book || {}; o.history = o.history || {};
      o.stats = o.stats || { answered: 0, correct: 0, byCat: {} };
      o.stats.byCat = o.stats.byCat || {};
      return o;
    } catch (e) { return freshStore(); }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S.store)); } catch (e) {}
  }

  /* ───────── 유틸 ───────── */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function todayKey(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function hashStr(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function shuffle(arr, rnd) {
    rnd = rnd || Math.random;
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function sampleN(arr, n, rnd) {
    var a = shuffle(arr, rnd);
    return a.slice(0, Math.min(n, a.length));
  }
  function pct(a, b) { return b ? Math.round(a / b * 100) : 0; }
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 1600);
  }

  /* ───────── 데이터 ───────── */
  function loadData() {
    var files = ['lang', 'sisa', 'ncs'];
    return Promise.all(files.map(function (k) {
      return fetch('data/' + k + '.json')
        .then(function (r) { if (!r.ok) throw new Error(k + ' ' + r.status); return r.json(); })
        .then(function (j) { S.data[k] = j; });
    })).then(function () {
      var n = 0;
      Object.keys(S.data).forEach(function (k) {
        S.data[k].forEach(function (q) { S.index[q.id] = q; n++; });
      });
      return n;
    });
  }
  function allQuestions() { return S.data.lang.concat(S.data.sisa, S.data.ncs); }
  function totalCount() { return S.data.lang.length + S.data.sisa.length + S.data.ncs.length; }

  /* ───────── 오늘의 퀴즈 ───────── */
  function buildDaily(dateStr) {
    var rnd = mulberry32(hashStr('daily|' + dateStr));
    var out = [];
    DAILY_PLAN.forEach(function (p) {
      var pool = S.data[p[0]];
      if (!pool.length) return;
      out = out.concat(sampleN(pool, p[1], rnd));
    });
    return shuffle(out, rnd);
  }

  /* ───────── 화면 ───────── */
  function tabbar() {
    var tabs = [
      ['home', '홈', '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>'],
      ['wrong', '오답노트', '<path d="M9 3h6l1 3h4v15H4V6h4z"/><path d="M9 11h6M9 15h4"/>'],
      ['book', '북마크', '<path d="M6 3h12v18l-6-4.5L6 21z"/>'],
      ['stats', '통계', '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>']
    ];
    return '<nav class="tabbar">' + tabs.map(function (t) {
      return '<button data-act="tab" data-tab="' + t[0] + '" class="' + (S.tab === t[0] && !S.quiz ? 'on' : '') + '">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">' + t[2] + '</svg>' +
        '<span>' + t[1] + '</span></button>';
    }).join('') + '</nav>';
  }

  function appbar(title, sub, left) {
    return '<header class="appbar">' +
      (left ? left : '') +
      '<div class="grow"><h1>' + title + '</h1>' + (sub ? '<div class="sub">' + sub + '</div>' : '') + '</div>' +
      '</header>';
  }

  function renderHome() {
    S.quiz = null;
    var today = todayKey();
    var d = new Date();
    var wd = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
    var rec = S.store.history[today];
    var wrongN = Object.keys(S.store.wrong).length;
    var bookN = Object.keys(S.store.book).length;
    var st = S.store.stats;
    var total = totalCount();

    var html = appbar('지농 퀴즈', '전체 ' + total.toLocaleString() + '문제 수록');
    html += '<main>';
    html += '<section class="hero">' +
      '<div class="date">' + d.getFullYear() + '년 ' + (d.getMonth() + 1) + '월 ' + d.getDate() + '일 ' + wd + '요일</div>' +
      '<h2>' + (rec ? '오늘의 퀴즈 완료 🎉' : '오늘의 퀴즈 20문제') + '</h2>' +
      '<p>' + (rec
        ? '점수 ' + rec[0] + ' / ' + rec[1] + ' · ' + (rec[0] === rec[1] ? '완벽해요!' : '틀린 문제는 오답노트에 담겼어요')
        : '국어 6 · 시사·경제 6 · NCS 8문제 — 매일 새로 바뀝니다') + '</p>' +
      '<div class="row">' +
      '<button class="btn light" data-act="daily">' + (rec ? '한 번 더 풀기' : '시작하기') + '</button>' +
      (rec ? '<button class="btn" style="background:rgba(255,255,255,.16)" data-act="tab" data-tab="wrong">오답노트 ' + wrongN + '</button>' : '') +
      '</div></section>';

    html += '<h2 class="sec">분야별 무제한 풀이</h2><div class="grid2">';
    Object.keys(CAT).forEach(function (k) {
      var c = CAT[k];
      html += '<button class="catcard" data-act="cat" data-cat="' + k + '">' +
        '<div class="emoji">' + c.emoji + '</div>' +
        '<div class="name">' + c.name + '</div>' +
        '<div class="cnt">' + S.data[k].length.toLocaleString() + '문제</div>' +
        '<div class="bar"><i style="width:' + Math.max(8, pct(S.data[k].length, total)) + '%;background:' + c.color + '"></i></div>' +
        '</button>';
    });
    html += '<button class="catcard" data-act="cat" data-cat="all">' +
      '<div class="emoji">🎲</div><div class="name">전체 랜덤</div>' +
      '<div class="cnt">' + total.toLocaleString() + '문제를 섞어서 무한으로</div></button>';
    html += '</div>';

    html += '<h2 class="sec">내 기록</h2><div class="stat">' +
      '<div><b>' + st.answered.toLocaleString() + '</b><span>푼 문제</span></div>' +
      '<div><b>' + pct(st.correct, st.answered) + '%</b><span>정답률</span></div>' +
      '<div><b>' + wrongN + '</b><span>오답노트</span></div>' +
      '</div>';

    html += '<div class="card" style="margin-top:12px"><div class="note" style="margin:0">' +
      '<b>홈 화면에 추가하기</b><br>아이폰 사파리 → 공유 버튼 → <span class="kbd">홈 화면에 추가</span><br>' +
      '안드로이드 크롬 → 우측 상단 ⋮ → <span class="kbd">홈 화면에 추가</span><br>' +
      'PC 크롬 → 주소창 오른쪽 설치 아이콘' +
      '</div></div>';

    html += '</main>';
    return html + tabbar();
  }

  function renderQuiz() {
    var q = S.quiz;
    var item = q.qs[q.i];
    if (!item) return renderResult();
    var picked = q.picks[q.i];
    var answered = picked !== undefined && picked !== null;
    var sub = item.sub || CAT[item.cat].name;
    var bookOn = !!S.store.book[item.id];

    var html = appbar(
      q.title,
      (q.i + 1) + ' / ' + (q.qs.length === Infinity ? '∞' : q.qs.length) + ' 문제',
      '<button class="iconbtn" data-act="quit" aria-label="나가기">' +
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M15 5l-7 7 7 7"/></svg></button>'
    );
    html += '<main>';
    html += '<div class="qtop"><span class="cnt">' + (q.i + 1) + ' / ' + q.qs.length + '</span>' +
      '<div class="progress"><i style="width:' + pct(q.i + (answered ? 1 : 0), q.qs.length) + '%"></i></div>' +
      '<button class="iconbtn starbtn ' + (bookOn ? 'on' : '') + '" data-act="bookmark" aria-label="북마크">' +
      '<svg width="21" height="21" viewBox="0 0 24 24" fill="' + (bookOn ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M6 3h12v18l-6-4.5L6 21z"/></svg></button>' +
      '</div>';
    html += '<span class="tag">' + esc(sub) + '</span>';
    html += '<div class="qtext">' + esc(item.q) + '</div>';
    html += '<div class="opts">';
    item.c.forEach(function (opt, i) {
      var cls = 'opt';
      if (answered) {
        if (i === item.a) cls += ' correct';
        else if (i === picked) cls += ' wrong';
      }
      html += '<button class="' + cls + '" data-act="pick" data-i="' + i + '"' + (answered ? ' disabled' : '') + '>' +
        '<span class="no">' + (i + 1) + '</span><span>' + esc(opt) + '</span></button>';
    });
    html += '</div>';

    if (answered) {
      var ok = picked === item.a;
      html += '<div class="expl"><div class="head" style="color:' + (ok ? 'var(--green)' : 'var(--red)') + '">' +
        (ok ? '✅ 정답입니다' : '❌ 오답 — 정답은 ' + (item.a + 1) + '번') + '</div>' + esc(item.e) + '</div>';
      html += '<div class="qfoot"><button class="btn wide" data-act="next">' +
        (q.i + 1 >= q.qs.length ? '결과 보기' : '다음 문제') + ' →</button></div>';
    }
    html += '</main>';
    return html + tabbar();
  }

  function renderResult() {
    var q = S.quiz;
    var n = q.picks.filter(function (p) { return p !== undefined && p !== null; }).length;
    var right = 0, wrongList = [];
    q.qs.forEach(function (item, i) {
      if (q.picks[i] === item.a) right++;
      else if (q.picks[i] !== undefined && q.picks[i] !== null) wrongList.push(item);
    });
    var rate = pct(right, n);
    var msg = rate >= 90 ? '완벽에 가까워요! 이대로만 가요 🔥'
      : rate >= 70 ? '좋아요. 틀린 문제만 다시 보면 됩니다 💪'
      : rate >= 50 ? '절반 넘게 맞혔어요. 오답노트를 꼭 봐요 📝'
      : '괜찮아요. 오답노트부터 천천히 되짚어 봐요 🌱';

    var html = appbar(q.title, '결과');
    html += '<main><div class="card"><div class="result">' +
      '<div class="score">' + right + '<small> / ' + n + '</small></div>' +
      '<div class="msg">' + msg + '</div></div>' +
      '<div class="stat" style="margin-top:16px">' +
      '<div><b>' + rate + '%</b><span>정답률</span></div>' +
      '<div><b>' + (n - right) + '</b><span>틀린 문제</span></div>' +
      '<div><b>' + Object.keys(S.store.wrong).length + '</b><span>오답노트</span></div>' +
      '</div>' +
      '<div style="margin-top:16px;display:grid;gap:9px">' +
      '<button class="btn wide" data-act="again">한 번 더 풀기</button>' +
      '<button class="btn wide ghost" data-act="home">홈으로</button>' +
      '</div></div>';

    if (wrongList.length) {
      html += '<h2 class="sec">틀린 문제</h2><div class="card" style="padding:4px 14px">';
      wrongList.forEach(function (item) {
        html += '<div class="listitem"><div class="t">' + esc(item.q) +
          '<div class="m">정답: ' + esc(item.c[item.a]) + '</div></div></div>';
      });
      html += '</div>';
    }
    html += '</main>';
    return html + tabbar();
  }

  function renderWrong() {
    S.quiz = null;
    var ids = Object.keys(S.store.wrong).sort(function (a, b) {
      return (S.store.wrong[b].t || 0) - (S.store.wrong[a].t || 0);
    });
    var html = appbar('오답노트', ids.length + '문제');
    html += '<main>';
    if (!ids.length) {
      html += '<div class="empty"><div class="big">🗂️</div>아직 틀린 문제가 없어요.<br>퀴즈를 풀면 자동으로 쌓입니다.</div>';
      html += '</main>' + tabbar();
      return html;
    }
    html += '<div style="display:grid;gap:9px;margin-bottom:14px">' +
      '<button class="btn wide" data-act="wrong-start">오답 다시 풀기 (' + Math.min(30, ids.length) + '문제)</button>' +
      '<button class="btn wide ghost" data-act="wrong-clear" style="padding:9px">오답노트 비우기</button></div>';
    html += '<div class="card" style="padding:4px 14px">';
    ids.forEach(function (id) {
      var item = S.index[id];
      if (!item) return;
      var w = S.store.wrong[id];
      html += '<div class="listitem" data-act="solve" data-id="' + item.id + '" role="button" tabindex="0" style="cursor:pointer">' +
        '<div class="t">' + esc(item.q) + '<div class="m">' + esc(item.sub || '') + ' · 정답 ' + (item.a + 1) + '번' +
        (w.n > 1 ? ' · ' + w.n + '회 틀림' : '') + '</div></div></div>';
    });
    html += '</div></main>';
    return html + tabbar();
  }

  function renderBook() {
    S.quiz = null;
    var ids = Object.keys(S.store.book);
    var html = appbar('북마크', ids.length + '문제');
    html += '<main>';
    if (!ids.length) {
      html += '<div class="empty"><div class="big">🔖</div>문제 화면의 별 버튼을 누르면<br>여기에 저장됩니다.</div>';
      html += '</main>' + tabbar();
      return html;
    }
    html += '<div style="margin-bottom:14px"><button class="btn wide" data-act="book-start">북마크 문제 풀기</button></div>';
    html += '<div class="card" style="padding:4px 14px">';
    ids.forEach(function (id) {
      var item = S.index[id];
      if (!item) return;
      html += '<div class="listitem"><div class="t">' + esc(item.q) +
        '<div class="m">' + esc(item.sub || '') + '</div></div>' +
        '<button class="iconbtn starbtn on" data-act="unbook" data-id="' + id + '" aria-label="북마크 해제">' +
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M6 3h12v18l-6-4.5L6 21z"/></svg></button></div>';
    });
    html += '</div></main>';
    return html + tabbar();
  }

  function renderStats() {
    S.quiz = null;
    var st = S.store.stats;
    var html = appbar('통계', '학습 기록은 이 기기에 저장됩니다');
    html += '<main>';
    html += '<div class="stat">' +
      '<div><b>' + st.answered.toLocaleString() + '</b><span>푼 문제</span></div>' +
      '<div><b>' + st.correct.toLocaleString() + '</b><span>맞힌 문제</span></div>' +
      '<div><b>' + pct(st.correct, st.answered) + '%</b><span>정답률</span></div></div>';

    html += '<h2 class="sec">분야별 정답률</h2><div class="card">';
    Object.keys(CAT).forEach(function (k) {
      var b = st.byCat[k] || { a: 0, c: 0 };
      html += '<div style="padding:9px 0;border-bottom:1px solid var(--line)">' +
        '<div style="display:flex;justify-content:space-between;font-size:14px;font-weight:700">' +
        '<span>' + CAT[k].emoji + ' ' + CAT[k].name + '</span><span>' +
        (b.a ? pct(b.c, b.a) + '% · ' + b.a + '문제' : '기록 없음') + '</span></div>' +
        '<div class="progress" style="margin-top:7px"><i style="width:' + pct(b.c, b.a) + '%;background:' + CAT[k].color + '"></i></div></div>';
    });
    html += '</div>';

    var days = Object.keys(S.store.history).sort();
    var streak = 0, cur = new Date();
    for (var i = 0; i < 400; i++) {
      var k = todayKey(cur);
      if (S.store.history[k]) { streak++; cur.setDate(cur.getDate() - 1); }
      else break;
    }
    html += '<h2 class="sec">데일리 퀴즈</h2><div class="card">' +
      '<div style="display:flex;gap:10px">' +
      '<div style="flex:1;text-align:center"><b style="font-size:20px">' + streak + '</b><div class="note" style="margin:0">연속 일수</div></div>' +
      '<div style="flex:1;text-align:center"><b style="font-size:20px">' + days.length + '</b><div class="note" style="margin:0">완료한 날</div></div>' +
      '</div>';
    if (days.length) {
      html += '<div style="margin-top:12px;font-size:13px;color:var(--muted)">최근 기록</div>';
      days.slice(-7).reverse().forEach(function (d) {
        var r = S.store.history[d];
        html += '<div style="display:flex;justify-content:space-between;font-size:13.5px;padding:5px 0;border-bottom:1px solid var(--line)">' +
          '<span>' + d + '</span><span style="font-weight:700">' + r[0] + ' / ' + r[1] + '</span></div>';
      });
    }
    html += '</div>';
    html += '<div class="note" style="margin-top:14px">전체 ' + totalCount().toLocaleString() + '문제 · 기록은 브라우저에만 저장되고 서버로 보내지 않습니다.</div>';
    html += '</main>';
    return html + tabbar();
  }

  function render() {
    if (S.quiz) shell.innerHTML = renderQuiz();
    else if (S.tab === 'home') shell.innerHTML = renderHome();
    else if (S.tab === 'wrong') shell.innerHTML = renderWrong();
    else if (S.tab === 'book') shell.innerHTML = renderBook();
    else shell.innerHTML = renderStats();
    window.scrollTo(0, 0);
  }

  /* ───────── 퀴즈 진행 ───────── */
  function startQuiz(qs, opts) {
    if (!qs.length) { toast('문제가 없습니다'); return; }
    S.quiz = { qs: qs, i: 0, picks: new Array(qs.length), title: opts.title, mode: opts.mode || 'normal' };
    render();
  }

  function pick(i) {
    var q = S.quiz;
    if (!q || q.picks[q.i] !== undefined) return;
    var item = q.qs[q.i];
    var ok = (i === item.a);
    q.picks[q.i] = i;
    S.store.stats.answered++;
    var bc = S.store.stats.byCat[item.cat] = S.store.stats.byCat[item.cat] || { a: 0, c: 0 };
    bc.a++;
    if (ok) {
      S.store.stats.correct++;
      bc.c++;
      if (S.store.wrong[item.id] && q.mode === 'wrong') delete S.store.wrong[item.id];
      else if (S.store.wrong[item.id]) S.store.wrong[item.id].ok = 1;
    } else {
      var w = S.store.wrong[item.id] || { n: 0, t: 0 };
      w.n++; w.t = Date.now(); w.ok = 0;
      S.store.wrong[item.id] = w;
    }
    save();
    render();
    var ex = shell.querySelector('.expl');
    if (ex) { try { ex.scrollIntoView({ block: 'nearest' }); } catch (err) {} }
  }

  function next() {
    var q = S.quiz;
    if (!q) return;
    if (q.i + 1 >= q.qs.length) {
      if (q.mode === 'daily') {
        var right = 0;
        q.qs.forEach(function (item, i) { if (q.picks[i] === item.a) right++; });
        S.store.history[todayKey()] = [right, q.qs.length];
        save();
      }
      q.finished = true;
      S.finishedQuiz = q;
      shell.innerHTML = renderResult();
      window.scrollTo(0, 0);
      return;
    }
    q.i++;
    render();
  }

  /* ───────── 이벤트 ───────── */
  function onClick(e) {
    var el = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
    if (!el) return;
    var act = el.getAttribute('data-act');

    if (act === 'tab') {
      if (S.quiz && !S.finishedQuiz) {
        if (!confirm('풀던 문제를 그만둘까요? 기록은 저장됩니다.')) return;
      }
      S.quiz = null; S.finishedQuiz = null;
      S.tab = el.getAttribute('data-tab');
      render(); return;
    }
    if (act === 'daily') {
      S.tab = 'home';
      startQuiz(buildDaily(todayKey()), { title: '오늘의 퀴즈', mode: 'daily' });
      return;
    }
    if (act === 'cat') {
      var c = el.getAttribute('data-cat');
      var pool = c === 'all' ? allQuestions() : S.data[c];
      startQuiz(shuffle(pool), { title: c === 'all' ? '전체 랜덤' : CAT[c].name, mode: 'free' });
      return;
    }
    if (act === 'pick') { pick(parseInt(el.getAttribute('data-i'), 10)); return; }
    if (act === 'next') { next(); return; }
    if (act === 'quit') {
      if (!confirm('풀던 문제를 그만둘까요? 기록은 저장됩니다.')) return;
      S.quiz = null; S.finishedQuiz = null; S.tab = 'home'; render(); return;
    }
    if (act === 'bookmark') {
      var item = S.quiz.qs[S.quiz.i];
      if (S.store.book[item.id]) delete S.store.book[item.id];
      else S.store.book[item.id] = 1;
      save(); render();
      toast(S.store.book[item.id] ? '북마크에 저장했어요' : '북마크를 해제했어요');
      return;
    }
    if (act === 'home') { S.quiz = null; S.finishedQuiz = null; S.tab = 'home'; render(); return; }
    if (act === 'again') {
      var again = S.quiz || S.finishedQuiz;
      if (!again) return;
      var qs = again.qs.slice();
      if (again.mode === 'daily') qs = shuffle(qs);
      startQuiz(qs, { title: again.title, mode: again.mode });
      return;
    }
    if (act === 'wrong-start') {
      var ids = Object.keys(S.store.wrong).sort(function (a, b) {
        return (S.store.wrong[b].t || 0) - (S.store.wrong[a].t || 0);
      }).slice(0, 30);
      startQuiz(ids.map(function (id) { return S.index[id]; }).filter(Boolean),
        { title: '오답 다시 풀기', mode: 'wrong' });
      return;
    }
    if (act === 'wrong-clear') {
      if (confirm('오답노트를 모두 지울까요?')) { S.store.wrong = {}; save(); render(); }
      return;
    }
    if (act === 'book-start') {
      var bids = Object.keys(S.store.book).map(function (id) { return S.index[id]; }).filter(Boolean);
      startQuiz(shuffle(bids), { title: '북마크 문제', mode: 'free' });
      return;
    }
    if (act === 'unbook') {
      delete S.store.book[el.getAttribute('data-id')];
      save(); render(); return;
    }
    if (act === 'solve') {
      var item = S.index[el.getAttribute('data-id')];
      if (item) startQuiz([item], { title: '문제 하나', mode: 'one' });
      return;
    }
  }

  function onKey(e) {
    if (!S.quiz) return;
    var q = S.quiz;
    if (e.key >= '1' && e.key <= '4') {
      if (q.picks[q.i] === undefined) pick(parseInt(e.key, 10) - 1);
    } else if (e.key === 'Enter' || e.key === ' ') {
      if (q.picks[q.i] !== undefined) { e.preventDefault(); next(); }
    }
  }

  /* ───────── 시작 ───────── */
  function boot() {
    shell = document.getElementById('shell');
    toastEl = document.getElementById('toast');
    S.store = loadStore();
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    window.addEventListener('error', function (ev) {
      if (!window.__shownErr) {
        window.__shownErr = 1;
        var d = document.createElement('div');
        d.className = 'toast show';
        d.textContent = '오류: ' + (ev.message || '알 수 없는 오류');
        document.body.appendChild(d);
      }
    });

    loadData().then(function () {
      render();
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(function () {});
      }
    }).catch(function (err) {
      shell.innerHTML = '<div class="empty"><div class="big">⚠️</div>문제 데이터를 불러오지 못했어요.<br>' +
        '인터넷 연결을 확인한 뒤 새로고침해 주세요.<br><span style="font-size:12px">' + esc(err.message) + '</span></div>';
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
