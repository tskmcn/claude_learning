/**
 * interactions.js
 * 下北沢演劇ガイド – UXインタラクション
 */

(function () {
  'use strict';

  /* ─────────────────────────────────────────
   * 1. スクロール時カード出現
   *    Intersection Observer + stagger 50ms
   * ───────────────────────────────────────── */
  function initCardReveal(cards) {
    if (!cards || cards.length === 0) return;

    // 初期状態を非表示にセット
    cards.forEach(function (card) {
      card.style.opacity = '0';
      card.style.transform = 'translateY(24px)';
      card.style.transition = 'opacity 0.4s ease-out, transform 0.4s ease-out';
    });

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;

          var card = entry.target;
          var index = parseInt(card.dataset.staggerIndex || '0', 10);

          setTimeout(function () {
            card.style.opacity = '1';
            card.style.transform = 'translateY(0)';
          }, index * 50);

          observer.unobserve(card);
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    );

    cards.forEach(function (card, i) {
      card.dataset.staggerIndex = i;
      observer.observe(card);
    });
  }

  /* ─────────────────────────────────────────
   * 2. モーダルアニメーション
   *    openModal: scale(0.95)→1 + opacity 0→1, 250ms ease-out
   *    closeModal: 逆方向
   * ───────────────────────────────────────── */
  var MODAL_DURATION = 250;

  function openModal(modal, overlay) {
    if (!modal) return;

    overlay && (overlay.style.display = 'block');

    // <dialog> 要素の場合は showModal() を使用
    if (typeof modal.showModal === 'function' && !modal.open) {
      modal.showModal();
    } else {
      modal.style.display = 'block';
    }

    // アニメーション開始値をセット
    modal.style.transition = 'none';
    modal.style.opacity = '0';
    modal.style.transform = 'scale(0.95)';

    // リフロー強制
    void modal.offsetWidth;

    modal.style.transition =
      'opacity ' + MODAL_DURATION + 'ms ease-out, transform ' + MODAL_DURATION + 'ms ease-out';
    modal.style.opacity = '1';
    modal.style.transform = 'scale(1)';

    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeModal(modal, overlay) {
    if (!modal) return;

    modal.style.transition =
      'opacity ' + MODAL_DURATION + 'ms ease-out, transform ' + MODAL_DURATION + 'ms ease-out';
    modal.style.opacity = '0';
    modal.style.transform = 'scale(0.95)';

    setTimeout(function () {
      if (typeof modal.close === 'function') {
        modal.close();
      } else {
        modal.style.display = 'none';
      }
      overlay && (overlay.style.display = 'none');
      modal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    }, MODAL_DURATION);
  }

  function initModal() {
    var modal = document.querySelector('.performance-modal');
    var overlay = document.getElementById('modal-overlay');

    if (!modal) return;

    // カードクリックでモーダルを開く
    document.addEventListener('click', function (e) {
      var card = e.target.closest('.performance-card');
      if (card) {
        // カードのデータを取得してモーダルに注入（実装があれば）
        var title = card.querySelector('[data-title]') || card.querySelector('h2, h3');
        if (title) {
          var modalTitle = modal.querySelector('[data-modal-title], .modal-title');
          if (modalTitle) modalTitle.textContent = title.textContent;
        }
        openModal(modal, overlay);
      }
    });

    // オーバーレイクリックで閉じる
    if (overlay) {
      overlay.addEventListener('click', function () {
        closeModal(modal, overlay);
      });
    }

    // 閉じるボタン
    modal.addEventListener('click', function (e) {
      if (
        e.target.closest('.modal-close') ||
        e.target.classList.contains('modal-close')
      ) {
        closeModal(modal, overlay);
      }
    });

    // ESCキーで閉じる（<dialog> の cancel イベントも考慮）
    modal.addEventListener('cancel', function (e) {
      e.preventDefault();
      closeModal(modal, overlay);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal.open) {
        closeModal(modal, overlay);
      }
    });

    // スワイプ閉じを登録
    initModalSwipe(modal, overlay);
  }

  /* ─────────────────────────────────────────
   * 3. ビュー切り替えアニメーション
   *    クロスフェード (opacity 0.3→1, 200ms)
   * ───────────────────────────────────────── */
  function initViewToggle() {
    var navBtns = document.querySelectorAll('.nav-btn[data-view]');
    if (navBtns.length === 0) return;

    navBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var targetView = btn.dataset.view;

        // アクティブ状態の切り替え
        navBtns.forEach(function (b) {
          b.classList.toggle('active', b.dataset.view === targetView);
          b.setAttribute('aria-pressed', b.dataset.view === targetView ? 'true' : 'false');
        });

        // ビューコンテナを取得
        var allViews = document.querySelectorAll('[data-view-panel]');
        allViews.forEach(function (panel) {
          if (panel.dataset.viewPanel === targetView) {
            // フェードイン
            panel.style.display = '';
            panel.style.transition = 'none';
            panel.style.opacity = '0.3';
            void panel.offsetWidth;
            panel.style.transition = 'opacity 200ms ease-out';
            panel.style.opacity = '1';
          } else {
            panel.style.display = 'none';
            panel.style.opacity = '';
            panel.style.transition = '';
          }
        });
      });
    });
  }

  /* ─────────────────────────────────────────
   * 4. スクロール時ヘッダー縮小
   *    scrollY>50 で .site-header に scrolled クラス
   * ───────────────────────────────────────── */
  function initHeaderShrink() {
    var header = document.querySelector('.site-header');
    if (!header) return;

    var ticking = false;

    function onScroll() {
      if (!ticking) {
        requestAnimationFrame(function () {
          header.classList.toggle('scrolled', window.scrollY > 50);
          ticking = false;
        });
        ticking = true;
      }
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    // 初期状態を同期
    onScroll();
  }

  /* ─────────────────────────────────────────
   * 5. モーダルスワイプ閉じ
   *    タッチY差分 >80px で closeModal()
   * ───────────────────────────────────────── */
  function initModalSwipe(modal, overlay) {
    if (!modal) return;

    var touchStartY = 0;
    var touchCurrentY = 0;
    var isDragging = false;
    var SWIPE_THRESHOLD = 80;

    modal.addEventListener(
      'touchstart',
      function (e) {
        touchStartY = e.touches[0].clientY;
        touchCurrentY = touchStartY;
        isDragging = true;
        // トランジションを一時停止して追従させる
        modal.style.transition = 'none';
      },
      { passive: true }
    );

    modal.addEventListener(
      'touchmove',
      function (e) {
        if (!isDragging) return;
        touchCurrentY = e.touches[0].clientY;
        var delta = touchCurrentY - touchStartY;

        // 下スワイプのみ追従（上は無視）
        if (delta > 0) {
          modal.style.transform = 'translateY(' + delta + 'px) scale(1)';
          modal.style.opacity = String(Math.max(0, 1 - delta / (SWIPE_THRESHOLD * 2)));
        }
      },
      { passive: true }
    );

    modal.addEventListener('touchend', function () {
      if (!isDragging) return;
      isDragging = false;

      var delta = touchCurrentY - touchStartY;

      if (delta > SWIPE_THRESHOLD) {
        // しきい値を超えたら閉じる
        closeModal(modal, overlay);
      } else {
        // 元の位置に戻す
        modal.style.transition =
          'opacity ' + MODAL_DURATION + 'ms ease-out, transform ' + MODAL_DURATION + 'ms ease-out';
        modal.style.transform = 'scale(1)';
        modal.style.opacity = '1';
      }
    });
  }

  /* ─────────────────────────────────────────
   * 6. フィルター適用後カード再アニメ
   *    グリッドのカードを stagger で再表示
   * ───────────────────────────────────────── */
  function reanimateCards(grid) {
    var targetGrid = grid || document.querySelector('.performance-grid');
    if (!targetGrid) return;

    var cards = targetGrid.querySelectorAll('.performance-card');
    if (cards.length === 0) return;

    cards.forEach(function (card, i) {
      card.style.transition = 'none';
      card.style.opacity = '0';
      card.style.transform = 'translateY(16px)';

      // リフロー強制
      void card.offsetWidth;

      setTimeout(function () {
        card.style.transition = 'opacity 0.35s ease-out, transform 0.35s ease-out';
        card.style.opacity = '1';
        card.style.transform = 'translateY(0)';
      }, i * 50);
    });
  }

  // フィルター変更イベントをリッスン（カスタムイベント or input/change）
  function initFilterReAnimate() {
    // カスタムイベント "filter:applied" を想定（他モジュールから dispatch される）
    document.addEventListener('filter:applied', function (e) {
      var grid = (e.detail && e.detail.grid) ? e.detail.grid : null;
      reanimateCards(grid);
    });

    // フォーム要素による汎用フィルター対応（data-filter 属性のある select/input）
    document.addEventListener('change', function (e) {
      if (e.target.closest('[data-filter-control]')) {
        // わずかに遅延させて DOM 更新後にアニメ実行
        setTimeout(function () { reanimateCards(null); }, 20);
      }
    });
  }

  /* ─────────────────────────────────────────
   * スケルトンカード ユーティリティ
   * ───────────────────────────────────────── */

  /**
   * スケルトンカードをグリッドに挿入する
   * @param {HTMLElement} grid   - 挿入先コンテナ
   * @param {number}      count  - 挿入枚数（デフォルト 6）
   */
  function showSkeletons(grid, count) {
    if (!grid) return;
    count = count || 6;
    grid.innerHTML = '';
    for (var i = 0; i < count; i++) {
      var skeleton = document.createElement('div');
      skeleton.className = 'skeleton-card';
      skeleton.innerHTML =
        '<div class="skeleton-img"></div>' +
        '<div class="skeleton-line long"></div>' +
        '<div class="skeleton-line short"></div>';
      grid.appendChild(skeleton);
    }
  }

  /**
   * スケルトンを削除して実カードを表示後にアニメ
   * @param {HTMLElement} grid  - 対象グリッド
   * @param {Array}       items - 実データ配列（カードは外部で生成済みと仮定）
   */
  function hideSkeletons(grid) {
    if (!grid) return;
    var skeletons = grid.querySelectorAll('.skeleton-card');
    skeletons.forEach(function (s) { s.remove(); });
    // 実カードをアニメ表示
    reanimateCards(grid);
  }

  /* ─────────────────────────────────────────
   * パブリック API（window.theaterUI に公開）
   * ───────────────────────────────────────── */
  window.theaterUI = {
    openModal: openModal,
    closeModal: closeModal,
    reanimateCards: reanimateCards,
    showSkeletons: showSkeletons,
    hideSkeletons: hideSkeletons,
  };

  /* ─────────────────────────────────────────
   * メイン初期化
   * ───────────────────────────────────────── */
  function initInteractions() {
    var grid = document.querySelector('.performance-grid');
    var cards = grid ? grid.querySelectorAll('.performance-card') : [];

    initCardReveal(cards);
    initModal();
    initViewToggle();
    initHeaderShrink();
    initFilterReAnimate();
  }

  /* DOMContentLoaded で自動起動 */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initInteractions);
  } else {
    initInteractions();
  }

})();

