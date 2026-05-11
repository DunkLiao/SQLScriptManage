/**
 * 匯入、匯出、完整備份與完整還原 UI 流程控制器。
 */

class ImportExportDialogs {
  constructor(options) {
    this.db = options.db;
    this.projectManager = options.projectManager;
    this.scriptManager = options.scriptManager;
    this.importExportManager = options.importExportManager;
    this.renderImpactSummary = options.renderImpactSummary;
    this.confirmDangerAction = options.confirmDangerAction;
    this.onDataChanged = options.onDataChanged || (async () => {});
    this.onError = options.onError || ((message) => {
      if (typeof dialogs !== 'undefined') {
        dialogs.showAlert({ title: '操作失敗', message, kind: 'danger' });
      }
    });

    this.pendingImportData = null;
    this.pendingRestoreData = null;
  }

  bindEvents() {
    this.bindExportEvents();
    this.bindImportEvents();
    this.bindFullBackupEvents();
    this.bindFullRestoreEvents();
  }

  bindExportEvents() {
    this.bindClose('btnCloseExport', 'exportModal');
    this.bindClose('btnCancelExport', 'exportModal');

    const btnStartExport = document.getElementById('btnStartExport');
    if (btnStartExport) {
      btnStartExport.addEventListener('click', () => this.performExport());
    }
  }

  bindImportEvents() {
    const importFileInput = document.getElementById('importFileInput');
    if (importFileInput) {
      importFileInput.addEventListener('change', (event) => this.handleImportFile(event));
    }

    this.bindClose('btnCloseConflict', 'conflictModal');
    this.bindClose('btnCancelImport', 'conflictModal');
    this.bindClose('btnCloseImportProject', 'importProjectModal');
    this.bindClose('btnCancelImportProject', 'importProjectModal');

    const btnConfirmImport = document.getElementById('btnConfirmImport');
    if (btnConfirmImport) {
      btnConfirmImport.addEventListener('click', () => this.confirmImport());
    }

    document.querySelectorAll('input[name="strategy"]').forEach(input => {
      input.addEventListener('change', () => this.updateImportPreviewSummary());
    });
  }

  bindFullBackupEvents() {
    this.bindClose('btnCloseFullBackup', 'fullBackupModal');
    this.bindClose('btnCancelFullBackup', 'fullBackupModal');

    const btnConfirmFullBackup = document.getElementById('btnConfirmFullBackup');
    if (btnConfirmFullBackup) {
      btnConfirmFullBackup.addEventListener('click', () => this.performFullBackup());
    }
  }

  bindFullRestoreEvents() {
    this.bindClose('btnCloseFullRestore', 'fullRestoreModal');
    this.bindClose('btnCancelFullRestore', 'fullRestoreModal');

    const btnConfirmFullRestore = document.getElementById('btnConfirmFullRestore');
    if (btnConfirmFullRestore) {
      btnConfirmFullRestore.addEventListener('click', () => this.performFullRestore());
    }

    document.querySelectorAll('input[name="restoreStrategy"]').forEach(input => {
      input.addEventListener('change', () => this.updateFullRestorePreview());
    });

    const restoreClearExisting = document.getElementById('restoreClearExisting');
    if (restoreClearExisting) {
      restoreClearExisting.addEventListener('change', () => this.updateFullRestorePreview());
    }

    const fullRestoreFileInput = document.getElementById('fullRestoreFileInput');
    if (fullRestoreFileInput) {
      fullRestoreFileInput.addEventListener('change', (event) => this.handleFullRestoreFile(event));
    }
  }

  bindClose(buttonId, modalId) {
    const button = document.getElementById(buttonId);
    if (!button) return;

    button.addEventListener('click', () => {
      const modal = document.getElementById(modalId);
      if (modal) modal.style.display = 'none';
    });
  }

