// ==UserScript==
// @name         X One-Tap Block
// @namespace    taq.x-one-tap-block
// @version      1.0
// @description  タイムラインの各ポストに🚫ボタンを追加。1タップでブロック（メニュー→ブロック→確認 を自動で踏む）
// @match        https://x.com/*
// @match        https://twitter.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const BTN_CLASS = 'otb-btn';
  const BUSY_CLASS = 'otb-busy';

  // 処理中はメニューと確認ダイアログを透明化して「1タップ」に見せる
  const style = document.createElement('style');
  style.textContent = `
    .${BTN_CLASS} {
      background: none; border: none; cursor: pointer;
      font-size: 15px; line-height: 1; padding: 6px; margin-right: 2px;
      border-radius: 9999px; opacity: .55; transition: opacity .15s, background .15s;
    }
    .${BTN_CLASS}:hover { opacity: 1; background: rgba(244, 33, 46, .12); }
    body.${BUSY_CLASS} [role="menu"],
    body.${BUSY_CLASS} [data-testid="Dropdown"],
    body.${BUSY_CLASS} [role="alertdialog"],
    body.${BUSY_CLASS} [data-testid="sheetDialog"],
    body.${BUSY_CLASS} [data-testid="mask"] { opacity: 0 !important; }
  `;
  document.head.appendChild(style);

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function waitFor(fn, timeout = 2500) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const v = fn();
      if (v) return v;
      await sleep(40);
    }
    return null;
  }

  function findBlockMenuItem() {
    const byId = document.querySelector('[role="menu"] [data-testid="block"]');
    if (byId) return byId;
    // フォールバック: 文言で探す（「ブロック解除」「Unblock」は除外）
    return [...document.querySelectorAll('[role="menu"] [role="menuitem"]')].find((el) => {
      const t = el.textContent || '';
      return (/ブロック/.test(t) && !/解除/.test(t)) || (/^Block @/.test(t.trim()));
    }) || null;
  }

  function abort() {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    document.body.classList.remove(BUSY_CLASS);
  }

  async function blockFromTweet(article, btn) {
    const caret = article.querySelector('[data-testid="caret"]');
    if (!caret) return;

    btn.disabled = true;
    document.body.classList.add(BUSY_CLASS);
    try {
      caret.click();

      const item = await waitFor(findBlockMenuItem);
      if (!item) { abort(); flash(btn, '自分のポスト or 既にブロック済み'); return; }
      item.click();

      const confirm = await waitFor(() => document.querySelector('[data-testid="confirmationSheetConfirm"]'));
      if (!confirm) { abort(); flash(btn, '確認ダイアログが見つからない'); return; }
      confirm.click();

      // ブロックしたポストはその場で消す
      const cell = article.closest('[data-testid="cellInnerDiv"]') || article;
      cell.style.display = 'none';
    } finally {
      await sleep(150);
      document.body.classList.remove(BUSY_CLASS);
      btn.disabled = false;
    }
  }

  function flash(btn, msg) {
    btn.title = msg;
    btn.textContent = '⚠️';
    setTimeout(() => { btn.textContent = '🚫'; btn.title = 'ブロック'; }, 1500);
  }

  function inject(article) {
    if (article.querySelector('.' + BTN_CLASS)) return;
    const caret = article.querySelector('[data-testid="caret"]');
    if (!caret) return;

    const btn = document.createElement('button');
    btn.className = BTN_CLASS;
    btn.type = 'button';
    btn.textContent = '🚫';
    btn.title = 'ブロック';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation(); // ポスト詳細に遷移しないように
      blockFromTweet(article, btn);
    });

    // 「…」ボタンの左隣に置く
    const caretWrap = caret.parentElement;
    caretWrap.parentElement.insertBefore(btn, caretWrap);
  }

  const scan = () => document.querySelectorAll('article[data-testid="tweet"]').forEach(inject);

  new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
  scan();
})();