/*
 * =====================================================================
 * スケルトンCSS（<style> タグに貼り付けて使用してください）
 * =====================================================================
 *
 * @keyframes skeleton-shimmer {
 *   0%   { background-position: -400px 0; }
 *   100% { background-position:  400px 0; }
 * }
 *
 * .skeleton-card {
 *   border-radius: 8px;
 *   overflow: hidden;
 *   background: #f0f0f0;
 *   padding: 0;
 * }
 *
 * .skeleton-img {
 *   width: 100%;
 *   height: 180px;
 *   background: linear-gradient(
 *     90deg,
 *     #e0e0e0 25%,
 *     #ececec 50%,
 *     #e0e0e0 75%
 *   );
 *   background-size: 800px 100%;
 *   animation: skeleton-shimmer 1.4s infinite linear;
 * }
 *
 * .skeleton-line {
 *   margin: 12px 16px 0;
 *   height: 14px;
 *   border-radius: 4px;
 *   background: linear-gradient(
 *     90deg,
 *     #e0e0e0 25%,
 *     #ececec 50%,
 *     #e0e0e0 75%
 *   );
 *   background-size: 800px 100%;
 *   animation: skeleton-shimmer 1.4s infinite linear;
 * }
 *
 * .skeleton-line.long  { width: 80%; }
 * .skeleton-line.short { width: 50%; margin-bottom: 16px; }
 *
 * /* ヘッダー縮小 */
 * .site-header {
 *   transition: padding 0.3s ease, box-shadow 0.3s ease;
 * }
 * .site-header.scrolled {
 *   padding-top: 8px;
 *   padding-bottom: 8px;
 *   box-shadow: 0 2px 12px rgba(0, 0, 0, 0.12);
 * }
 * =====================================================================
 */
