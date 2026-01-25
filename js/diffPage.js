/*
 * 獨立差異檢視頁面邏輯
 */

class DiffPage {
  constructor() {
    this.db = null;
    this.ready = false;
    this.params = new URLSearchParams(window.location.search);
  }

  async init() {
    try {
      if (typeof diff_match_patch === 'undefined') throw new Error('diff-match-patch 未載入');
      await db.initialize();
      this.db = db;
      await versionManager.init(db, diffEngine);
      this.ready = true;
      this.bindEvents();
      await this.loadAndRender();
    } catch (err) {
      this.showError(err.message || String(err));
    }
  }

  bindEvents() {
    document.getElementById('btnReload').addEventListener('click', () => {
      window.location.href = 'index.html';
    });

    document.getElementById('btnExport').addEventListener('click', () => this.exportDiff());
    document.getElementById('toggleWhitespace').addEventListener('change', () => this.loadAndRender());
    document.getElementById('toggleCase').addEventListener('change', () => this.loadAndRender());
  }

  async loadAndRender() {
    const from = this.params.get('from');
    const to = this.params.get('to');
    if (!from || !to) {
      this.showError('缺少 from 或 to 參數，請從主頁重新選擇版本。');
      return;
    }

    this.setLoading(true);

    try {
      const ignoreWs = document.getElementById('toggleWhitespace').checked;
      const ignoreCase = document.getElementById('toggleCase').checked;

      const contentFrom = await versionManager.getVersionContent(from);
      const contentTo = await versionManager.getVersionContent(to);

      const normalizedFrom = this.normalize(contentFrom, { ignoreWs, ignoreCase });
      const normalizedTo = this.normalize(contentTo, { ignoreWs, ignoreCase });

      const comparison = diffEngine.computeDiff(normalizedFrom, normalizedTo);
      this.renderMeta(from, to, comparison.stats);
      this.renderTable(comparison.lineDiffs);
      this.setLoading(false);
    } catch (err) {
      this.showError(err.message || String(err));
    }
  }

  normalize(text, { ignoreWs, ignoreCase }) {
    let t = text || '';
    if (ignoreWs) t = t.replace(/\s+/g, ' ');
    if (ignoreCase) t = t.toLowerCase();
    return t;
  }

  renderMeta(from, to, stats) {
    const metaFrom = document.getElementById('metaFrom');
    const metaTo = document.getElementById('metaTo');
    const statsEl = document.getElementById('diffStats');

    const renderMetaCard = (id, title) => `
      <div class="title">${title}</div>
      <div>版本 ID：${id}</div>
    `;

    metaFrom.innerHTML = renderMetaCard(from, '從版本');
    metaTo.innerHTML = renderMetaCard(to, '到版本');

    statsEl.innerHTML = `
      <div class="pill add">+${stats.linesAdded} 行</div>
      <div class="pill del">-${stats.linesRemoved} 行</div>
      <div class="pill same">總行數 ${stats.totalLines}</div>
    `;
  }

  renderTable(lineDiffs) {
    const table = document.getElementById('diffTable');
    const wrap = document.getElementById('diffTableWrap');
    const empty = document.getElementById('emptyState');

    table.innerHTML = '';
    empty.hidden = true;

    if (!lineDiffs || lineDiffs.length === 0) {
      wrap.hidden = true;
      empty.hidden = false;
      return;
    }

    wrap.hidden = false;

    let lineNum = 1;
    for (const [op, content] of lineDiffs) {
      const tr = document.createElement('tr');
      const marker = op === 1 ? '+' : op === -1 ? '-' : '';
      const cls = op === 1 ? 'diff-added' : op === -1 ? 'diff-removed' : 'diff-unchanged';
      tr.className = cls;

      tr.innerHTML = `
        <td class="line-number">${lineNum}</td>
        <td class="line-marker">${marker}</td>
        <td class="line-text">${this.escapeHtml(content)}</td>
      `;
      table.appendChild(tr);
      lineNum++;
    }
  }

  async exportDiff() {
    try {
      const from = this.params.get('from');
      const to = this.params.get('to');
      const data = {
        from,
        to,
        exportedAt: new Date().toISOString(),
        note: 'SQLScriptManage diff export'
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `diff_${from}_to_${to}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('匯出失敗：' + err.message);
    }
  }

  setLoading(isLoading) {
    document.getElementById('loading').hidden = !isLoading;
    document.getElementById('diffTableWrap').hidden = isLoading;
    document.getElementById('emptyState').hidden = true;
    document.getElementById('errorState').hidden = true;
  }

  showError(msg) {
    document.getElementById('loading').hidden = true;
    document.getElementById('diffTableWrap').hidden = true;
    document.getElementById('emptyState').hidden = true;
    const err = document.getElementById('errorState');
    err.hidden = false;
    err.textContent = msg;
  }

  escapeHtml(text) {
    return (text || '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c] || c));
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const page = new DiffPage();
  page.init();
});