  showExportDialog() {
    const exportProjectSelect = document.getElementById('exportProjectSelect');
    if (exportProjectSelect) {
      const projects = this.projectManager.getProjects();
      const currentProjectId = this.projectManager.getCurrentProjectId();

      exportProjectSelect.innerHTML = '';
      for (const project of projects) {
        const option = document.createElement('option');
        option.value = project.projectId;
        option.textContent = project.projectName;
        if (project.projectId === currentProjectId) {
          option.selected = true;
        }
        exportProjectSelect.appendChild(option);
      }
    }

    document.getElementById('exportModal').style.display = 'flex';
  }

  async performExport() {
    try {
      const includeTags = document.getElementById('exportTags').checked;
      const includeComments = document.getElementById('exportComments').checked;
      const exportProjectSelect = document.getElementById('exportProjectSelect');
      const projectId = exportProjectSelect ? exportProjectSelect.value : null;

      const { jsonContent, filename } = await this.importExportManager.exportToJSON({
        includeTags,
        includeComments,
        projectId
      });

      this.importExportManager.downloadFile(jsonContent, `${filename}.json`, 'application/json');
      dialogs.showToast('導出成功！(JSON)', { kind: 'success' });
      document.getElementById('exportModal').style.display = 'none';
    } catch (error) {
      this.onError('導出失敗：' + error.message);
    }
  }

  showImportDialog() {
    document.getElementById('importFileInput').click();
  }

  async handleImportFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
      if (!file.name.endsWith('.json')) {
        this.onError('請選擇 JSON 檔案');
        event.target.value = '';
        return;
      }

      const text = await file.text();
      const result = await this.importExportManager.importFromJSON(text);
      const importData = result.data;

      const targetProjectId = await this.showImportProjectSelector();
      if (!targetProjectId) {
        event.target.value = '';
        return;
      }

