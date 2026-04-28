/**
 * app.js — 下北沢演劇ガイド メインロジック
 */

(function () {
  'use strict';

  /* ─── 状態 ──────────────────────────────────────────────── */
  var State = {
    currentView: 'grid',
    selectedDate: null,
    selectedGenre: null,
    selectedVenueId: null,
    venues: [],
    performances: [],
    filteredPerformances: [],
  };

  /* ─── DOM参照 ────────────────────────────────────────────── */
  var $ = function (sel) { return document.querySelector(sel); };
  var $$ = function (sel) { return Array.from(document.querySelectorAll(sel)); };

  /* ─── データ取得 ─────────────────────────────────────────── */
  async function fetchData() {
    var base = document.querySelector('meta[name="base-path"]');
    var basePath = base ? base.content : '.';
    var [venueRes, perfRes] = await Promise.all([
      fetch(basePath + '/data/venues.json'),
      fetch(basePath + '/data/performances.json'),
    ]);
    var venueData = await venueRes.json();
    var perfData = await perfRes.json();
    State.venues = venueData.venues;
    State.performances = perfData.performances;
    State.filteredPerformances = perfData.performances.slice();
  }

  /* ─── フィルタリング ─────────────────────────────────────── */
  function applyFilters() {
    State.filteredPerformances = State.performances.filter(function (p) {
      var dateOk = !State.selectedDate || p.dates.includes(State.selectedDate);
      var genreOk = !State.selectedGenre || p.genre === State.selectedGenre;
      var venueOk = !State.selectedVenueId || p.venueId === State.selectedVenueId;
      return dateOk && genreOk && venueOk;
    });

    renderAll();

    document.dispatchEvent(new CustomEvent('filter:applied', {
      detail: { grid: $('#performance-grid') }
    }));
  }

  function resetFilters() {
    State.selectedDate = null;
    State.selectedGenre = null;
    State.selectedVenueId = null;

    var dateInput = $('#filter-date');
    var genreSelect = $('#filter-genre');
    var venueSelect = $('#filter-venue');
    if (dateInput) dateInput.value = '';
    if (genreSelect) genreSelect.value = '';
    if (venueSelect) venueSelect.value = '';

    $$('.filter-chip').forEach(function (c) { c.classList.remove('active'); });

    applyFilters();
  }

  /* ─── ビュー切り替え ─────────────────────────────────────── */
  function switchView(viewName) {
    State.currentView = viewName;

    $$('.nav-btn[data-view]').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.view === viewName);
    });

    var gridView = $('#view-grid');
    var mapView = $('#view-map');

    if (viewName === 'map') {
      gridView.classList.add('hidden');
      mapView.classList.remove('hidden');
      if (window.theaterMap) window.theaterMap.invalidateSize();
      window.theaterMap && window.theaterMap.renderMarkers(State.venues, State.filteredPerformances);
    } else {
      mapView.classList.add('hidden');
      gridView.classList.remove('hidden');
      renderGrid(State.filteredPerformances);
    }
  }

  /* ─── レンダリング ───────────────────────────────────────── */
  function renderAll() {
    if (State.currentView === 'map') {
      window.theaterMap && window.theaterMap.renderMarkers(State.venues, State.filteredPerformances);
    } else {
      renderGrid(State.filteredPerformances);
    }
    updateFilterChipStyles();
  }

  function renderGrid(performances) {
    var grid = $('#performance-grid');
    if (!grid) return;

    if (performances.length === 0) {
      grid.innerHTML = renderEmpty();
      return;
    }

    grid.innerHTML = performances.map(function (p, i) {
      return renderCard(p, i);
    }).join('');

    if (window.theaterUI) {
      var cards = grid.querySelectorAll('.performance-card');
      cards.forEach(function (card, i) {
        card.dataset.staggerIndex = i;
        card.style.opacity = '0';
        card.style.transform = 'translateY(24px)';
        card.style.transition = 'opacity 0.4s ease-out, transform 0.4s ease-out';
        setTimeout(function () {
          card.style.opacity = '1';
          card.style.transform = 'translateY(0)';
        }, i * 60);
      });
    }
  }

  function renderCard(p, index) {
    var venue = State.venues.find(function (v) { return v.id === p.venueId; }) || {};
    var dateRange = formatDateRange(p.dates);
    var priceStr = formatPrice(p.price);
    var castStr = p.cast.slice(0, 3).map(stripSampleMarker).join('、') + (p.cast.length > 3 ? ' ほか' : '');
    var sampleBadge = isSample(p.title) ? '<span class="badge-sample" title="サンプルデータ">SAMPLE</span>' : '';

    return '<article class="performance-card" data-id="' + p.id + '" tabindex="0" role="button" aria-label="' + escHtml(stripSampleMarker(p.title)) + ' の詳細を見る">' +
      '<div class="card-thumbnail-wrap">' +
        '<div class="card-thumbnail" style="background:' + p.imageColor + ';">' +
          '<div class="card-thumbnail-inner">' +
            '<div class="card-thumb-title">' + displayText(p.title) + '</div>' +
            '<div class="card-thumb-company">' + displayText(p.company) + '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="card-body">' +
        '<div class="card-badges"><span class="card-genre">' + displayText(p.genre) + '</span>' + sampleBadge + '</div>' +
        '<h2 class="card-title">' + displayText(p.title) + '</h2>' +
        '<p class="card-company">' + displayText(p.company) + '</p>' +
        '<p class="card-dates">' + escHtml(dateRange) + '</p>' +
        '<p class="card-venue">' + escHtml(venue.name || '') + '</p>' +
        '<p class="card-cast">' + escHtml(castStr) + '</p>' +
        '<div class="card-footer">' +
          '<span class="card-price">' + escHtml(priceStr) + '</span>' +
          '<button class="card-ticket-btn" data-ticket-url="' + escHtml(p.ticketUrl) + '" onclick="event.stopPropagation();window.open(this.dataset.ticketUrl,\'_blank\',\'noopener\')">チケット購入</button>' +
        '</div>' +
      '</div>' +
    '</article>';
  }

  function renderEmpty() {
    return '<div class="empty-state">' +
      '<div class="empty-icon">🎭</div>' +
      '<p class="empty-title">該当する公演がありません</p>' +
      '<p class="empty-sub">条件を変えて再度お試しください</p>' +
      '<button class="btn-reset-filter" id="empty-reset">フィルターをリセット</button>' +
    '</div>';
  }

  /* ─── モーダル ───────────────────────────────────────────── */
  function openModal(performanceId) {
    var p = State.performances.find(function (x) { return x.id === performanceId; });
    if (!p) return;
    var venue = State.venues.find(function (v) { return v.id === p.venueId; }) || {};

    var modal = $('#performance-modal');
    var overlay = $('#modal-overlay');
    if (!modal || !overlay) return;

    modal.innerHTML = buildModalContent(p, venue);
    document.body.style.overflow = 'hidden';

    overlay.style.opacity = '0';
    overlay.style.display = 'flex';
    overlay.style.transition = 'none';
    modal.style.transform = 'translateY(24px) scale(0.97)';
    modal.style.opacity = '0';
    modal.style.transition = 'none';

    void overlay.offsetWidth;

    overlay.style.transition = 'opacity 250ms ease';
    overlay.style.opacity = '1';
    overlay.classList.add('active');
    modal.style.transition = 'transform 300ms cubic-bezier(0.34,1.56,0.64,1), opacity 250ms ease';
    modal.style.transform = 'translateY(0) scale(1)';
    modal.style.opacity = '1';

    modal.querySelector('.modal-close') && modal.querySelector('.modal-close').focus();
  }

  function closeModal() {
    var overlay = $('#modal-overlay');
    var modal = $('#performance-modal');
    if (!overlay) return;

    overlay.style.transition = 'opacity 200ms ease';
    overlay.style.opacity = '0';
    if (modal) {
      modal.style.transition = 'transform 200ms ease, opacity 200ms ease';
      modal.style.transform = 'translateY(16px) scale(0.97)';
      modal.style.opacity = '0';
    }

    setTimeout(function () {
      overlay.classList.remove('active');
      overlay.style.display = 'none';
      document.body.style.overflow = '';
    }, 200);
  }

  function buildModalContent(p, venue) {
    var dateRange = formatDateRange(p.dates);
    var matineeInfo = p.matineeDates && p.matineeDates.length > 0
      ? '一部日程にマチネあり (' + p.matineeStartTime + '開演)' : '';

    var sampleNotice = isSample(p.title)
      ? '<div class="modal-sample-notice">⚠️ このデータはサンプルです。実際の公演情報とは異なります。</div>'
      : '';

    return '<button class="modal-close" aria-label="閉じる">&times;</button>' +
      sampleNotice +
      '<div class="modal-hero" style="background:' + p.imageColor + ';">' +
        '<div class="modal-hero-inner">' +
          '<h1 class="modal-hero-title">' + displayText(p.title) + '</h1>' +
          '<p class="modal-hero-company">' + displayText(p.company) + '</p>' +
        '</div>' +
      '</div>' +
      '<div class="modal-body">' +
        '<div class="modal-meta">' +
          '<span class="modal-genre">' + displayText(p.genre) + '</span>' +
          p.tags.map(function (t) { return '<span class="modal-tag">' + displayText(t) + '</span>'; }).join('') +
        '</div>' +
        '<h2 class="modal-title">' + displayText(p.title) + '</h2>' +
        '<p class="modal-company">' + displayText(p.company) + '　<span class="modal-organizer">主宰：' + displayText(p.organizer) + '</span></p>' +
        '<div class="modal-info-grid">' +
          '<div class="modal-info-item"><span class="modal-info-label">公演日程</span><span class="modal-info-value">' + escHtml(dateRange) + '</span></div>' +
          '<div class="modal-info-item"><span class="modal-info-label">会場</span><span class="modal-info-value">' + escHtml(venue.name || '') + '</span></div>' +
          '<div class="modal-info-item"><span class="modal-info-label">開場 / 開演</span><span class="modal-info-value">' + escHtml(p.openingTime) + ' / ' + escHtml(p.startTime) + (matineeInfo ? '<br><small>' + escHtml(matineeInfo) + '</small>' : '') + '</span></div>' +
          '<div class="modal-info-item"><span class="modal-info-label">会場住所</span><span class="modal-info-value">' + escHtml(venue.address || '') + '<br><small>' + escHtml(venue.access || '') + '</small></span></div>' +
        '</div>' +
        '<div class="modal-cast-section"><span class="modal-info-label">出演者</span><p class="modal-cast">' + p.cast.map(function(c){ return escHtml(stripSampleMarker(c)); }).join('　') + '</p></div>' +
        '<div class="modal-description"><h3 class="modal-section-label">あらすじ</h3><p>' + displayText(p.synopsis) + '</p></div>' +
        '<div class="modal-actions">' +
          '<a href="' + escHtml(p.ticketUrl) + '" target="_blank" rel="noopener noreferrer" class="modal-ticket-btn">🎟 チケット購入</a>' +
          (venue.url ? '<a href="' + escHtml(venue.url) + '" target="_blank" rel="noopener noreferrer" class="modal-map-btn">🗺 劇場サイト</a>' : '') +
        '</div>' +
      '</div>';
  }

  /* ─── フィルターUI構築 ───────────────────────────────────── */
  function buildFilterUI() {
    var dateInput = $('#filter-date');
    var genreSelect = $('#filter-genre');
    var venueSelect = $('#filter-venue');

    if (genreSelect) {
      var genres = [...new Set(State.performances.map(function (p) { return p.genre; }))];
      genreSelect.innerHTML = '<option value="">ジャンル（すべて）</option>' +
        genres.map(function (g) { return '<option value="' + escHtml(g) + '">' + escHtml(g) + '</option>'; }).join('');
    }

    if (venueSelect) {
      venueSelect.innerHTML = '<option value="">会場（すべて）</option>' +
        State.venues.map(function (v) {
          return '<option value="' + escHtml(v.id) + '">' + escHtml(v.name) + '</option>';
        }).join('');
    }

    buildDateChips();
  }

  function buildDateChips() {
    var chipContainer = $('#date-chips');
    if (!chipContainer) return;

    var allDates = new Set();
    State.performances.forEach(function (p) {
      p.dates.forEach(function (d) { allDates.add(d); });
    });
    var sortedDates = [...allDates].sort();

    var today = new Date();
    var upcomingDates = sortedDates.filter(function (d) {
      return new Date(d) >= today;
    }).slice(0, 14);

    chipContainer.innerHTML = upcomingDates.map(function (d) {
      var dt = new Date(d);
      var label = (dt.getMonth() + 1) + '/' + dt.getDate() + '(' + ['日','月','火','水','木','金','土'][dt.getDay()] + ')';
      return '<button class="filter-chip date-chip" data-date="' + escHtml(d) + '">' + label + '</button>';
    }).join('');

    chipContainer.addEventListener('click', function (e) {
      var chip = e.target.closest('.date-chip');
      if (!chip) return;
      var isActive = chip.classList.contains('active');
      $$('.date-chip').forEach(function (c) { c.classList.remove('active'); });
      if (!isActive) {
        chip.classList.add('active');
        State.selectedDate = chip.dataset.date;
      } else {
        State.selectedDate = null;
      }
      applyFilters();
    });
  }

  function updateFilterChipStyles() {
    $$('.date-chip').forEach(function (c) {
      c.classList.toggle('active', c.dataset.date === State.selectedDate);
    });
  }

  /* ─── イベント登録 ───────────────────────────────────────── */
  function bindEvents() {
    $$('.nav-btn[data-view]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        switchView(btn.dataset.view);
      });
    });

    var dateInput = $('#filter-date');
    if (dateInput) {
      dateInput.addEventListener('change', function () {
        State.selectedDate = dateInput.value || null;
        $$('.date-chip').forEach(function (c) { c.classList.remove('active'); });
        applyFilters();
      });
    }

    var genreSelect = $('#filter-genre');
    if (genreSelect) {
      genreSelect.addEventListener('change', function () {
        State.selectedGenre = genreSelect.value || null;
        applyFilters();
      });
    }

    var venueSelect = $('#filter-venue');
    if (venueSelect) {
      venueSelect.addEventListener('change', function () {
        State.selectedVenueId = venueSelect.value || null;
        applyFilters();
      });
    }

    var resetBtn = $('#filter-reset');
    if (resetBtn) {
      resetBtn.addEventListener('click', resetFilters);
    }

    var overlay = $('#modal-overlay');
    if (overlay) {
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) closeModal();
      });
    }

    document.addEventListener('click', function (e) {
      var card = e.target.closest('.performance-card');
      if (card && !e.target.closest('.card-ticket-btn')) {
        openModal(card.dataset.id);
      }
      var closeBtn = e.target.closest('.modal-close');
      if (closeBtn) closeModal();
      var emptyReset = e.target.closest('#empty-reset');
      if (emptyReset) resetFilters();
      var sidebarItem = e.target.closest('.sidebar-perf-item');
      if (sidebarItem) openModal(sidebarItem.dataset.id);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeModal();
    });

    document.addEventListener('venueSelected', function (e) {
      State.selectedVenueId = e.detail.venueId;
      applyFilters();
      var venueSelect = $('#filter-venue');
      if (venueSelect) venueSelect.value = e.detail.venueId || '';
    });
  }

  /* ─── スケルトン表示 ─────────────────────────────────────── */
  function showSkeletons() {
    var grid = $('#performance-grid');
    if (!grid) return;
    grid.innerHTML = Array(6).fill(0).map(function () {
      return '<div class="skeleton-card">' +
        '<div class="skeleton-thumb"></div>' +
        '<div class="skeleton-body">' +
          '<div class="skeleton-line s-genre"></div>' +
          '<div class="skeleton-line s-title"></div>' +
          '<div class="skeleton-line s-title2"></div>' +
          '<div class="skeleton-line s-sub"></div>' +
          '<div class="skeleton-line s-sub2"></div>' +
          '<div class="skeleton-line s-btn"></div>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  /* ─── ユーティリティ ─────────────────────────────────────── */
  function formatDateRange(dates) {
    if (!dates || dates.length === 0) return '';
    if (dates.length === 1) return formatDate(dates[0]);
    return formatDate(dates[0]) + ' 〜 ' + formatDate(dates[dates.length - 1]);
  }

  function formatDate(dateStr) {
    var d = new Date(dateStr);
    var days = ['日', '月', '火', '水', '木', '金', '土'];
    return (d.getMonth() + 1) + '月' + d.getDate() + '日(' + days[d.getDay()] + ')';
  }

  function formatPrice(price) {
    if (!price) return '';
    var min = Math.min.apply(null, Object.values(price));
    var max = Math.max.apply(null, Object.values(price));
    if (min === max) return '¥' + min.toLocaleString();
    return '¥' + min.toLocaleString() + '〜';
  }

  function stripSampleMarker(str) {
    return String(str).replace(/^##Sample##/, '');
  }

  function isSample(str) {
    return String(str).startsWith('##Sample##');
  }

  function displayText(str) {
    return escHtml(stripSampleMarker(str));
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /* ─── 初期化 ─────────────────────────────────────────────── */
  async function init() {
    showSkeletons();
    try {
      await fetchData();
      buildFilterUI();
      bindEvents();
      renderAll();
    } catch (err) {
      var grid = $('#performance-grid');
      if (grid) {
        grid.innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div><p class="empty-title">データの読み込みに失敗しました</p></div>';
      }
      console.error(err);
    }
  }

  window.theaterApp = { openModal: openModal, closeModal: closeModal, getState: function () { return State; } };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
