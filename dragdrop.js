/* ══════════════════════════════════════════════════════════════════
   Daily Command Center — Drag & Drop reorder
   ──────────────────────────────────────────────────────────────────
   Wraps renderDailyList() and renderMasterList() to make rows
   draggable. Reorder persists by rewriting the dcc_tasks array.

   - Daily ↔ Daily and Master ↔ Master only (cross-list moves still
     use the A button).
   - Buttons inside a row (X / A / B / C / ↩ / ✓) suppress the drag.
   - Works with mouse and touch (loads SortableJS from CDN).
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var SORTABLE_SRC =
    'https://cdn.jsdelivr.net/npm/sortablejs@1.15.2/Sortable.min.js';

  // ─── Load SortableJS once, then boot ──────────────────────────
  function loadSortable(cb) {
    if (window.Sortable) return cb();
    var s = document.createElement('script');
    s.src = SORTABLE_SRC;
    s.onload = cb;
    s.onerror = function () {
      console.warn('[dragdrop] Could not load SortableJS from CDN');
    };
    document.head.appendChild(s);
  }

  // ─── Reorder dcc_tasks so the new visual order persists ───────
  // listFilterFn picks the tasks that belong to the list being
  // reordered (Daily or Master). Non-list tasks stay where they
  // were in the underlying array.
  function persistOrder(containerId, listFilterFn, idPrefix) {
    try {
      var container = document.getElementById(containerId);
      if (!container) return;

      var newIds = [].slice
        .call(container.querySelectorAll('[id^="' + idPrefix + '"]'))
        .map(function (el) { return el.id.slice(idPrefix.length); });

      var raw = localStorage.getItem('dcc_tasks') || '[]';
      var tasks = JSON.parse(raw);
      var byId = {};
      tasks.forEach(function (t) { byId[String(t.id)] = t; });

      var i = 0;
      var reordered = tasks.map(function (t) {
        if (listFilterFn(t)) {
          var nextId = newIds[i++];
          return byId[String(nextId)] || t;
        }
        return t;
      });

      localStorage.setItem('dcc_tasks', JSON.stringify(reordered));
    } catch (e) {
      console.error('[dragdrop] persistOrder failed', e);
    }
  }

  // ─── Bind Sortable to a container exactly once ────────────────
  function bind(containerId, listFilterFn, idPrefix) {
    var container = document.getElementById(containerId);
    if (!container) return;
    if (container.dataset.dndBound === '1') return;
    container.dataset.dndBound = '1';

    Sortable.create(container, {
      animation: 150,
      // Don't start a drag when the user taps a button/input.
      filter: 'button, input, a, select, textarea, .sort-btns',
      preventOnFilter: false,
      // Touch: press-and-hold 200ms before drag starts so normal
      // finger swipes still scroll the page. Mouse stays instant.
      delay: 200,
      delayOnTouchOnly: true,
      touchStartThreshold: 5,
      ghostClass: 'dnd-ghost',
      chosenClass: 'dnd-chosen',
      dragClass: 'dnd-drag',
      onEnd: function () {
        persistOrder(containerId, listFilterFn, idPrefix);
      }
    });
  }

  // ─── Wrap a render fn so we re-attempt the bind after render ──
  // Bind is idempotent (data-dndBound flag), so calling it on every
  // render is safe and cheap. innerHTML replacements inside the
  // container don't break Sortable — it listens on the container.
  function wrapRender(fnName, bindFn) {
    if (typeof window[fnName] !== 'function') {
      console.warn('[dragdrop] ' + fnName + ' not found yet — will retry');
      return false;
    }
    var original = window[fnName];
    window[fnName] = function () {
      var result = original.apply(this, arguments);
      requestAnimationFrame(bindFn);
      return result;
    };
    return true;
  }

  // ─── A tiny stylesheet for the drag visuals ───────────────────
  function injectStyles() {
    if (document.getElementById('dnd-styles')) return;
    var css =
      '.dnd-ghost{opacity:.35;}' +
      '.dnd-chosen{cursor:grabbing!important;}' +
      '.dnd-drag{box-shadow:0 6px 18px rgba(0,0,0,.18);}' +
      '#body-daily .daily-item,#master-items .master-item{cursor:grab;}';
    var style = document.createElement('style');
    style.id = 'dnd-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ─── Boot, retrying briefly until render fns exist ────────────
  function boot() {
    injectStyles();

    var bindDaily = function () {
      bind('body-daily', function (t) { return t.priority === 'a'; }, 'dl-');
    };
    var bindMaster = function () {
      bind('master-items', function (t) { return t.priority !== 'a'; }, 'ml-');
    };

    var dailyWrapped = false;
    var masterWrapped = false;
    var tries = 0;

    (function attempt() {
      if (!dailyWrapped) dailyWrapped = wrapRender('renderDailyList', bindDaily);
      if (!masterWrapped) masterWrapped = wrapRender('renderMasterList', bindMaster);

      if (dailyWrapped && masterWrapped) {
        // Re-render once so the wrappers fire and Sortable binds.
        try { window.renderDailyList(); } catch (e) {}
        try { window.renderMasterList(); } catch (e) {}
        return;
      }
      if (++tries < 40) setTimeout(attempt, 250); // up to ~10s
      else console.warn('[dragdrop] gave up waiting for render fns');
    })();
  }

  // ─── Kick off after DOM is ready and SortableJS has loaded ────
  function start() {
    loadSortable(boot);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