      this.pendingImportData = { importData, targetProjectId };
      await this.showConflictDialog(result, targetProjectId);
    } catch (error) {
      this.onError('導入失敗：' + error.message);
    }

    event.target.value = '';
  }

  async showImportProjectSelector() {
    return new Promise((resolve) => {
      const modal = document.getElementById('importProjectModal');
      const selector = document.getElementById('importTargetProject');

      if (!modal || !selector) {
        resolve(this.projectManager.getCurrentProjectId());
        return;
      }

      const projects = this.projectManager.getProjects();
      const currentProjectId = this.projectManager.getCurrentProjectId();

      selector.innerHTML = '';
      for (const project of projects) {
        const option = document.createElement('option');
        option.value = project.projectId;
        option.textContent = project.projectName;
        if (project.projectId === currentProjectId) {
          option.selected = true;
        }
        selector.appendChild(option);
      }

      modal.style.display = 'flex';

      const confirmBtn = document.getElementById('btnConfirmImportProject');
      const closeBtn = document.getElementById('btnCloseImportProject');
      const cancelBtn = document.getElementById('btnCancelImportProject');

      const cleanup = () => {
        confirmBtn.removeEventListener('click', handleConfirm);
        closeBtn.removeEventListener('click', handleCancel);
        cancelBtn.removeEventListener('click', handleCancel);
      };

      const handleConfirm = () => {
        const projectId = selector.value;
        modal.style.display = 'none';
        cleanup();
        resolve(projectId);
      };

      const handleCancel = () => {
        modal.style.display = 'none';
        cleanup();
        resolve(null);
      };

      confirmBtn.addEventListener('click', handleConfirm);
      closeBtn.addEventListener('click', handleCancel);
      cancelBtn.addEventListener('click', handleCancel);
    });
  }

  async showConflictDialog(result, targetProjectId = null) {
    const title = document.getElementById('conflictModalTitle');
    const intro = document.getElementById('importConfirmIntro');
    const strategyPanel = document.getElementById('conflictStrategyPanel');
    const conflictList = document.getElementById('conflictList');
    conflictList.innerHTML = '';

    if (title) {
      title.textContent = result.conflicts.length > 0 ? '導入衝突確認' : '導入確認';
    }
    if (intro) {
      intro.textContent = result.conflicts.length > 0
        ? '檢測到以下版本衝突，請選擇處理方式並確認導入影響摘要。'
        : '未檢測到版本 ID 衝突，請確認導入影響摘要後再執行。';
    }
    if (strategyPanel) {
      strategyPanel.hidden = result.conflicts.length === 0;
    }

    const defaultStrategy = document.querySelector('input[name="strategy"][value="skipAll"]');
    if (defaultStrategy) defaultStrategy.checked = true;

    for (const conflict of result.conflicts) {
      conflictList.appendChild(this.createConflictItem(conflict));
    }

    this.pendingImportData = {
      importData: result.data,
      targetProjectId: targetProjectId || this.projectManager.getCurrentProjectId()
    };
    await this.updateImportPreviewSummary();
    document.getElementById('conflictModal').style.display = 'flex';
  }

  createConflictItem(conflict) {
    const item = document.createElement('div');
    item.className = 'conflict-item';
    item.dataset.versionId = conflict.versionId;

    const header = document.createElement('div');
    header.className = 'conflict-header';
    const type = document.createElement('span');
    type.className = 'conflict-type';
    type.textContent = conflict.type === 'version_exists' ? '版本 ID 重複' : '孤立版本';
    const version = document.createElement('span');
    version.className = 'conflict-version';
    version.textContent = conflict.versionId;
    header.appendChild(type);
    header.appendChild(version);
    item.appendChild(header);

    const detail = document.createElement('div');
    detail.className = 'conflict-detail';
    if (conflict.type === 'version_exists') {
      const local = document.createElement('p');
      local.textContent = `本地版本：${new Date(conflict.local.timestamp).toLocaleString('zh-TW')}`;
      const imported = document.createElement('p');
      imported.textContent = `導入版本：${new Date(conflict.import.timestamp).toLocaleString('zh-TW')}`;
      const same = document.createElement('p');
      same.textContent = `內容一致：${conflict.contentMatch ? '是' : '否'}`;
      const actions = document.createElement('div');
      actions.className = 'conflict-actions';
      for (const [value, label] of [['skip', '跳過'], ['overwrite', '覆蓋'], ['merge', '合併']]) {
        const radioLabel = document.createElement('label');
        radioLabel.className = 'radio-button';
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = `conflict_${conflict.versionId}`;
        input.value = value;
        input.checked = value === 'skip';
        input.addEventListener('change', () => this.updateImportPreviewSummary());
        const span = document.createElement('span');
        span.textContent = label;
        radioLabel.appendChild(input);
        radioLabel.appendChild(span);
        actions.appendChild(radioLabel);
      }
      detail.appendChild(local);
      detail.appendChild(imported);
      detail.appendChild(same);
      detail.appendChild(actions);
    } else {
      const message = document.createElement('p');
      message.textContent = conflict.message || '缺失父版本';
      detail.appendChild(message);
    }
    item.appendChild(detail);

    return item;
  }

  collectImportResolutions() {
    const strategyEl = document.querySelector('input[name="strategy"]:checked');
    const strategy = strategyEl ? strategyEl.value : 'skipAll';
    const resolutions = {};

    if (!this.pendingImportData?.importData?.versions) {
      return resolutions;
    }

    if (strategy !== 'custom') {
      for (const version of this.pendingImportData.importData.versions) {
        resolutions[version.versionId] = strategy === 'skipAll' ? 'skip' :
                                        strategy === 'overwriteAll' ? 'overwrite' :
                                        'merge';
      }
      return resolutions;
    }

    const conflictItems = document.querySelectorAll('.conflict-item');
    conflictItems.forEach((item) => {
      const versionId = item.querySelector('.conflict-version').textContent;
      const selected = item.querySelector(`input[name="conflict_${versionId}"]:checked`);
      if (selected) {
        resolutions[versionId] = selected.value;
      }
    });
    return resolutions;
  }

  async updateImportPreviewSummary() {
    const container = document.getElementById('importImpactSummary');
    if (!container || !this.pendingImportData?.importData) return;

    try {
      const preview = await this.importExportManager.getImportPreview(this.pendingImportData.importData, {
        targetProjectId: this.pendingImportData.targetProjectId,
        resolutions: this.collectImportResolutions()
      });

      this.renderImpactSummary(container, '導入影響摘要', [
        { label: 'SQL 腳本', value: `新增 ${preview.scripts.imported}、跳過 ${preview.scripts.skipped}` },
        { label: '版本', value: `新增 ${preview.versions.imported}、覆蓋 ${preview.versions.overwritten}、合併 ${preview.versions.merged}、跳過 ${preview.versions.skipped}` },
        { label: '版本衝突', value: `${preview.conflicts} 筆` },
        { label: '孤立版本', value: `${preview.orphanVersions} 筆` }
      ], { danger: preview.versions.overwritten > 0 });
    } catch (error) {
      this.renderImpactSummary(container, '導入影響摘要無法產生', [
        { label: '錯誤', value: error.message }
      ], { danger: true });
    }
  }

  async confirmImport() {
    const resolutions = this.collectImportResolutions();

    try {
      await this.performImport(this.pendingImportData, resolutions);
    } catch (error) {
      this.onError('導入失敗：' + error.message);
    }
  }

  async performImport(importInfo, resolutions = {}) {
    try {
      let jsonData;
      let targetProjectId;

      if (importInfo.importData) {
        jsonData = importInfo.importData;
        targetProjectId = importInfo.targetProjectId;
      } else {
        jsonData = importInfo;
        targetProjectId = this.projectManager.getCurrentProjectId();
      }

      const results = await this.importExportManager.executeImport(jsonData, resolutions, targetProjectId);

      let message = '導入完成！\n';
      if (results.scripts) {
        message += `SQL 腳本：${results.scripts} 支\n`;
      }
      message += `匯入：${results.imported} 個版本\n`;
      message += `覆蓋：${results.overwritten} 個版本\n`;
      message += `合併：${results.merged} 個版本\n`;
      message += `跳過：${results.skipped} 個版本`;

      if (results.errors.length > 0) {
        message += `\n錯誤：${results.errors.length} 個版本`;
      }

      await dialogs.showAlert({ title: '導入完成', message });
      document.getElementById('conflictModal').style.display = 'none';
      await this.onDataChanged({ reloadProjects: false });
    } catch (error) {
      this.onError('導入失敗：' + error.message);
    }
  }

  async showFullBackupDialog() {
    try {
      const allProjects = await this.importExportManager._getAllProjects();
      const allScripts = await this.importExportManager._getAllScripts();
      const allVersions = await this.db.getAllVersions();
      const allTags = await this.importExportManager._getAllTags();
      const allComments = await this.importExportManager._getAllComments();

      document.getElementById('statsProjects').textContent = allProjects.length;
      const statsScripts = document.getElementById('statsScripts');
      if (statsScripts) statsScripts.textContent = allScripts.length;
      document.getElementById('statsVersions').textContent = allVersions.length;
      document.getElementById('statsTags').textContent = allTags.length;
      document.getElementById('statsComments').textContent = allComments.length;

      document.getElementById('fullBackupModal').style.display = 'flex';
    } catch (error) {
      console.error('載入統計資訊失敗:', error);
      this.onError('載入統計資訊失敗：' + error.message);
    }
  }

  async performFullBackup() {
    try {
      const includeTags = document.getElementById('backupIncludeTags').checked;
      const includeComments = document.getElementById('backupIncludeComments').checked;
      const includeMetadata = document.getElementById('backupIncludeMetadata').checked;

      console.log('開始完整資料庫備份...');

      const { jsonContent, filename } = await this.importExportManager.exportFullDatabase({
        includeTags,
        includeComments,
        includeMetadata
      });

      this.importExportManager.downloadFile(jsonContent, filename, 'application/json');

      console.log('✓ 完整備份完成');
      dialogs.showToast('完整資料庫備份成功！', { kind: 'success' });
      document.getElementById('fullBackupModal').style.display = 'none';
    } catch (error) {
      console.error('完整備份失敗:', error);
      this.onError('完整備份失敗：' + error.message);
    }
  }

  showFullRestoreDialog() {
    document.getElementById('fullRestoreFileInput').click();
  }

  async handleFullRestoreFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
      if (!file.name.endsWith('.json')) {
        this.onError('請選擇 JSON 備份檔案');
        event.target.value = '';
        return;
      }

      console.log('正在讀取備份檔案...');
      const text = await file.text();
      const validation = await this.importExportManager.validateImportData(text, { requireFull: true });
      const jsonData = validation.data;

      this.renderRestoreFileInfo(jsonData, validation.counts);

      this.pendingRestoreData = jsonData;
      await this.updateFullRestorePreview();
      document.getElementById('fullRestoreModal').style.display = 'flex';
    } catch (error) {
      console.error('讀取備份檔案失敗:', error);
      this.onError('讀取備份檔案失敗：' + error.message);
    }

    event.target.value = '';
  }

  renderRestoreFileInfo(jsonData, counts) {
    const restoreFileInfo = document.getElementById('restoreFileInfo');
    const restoreStats = document.getElementById('restoreStats');
    restoreStats.innerHTML = '';
    const statsGrid = document.createElement('div');
    statsGrid.className = 'stats-grid';
    const fileStats = [
      ['匯出日期', jsonData.exportDate ? new Date(jsonData.exportDate).toLocaleString('zh-TW') : '未知'],
      ['格式版本', jsonData.formatVersion],
      ['專案數', counts.projects],
      ['SQL 腳本數', counts.scripts],
      ['版本數', counts.versions],
      ['標籤數', counts.tags],
      ['批註數', counts.comments]
    ];
    for (const [label, value] of fileStats) {
      const item = document.createElement('div');
      const strong = document.createElement('strong');
      strong.textContent = `${label}：`;
      const span = document.createElement('span');
      span.textContent = value;
      item.appendChild(strong);
      item.appendChild(span);
      statsGrid.appendChild(item);
    }
    restoreStats.appendChild(statsGrid);
    restoreFileInfo.style.display = 'block';
  }

  async updateFullRestorePreview() {
    if (!this.pendingRestoreData) return;

    const container = document.getElementById('restoreImpactSummary');
    const strategyEl = document.querySelector('input[name="restoreStrategy"]:checked');
    const strategy = strategyEl ? strategyEl.value : 'skip';
    const clearExisting = document.getElementById('restoreClearExisting')?.checked || false;

    try {
      const preview = await this.importExportManager.getFullRestorePreview(this.pendingRestoreData, {
        conflictStrategy: strategy,
        clearExisting
      });

      const items = [];
      if (preview.clearCounts) {
        items.push({
          label: '會先清除',
          value: `專案 ${preview.clearCounts.projects}、SQL 腳本 ${preview.clearCounts.scripts}、版本 ${preview.clearCounts.versions}、標籤 ${preview.clearCounts.tags}、批註 ${preview.clearCounts.comments}`
        });
      }

      items.push(
        { label: '專案', value: `新增 ${preview.projects.imported}、覆蓋 ${preview.projects.overwritten}、跳過 ${preview.projects.skipped}` },
        { label: 'SQL 腳本', value: `新增 ${preview.scripts.imported}、覆蓋 ${preview.scripts.overwritten}、跳過 ${preview.scripts.skipped}` },
        { label: '版本', value: `新增 ${preview.versions.imported}、覆蓋 ${preview.versions.overwritten}、合併 ${preview.versions.merged}、跳過 ${preview.versions.skipped}` },
        { label: '標籤', value: `新增 ${preview.tags.imported}` },
        { label: '批註', value: `新增 ${preview.comments.imported}` },
        { label: '版本衝突', value: `${preview.conflicts.length} 筆` }
      );

      this.renderImpactSummary(container, '還原影響摘要', items, { danger: clearExisting });
    } catch (error) {
      this.renderImpactSummary(container, '還原檔案驗證失敗', [
        { label: '錯誤', value: error.message }
      ], { danger: true });
    }
  }

  async performFullRestore() {
    if (!this.pendingRestoreData) {
      this.onError('請先選擇備份檔案');
      return;
    }

    const strategy = document.querySelector('input[name="restoreStrategy"]:checked').value;
    const clearExisting = document.getElementById('restoreClearExisting').checked;
    let preview;

    try {
      preview = await this.importExportManager.getFullRestorePreview(this.pendingRestoreData, {
        conflictStrategy: strategy,
        clearExisting
      });
      await this.updateFullRestorePreview();
    } catch (error) {
      this.onError('還原檔案驗證失敗：' + error.message);
      return;
    }

    if (clearExisting) {
      const confirmed = await this.confirmDangerAction({
        title: '清空後還原',
        message: '您選擇了「清空所有現有資料」選項。建議確認已有完整備份後再繼續。',
        confirmText: '清空並還原',
        items: [
          { label: '將清除', value: `專案 ${preview.clearCounts.projects}、SQL 腳本 ${preview.clearCounts.scripts}、版本 ${preview.clearCounts.versions}、標籤 ${preview.clearCounts.tags}、批註 ${preview.clearCounts.comments}` }
        ]
      });

      if (!confirmed) return;
    }

    try {
      console.log('開始完整資料庫還原...');
      console.log(`  - 衝突策略: ${strategy}`);
      console.log(`  - 清空現有資料: ${clearExisting}`);

      const results = await this.importExportManager.importFullDatabase(this.pendingRestoreData, {
        conflictStrategy: strategy,
        clearExisting
      });

      await dialogs.showAlert({
        title: '完整還原完成',
        message: this.formatFullRestoreResult(results)
      });
      document.getElementById('fullRestoreModal').style.display = 'none';
      this.pendingRestoreData = null;
      await this.onDataChanged({ reloadProjects: true });
      console.log('✓ 完整還原完成並已重新載入');
    } catch (error) {
      console.error('完整還原失敗:', error);
      this.onError('完整還原失敗：' + error.message);
    }
  }

  formatFullRestoreResult(results) {
    let message = '完整資料庫還原完成！\n\n';
    message += `專案：新增 ${results.projects.imported}, 覆蓋 ${results.projects.overwritten}, 跳過 ${results.projects.skipped}\n`;
    if (results.scripts) {
      message += `SQL 腳本：新增 ${results.scripts.imported}, 覆蓋 ${results.scripts.overwritten}, 跳過 ${results.scripts.skipped}\n`;
    }
    message += `版本：新增 ${results.versions.imported}, 覆蓋 ${results.versions.overwritten}, 合併 ${results.versions.merged}, 跳過 ${results.versions.skipped}\n`;
    message += `標籤：新增 ${results.tags.imported}, 跳過 ${results.tags.skipped}\n`;
    message += `批註：新增 ${results.comments.imported}, 跳過 ${results.comments.skipped}`;

    if (results.metadata.imported > 0) {
      message += `\n元數據：新增 ${results.metadata.imported}`;
    }

    const totalErrors =
      results.projects.errors.length +
      (results.scripts?.errors.length || 0) +
      results.versions.errors.length +
      results.tags.errors.length +
      results.comments.errors.length +
      results.metadata.errors.length;

    if (totalErrors > 0) {
      message += `\n\n⚠️ 發生 ${totalErrors} 個錯誤`;
      console.warn('還原錯誤詳情:', results);
    }

    return message;
  }
}
