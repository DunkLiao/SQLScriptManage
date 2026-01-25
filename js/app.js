/**
 * 主應用控制器和交互邏輯
 */

class SQLVersionApp {
  constructor() {
    this.db = null;
    this.versionManager = null;
    this.importExportManager = null;
    this.currentVersion = null;
    this.selectedVersionId = null;
  }

  /**
   * 初始化應用
   */
  async init() {
    console.log('正在初始化 SQL 版本控管工具...');

    try {
      // 驗證所有依賴是否已加載
      if (typeof diff_match_patch === 'undefined') {
        throw new Error('diff-match-patch 庫未加載');
      }
      if (typeof db === 'undefined') {
        throw new Error('database 模塊未加載');
      }
      if (typeof diffEngine === 'undefined') {
        throw new Error('diffEngine 模塊未加載');
      }
      if (typeof versionManager === 'undefined') {
        throw new Error('versionManager 模塊未加載');
      }
      if (typeof importExportManager === 'undefined') {
        throw new Error('importExportManager 模塊未加載');
      }
      
      console.log('✓ 所有依賴模塊已成功加載');

      // 初始化數據庫
      await db.initialize();
      this.db = db;

      // 初始化版本管理器
      await versionManager.init(db, diffEngine);
      this.versionManager = versionManager;

      // 初始化導入導出管理器
      await importExportManager.init(db, versionManager, diffEngine);
      this.importExportManager = importExportManager;

      // 綁定 UI 事件
      this.bindUIEvents();

      // 加載版本列表
      await this.loadVersionTree();

      console.log('應用初始化完成');
    } catch (error) {
      console.error('應用初始化失敗:', error);
      alert('應用初始化失敗：' + error.message);
    }
  }

