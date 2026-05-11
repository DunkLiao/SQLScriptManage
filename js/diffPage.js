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
      const versionFrom = await this.db.getVersion(from);
      const versionTo = await this.db.getVersion(to);

      const normalizedFrom = this.normalize(contentFrom, { ignoreWs, ignoreCase });
      const normalizedTo = this.normalize(contentTo, { ignoreWs, ignoreCase });

      const comparison = diffEngine.computeDiff(normalizedFrom, normalizedTo);
      await this.renderMeta(versionFrom, versionTo, comparison.stats);
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

  async renderMeta(fromVersion, toVersion, stats) {
    const metaFrom = document.getElementById('metaFrom');
    const metaTo = document.getElementById('metaTo');
    const statsEl = document.getElementById('diffStats');

    const fromScript = fromVersion?.scriptId ? await this.db.getScript(fromVersion.scriptId) : null;
    const toScript = toVersion?.scriptId ? await this.db.getScript(toVersion.scriptId) : null;

    this.renderMetaCard(metaFrom, '從版本', fromVersion, fromScript);
    this.renderMetaCard(metaTo, '到版本', toVersion, toScript);

    statsEl.replaceChildren();
    const pills = [
      ['pill add', `+${stats.linesAdded} 行`],
      ['pill del', `-${stats.linesRemoved} 行`],
      ['pill same', `總行數 ${stats.totalLines}`]
    ];
    for (const [className, text] of pills) {
      const pill = document.createElement('div');
      pill.className = className;
      pill.textContent = text;
      statsEl.appendChild(pill);
    }
  }

  renderMetaCard(container, title, version, script) {
    container.replaceChildren();

    const heading = document.createElement('div');
    heading.className = 'title';
    heading.textContent = title;
    container.appendChild(heading);

    const rows = [
      ['SQL 腳本', script ? this.formatScriptDisplayName(script.scriptName) : '(未知)'],
      ['標籤', version?.label || '(無)'],
      ['作者', version?.author || '(未知)'],
      ['時間', version?.timestamp ? new Date(version.timestamp).toLocaleString('zh-TW') : '(未知)'],
      ['版本 ID', version?.versionId || '(未知)']
    ];

    for (const [label, value] of rows) {
      const row = document.createElement('div');
      row.textContent = `${label}：${value}`;
      container.appendChild(row);
    }
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

      const lineNumber = document.createElement('td');
      lineNumber.className = 'line-number';
      lineNumber.textContent = lineNum;
      const lineMarker = document.createElement('td');
      lineMarker.className = 'line-marker';
      lineMarker.textContent = marker;
      const lineText = document.createElement('td');
      lineText.className = 'line-text';
      lineText.textContent = content;
      tr.appendChild(lineNumber);
      tr.appendChild(lineMarker);
      tr.appendChild(lineText);
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
      if (typeof dialogs !== 'undefined') {
        dialogs.showAlert({
          title: '匯出失敗',
          message: '匯出失敗：' + err.message,
          kind: 'danger'
        });
      } else {
        this.showError('匯出失敗：' + err.message);
      }
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

  formatScriptDisplayName(scriptName) {
    return scriptName === 'main.sql' ? 'main' : scriptName;
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const page = new DiffPage();
  page.init();
});
