/*
 * 獨立差異檢視頁面邏輯
 */

class DiffPage {
  constructor() {
    this.db = null;
    this.ready = false;
    this.params = new URLSearchParams(window.location.search);
    this.workerDiffThreshold = 250000;
    this.workerLineThreshold = 8000;
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

    this.setLoading(true, '載入版本內容...');

    try {
      const ignoreWs = document.getElementById('toggleWhitespace').checked;
      const ignoreCase = document.getElementById('toggleCase').checked;

      const contentFrom = await versionManager.getVersionContent(from);
      const contentTo = await versionManager.getVersionContent(to);
      const versionFrom = await this.db.getVersion(from);
      const versionTo = await this.db.getVersion(to);

      this.setLoading(true, this.shouldUseWorker(contentFrom, contentTo)
        ? '大檔案差異計算中...'
        : '計算差異中...');
      const comparison = await this.computeDiff(contentFrom, contentTo, { ignoreWs, ignoreCase });

      await this.renderMeta(versionFrom, versionTo, comparison.stats);
      this.setLoading(true, '渲染差異結果...');
      await this.renderTable(comparison.lineDiffs);
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

  shouldUseWorker(contentFrom, contentTo) {
    const totalLength = (contentFrom || '').length + (contentTo || '').length;
    if (totalLength >= this.workerDiffThreshold) return true;

    const totalLines = (contentFrom || '').split('\n').length + (contentTo || '').split('\n').length;
    return totalLines >= this.workerLineThreshold;
  }

  async computeDiff(contentFrom, contentTo, options) {
    if (this.shouldUseWorker(contentFrom, contentTo)) {
      try {
        return await this.computeDiffInWorker(contentFrom, contentTo, options);
      } catch (error) {
        console.warn('Worker diff 失敗，改用同步計算:', error);
        this.setLoading(true, 'Worker 無法使用，改用同步計算...');
      }
    }

    const normalizedFrom = this.normalize(contentFrom, options);
    const normalizedTo = this.normalize(contentTo, options);
    return diffEngine.computeDiff(normalizedFrom, normalizedTo);
  }

  computeDiffInWorker(contentFrom, contentTo, options) {
    return new Promise((resolve, reject) => {
      if (typeof Worker === 'undefined') {
        reject(new Error('此瀏覽器不支援 Web Worker'));
        return;
      }

      const worker = new Worker('js/workers/diffWorker.js');
      worker.onmessage = (event) => {
        worker.terminate();
        if (event.data?.ok) {
          resolve(event.data.comparison);
          return;
        }
        reject(new Error(event.data?.error || 'Worker diff 失敗'));
      };
      worker.onerror = (event) => {
        worker.terminate();
        reject(new Error(event.message || 'Worker diff 載入失敗'));
      };
      worker.postMessage({ contentFrom, contentTo, options });
    });
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

  async renderTable(lineDiffs) {
    const table = document.getElementById('diffTable');
    const wrap = document.getElementById('diffTableWrap');
    const empty = document.getElementById('emptyState');

    table.replaceChildren();
    empty.hidden = true;

    if (!lineDiffs || lineDiffs.length === 0) {
      wrap.hidden = true;
      empty.hidden = false;
      return;
    }

    wrap.hidden = false;

    let lineNum = 1;
    const batchSize = 500;
    let frag = document.createDocumentFragment();

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
      frag.appendChild(tr);
      lineNum++;

      if (lineNum % batchSize === 0) {
        table.appendChild(frag);
        frag = document.createDocumentFragment();
        await this.nextFrame();
      }
    }

    table.appendChild(frag);
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

  nextFrame() {
    return new Promise(resolve => requestAnimationFrame(resolve));
  }

  setLoading(isLoading, message = '載入中...') {
    const loading = document.getElementById('loading');
    loading.textContent = message;
    loading.hidden = !isLoading;
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