  /**
   * 綁定 UI 事件
   */
  bindUIEvents() {
    // SQL 編輯器
    const sqlEditor = document.getElementById('sqlEditor');
    sqlEditor.addEventListener('input', () => this.updateEditorStats());

    document.getElementById('btnFormat').addEventListener('click', () => this.formatSQL());
    document.getElementById('btnClear').addEventListener('click', () => this.clearSQL());

    // 工具欄按鈕
    document.getElementById('btnSaveVersion').addEventListener('click', () => this.showSaveVersionDialog());
    document.getElementById('btnCompare').addEventListener('click', () => this.showCompareDialog());

    // 導航欄按鈕
    document.getElementById('btnNewVersion').addEventListener('click', () => this.showSaveVersionDialog());
    document.getElementById('btnExport').addEventListener('click', () => this.showExportDialog());
    document.getElementById('btnImport').addEventListener('click', () => this.showImportDialog());

    // 版本資訊區域
    document.getElementById('btnEditLabel').addEventListener('click', () => this.enableLabelEdit());
    document.getElementById('btnSaveLabel').addEventListener('click', () => this.saveVersionLabel());
    document.getElementById('btnCopyVersionId').addEventListener('click', () => this.copyVersionId());
    document.getElementById('btnDeleteVersion').addEventListener('click', () => this.deleteVersion());

    // 版本列表
    document.getElementById('btnSearch').addEventListener('click', () => this.searchVersions());
    document.getElementById('searchVersions').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.searchVersions();
    });

    // 模態對話框
    this.bindDialogEvents();
  }

  /**
   * 綁定模態對話框事件
   */
  bindDialogEvents() {
    // 新增版本對話框
    document.getElementById('btnCloseModal').addEventListener('click', () => {
      document.getElementById('newVersionModal').style.display = 'none';
    });
    document.getElementById('btnCancelSave').addEventListener('click', () => {
      document.getElementById('newVersionModal').style.display = 'none';
    });
    document.getElementById('btnConfirmSave').addEventListener('click', () => this.confirmSaveVersion());

    // 比對對話框
    document.getElementById('btnCloseCompare').addEventListener('click', () => {
      document.getElementById('compareModal').style.display = 'none';
    });
    document.getElementById('btnCancelCompare').addEventListener('click', () => {
      document.getElementById('compareModal').style.display = 'none';
    });
    document.getElementById('btnDoCompare').addEventListener('click', () => this.performComparison());

    // 導出對話框
    document.getElementById('btnCloseExport').addEventListener('click', () => {
      document.getElementById('exportModal').style.display = 'none';
    });
    document.getElementById('btnCancelExport').addEventListener('click', () => {
      document.getElementById('exportModal').style.display = 'none';
    });
    document.getElementById('btnStartExport').addEventListener('click', () => this.performExport());

    // 導入檔案輸入
    document.getElementById('importFileInput').addEventListener('change', (e) => {
      this.handleImportFile(e);
    });

    // 衝突確認對話框
    document.getElementById('btnCloseConflict').addEventListener('click', () => {
      document.getElementById('conflictModal').style.display = 'none';
    });
    document.getElementById('btnCancelImport').addEventListener('click', () => {
      document.getElementById('conflictModal').style.display = 'none';
    });
    document.getElementById('btnConfirmImport').addEventListener('click', () => this.confirmImport());
  }

  /**
   * 更新編輯器統計信息
   */
  updateEditorStats() {
    const sqlEditor = document.getElementById('sqlEditor');
    const lines = sqlEditor.value.split('\n');
    const chars = sqlEditor.value.length;

    document.getElementById('lineCount').textContent = lines.length;
    document.getElementById('charCount').textContent = chars;
  }

  /**
   * 格式化 SQL
   */
  formatSQL() {
    const sqlEditor = document.getElementById('sqlEditor');
    let sql = sqlEditor.value;

    // 簡單的格式化：轉換為大寫 SQL 關鍵字
    // 實際應用中可以集成專業的 SQL 格式化庫
    sql = sql
      .replace(/\bSELECT\b/gi, 'SELECT')
      .replace(/\bFROM\b/gi, 'FROM')
      .replace(/\bWHERE\b/gi, 'WHERE')
      .replace(/\bAND\b/gi, 'AND')
      .replace(/\bOR\b/gi, 'OR')
      .replace(/\bJOIN\b/gi, 'JOIN')
      .replace(/\bLEFT\b/gi, 'LEFT')
      .replace(/\bRIGHT\b/gi, 'RIGHT')
      .replace(/\bINNER\b/gi, 'INNER')
      .replace(/\bOUTER\b/gi, 'OUTER')
      .replace(/\bON\b/gi, 'ON')
      .replace(/\bORDER\s+BY\b/gi, 'ORDER BY')
      .replace(/\bGROUP\s+BY\b/gi, 'GROUP BY');

    sqlEditor.value = sql;
    this.updateEditorStats();
  }

  /**
   * 清空 SQL
   */
  clearSQL() {
    if (confirm('確定要清空編輯器內容嗎？')) {
      document.getElementById('sqlEditor').value = '';
      this.updateEditorStats();
    }
  }

  /**
   * 加載版本列表樹
   */
  async loadVersionTree() {
    const versions = await this.versionManager.getAllVersions();
    const treeContainer = document.getElementById('versionTree');
    treeContainer.innerHTML = '';

    if (versions.length === 0) {
      treeContainer.innerHTML = '<p style="text-align:center; color:#999;">暫無版本</p>';
      return;
    }

    for (const version of versions) {
      const item = this.createVersionTreeItem(version);
      treeContainer.appendChild(item);
    }
  }

  /**
   * 創建版本樹項目
   */
  createVersionTreeItem(version) {
    const item = document.createElement('div');
    item.className = 'version-item';
    item.dataset.versionId = version.versionId;

    const header = document.createElement('div');
    header.className = 'version-item-header';

    const toggle = document.createElement('span');
    toggle.className = 'version-toggle';
    toggle.textContent = '▼';

    const id = document.createElement('span');
    id.className = 'version-id';
    id.textContent = version.versionId;

    const label = document.createElement('span');
    label.className = 'version-label';
    label.textContent = version.label || '(無標籤)';

    header.appendChild(toggle);
    header.appendChild(id);
    header.appendChild(label);

    const detail = document.createElement('div');
    detail.className = 'version-item-detail';
    const date = new Date(version.timestamp).toLocaleString('zh-TW');
    detail.textContent = `${date} • ${version.author}`;

    item.appendChild(header);
    item.appendChild(detail);

    // 綁定點擊事件
    item.addEventListener('click', () => this.selectVersion(version.versionId));

    return item;
  }

  /**
   * 選擇版本
   */
  async selectVersion(versionId) {
    // 移除前一個選中狀態
    document.querySelectorAll('.version-item.active').forEach(item => {
      item.classList.remove('active');
    });

    // 標記當前版本為選中
    const selectedItem = document.querySelector(`[data-version-id="${versionId}"]`);
    if (selectedItem) {
      selectedItem.classList.add('active');
    }

    this.selectedVersionId = versionId;

    // 加載版本詳情
    await this.loadVersionDetail(versionId);
  }

  /**
   * 加載版本詳情
   */
  async loadVersionDetail(versionId) {
    const version = await this.versionManager.db.getVersion(versionId);
    if (!version) return;

    // 更新版本資訊面板
    document.getElementById('versionId').textContent = version.versionId;
    document.getElementById('versionTime').textContent = new Date(version.timestamp).toLocaleString('zh-TW');
    document.getElementById('versionLabel').value = version.label;
    document.getElementById('versionAuthor').textContent = version.author;
    document.getElementById('versionDiffAdded').textContent = `+${version.stats.linesAdded} 行`;
    document.getElementById('versionDiffRemoved').textContent = `-${version.stats.linesRemoved} 行`;

    // 加載版本內容到編輯器
    const content = await this.versionManager.getVersionContent(versionId);
    document.getElementById('sqlEditor').value = content;
    this.updateEditorStats();

    // 加載版本詳情面板
    const detailContent = document.getElementById('detailContent');
    detailContent.innerHTML = `
      <div style="font-size: 12px; color: #666;">
        <p><strong>版本 ID：</strong> ${version.versionId}</p>
        <p><strong>時間：</strong> ${new Date(version.timestamp).toLocaleString('zh-TW')}</p>
        <p><strong>標籤：</strong> ${version.label}</p>
        <p><strong>作者：</strong> ${version.author}</p>
        <p><strong>描述：</strong> ${version.description || '(無)' }</p>
        <p><strong>父版本：</strong> ${version.parentVersionId || '(根版本)'}</p>
        <p><strong>存儲模式：</strong> ${version.isDeltaMode ? '差異' : '完整內容'}</p>
        <p><strong>統計：</strong> +${version.stats.linesAdded} -${version.stats.linesRemoved}</p>
      </div>
    `;
  }

  /**
   * 顯示保存版本對話框
   */
  showSaveVersionDialog() {
    document.getElementById('newLabel').value = '';
    document.getElementById('newDescription').value = '';
    document.getElementById('newAuthor').value = localStorage.getItem('lastAuthor') || '';
    document.getElementById('createSnapshot').checked = false;
    document.getElementById('newVersionModal').style.display = 'flex';
  }

  /**
   * 確認保存版本
   */
  async confirmSaveVersion() {
    const label = document.getElementById('newLabel').value.trim();
    const description = document.getElementById('newDescription').value.trim();
    const author = document.getElementById('newAuthor').value.trim();
    const createSnapshot = document.getElementById('createSnapshot').checked;
    const sql = document.getElementById('sqlEditor').value.trim();

    if (!label) {
      alert('請輸入版本標籤');
      return;
    }

    if (!author) {
      alert('請輸入作者');
      return;
    }

    if (!sql) {
      alert('請輸入 SQL 內容');
      return;
    }

    try {
      // 保存作者到本地存儲
      localStorage.setItem('lastAuthor', author);

      // 保存版本
      const version = await this.versionManager.saveVersion(
        sql,
        label,
        description,
        author,
        createSnapshot
      );

      alert(`版本保存成功！\nID: ${version.versionId}`);

      // 關閉對話框
      document.getElementById('newVersionModal').style.display = 'none';

      // 重新加載版本列表
      await this.loadVersionTree();

      // 選擇新版本
      await this.selectVersion(version.versionId);
    } catch (error) {
      alert('保存版本失敗：' + error.message);
    }
  }

  /**
   * 顯示比對對話框
   */
  showCompareDialog() {
    const compareFrom = document.getElementById('compareFrom');
    const compareTo = document.getElementById('compareTo');

    // 填充版本選項
    versionManager.getAllVersions().then(versions => {
      compareFrom.innerHTML = '<option value="">選擇版本...</option>';
      compareTo.innerHTML = '<option value="">選擇版本...</option>';

      for (const version of versions) {
        const optFrom = document.createElement('option');
        optFrom.value = version.versionId;
        optFrom.textContent = `${version.label} (${version.versionId})`;
        compareFrom.appendChild(optFrom);

        const optTo = document.createElement('option');
        optTo.value = version.versionId;
        optTo.textContent = `${version.label} (${version.versionId})`;
        compareTo.appendChild(optTo);
      }

      // 預設選擇
      if (this.selectedVersionId && versions.length > 0) {
        const selectedIndex = versions.findIndex(v => v.versionId === this.selectedVersionId);
        if (selectedIndex > 0) {
          compareFrom.value = versions[selectedIndex - 1].versionId;
        }
        compareTo.value = this.selectedVersionId;
      }
    });

    document.getElementById('compareModal').style.display = 'flex';
  }

  /**
   * 執行比對
   */
  async performComparison() {
    const from = document.getElementById('compareFrom').value;
    const to = document.getElementById('compareTo').value;

    if (!from || !to) {
      alert('請選擇兩個版本進行比對');
      return;
    }

    try {
      const comparison = await this.versionManager.compareVersions(from, to);

      // 關閉比對對話框
      document.getElementById('compareModal').style.display = 'none';

      // 渲染 Diff 查看器
      this.renderDiffViewer(comparison);

      // 展開 Diff 面板
      document.getElementById('diffPanel').style.display = 'block';
    } catch (error) {
      alert('比對失敗：' + error.message);
    }
  }

  /**
   * 渲染 Diff 查看器
   */
  renderDiffViewer(comparison) {
    const diffContent = document.getElementById('diffContent');
    
    let html = `
      <div class="diff-viewer">
        <div class="diff-header-info">
          <div class="diff-versions">
            <span class="version-label">從版本</span>
            <span class="version-id">${comparison.fromVersion}</span>
            <span class="arrow">→</span>
            <span class="version-label">到版本</span>
            <span class="version-id">${comparison.toVersion}</span>
          </div>
        </div>
        <div class="diff-stats-bar">
          <span class="stat-added">+${comparison.stats.linesAdded} 行</span>
          <span class="stat-removed">-${comparison.stats.linesRemoved} 行</span>
          <span class="stat-total">${comparison.stats.totalLines} 總行數</span>
        </div>
        <div class="diff-content">
          <table class="diff-table">
            <tbody>
    `;

    let lineNum = 1;
    for (const [op, content] of comparison.lineDiffs) {
      let className = '';
      let marker = '';

      if (op === 1) {
        className = 'diff-added';
        marker = '+';
      } else if (op === -1) {
        className = 'diff-removed';
        marker = '-';
      } else {
        className = 'diff-unchanged';
        marker = ' ';
      }

      const escapedContent = this.escapeHtml(content);
      html += `
        <tr class="${className}">
          <td class="line-number">${lineNum}</td>
          <td class="line-marker"></td>
          <td class="line-content"><code>${escapedContent}</code></td>
        </tr>
      `;
      lineNum++;
    }

    html += `
            </tbody>
          </table>
        </div>
      </div>
    `;

    diffContent.innerHTML = html;
  }

  /**
   * 版本回溯
   */
  async revertToVersion() {
    if (!this.selectedVersionId) {
      alert('請先選擇一個版本');
      return;
    }

    if (confirm(`確定要回溯到版本 ${this.selectedVersionId} 嗎？`)) {
      try {
        const content = await this.versionManager.revertToVersion(this.selectedVersionId);
        document.getElementById('sqlEditor').value = content;
        this.updateEditorStats();
        alert('版本已回溯！');
      } catch (error) {
        alert('回溯失敗：' + error.message);
      }
    }
  }

  /**
   * 啟用 Label 編輯
   */
  enableLabelEdit() {
    const input = document.getElementById('versionLabel');
    const editBtn = document.getElementById('btnEditLabel');
    const saveBtn = document.getElementById('btnSaveLabel');

    input.disabled = false;
    input.focus();
    editBtn.style.display = 'none';
    saveBtn.style.display = 'inline-block';
  }

  /**
   * 保存版本 Label
   */
  async saveVersionLabel() {
    if (!this.selectedVersionId) return;

    const label = document.getElementById('versionLabel').value.trim();
    if (!label) {
      alert('標籤不能為空');
      return;
    }

    try {
      await this.versionManager.updateVersionLabel(this.selectedVersionId, label);
      alert('標籤已保存');

      // 禁用編輯
      document.getElementById('versionLabel').disabled = true;
      document.getElementById('btnEditLabel').style.display = 'inline-block';
      document.getElementById('btnSaveLabel').style.display = 'none';

      // 重新加載版本樹
      await this.loadVersionTree();
      await this.selectVersion(this.selectedVersionId);
    } catch (error) {
      alert('保存失敗：' + error.message);
    }
  }

  /**
   * 複製版本 ID
   */
  copyVersionId() {
    const versionId = document.getElementById('versionId').textContent;
    if (versionId === '-') return;

    navigator.clipboard.writeText(versionId).then(() => {
      alert('版本 ID 已複製到剪貼板');
    });
  }

  /**
   * 刪除版本
   */
  async deleteVersion() {
    if (!this.selectedVersionId) {
      alert('請先選擇一個版本');
      return;
    }

    if (confirm(`確定要刪除版本 ${this.selectedVersionId} 嗎？此操作無法撤銷。`)) {
      try {
        await this.versionManager.deleteVersion(this.selectedVersionId);
        alert('版本已刪除');

        // 重新加載版本列表
        await this.loadVersionTree();

        // 清空編輯器和詳情面板
        document.getElementById('sqlEditor').value = '';
        document.getElementById('detailContent').innerHTML = '<p class="placeholder-text">選擇一個版本查看詳情</p>';
        this.updateEditorStats();
      } catch (error) {
        alert('刪除失敗：' + error.message);
      }
    }
  }

  /**
   * 搜尋版本
   */
  async searchVersions() {
    const keyword = document.getElementById('searchVersions').value.trim();

    if (!keyword) {
      await this.loadVersionTree();
      return;
    }

    try {
      const results = await this.versionManager.searchVersions(keyword);
      const treeContainer = document.getElementById('versionTree');
      treeContainer.innerHTML = '';

      if (results.length === 0) {
        treeContainer.innerHTML = '<p style="text-align:center; color:#999;">未找到相符的版本</p>';
        return;
      }

      for (const version of results) {
        const item = this.createVersionTreeItem(version);
        treeContainer.appendChild(item);
      }
    } catch (error) {
      alert('搜尋失敗：' + error.message);
    }
  }

  /**
   * 顯示導出對話框
   */
  showExportDialog() {
    document.getElementById('exportModal').style.display = 'flex';
  }

  /**
   * 執行導出
   */
  async performExport() {
    try {
      const includeMetadata = document.getElementById('exportMetadata').checked;
      const includeSQL = document.getElementById('exportSQL').checked;
      const includeTags = document.getElementById('exportTags').checked;
      const includeComments = document.getElementById('exportComments').checked;
      const format = document.querySelector('input[name="format"]:checked').value;

      if (!includeMetadata && !includeSQL) {
        alert('請至少選擇一個導出內容');
        return;
      }

      const { sqlContent, jsonContent, filename } = await this.importExportManager.exportToSQLAndJSON({
        includeDelta: false,
        includeTags,
        includeComments
      });

      // 下載
      if (format === 'zip') {
        await this.importExportManager.downloadAsZip(sqlContent, jsonContent, filename);
      } else {
        if (includeSQL) {
          this.importExportManager.downloadFile(sqlContent, `${filename}.sql`, 'text/plain');
        }
        if (includeMetadata) {
          this.importExportManager.downloadFile(jsonContent, `${filename}.json`, 'application/json');
        }
      }

      alert('導出成功！');
      document.getElementById('exportModal').style.display = 'none';
    } catch (error) {
      alert('導出失敗：' + error.message);
    }
  }

  /**
   * 顯示導入對話框
   */
  showImportDialog() {
    document.getElementById('importFileInput').click();
  }

  /**
   * 處理導入檔案
   */
  async handleImportFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
      let importData;

      if (file.name.endsWith('.zip')) {
        const zipData = await this.importExportManager.parseZipFile(file);
        importData = zipData.jsonContent;
      } else if (file.name.endsWith('.json')) {
        const text = await file.text();
        importData = JSON.parse(text);
      } else {
        alert('請選擇 ZIP 或 JSON 檔案');
        return;
      }

      // 驗證導入數據
      const result = await this.importExportManager.importFromJSON(importData);

      if (result.conflicts.length > 0) {
        // 顯示衝突確認對話框
        this.showConflictDialog(result);
      } else {
        // 直接導入
        await this.performImport(importData);
      }
    } catch (error) {
      alert('導入失敗：' + error.message);
    }

    // 重置檔案輸入
    event.target.value = '';
  }

  /**
   * 顯示衝突確認對話框
   */
  showConflictDialog(result) {
    const conflictList = document.getElementById('conflictList');
    conflictList.innerHTML = '';

    for (const conflict of result.conflicts) {
      const conflictHtml = `
        <div class="conflict-item">
          <div class="conflict-header">
            <span class="conflict-type">⚠️ ${conflict.type === 'version_exists' ? '版本 ID 重複' : '孤立版本'}</span>
            <span class="conflict-version">${conflict.versionId}</span>
          </div>
          <div class="conflict-detail">
            ${conflict.type === 'version_exists' ? `
              <p><strong>本地版本：</strong> ${new Date(conflict.local.timestamp).toLocaleString('zh-TW')}</p>
              <p><strong>導入版本：</strong> ${new Date(conflict.import.timestamp).toLocaleString('zh-TW')}</p>
              <p><strong>內容一致：</strong> ${conflict.contentMatch ? '是' : '否'}</p>
              <div class="conflict-actions">
                <label class="radio-button">
                  <input type="radio" name="conflict_${conflict.versionId}" value="skip" checked />
                  <span>跳過</span>
                </label>
                <label class="radio-button">
                  <input type="radio" name="conflict_${conflict.versionId}" value="overwrite" />
                  <span>覆蓋</span>
                </label>
                <label class="radio-button">
                  <input type="radio" name="conflict_${conflict.versionId}" value="merge" />
                  <span>合併</span>
                </label>
              </div>
            ` : `
              <p>${conflict.message}</p>
            `}
          </div>
        </div>
      `;
      conflictList.innerHTML += conflictHtml;
    }

    // 保存導入數據供稍後使用
    this.pendingImportData = result.data;
    document.getElementById('conflictModal').style.display = 'flex';
  }

  /**
   * 確認導入
   */
  async confirmImport() {
    const strategy = document.querySelector('input[name="strategy"]:checked').value;
    const resolutions = {};

    if (strategy !== 'custom') {
      // 對所有衝突應用相同策略
      for (const conflict of this.importExportManager._detectConflicts(this.pendingImportData.versions)) {
        if (conflict.type === 'version_exists') {
          resolutions[conflict.versionId] = strategy === 'skipAll' ? 'skip' :
                                            strategy === 'overwriteAll' ? 'overwrite' :
                                            'merge';
        }
      }
    } else {
      // 逐個讀取用戶選擇
      const conflictItems = document.querySelectorAll('.conflict-item');
      conflictItems.forEach((item) => {
        const versionId = item.querySelector('.conflict-version').textContent;
        const selected = item.querySelector(`input[name="conflict_${versionId}"]:checked`);
        if (selected) {
          resolutions[versionId] = selected.value;
        }
      });
    }

    try {
      await this.performImport(this.pendingImportData, resolutions);
    } catch (error) {
      alert('導入失敗：' + error.message);
    }
  }

  /**
   * 執行導入
   */
  async performImport(jsonData, resolutions = {}) {
    try {
      const results = await this.importExportManager.executeImport(jsonData, resolutions);

      let message = `導入完成！\n`;
      message += `匯入：${results.imported} 個版本\n`;
      message += `覆蓋：${results.overwritten} 個版本\n`;
      message += `合併：${results.merged} 個版本\n`;
      message += `跳過：${results.skipped} 個版本`;

      if (results.errors.length > 0) {
        message += `\n錯誤：${results.errors.length} 個版本`;
      }

      alert(message);

      // 關閉對話框
      document.getElementById('conflictModal').style.display = 'none';

      // 重新加載版本列表
      await this.loadVersionTree();
    } catch (error) {
      alert('導入失敗：' + error.message);
    }
  }

  /**
   * 顯示標籤管理（暫不實現）
   */
  showTagsManagement() {
    alert('標籤管理功能即將推出');
  }

  /**
   * HTML 轉義
   */
  escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }
}

// 應用初始化
const app = new SQLVersionApp();
document.addEventListener('DOMContentLoaded', () => {
  app.init();
});
