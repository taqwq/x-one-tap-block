// ==UserScript==
// @name         X One-Tap Block
// @namespace    taq.x-one-tap-block
// @version      1.3
// @description  タイムラインの各ポストに🚫ボタンを追加。1タップでブロック（メニュー→ブロック→確認 を自動で踏む）
// @match        https://x.com/*
// @match        https://twitter.com/*
// @run-at       document-idle
// @grant        none
// @updateURL    https://raw.githubusercontent.com/taqwq/x-one-tap-block/main/x-one-tap-block.user.js
// @downloadURL  https://raw.githubusercontent.com/taqwq/x-one-tap-block/main/x-one-tap-block.user.js
// ==/UserScript==

(() => {
  'use strict';

  const BTN_CLASS = 'otb-btn';
  const BUSY_CLASS = 'otb-busy';

  // 処理中はメニューと確認ダイアログを透明化して「1タップ」に見せる
  const style = document.createElement('style');
  style.textContent = `
    /* Xの「…」「Grok」と同じ寸法：アイコン18.75px、隣との間隔8px、ホバー円は疑似要素で外側に広げる */
    .${BTN_CLASS} {
      position: relative; display: flex; align-items: center; justify-content: center;
      width: 18.75px; height: 20px; margin: 0 8px 0 0; padding: 0;
      background: none; border: none; outline: none; cursor: pointer;
      color: rgb(113, 118, 123); transition: color .2s;
    }
    .${BTN_CLASS}::before {
      content: ''; position: absolute; inset: -8px; border-radius: 9999px;
      background-color: transparent; transition: background-color .2s;
    }
    .${BTN_CLASS} svg { width: 18.75px; height: 18.75px; position: relative; }
    .${BTN_CLASS}:hover { color: rgb(244, 33, 46); }
    .${BTN_CLASS}:hover::before { background-color: rgba(244, 33, 46, .1); }
    .${BTN_CLASS}:focus-visible::before { box-shadow: 0 0 0 2px rgba(244, 33, 46, .5); }
    .${BTN_CLASS}[data-state="warn"] { color: rgb(255, 212, 0); }
    body.${BUSY_CLASS} [role="menu"],
    body.${BUSY_CLASS} [data-testid="Dropdown"],
    body.${BUSY_CLASS} [role="alertdialog"],
    body.${BUSY_CLASS} [data-testid="sheetDialog"],
    body.${BUSY_CLASS} [data-testid="mask"] { opacity: 0 !important; }
  `;
  document.head.appendChild(style);

  // 禁止アイコン（線の太さをXの他アイコンに合わせる。innerHTMLはTrusted Typesで弾かれ得るのでDOMで組み立てる）
  function makeIcon() {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    for (const [k, v] of Object.entries({
      viewBox: '0 0 24 24', 'aria-hidden': 'true', fill: 'none',
      stroke: 'currentColor', 'stroke-width': '1.75', 'stroke-linecap': 'round',
    })) svg.setAttribute(k, v);
    const circle = document.createElementNS(NS, 'circle');
    circle.setAttribute('cx', '12'); circle.setAttribute('cy', '12'); circle.setAttribute('r', '8.25');
    const slash = document.createElementNS(NS, 'path');
    slash.setAttribute('d', 'M6.2 6.2l11.6 11.6');
    svg.append(circle, slash);
    return svg;
  }

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
    btn.dataset.state = 'warn';
    setTimeout(() => { delete btn.dataset.state; btn.title = 'ブロック'; }, 1500);
  }

  function inject(article) {
    if (article.querySelector('.' + BTN_CLASS)) return;
    const caret = article.querySelector('[data-testid="caret"]');
    if (!caret) return;

    const btn = document.createElement('button');
    btn.className = BTN_CLASS;
    btn.type = 'button';
    btn.appendChild(makeIcon());
    btn.title = 'ブロック';
    btn.setAttribute('aria-label', 'ブロック');
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation(); // ポスト詳細に遷移しないように
      blockFromTweet(article, btn);
    });

    // 「…」ボタンの左隣（同じ横並びコンテナ内）に置く
    caret.parentElement.insertBefore(btn, caret);
  }

  const scan = () => document.querySelectorAll('article[data-testid="tweet"]').forEach(inject);

  new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
  scan();
})();
