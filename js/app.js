/**
 * 主應用控制器和交互邏輯
 */

class SQLVersionApp {
  constructor() {
    this.db = null;
    this.versionManager = null;
    this.importExportManager = null;
    this.projectManager = null;  // v3 新增：專案管理器
    this.scriptManager = null;   // v5 新增：SQL 腳本管理器
    this.versionTreeController = null;
    this.editorController = null;
    this.importExportDialogs = null;
    this.currentVersion = null;
    this.selectedVersionId = null;
    this.cleanEditorContent = '';
    this.hasUnsavedChanges = false;
  }

  get monacoEditor() {
    return this.editorController ? this.editorController.monacoEditor : null;
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
      if (typeof projectManager === 'undefined') {
        throw new Error('projectManager 模塊未加載');
      }
      if (typeof scriptManager === 'undefined') {
        throw new Error('scriptManager 模塊未加載');
      }
      if (typeof VersionTreeController === 'undefined') {
        throw new Error('versionTree UI 模塊未加載');
      }
      if (typeof EditorController === 'undefined') {
        throw new Error('editorController UI 模塊未加載');
      }
      if (typeof ImportExportDialogs === 'undefined') {
        throw new Error('importExportDialogs UI 模塊未加載');
      }
      
      console.log('✓ 所有依賴模塊已成功加載');

      // 初始化數據庫
      console.log('正在初始化數據庫...');
      await db.initialize();
      this.db = db;
      console.log('✓ 數據庫初始化完成');

      // v3 新增：初始化專案管理器（必須在版本管理器之前）
      console.log('正在初始化專案管理器...');
      await projectManager.init(db);
      this.projectManager = projectManager;
      console.log('✓ 專案管理器初始化完成');

      console.log('正在初始化 SQL 腳本管理器...');
      await scriptManager.init(db, projectManager);
      this.scriptManager = scriptManager;
      console.log('✓ SQL 腳本管理器初始化完成');

      // 初始化版本管理器（傳入 projectManager）
      console.log('正在初始化版本管理器...');
      await versionManager.init(db, diffEngine, projectManager, scriptManager);
      this.versionManager = versionManager;
      console.log('✓ 版本管理器初始化完成');

      // 初始化導入導出管理器（傳入 projectManager）
      console.log('正在初始化導入導出管理器...');
      await importExportManager.init(db, versionManager, diffEngine, projectManager, scriptManager);
      this.importExportManager = importExportManager;
      console.log('✓ 導入導出管理器初始化完成');

      this.initVersionTreeController();
      this.initEditorController();
      this.initImportExportDialogs();

      // 綁定 UI 事件
      console.log('正在綁定 UI 事件...');
      this.bindUIEvents();
      console.log('✓ UI 事件綁定完成');

      // 初始化 Monaco Editor
      console.log('正在初始化 Monaco Editor...');
      await this.editorController.init();
      this.markEditorClean('');
      console.log('✓ Monaco Editor 初始化完成');

      // 加載並應用主題
      console.log('正在加載主題設定...');
      await this.editorController.loadTheme();
      console.log('✓ 主題設定完成');

      // 加載版本列表
      console.log('正在加載版本列表...');
      await this.updateProjectSelector();
      await this.updateScriptSelector();
      await this.loadVersionTree();
      console.log('✓ 版本列表加載完成');

      console.log('✓ 專案與 SQL 腳本選擇器初始化完成');

      console.log('✅ 應用初始化完成！');
      this.showInitializationStatus('success');
      await this.updateStorageUsageStatus();
    } catch (error) {
      console.error('❌ 應用初始化失敗:', error);
      console.error('錯誤堆棧:', error.stack);
      this.showInitializationStatus('error', error.message);
      await this.showAlert('應用初始化失敗：' + error.message + '\n\n請嘗試刷新頁面或清除瀏覽器快取。', {
        title: '初始化失敗',
        kind: 'danger'
      });
    }
  }

  /**
   * 顯示初始化狀態
   */
  showInitializationStatus(status, errorMessage = '') {
    const statusElement = document.getElementById('initStatus');
    if (statusElement) {
      statusElement.classList.remove('status-pending', 'status-success', 'status-error');
      if (status === 'success') {
        statusElement.textContent = '✅ 應用已就緒';
        statusElement.classList.add('status-success');
      } else {
        statusElement.textContent = '❌ 初始化失敗：' + errorMessage;
        statusElement.classList.add('status-error');
      }
    }
  }

  initVersionTreeController() {
    this.versionTreeController = new VersionTreeController({
      versionManager: this.versionManager,
      scriptManager: this.scriptManager,
      treeContainer: document.getElementById('versionTree'),
      searchInput: document.getElementById('searchVersions'),
      searchButton: document.getElementById('btnSearch'),
      contextMenu: document.getElementById('contextMenu'),
      contextCompare: document.getElementById('contextCompare'),
      titleElement: document.querySelector('.card.card-version-tree .card-header h3'),
      formatScriptDisplayName: (scriptName) => this.formatScriptDisplayName(scriptName),
      onSelectVersion: (versionId) => this.selectVersion(versionId),
      onCompareVersion: (versionId) => this.editorController.compareWithCurrent(versionId),
      onError: (message) => this.showAlert(message, { title: '操作失敗', kind: 'danger' })
    });
    this.versionTreeController.bindEvents();
  }

  initEditorController() {
    this.editorController = new EditorController({
      db: this.db,
      versionManager: this.versionManager,
      scriptManager: this.scriptManager,
      importExportManager: this.importExportManager,
      onSaveVersion: () => this.showSaveVersionDialog(),
      onError: (message) => this.showAlert(message, { title: '提示' }),
      onContentChanged: (content) => this.handleEditorContentChanged(content)
    });
    this.editorController.bindEvents();
  }

  initImportExportDialogs() {
    this.importExportDialogs = new ImportExportDialogs({
      db: this.db,
      projectManager: this.projectManager,
      scriptManager: this.scriptManager,
      importExportManager: this.importExportManager,
      renderImpactSummary: (container, title, items, options) => {
        this.renderImpactSummary(container, title, items, options);
      },
      confirmDangerAction: (options) => this.confirmDangerAction(options),
      onDataChanged: (options) => this.reloadAfterDataImport(options),
      onError: (message) => this.showAlert(message, { title: '操作失敗', kind: 'danger' })
    });
    this.importExportDialogs.bindEvents();
  }

  refreshControllerDependencies() {
    if (this.versionTreeController) {
      this.versionTreeController.versionManager = this.versionManager;
      this.versionTreeController.scriptManager = this.scriptManager;
    }

    if (this.editorController) {
      this.editorController.db = this.db;
      this.editorController.versionManager = this.versionManager;
      this.editorController.scriptManager = this.scriptManager;
      this.editorController.importExportManager = this.importExportManager;
    }

    if (this.importExportDialogs) {
      this.importExportDialogs.db = this.db;
      this.importExportDialogs.projectManager = this.projectManager;
      this.importExportDialogs.scriptManager = this.scriptManager;
      this.importExportDialogs.importExportManager = this.importExportManager;
    }
  }

  showAlert(message, options = {}) {
    return dialogs.showAlert({
      title: options.title || '提示',
      message,
      kind: options.kind || 'info',
      buttonText: options.buttonText || '確定'
    });
  }

  showToast(message, options = {}) {
    dialogs.showToast(message, options);
  }

  handleEditorContentChanged(content) {
    this.hasUnsavedChanges = content !== this.cleanEditorContent;
  }

  markEditorClean(content = null) {
    this.cleanEditorContent = content === null
      ? (this.monacoEditor ? this.monacoEditor.getValue() : '')
      : content;
    this.hasUnsavedChanges = false;
  }

  async confirmDiscardUnsavedChanges(actionText) {
    if (!this.hasUnsavedChanges) return true;
    return dialogs.showConfirm({
      title: '未儲存的 SQL 變更',
      message: `目前編輯器有尚未保存成版本的 SQL 內容。確定要${actionText}並放棄這些變更嗎？`,
      confirmText: '放棄變更',
      cancelText: '繼續編輯',
      kind: 'warning'
    });
  }

  renderDetailPlaceholder() {
    const detailContent = document.getElementById('detailContent');
    if (!detailContent) return;
    const placeholder = document.createElement('p');
    placeholder.className = 'placeholder-text';
    placeholder.textContent = '選擇一個版本查看詳情';
    detailContent.replaceChildren(placeholder);
  }

  /**
   * 綁定 UI 事件
   */
  bindUIEvents() {
    // 工具欄按鈕
    const btnSaveVersion = document.getElementById('btnSaveVersion');
    if (btnSaveVersion) {
      btnSaveVersion.addEventListener('click', () => this.showSaveVersionDialog());
    }
    const btnFormatSQL = document.getElementById('btnFormatSQL');
    if (btnFormatSQL) {
      btnFormatSQL.addEventListener('click', () => this.editorController.formatSQL());
    }
    const btnCompareMode = document.getElementById('btnCompareMode');
    if (btnCompareMode) {
      btnCompareMode.addEventListener('click', () => this.editorController.toggleCompareMode());
    }
    const btnDeleteVersion = document.getElementById('btnDeleteVersion');
    if (btnDeleteVersion) {
      btnDeleteVersion.addEventListener('click', () => this.deleteVersion());
    }
    const btnDownloadSQL = document.getElementById('btnDownloadSQL');
    if (btnDownloadSQL) {
      btnDownloadSQL.addEventListener('click', () => this.editorController.downloadCurrentSQL());
    }

    const btnHelp = document.getElementById('btnHelp');
    if (btnHelp) {
      btnHelp.addEventListener('click', () => {
        const helpModal = document.getElementById('helpModal');
        if (helpModal) {
          helpModal.style.display = 'flex';
        }
      });
    }
    
    // 主題切換
    const btnThemeToggle = document.getElementById('btnThemeToggle');
    if (btnThemeToggle) {
      btnThemeToggle.addEventListener('click', () => this.editorController.toggleTheme());
    }
    
    // 更多選單
    const btnMore = document.getElementById('btnMore');
    const moreMenu = document.getElementById('moreMenu');
    if (btnMore && moreMenu) {
      btnMore.addEventListener('click', (e) => {
        e.stopPropagation();
        moreMenu.style.display = moreMenu.style.display === 'none' ? 'block' : 'none';
      });
      
      // 點擊其他地方關閉選單
      document.addEventListener('click', (e) => {
        if (!btnMore.contains(e.target)) {
          moreMenu.style.display = 'none';
        }
      });
    }
    
    // 導航欄按鈕
    const btnExport = document.getElementById('btnExport');
    if (btnExport) {
      btnExport.addEventListener('click', () => this.importExportDialogs.showExportDialog());
    }
    const btnImport = document.getElementById('btnImport');
    if (btnImport) {
      btnImport.addEventListener('click', () => this.importExportDialogs.showImportDialog());
    }
    
    // 從更多選單中觸發的功能
    const btnCompare = document.getElementById('btnCompare');
    if (btnCompare && moreMenu) {
      btnCompare.addEventListener('click', () => {
        moreMenu.style.display = 'none';
        this.showCompareDialog();
      });
    }
    const btnFullBackup = document.getElementById('btnFullBackup');
    if (btnFullBackup && moreMenu) {
      btnFullBackup.addEventListener('click', () => {
        moreMenu.style.display = 'none';
        this.importExportDialogs.showFullBackupDialog();
      });
    }
    const btnFullRestore = document.getElementById('btnFullRestore');
    if (btnFullRestore && moreMenu) {
      btnFullRestore.addEventListener('click', () => {
        moreMenu.style.display = 'none';
        this.importExportDialogs.showFullRestoreDialog();
      });
    }
    const btnClearAllData = document.getElementById('btnClearAllData');
    if (btnClearAllData && moreMenu) {
      btnClearAllData.addEventListener('click', async () => {
        moreMenu.style.display = 'none';
        const clearAllModal = document.getElementById('clearAllModal');
        if (clearAllModal) {
          await this.showClearAllImpactSummary();
          clearAllModal.style.display = 'flex';
        }
      });
    }

    // v3 新增：專案管理事件監聽
    const projectSelector = document.getElementById('projectSelector');
    if (projectSelector) {
      projectSelector.addEventListener('change', (e) => this.switchProject(e.target.value));
    }

    const btnNewProject = document.getElementById('btnNewProject');
    if (btnNewProject) {
      btnNewProject.addEventListener('click', () => this.showCreateProjectDialog());
    }

    const btnDeleteProject = document.getElementById('btnDeleteProject');
    if (btnDeleteProject) {
      btnDeleteProject.addEventListener('click', () => this.showDeleteProjectDialog());
    }

    const scriptSelector = document.getElementById('scriptSelector');
    if (scriptSelector) {
      scriptSelector.addEventListener('change', (e) => this.switchScript(e.target.value));
    }

    const btnNewScript = document.getElementById('btnNewScript');
    if (btnNewScript) {
      btnNewScript.addEventListener('click', () => this.showCreateScriptDialog());
    }

    const btnDeleteScript = document.getElementById('btnDeleteScript');
    if (btnDeleteScript) {
      btnDeleteScript.addEventListener('click', () => this.showDeleteScriptDialog());
    }

    // 初始化狀態指示器 - 點擊重新初始化
    const initStatus = document.getElementById('initStatus');
    if (initStatus) {
      initStatus.style.cursor = 'pointer';
      initStatus.addEventListener('click', () => this.reinitializeApp());
    }

    // 快捷鍵
    document.addEventListener('keydown', (e) => this.editorController.handleKeyboardShortcuts(e));

    // 模態對話框
    this.bindDialogEvents();
  }

  /**
   * 重新初始化應用
   */
  async reinitializeApp() {
    console.log('用戶觸發重新初始化...');
    const initStatus = document.getElementById('initStatus');
    if (initStatus) {
      initStatus.textContent = '⏳ 正在重新初始化...';
      initStatus.classList.remove('status-success', 'status-error');
      initStatus.classList.add('status-pending');
    }
    
    try {
      // 重新初始化數據庫
      console.log('重新初始化數據庫...');
      await db.initialize();
      this.db = db;

      console.log('重新初始化專案管理器...');
      await projectManager.init(db);
      this.projectManager = projectManager;

      console.log('重新初始化 SQL 腳本管理器...');
      await scriptManager.init(db, projectManager);
      this.scriptManager = scriptManager;
      
      // 重新初始化版本管理器
      console.log('重新初始化版本管理器...');
      await versionManager.init(db, diffEngine, projectManager, scriptManager);
      this.versionManager = versionManager;

      console.log('重新初始化導入導出管理器...');
      await importExportManager.init(db, versionManager, diffEngine, projectManager, scriptManager);
      this.importExportManager = importExportManager;
      this.refreshControllerDependencies();
      
      // 重新加載版本列表
      console.log('重新加載版本列表...');
      await this.updateProjectSelector();
      await this.updateScriptSelector();
      await this.loadVersionTree();
      this.markEditorClean(this.monacoEditor ? this.monacoEditor.getValue() : '');
      
      console.log('✅ 重新初始化完成！');
      if (initStatus) {
        initStatus.textContent = '✅ 應用已就緒';
        initStatus.classList.remove('status-pending', 'status-error');
        initStatus.classList.add('status-success');
      }
      await this.updateStorageUsageStatus();
    } catch (error) {
      console.error('❌ 重新初始化失敗:', error);
      this.showInitializationStatus('error', error.message);
    }
  }

  /**
   * 綁定模態對話框事件
   */
  bindDialogEvents() {
    // 使用說明對話框
    const btnCloseHelp = document.getElementById('btnCloseHelp');
    if (btnCloseHelp) {
      btnCloseHelp.addEventListener('click', () => {
        document.getElementById('helpModal').style.display = 'none';
      });
    }
    const btnCancelHelp = document.getElementById('btnCancelHelp');
    if (btnCancelHelp) {
      btnCancelHelp.addEventListener('click', () => {
        document.getElementById('helpModal').style.display = 'none';
      });
    }

    // 新增版本對話框
    const btnCloseModal = document.getElementById('btnCloseModal');
    if (btnCloseModal) {
      btnCloseModal.addEventListener('click', () => {
        document.getElementById('newVersionModal').style.display = 'none';
      });
    }
    const btnCancelSave = document.getElementById('btnCancelSave');
    if (btnCancelSave) {
      btnCancelSave.addEventListener('click', () => {
        document.getElementById('newVersionModal').style.display = 'none';
      });
    }
    const btnConfirmSave = document.getElementById('btnConfirmSave');
    if (btnConfirmSave) {
      btnConfirmSave.addEventListener('click', () => this.confirmSaveVersion());
    }

    // 比對對話框
    const btnCloseCompare = document.getElementById('btnCloseCompare');
    if (btnCloseCompare) {
      btnCloseCompare.addEventListener('click', () => {
        document.getElementById('compareModal').style.display = 'none';
      });
    }
    const btnCancelCompare = document.getElementById('btnCancelCompare');
    if (btnCancelCompare) {
      btnCancelCompare.addEventListener('click', () => {
        document.getElementById('compareModal').style.display = 'none';
      });
    }
    const btnDoCompare = document.getElementById('btnDoCompare');
    if (btnDoCompare) {
      btnDoCompare.addEventListener('click', () => this.performComparison());
    }

    // 差異面板關閉
    const btnCloseDiff = document.getElementById('btnCloseDiff');
    if (btnCloseDiff) {
      btnCloseDiff.addEventListener('click', () => {
        document.getElementById('diffPanel').style.display = 'none';
        document.getElementById('diffContent').replaceChildren();
      });
    }

    // 清空全部資料對話框（按鈕事件已在 bindUIEvents 中綁定）
    const btnCloseClearAll = document.getElementById('btnCloseClearAll');
    if (btnCloseClearAll) {
      btnCloseClearAll.addEventListener('click', () => {
        document.getElementById('clearAllModal').style.display = 'none';
      });
    }
    const btnCancelClearAll = document.getElementById('btnCancelClearAll');
    if (btnCancelClearAll) {
      btnCancelClearAll.addEventListener('click', () => {
        document.getElementById('clearAllModal').style.display = 'none';
      });
    }
    const btnConfirmClearAll = document.getElementById('btnConfirmClearAll');
    if (btnConfirmClearAll) {
      btnConfirmClearAll.addEventListener('click', () => this.confirmClearAllData());
    }
    const btnBackupBeforeClearAll = document.getElementById('btnBackupBeforeClearAll');
    if (btnBackupBeforeClearAll) {
      btnBackupBeforeClearAll.addEventListener('click', async () => {
        document.getElementById('clearAllModal').style.display = 'none';
        await this.importExportDialogs.showFullBackupDialog();
      });
    }
  }

  /**
   * 加載版本列表樹
   */
  async loadVersionTree() {
    if (this.versionTreeController) {
      await this.versionTreeController.load();
    }
  }

  async reloadAfterDataImport(options = {}) {
    if (options.reloadProjects) {
      await this.projectManager.loadProjects();
      const projects = this.projectManager.getProjects();
      if (projects.length > 0) {
        const currentId = this.projectManager.getCurrentProjectId();
        if (!projects.some(project => project.projectId === currentId)) {
          await this.projectManager.setCurrentProject(projects[0].projectId);
        }
      }
    }

    await this.scriptManager.loadScriptsForCurrentProject();
    await this.updateProjectSelector();
    await this.updateScriptSelector();
    await this.loadVersionTree();
    this.markEditorClean(this.monacoEditor ? this.monacoEditor.getValue() : '');
    await this.updateStorageUsageStatus();
  }

  /**
   * 選擇版本
   */
  async selectVersion(versionId) {
    if (versionId === this.selectedVersionId) return;

    const canSelect = await this.confirmDiscardUnsavedChanges('載入其他版本');
    if (!canSelect) {
      if (this.versionTreeController) {
        this.versionTreeController.setSelectedVersion(this.selectedVersionId);
      }
      return;
    }

    if (this.versionTreeController) {
      this.versionTreeController.setSelectedVersion(versionId);
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

    // 版本資訊面板已移除

    // 加載版本內容到編輯器
    const content = await this.versionManager.getVersionContent(versionId);
    if (this.monacoEditor) {
      this.monacoEditor.setValue(content);
      this.updateEditorStats();
      this.markEditorClean(content);
    }

    // 加載版本詳情面板
    const detailContent = document.getElementById('detailContent');
    if (detailContent) {
      const script = version.scriptId ? await this.db.getScript(version.scriptId) : null;
      detailContent.replaceChildren();
      const list = document.createElement('div');
      list.className = 'detail-list';
      const rows = [
        ['版本 ID', version.versionId],
        ['SQL 腳本', script ? this.formatScriptDisplayName(script.scriptName) : '(未知)'],
        ['時間', new Date(version.timestamp).toLocaleString('zh-TW')],
        ['標籤', version.label],
        ['作者', version.author],
        ['描述', version.description || '(無)'],
        ['父版本', version.parentVersionId || '(根版本)'],
        ['存儲模式', version.isDeltaMode ? '差異' : '完整內容'],
        ['統計', `+${version.stats.linesAdded} -${version.stats.linesRemoved}`, 'detail-diff']
      ];

      for (const [labelText, valueText, valueClass] of rows) {
        const row = document.createElement('div');
        row.className = 'detail-row';
        const label = document.createElement('span');
        label.textContent = labelText;
        const value = document.createElement('strong');
        if (valueClass) value.className = valueClass;
        value.textContent = valueText;
        row.appendChild(label);
        row.appendChild(value);
        list.appendChild(row);
      }

      detailContent.appendChild(list);
    }
  }

  /**
   * 顯示保存版本對話框
   */
  async showSaveVersionDialog() {
    const sqlRaw = this.monacoEditor ? this.monacoEditor.getValue() : '';
    const sqlContent = sqlRaw.trim();
    
    // 檢查是否有內容
    if (!sqlContent) {
      await this.showAlert('請先輸入 SQL 內容', { title: '無法保存' });
      return;
    }
    
    // 清空表單
    const newLabel = document.getElementById('newLabel');
    const newDescription = document.getElementById('newDescription');
    const newAuthor = document.getElementById('newAuthor');
    const createSnapshot = document.getElementById('createSnapshot');
    
    if (newLabel) newLabel.value = '';
    if (newDescription) newDescription.value = '';
    if (newAuthor) {
      const lastAuthorPref = await this.db.getMetadata('lastAuthor');
      newAuthor.value = lastAuthorPref?.value || '';
    }
    if (createSnapshot) createSnapshot.checked = true;
    
    // 更新對話框標題
    const modalTitle = document.querySelector('#newVersionModal .modal-header h2');
    if (modalTitle) {
      modalTitle.textContent = '保存新版本';
    }
    
    // 顯示目前 SQL 腳本與上一版本資訊
    const parentInfoDiv = document.getElementById('versionParentInfo');
    const diffSummaryDiv = document.getElementById('saveVersionDiffSummary');
    if (parentInfoDiv) {
      try {
        const currentScript = this.scriptManager.getCurrentScript();
        const savePreview = await this.versionManager.getSavePreview(sqlRaw);
        const latestVersion = savePreview.latestVersion;
        const scriptName = currentScript
          ? this.formatScriptDisplayName(currentScript.scriptName)
          : '(未選擇)';
        const latestText = latestVersion
          ? `上一版本：${latestVersion.label || latestVersion.versionId.substring(0, 8)}`
          : '此 SQL 腳本尚無版本，將建立第一個版本';

        parentInfoDiv.replaceChildren();
        const note = document.createElement('div');
        note.className = 'parent-version-note';
        const name = document.createElement('strong');
        name.textContent = `SQL 腳本：${scriptName}`;
        const latest = document.createElement('span');
        latest.textContent = latestText;
        note.appendChild(name);
        note.appendChild(latest);
        parentInfoDiv.appendChild(note);

        this.renderSaveVersionDiffSummary(diffSummaryDiv, savePreview);
      } catch (error) {
        console.error('讀取 SQL 腳本資訊失敗:', error);
        parentInfoDiv.replaceChildren();
        if (diffSummaryDiv) {
          diffSummaryDiv.replaceChildren();
          diffSummaryDiv.hidden = true;
        }
      }
    }
    
    // 顯示對話框
    const newVersionModal = document.getElementById('newVersionModal');
    if (newVersionModal) {
      newVersionModal.style.display = 'flex';
    }
    
    // 焦點放在標籤輸入框
    if (newLabel) {
      setTimeout(() => {
        newLabel.focus();
      }, 100);
    }
  }

  renderSaveVersionDiffSummary(container, savePreview) {
    if (!container || !savePreview) return;

    const { latestVersion, stats } = savePreview;
    const previousLabel = latestVersion
      ? (latestVersion.label || latestVersion.versionId.substring(0, 8))
      : '第一個版本';
    const changeText = stats.linesAdded === 0 && stats.linesRemoved === 0
      ? '內容無變化'
      : `+${stats.linesAdded} -${stats.linesRemoved}`;

    dialogs.renderImpactSummary(container, '保存前差異摘要', [
      { label: '比較基準', value: previousLabel },
      { label: '新增行數', value: `+${stats.linesAdded}` },
      { label: '刪除行數', value: `-${stats.linesRemoved}` },
      { label: '變更狀態', value: changeText }
    ]);
  }

  /**
   * 確認保存版本
   */
  async confirmSaveVersion() {
    const newLabelEl = document.getElementById('newLabel');
    const newDescriptionEl = document.getElementById('newDescription');
    const newAuthorEl = document.getElementById('newAuthor');
    const createSnapshotEl = document.getElementById('createSnapshot');
    
    const label = newLabelEl ? newLabelEl.value.trim() : '';
    const description = newDescriptionEl ? newDescriptionEl.value.trim() : '';
    const author = newAuthorEl ? newAuthorEl.value.trim() : '';
    const sqlRaw = this.monacoEditor ? this.monacoEditor.getValue() : '';
    const createSnapshot = createSnapshotEl ? createSnapshotEl.checked : false;
    const sql = sqlRaw.trim();

    if (!label) {
      await this.showAlert('請輸入版本標籤', { title: '資料不完整' });
      return;
    }

    if (!author) {
      await this.showAlert('請輸入作者', { title: '資料不完整' });
      return;
    }

    if (!sql) {
      await this.showAlert('請輸入 SQL 內容', { title: '資料不完整' });
      return;
    }

    try {
      // 保存作者到 IndexedDB
      await this.db.saveMetadata('lastAuthor', author);

      // 保存版本
      const version = await this.versionManager.saveVersion(
        sqlRaw,
        label,
        description,
        author,
        createSnapshot
      );

      this.markEditorClean(sqlRaw);
      this.showToast(`版本保存成功：${version.versionId}`, { kind: 'success' });

      // 關閉對話框
      document.getElementById('newVersionModal').style.display = 'none';

      // 重新加載版本列表
      await this.loadVersionTree();

      // 選擇新版本
      await this.selectVersion(version.versionId);

      await this.updateStorageUsageStatus();
    } catch (error) {
      await this.showAlert('保存版本失敗：' + error.message, { title: '保存失敗', kind: 'danger' });
    }
  }

  /**
   * 顯示比對對話框
   */
  showCompareDialog() {
    const compareFrom = document.getElementById('compareFrom');
    const compareTo = document.getElementById('compareTo');
    
    if (!compareFrom || !compareTo) {
      console.error('找不到比對對話框的元素');
      return;
    }

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
        if (selectedIndex > 0 && compareFrom) {
          compareFrom.value = versions[selectedIndex - 1].versionId;
        }
        if (compareTo) {
          compareTo.value = this.selectedVersionId;
        }
      }
    });

    const compareModal = document.getElementById('compareModal');
    if (compareModal) {
      compareModal.style.display = 'flex';
    }
  }

  /**
   * 執行比對
   */
  async performComparison() {
    const compareFromEl = document.getElementById('compareFrom');
    const compareToEl = document.getElementById('compareTo');
    
    const from = compareFromEl ? compareFromEl.value : '';
    const to = compareToEl ? compareToEl.value : '';

    if (!from || !to) {
      await this.showAlert('請選擇兩個版本進行比對');
      return;
    }

    try {
      // 導向獨立差異頁面，避免在主頁擁擠
      const url = `diff.html?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
      window.open(url, '_blank');

      // 關閉比對對話框
      document.getElementById('compareModal').style.display = 'none';
    } catch (error) {
      await this.showAlert('比對失敗：' + error.message, { title: '比對失敗', kind: 'danger' });
    }
  }

  /**
   * 渲染 Diff 查看器
   */
  renderDiffViewer(comparison) {
    const diffContent = document.getElementById('diffContent');
    const hasDiff = Array.isArray(comparison.lineDiffs) && comparison.lineDiffs.length > 0;
    
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

    if (!hasDiff) {
      html += `
        <tr class="diff-unchanged">
          <td class="line-number">-</td>
          <td class="line-marker"></td>
          <td class="line-content"><code>兩個版本內容相同，沒有差異。</code></td>
        </tr>
      `;
    } else {
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
            <td class="line-marker" data-marker="${marker}"></td>
            <td class="line-content"><code>${escapedContent}</code></td>
          </tr>
        `;
        lineNum++;
      }
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
      await this.showAlert('請先選擇一個版本');
      return;
    }

    const confirmed = await dialogs.showConfirm({
      title: '回溯版本',
      message: `確定要回溯到版本 ${this.selectedVersionId} 嗎？目前編輯器內容會被此版本取代。`,
      confirmText: '回溯',
      cancelText: '取消',
      kind: 'warning'
    });

    if (confirmed) {
      try {
        const content = await this.versionManager.revertToVersion(this.selectedVersionId);
        if (this.monacoEditor) {
          this.monacoEditor.setValue(content);
        }
        this.updateEditorStats();
        this.markEditorClean(content);
        this.showToast('版本已回溯', { kind: 'success' });
      } catch (error) {
        await this.showAlert('回溯失敗：' + error.message, { title: '回溯失敗', kind: 'danger' });
      }
    }
  }

  /**
   * 啟用版本 Label 編輯（已移除）
   */
  enableLabelEdit() {
    // 版本資訊面板已移除
  }

  /**
   * 保存版本 Label（已移除）
   */
  async saveVersionLabel() {
    // 版本資訊面板已移除
  }

  /**
   * 複製版本 ID（已移除）
   */
  copyVersionId() {
    // 版本資訊面板已移除
  }

  renderImpactSummary(container, title, items, options = {}) {
    dialogs.renderImpactSummary(container, title, items, options);
  }

  confirmDangerAction({ title, message, items = [], confirmText = '確認執行' }) {
    return dialogs.confirmDangerAction({ title, message, items, confirmText });
  }

  formatImpactStats(stats) {
    return [
      `SQL 腳本 ${stats.scripts || 0}`,
      `版本 ${stats.versions || 0}`,
      `標籤 ${stats.tags || 0}`,
      `批註 ${stats.comments || 0}`
    ].join('、');
  }

  async showClearAllImpactSummary() {
    const container = document.getElementById('clearAllImpactSummary');
    try {
      const counts = await this.db.getDataCounts();
      this.renderImpactSummary(container, '將被清除的現有資料', [
        { label: '專案', value: counts.projects },
        { label: 'SQL 腳本', value: counts.scripts },
        { label: '版本', value: counts.versions },
        { label: '標籤', value: counts.tags },
        { label: '批註', value: counts.comments }
      ], { danger: true });
    } catch (error) {
      this.renderImpactSummary(container, '無法取得影響摘要', [
        { label: '錯誤', value: error.message }
      ], { danger: true });
    }
  }

  /**
   * 刪除版本
   */
  async deleteVersion() {
    if (!this.selectedVersionId) {
      await this.showAlert('請先選擇一個版本');
      return;
    }

    try {
      const version = await this.versionManager.getVersion(this.selectedVersionId);
      const stats = await this.db.getVersionImpactStats(this.selectedVersionId);
      const timestamp = version?.timestamp ? new Date(version.timestamp).toLocaleString('zh-TW') : '未知';
      const confirmed = await this.confirmDangerAction({
        title: '刪除版本',
        message: `確定要刪除版本「${version?.label || this.selectedVersionId}」嗎？`,
        confirmText: '刪除版本',
        items: [
          { label: '版本 ID', value: this.selectedVersionId },
          { label: '作者', value: version?.author || '未知' },
          { label: '時間', value: timestamp },
          { label: '同時刪除', value: this.formatImpactStats(stats) }
        ]
      });

      if (!confirmed) return;

      try {
        await this.versionManager.deleteVersion(this.selectedVersionId);
        this.showToast('版本已刪除', { kind: 'success' });

        // 重新加載版本列表
        await this.loadVersionTree();

        // 清空編輯器和詳情面板
        if (this.monacoEditor) {
          this.monacoEditor.setValue('');
          this.markEditorClean('');
        }
        this.renderDetailPlaceholder();
        this.updateEditorStats();
        await this.updateStorageUsageStatus();
      } catch (error) {
        await this.showAlert('刪除失敗：' + error.message, { title: '刪除失敗', kind: 'danger' });
      }
    } catch (error) {
      await this.showAlert('刪除前檢查失敗：' + error.message, { title: '刪除失敗', kind: 'danger' });
    }
  }

  /**
   * 確認清空全部資料
   */
  async confirmClearAllData() {
    try {
      // 清空整個本機資料庫，並重建預設專案
      await this.db.clearAllData();
      await this.projectManager.loadProjects();
      await this.projectManager.setCurrentProject('default');
      await this.scriptManager.loadScriptsForCurrentProject();
      await this.updateProjectSelector();
      await this.updateScriptSelector();
      
      // 清空編輯器
      if (this.monacoEditor) {
        this.monacoEditor.setValue('');
        this.markEditorClean('');
      }
      
      // 重新整理版本樹
      await this.loadVersionTree();
      
      // 清空詳情面板
      this.renderDetailPlaceholder();
      
      // 關閉對話框
      const clearAllModal = document.getElementById('clearAllModal');
      if (clearAllModal) {
        clearAllModal.style.display = 'none';
      }
      
      // 更新統計信息
      this.updateEditorStats();
      await this.updateStorageUsageStatus();
      
      // 顯示成功訊息
      this.showToast('所有本機資料已成功清空，已重建預設專案', { kind: 'success' });
      
      console.log('✓ 清空全部本機資料完成');
    } catch (error) {
      console.error('❌ 清空資料失敗:', error);
      await this.showAlert('清空資料失敗，請重試', { title: '清空失敗', kind: 'danger' });
    }
  }

  /**
   * 搜尋版本
   */
  async searchVersions() {
    if (this.versionTreeController) {
      await this.versionTreeController.searchFromInput();
    }
  }

  /**
   * 顯示標籤管理（暫不實現）
   */
  showTagsManagement() {
    this.showToast('標籤管理功能即將推出');
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

  // ========== v3 新增：專案管理相關方法 ==========

  /**
   * 更新專案選擇器下拉選單
   */
  async updateProjectSelector() {
    const selector = document.getElementById('projectSelector');
    if (!selector) return;

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
  }

  /**
   * 更新 SQL 腳本選擇器下拉選單
   */
  async updateScriptSelector() {
    const selector = document.getElementById('scriptSelector');
    if (!selector) return;

    const scripts = this.scriptManager.getScripts();
    const currentScriptId = this.scriptManager.getCurrentScriptId();

    selector.innerHTML = '';
    for (const script of scripts) {
      const option = document.createElement('option');
      option.value = script.scriptId;
      option.textContent = this.formatScriptDisplayName(script.scriptName);
      if (script.scriptId === currentScriptId) {
        option.selected = true;
      }
      selector.appendChild(option);
    }
  }

  /**
   * 切換專案
   */
  async switchProject(projectId, options = {}) {
    const currentProjectId = this.projectManager.getCurrentProjectId();
    if (!projectId || projectId === currentProjectId) {
      await this.updateProjectSelector();
      return;
    }

    if (!options.skipUnsavedCheck) {
      const canSwitch = await this.confirmDiscardUnsavedChanges('切換專案');
      if (!canSwitch) {
        await this.updateProjectSelector();
        return;
      }
    }

    try {
      await this.projectManager.setCurrentProject(projectId);
      await this.scriptManager.loadScriptsForCurrentProject();
      console.log('✓ 已切換到專案:', projectId);

      this.selectedVersionId = null;

      // 更新選擇器UI
      await this.updateProjectSelector();
      await this.updateScriptSelector();

      // 更新版本樹
      await this.loadVersionTree();

      // 清空編輯器
      if (this.monacoEditor) {
        this.monacoEditor.setValue('');
        this.updateEditorStats();
        this.markEditorClean('');
      }

      await this.updateStorageUsageStatus();
    } catch (error) {
      console.error('切換專案失敗:', error);
      await this.updateProjectSelector();
      await this.showAlert('切換專案失敗：' + error.message, { title: '切換失敗', kind: 'danger' });
    }
  }

  /**
   * 顯示建立專案對話框
   */
  async showCreateProjectDialog() {
    const projectName = await dialogs.showPrompt({
      title: '建立專案',
      message: '請輸入新專案名稱：',
      confirmText: '建立'
    });
    if (!projectName || projectName.trim() === '') {
      return;
    }

    this.createProject(projectName);
  }

  /**
   * 建立新專案
   */
  async createProject(projectName) {
    try {
      const canSwitch = await this.confirmDiscardUnsavedChanges('建立專案後切換到新專案');
      if (!canSwitch) return;

      const project = await this.projectManager.createProject(projectName);
      console.log('✓ 已建立新專案:', project.projectName);

      // 自動切換到新專案
      await this.switchProject(project.projectId, { skipUnsavedCheck: true });
      await this.updateStorageUsageStatus();

      this.showToast(`已成功建立新專案「${projectName}」`, { kind: 'success' });
    } catch (error) {
      console.error('建立專案失敗:', error);
      await this.showAlert('建立專案失敗：' + error.message, { title: '建立失敗', kind: 'danger' });
    }
  }

  /**
   * 顯示刪除專案對話框
   */
  async showDeleteProjectDialog() {
    const projects = this.projectManager.getProjects();
    const currentProjectId = this.projectManager.getCurrentProjectId();
    
    if (projects.length <= 1) {
      await this.showAlert('至少需要保留一個專案，無法刪除。');
      return;
    }

    const projectId = await dialogs.showSelect({
      title: '刪除專案',
      message: '請選擇要刪除的專案：',
      options: projects.map((proj) => ({
        value: proj.projectId,
        label: `${proj.projectName}${proj.projectId === currentProjectId ? ' (當前專案)' : ''}`
      })),
      confirmText: '下一步'
    });

    if (!projectId) {
      return;
    }
    
    const projectToDelete = projects.find((project) => project.projectId === projectId);
    if (!projectToDelete) return;
    this.deleteProject(projectToDelete.projectId, projectToDelete.projectName);
  }

  /**
   * 刪除專案
   */
  async deleteProject(projectId, projectName) {
    const currentProjectId = this.projectManager.getCurrentProjectId();
    const isCurrentProject = projectId === currentProjectId;

    try {
      if (isCurrentProject) {
        const canDeleteCurrent = await this.confirmDiscardUnsavedChanges('刪除目前專案');
        if (!canDeleteCurrent) return;
      }

      const stats = await this.db.getProjectImpactStats(projectId);
      const confirmed = await this.confirmDangerAction({
        title: '刪除專案',
        message: `確定要刪除專案「${projectName}」嗎？建議先執行完整備份。`,
        confirmText: '刪除專案',
        items: [
          { label: '專案', value: projectName },
          { label: '同時刪除', value: this.formatImpactStats(stats) }
        ]
      });

      if (!confirmed) {
        return;
      }

      // 如果要刪除的是當前專案，先切換到其他專案
      if (isCurrentProject) {
        const projects = this.projectManager.getProjects();
        const otherProject = projects.find(p => p.projectId !== projectId);
        
        if (otherProject) {
          console.log(`正在切換到專案「${otherProject.projectName}」...`);
          await this.projectManager.setCurrentProject(otherProject.projectId);
          await this.scriptManager.loadScriptsForCurrentProject();
        }
      }
      
      // 執行刪除（現在可以安全刪除了）
      await this.projectManager.deleteProject(projectId);
      console.log(`✓ 專案「${projectName}」已成功刪除`);
      
      // 更新專案選擇器
      await this.updateProjectSelector();
      await this.scriptManager.loadScriptsForCurrentProject();
      await this.updateScriptSelector();

      // 重新加載版本列表
      await this.loadVersionTree();
      if (isCurrentProject && this.monacoEditor) {
        this.monacoEditor.setValue('');
        this.updateEditorStats();
        this.markEditorClean('');
        this.renderDetailPlaceholder();
      }
      await this.updateStorageUsageStatus();
      
      this.showToast(`專案「${projectName}」已成功刪除`, { kind: 'success' });
    } catch (error) {
      console.error('刪除專案失敗:', error);
      await this.showAlert('刪除專案失敗：' + error.message, { title: '刪除失敗', kind: 'danger' });
    }
  }

  updateEditorStats() {
    this.editorController.updateEditorStats();
  }

  /**
   * 切換 SQL 腳本
   */
  async switchScript(scriptId, options = {}) {
    const currentScriptId = this.scriptManager.getCurrentScriptId();
    if (!scriptId || scriptId === currentScriptId) {
      await this.updateScriptSelector();
      return;
    }

    if (!options.skipUnsavedCheck) {
      const canSwitch = await this.confirmDiscardUnsavedChanges('切換 SQL 腳本');
      if (!canSwitch) {
        await this.updateScriptSelector();
        return;
      }
    }

    try {
      await this.scriptManager.setCurrentScript(scriptId);
      this.selectedVersionId = null;
      await this.updateScriptSelector();
      await this.loadVersionTree();

      if (this.monacoEditor) {
        this.monacoEditor.setValue('');
        this.updateEditorStats();
        this.markEditorClean('');
      }

      this.renderDetailPlaceholder();
    } catch (error) {
      console.error('切換 SQL 腳本失敗:', error);
      await this.updateScriptSelector();
      await this.showAlert('切換 SQL 腳本失敗：' + error.message, { title: '切換失敗', kind: 'danger' });
    }
  }

  async showCreateScriptDialog() {
    const scriptName = await dialogs.showPrompt({
      title: '建立 SQL 腳本',
      message: '請輸入 SQL 腳本名稱：',
      defaultValue: 'new-script',
      confirmText: '建立'
    });
    if (!scriptName || scriptName.trim() === '') return;
    this.createScript(scriptName);
  }

  async createScript(scriptName) {
    try {
      const canSwitch = await this.confirmDiscardUnsavedChanges('建立 SQL 腳本後切換到新腳本');
      if (!canSwitch) return;

      const script = await this.scriptManager.createScript(scriptName);
      await this.updateScriptSelector();
      await this.switchScript(script.scriptId, { skipUnsavedCheck: true });
      this.showToast(`已成功建立 SQL 腳本「${script.scriptName}」`, { kind: 'success' });
    } catch (error) {
      console.error('建立 SQL 腳本失敗:', error);
      await this.showAlert('建立 SQL 腳本失敗：' + error.message, { title: '建立失敗', kind: 'danger' });
    }
  }

  formatScriptDisplayName(scriptName) {
    return scriptName === 'main.sql' ? 'main' : scriptName;
  }

  async showDeleteScriptDialog() {
    const scripts = this.scriptManager.getScripts();
    if (scripts.length <= 1) {
      await this.showAlert('至少需要保留一支 SQL 腳本，無法刪除。');
      return;
    }

    const scriptId = await dialogs.showSelect({
      title: '刪除 SQL 腳本',
      message: '請選擇要刪除的 SQL 腳本：',
      options: scripts.map((script) => ({
        value: script.scriptId,
        label: `${script.scriptName}${script.scriptId === this.scriptManager.getCurrentScriptId() ? ' (當前)' : ''}`
      })),
      confirmText: '下一步'
    });

    if (!scriptId) {
      return;
    }

    const script = scripts.find((item) => item.scriptId === scriptId);
    if (!script) return;
    this.deleteScript(script.scriptId, script.scriptName);
  }

  async deleteScript(scriptId, scriptName) {
    try {
      if (scriptId === this.scriptManager.getCurrentScriptId()) {
        const canDeleteCurrent = await this.confirmDiscardUnsavedChanges('刪除目前 SQL 腳本');
        if (!canDeleteCurrent) return;
      }

      const stats = await this.db.getScriptImpactStats(scriptId);
      const confirmed = await this.confirmDangerAction({
        title: '刪除 SQL 腳本',
        message: `確定要刪除 SQL 腳本「${scriptName}」嗎？建議先執行完整備份。`,
        confirmText: '刪除 SQL 腳本',
        items: [
          { label: 'SQL 腳本', value: scriptName },
          { label: '同時刪除', value: this.formatImpactStats(stats) }
        ]
      });

      if (!confirmed) return;

      await this.scriptManager.deleteScript(scriptId);
      this.selectedVersionId = null;
      await this.updateScriptSelector();
      await this.loadVersionTree();

      if (this.monacoEditor) {
        this.monacoEditor.setValue('');
        this.updateEditorStats();
        this.markEditorClean('');
      }

      this.renderDetailPlaceholder();

      await this.updateStorageUsageStatus();
      this.showToast(`SQL 腳本「${scriptName}」已成功刪除`, { kind: 'success' });
    } catch (error) {
      console.error('刪除 SQL 腳本失敗:', error);
      await this.showAlert('刪除 SQL 腳本失敗：' + error.message, { title: '刪除失敗', kind: 'danger' });
    }
  }

  /**
   * 更新瀏覽器儲存空間用量。此數值為目前 origin 的估算用量，通常包含 IndexedDB。
   */
  async updateStorageUsageStatus() {
    const storageElement = document.getElementById('statusStorage');
    if (!storageElement) return;

    if (!navigator.storage || typeof navigator.storage.estimate !== 'function') {
      storageElement.textContent = '儲存 不支援容量查詢';
      storageElement.title = '此瀏覽器不支援 Storage Estimate API';
      return;
    }

    try {
      const estimate = await navigator.storage.estimate();
      const usage = estimate.usage || 0;
      const quota = estimate.quota || 0;
      const percent = quota > 0 ? `${((usage / quota) * 100).toFixed(2)}%` : '--%';
      const usageText = this.formatBytes(usage);
      const quotaText = quota > 0 ? this.formatBytes(quota) : '未知';
      const text = `儲存 ${usageText} / ${quotaText} (${percent})`;

      storageElement.textContent = text;
      storageElement.title = '目前來源的瀏覽器儲存空間用量，通常包含 IndexedDB';
    } catch (error) {
      console.warn('儲存空間用量查詢失敗:', error);
      storageElement.textContent = '儲存 無法取得';
      storageElement.title = error.message || '儲存空間用量查詢失敗';
    }
  }

  /**
   * 將 byte 數轉為易讀格式。
   */
  formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) {
      return '0 B';
    }

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = bytes;
    let unitIndex = 0;

    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex++;
    }

    const decimals = unitIndex === 0 ? 0 : 1;
    return `${value.toFixed(decimals)} ${units[unitIndex]}`;
  }

}

// 應用初始化
const app = new SQLVersionApp();
document.addEventListener('DOMContentLoaded', () => {
  app.init();
});
