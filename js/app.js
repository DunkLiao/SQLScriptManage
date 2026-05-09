/**
 * 主應用控制器和交互邏輯
 */

class SQLVersionApp {
  constructor() {
    this.db = null;
    this.versionManager = null;
    this.importExportManager = null;
    this.projectManager = null;  // v3 新增：專案管理器
    this.currentVersion = null;
    this.selectedVersionId = null;
    this.pendingImportData = null;  // v3 新增：待導入的數據
    
    // Monaco Editor 相關
    this.monacoEditor = null;
    this.leftMonacoEditor = null;
    this.rightMonacoEditor = null;
    this.isSplitView = false;
    this.isSyncScroll = true;
    this.currentTheme = 'light';
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

      // 初始化版本管理器（傳入 projectManager）
      console.log('正在初始化版本管理器...');
      await versionManager.init(db, diffEngine, projectManager);
      this.versionManager = versionManager;
      console.log('✓ 版本管理器初始化完成');

      // 初始化導入導出管理器（傳入 projectManager）
      console.log('正在初始化導入導出管理器...');
      await importExportManager.init(db, versionManager, diffEngine, projectManager);
      this.importExportManager = importExportManager;
      console.log('✓ 導入導出管理器初始化完成');

      // 綁定 UI 事件
      console.log('正在綁定 UI 事件...');
      this.bindUIEvents();
      console.log('✓ UI 事件綁定完成');

      // 初始化 Monaco Editor
      console.log('正在初始化 Monaco Editor...');
      await this.initMonacoEditor();
      console.log('✓ Monaco Editor 初始化完成');

      // 加載並應用主題
      console.log('正在加載主題設定...');
      await this.loadTheme();
      console.log('✓ 主題設定完成');

      // 加載版本列表
      console.log('正在加載版本列表...');
      await this.loadVersionTree();
      console.log('✓ 版本列表加載完成');

      // v3 新增：初始化專案選擇器
      await this.updateProjectSelector();
      console.log('✓ 專案選擇器初始化完成');

      console.log('✅ 應用初始化完成！');
      this.showInitializationStatus('success');
    } catch (error) {
      console.error('❌ 應用初始化失敗:', error);
      console.error('錯誤堆棧:', error.stack);
      this.showInitializationStatus('error', error.message);
      alert('應用初始化失敗：' + error.message + '\n\n請嘗試刷新頁面或清除瀏覽器快取。');
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
        statusElement.innerHTML = '✅ 應用已就緒';
        statusElement.classList.add('status-success');
      } else {
        statusElement.innerHTML = '❌ 初始化失敗：' + errorMessage;
        statusElement.classList.add('status-error');
      }
    }
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
      btnFormatSQL.addEventListener('click', () => this.formatSQL());
    }
    const btnCompareMode = document.getElementById('btnCompareMode');
    if (btnCompareMode) {
      btnCompareMode.addEventListener('click', () => this.toggleCompareMode());
    }
    const btnDeleteVersion = document.getElementById('btnDeleteVersion');
    if (btnDeleteVersion) {
      btnDeleteVersion.addEventListener('click', () => this.deleteVersion());
    }
    
    // 主題切換
    const btnThemeToggle = document.getElementById('btnThemeToggle');
    if (btnThemeToggle) {
      btnThemeToggle.addEventListener('click', () => this.toggleTheme());
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
    
    // 分割視圖控制
    const btnCloseSplit = document.getElementById('btnCloseSplit');
    if (btnCloseSplit) {
      btnCloseSplit.addEventListener('click', () => this.closeSplitView());
    }
    
    const btnSyncScroll = document.getElementById('btnSyncScroll');
    if (btnSyncScroll) {
      btnSyncScroll.addEventListener('click', () => this.toggleSyncScroll());
    }
    
    // 版本選擇下拉
    const leftVersionSelect = document.getElementById('leftVersionSelect');
    if (leftVersionSelect) {
      leftVersionSelect.addEventListener('change', (e) => this.loadVersionToSplit('left', e.target.value));
    }
    
    const rightVersionSelect = document.getElementById('rightVersionSelect');
    if (rightVersionSelect) {
      rightVersionSelect.addEventListener('change', (e) => this.loadVersionToSplit('right', e.target.value));
    }

    // 導航欄按鈕
    const btnExport = document.getElementById('btnExport');
    if (btnExport) {
      btnExport.addEventListener('click', () => this.showExportDialog());
    }
    const btnImport = document.getElementById('btnImport');
    if (btnImport) {
      btnImport.addEventListener('click', () => this.showImportDialog());
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
        this.showFullBackupDialog();
      });
    }
    const btnFullRestore = document.getElementById('btnFullRestore');
    if (btnFullRestore && moreMenu) {
      btnFullRestore.addEventListener('click', () => {
        moreMenu.style.display = 'none';
        this.showFullRestoreDialog();
      });
    }
    const btnClearAllData = document.getElementById('btnClearAllData');
    if (btnClearAllData && moreMenu) {
      btnClearAllData.addEventListener('click', () => {
        moreMenu.style.display = 'none';
        const clearAllModal = document.getElementById('clearAllModal');
        if (clearAllModal) {
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

    // 初始化狀態指示器 - 點擊重新初始化
    const initStatus = document.getElementById('initStatus');
    if (initStatus) {
      initStatus.style.cursor = 'pointer';
      initStatus.addEventListener('click', () => this.reinitializeApp());
    }

    // 版本列表
    const btnSearch = document.getElementById('btnSearch');
    if (btnSearch) {
      btnSearch.addEventListener('click', () => this.searchVersions());
    }
    const searchVersions = document.getElementById('searchVersions');
    if (searchVersions) {
      searchVersions.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') this.searchVersions();
      });
    }
    
    // 右鍵選單
    const contextMenu = document.getElementById('contextMenu');
    if (contextMenu) {
      document.addEventListener('contextmenu', (e) => {
        contextMenu.style.display = 'none';
      });
    }
    
    const contextCompare = document.getElementById('contextCompare');
    if (contextCompare && contextMenu) {
      contextCompare.addEventListener('click', () => {
        const versionId = contextMenu.dataset.versionId;
        contextMenu.style.display = 'none';
        if (versionId) {
          this.compareWithCurrent(versionId);
        }
      });
    }
    
    // 快捷鍵
    document.addEventListener('keydown', (e) => this.handleKeyboardShortcuts(e));

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
      initStatus.innerHTML = '⏳ 正在重新初始化...';
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
      
      // 重新初始化版本管理器
      console.log('重新初始化版本管理器...');
      await versionManager.init(db, diffEngine, projectManager);
      this.versionManager = versionManager;

      console.log('重新初始化導入導出管理器...');
      await importExportManager.init(db, versionManager, diffEngine, projectManager);
      this.importExportManager = importExportManager;
      
      // 重新加載版本列表
      console.log('重新加載版本列表...');
      await this.loadVersionTree();
      await this.updateProjectSelector();
      
      console.log('✅ 重新初始化完成！');
      if (initStatus) {
        initStatus.innerHTML = '✅ 應用已就緒';
        initStatus.classList.remove('status-pending', 'status-error');
        initStatus.classList.add('status-success');
      }
    } catch (error) {
      console.error('❌ 重新初始化失敗:', error);
      this.showInitializationStatus('error', error.message);
    }
  }

  /**
   * 綁定模態對話框事件
   */
  bindDialogEvents() {
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

    // 導出對話框
    const btnCloseExport = document.getElementById('btnCloseExport');
    if (btnCloseExport) {
      btnCloseExport.addEventListener('click', () => {
        document.getElementById('exportModal').style.display = 'none';
      });
    }
    const btnCancelExport = document.getElementById('btnCancelExport');
    if (btnCancelExport) {
      btnCancelExport.addEventListener('click', () => {
        document.getElementById('exportModal').style.display = 'none';
      });
    }
    const btnStartExport = document.getElementById('btnStartExport');
    if (btnStartExport) {
      btnStartExport.addEventListener('click', () => this.performExport());
    }

    // 導入檔案輸入
    const importFileInput = document.getElementById('importFileInput');
    if (importFileInput) {
      importFileInput.addEventListener('change', (e) => {
        this.handleImportFile(e);
      });
    }

    // 衝突確認對話框
    const btnCloseConflict = document.getElementById('btnCloseConflict');
    if (btnCloseConflict) {
      btnCloseConflict.addEventListener('click', () => {
        document.getElementById('conflictModal').style.display = 'none';
      });
    }
    const btnCancelImport = document.getElementById('btnCancelImport');
    if (btnCancelImport) {
      btnCancelImport.addEventListener('click', () => {
        document.getElementById('conflictModal').style.display = 'none';
      });
    }
    const btnConfirmImport = document.getElementById('btnConfirmImport');
    if (btnConfirmImport) {
      btnConfirmImport.addEventListener('click', () => this.confirmImport());
    }

    // 差異面板關閉
    const btnCloseDiff = document.getElementById('btnCloseDiff');
    if (btnCloseDiff) {
      btnCloseDiff.addEventListener('click', () => {
        document.getElementById('diffPanel').style.display = 'none';
        document.getElementById('diffContent').innerHTML = '';
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

    // v3 新增：導入目標專案選擇對話框（備用關閉按鈕）
    const btnCloseImportProject = document.getElementById('btnCloseImportProject');
    if (btnCloseImportProject) {
      btnCloseImportProject.addEventListener('click', () => {
        document.getElementById('importProjectModal').style.display = 'none';
      });
    }

    // 完整備份對話框
    const btnCloseFullBackup = document.getElementById('btnCloseFullBackup');
    if (btnCloseFullBackup) {
      btnCloseFullBackup.addEventListener('click', () => {
        document.getElementById('fullBackupModal').style.display = 'none';
      });
    }
    const btnCancelFullBackup = document.getElementById('btnCancelFullBackup');
    if (btnCancelFullBackup) {
      btnCancelFullBackup.addEventListener('click', () => {
        document.getElementById('fullBackupModal').style.display = 'none';
      });
    }
    const btnConfirmFullBackup = document.getElementById('btnConfirmFullBackup');
    if (btnConfirmFullBackup) {
      btnConfirmFullBackup.addEventListener('click', () => this.performFullBackup());
    }

    // 完整還原對話框
    const btnCloseFullRestore = document.getElementById('btnCloseFullRestore');
    if (btnCloseFullRestore) {
      btnCloseFullRestore.addEventListener('click', () => {
        document.getElementById('fullRestoreModal').style.display = 'none';
      });
    }
    const btnCancelFullRestore = document.getElementById('btnCancelFullRestore');
    if (btnCancelFullRestore) {
      btnCancelFullRestore.addEventListener('click', () => {
        document.getElementById('fullRestoreModal').style.display = 'none';
      });
    }
    const btnConfirmFullRestore = document.getElementById('btnConfirmFullRestore');
    if (btnConfirmFullRestore) {
      btnConfirmFullRestore.addEventListener('click', () => this.performFullRestore());
    }

    // 完整還原檔案輸入
    const fullRestoreFileInput = document.getElementById('fullRestoreFileInput');
    if (fullRestoreFileInput) {
      fullRestoreFileInput.addEventListener('change', (e) => {
        this.handleFullRestoreFile(e);
      });
    }
  }

  /**
   * 加載版本列表樹
   */
  async loadVersionTree() {
    const versions = await this.versionManager.getAllVersions();
    const treeContainer = document.getElementById('versionTree');
    treeContainer.innerHTML = '';

    // 顯示列表數量，便於確認是否取到完整資料
    const titleEl = document.querySelector('.card.card-version-tree .card-header h3');
    if (titleEl) {
      titleEl.textContent = `版本列表（${versions.length}）`;
    }

    console.log('版本列表加載：', versions.map(v => v.versionId));

    if (versions.length === 0) {
      treeContainer.innerHTML = '<p class="empty-state">暫無版本</p>';
      return;
    }

    // 使用 DocumentFragment 減少重排，並保護單筆渲染錯誤不影響整體
    const frag = document.createDocumentFragment();
    for (const version of versions) {
      try {
        const item = this.createVersionTreeItem(version);
        frag.appendChild(item);
      } catch (e) {
        console.warn('渲染版本項目失敗：', version.versionId, e);
      }
    }
    treeContainer.appendChild(frag);
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
    
    // 綁定右鍵選單事件
    item.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.showContextMenu(e, version.versionId);
    });

    return item;
  }
  
  /**
   * 顯示右鍵選單
   */
  showContextMenu(event, versionId) {
    const contextMenu = document.getElementById('contextMenu');
    contextMenu.dataset.versionId = versionId;
    
    // 定位選單
    contextMenu.style.left = event.clientX + 'px';
    contextMenu.style.top = event.clientY + 'px';
    contextMenu.style.display = 'block';
    
    // 點擊其他地方關閉選單
    setTimeout(() => {
      document.addEventListener('click', () => {
        contextMenu.style.display = 'none';
      }, { once: true });
    }, 0);
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

    // 版本資訊面板已移除

    // 加載版本內容到編輯器
    const content = await this.versionManager.getVersionContent(versionId);
    if (this.monacoEditor) {
      this.monacoEditor.setValue(content);
      this.updateEditorStats();
    }

    // 加載版本詳情面板
    const detailContent = document.getElementById('detailContent');
    if (detailContent) {
      detailContent.innerHTML = `
        <div class="detail-list">
          <div class="detail-row"><span>版本 ID</span><strong>${version.versionId}</strong></div>
          <div class="detail-row"><span>時間</span><strong>${new Date(version.timestamp).toLocaleString('zh-TW')}</strong></div>
          <div class="detail-row"><span>標籤</span><strong>${version.label}</strong></div>
          <div class="detail-row"><span>作者</span><strong>${version.author}</strong></div>
          <div class="detail-row"><span>描述</span><strong>${version.description || '(無)'}</strong></div>
          <div class="detail-row"><span>父版本</span><strong>${version.parentVersionId || '(根版本)'}</strong></div>
          <div class="detail-row"><span>存儲模式</span><strong>${version.isDeltaMode ? '差異' : '完整內容'}</strong></div>
          <div class="detail-row"><span>統計</span><strong class="detail-diff">+${version.stats.linesAdded} -${version.stats.linesRemoved}</strong></div>
        </div>
      `;
    }
  }

  /**
   * 顯示保存版本對話框
   */
  async showSaveVersionDialog() {
    const sqlContent = this.monacoEditor ? this.monacoEditor.getValue().trim() : '';
    
    // 檢查是否有內容
    if (!sqlContent) {
      alert('❌ 請先輸入 SQL 內容');
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
    
    // 判斷是否基於現有版本
    const isNewVersion = !this.selectedVersionId;
    
    // 更新對話框標題
    const modalTitle = document.querySelector('#newVersionModal .modal-header h2');
    if (modalTitle) {
      modalTitle.textContent = isNewVersion ? '保存新版本' : '保存為新版本';
    }
    
    // 顯示父版本資訊（如果基於現有版本）
    const parentInfoDiv = document.getElementById('versionParentInfo');
    if (parentInfoDiv) {
      if (!isNewVersion) {
        try {
          const parentVersion = await this.versionManager.getVersion(this.selectedVersionId);
          if (parentVersion) {
            const parentLabel = parentVersion.label || parentVersion.versionId.substring(0, 8);
            parentInfoDiv.innerHTML = `
              <div class="parent-version-note">
                <strong>基於版本：${parentLabel}</strong>
                <span>新版本將作為此版本的子版本儲存</span>
              </div>
            `;
          } else {
            parentInfoDiv.innerHTML = '';
          }
        } catch (error) {
          console.error('讀取父版本資訊失敗:', error);
          parentInfoDiv.innerHTML = '';
        }
      } else {
        parentInfoDiv.innerHTML = '';
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
      alert('請選擇兩個版本進行比對');
      return;
    }

    try {
      // 導向獨立差異頁面，避免在主頁擁擠
      const url = `diff.html?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
      window.open(url, '_blank');

      // 關閉比對對話框
      document.getElementById('compareModal').style.display = 'none';
    } catch (error) {
      alert('比對失敗：' + error.message);
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
      alert('請先選擇一個版本');
      return;
    }

    if (confirm(`確定要回溯到版本 ${this.selectedVersionId} 嗎？`)) {
      try {
        const content = await this.versionManager.revertToVersion(this.selectedVersionId);
        if (this.monacoEditor) {
          this.monacoEditor.setValue(content);
        }
        this.updateEditorStats();
        alert('版本已回溯！');
      } catch (error) {
        alert('回溯失敗：' + error.message);
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
        if (this.monacoEditor) {
          this.monacoEditor.setValue('');
        }
        const detailContent = document.getElementById('detailContent');
        if (detailContent) {
          detailContent.innerHTML = '<p class="placeholder-text">選擇一個版本查看詳情</p>';
        }
        this.updateEditorStats();
      } catch (error) {
        alert('刪除失敗：' + error.message);
      }
    }
  }

  /**
   * 確認清空全部資料
   */
  async confirmClearAllData() {
    try {
      // 清空資料庫中的所有版本
      await this.versionManager.deleteAllVersions();
      
      // 清空編輯器
      if (this.monacoEditor) {
        this.monacoEditor.setValue('');
      }
      
      // 重新整理版本樹
      await this.loadVersionTree();
      
      // 清空詳情面板
      const detailContent = document.getElementById('detailContent');
      if (detailContent) {
        detailContent.innerHTML = '<p class="placeholder-text">選擇一個版本查看詳情</p>';
      }
      
      // 關閉對話框
      const clearAllModal = document.getElementById('clearAllModal');
      if (clearAllModal) {
        clearAllModal.style.display = 'none';
      }
      
      // 更新統計信息
      this.updateEditorStats();
      
      // 顯示成功訊息
      alert('✓ 所有版本資料已成功刪除');
      
      console.log('✓ 清空全部版本資料完成');
    } catch (error) {
      console.error('❌ 清空資料失敗:', error);
      alert('❌ 清空資料失敗，請重試');
    }
  }

  /**
   * 搜尋版本
   */
  async searchVersions() {
    const searchVersionsEl = document.getElementById('searchVersions');
    const keyword = searchVersionsEl ? searchVersionsEl.value.trim() : '';

    if (!keyword) {
      await this.loadVersionTree();
      return;
    }

    try {
      const results = await this.versionManager.searchVersions(keyword);
      const treeContainer = document.getElementById('versionTree');
      if (!treeContainer) return;
      
      treeContainer.innerHTML = '';

      if (results.length === 0) {
        treeContainer.innerHTML = '<p class="empty-state">未找到相符的版本</p>';
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
    // v3 新增：初始化導出專案選擇器
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

  /**
   * 執行導出（僅 JSON）
   */
  async performExport() {
    try {
      const includeTags = document.getElementById('exportTags').checked;
      const includeComments = document.getElementById('exportComments').checked;
      // v3 新增：獲取選定的專案
      const exportProjectSelect = document.getElementById('exportProjectSelect');
      const projectId = exportProjectSelect ? exportProjectSelect.value : null;

      const { jsonContent, filename } = await this.importExportManager.exportToJSON({
        includeTags,
        includeComments,
        projectId
      });

      this.importExportManager.downloadFile(jsonContent, `${filename}.json`, 'application/json');

      alert('導出成功！(JSON)');
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
   * 處理導入檔案（僅 JSON）
   */
  async handleImportFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
      if (!file.name.endsWith('.json')) {
        alert('請選擇 JSON 檔案');
        event.target.value = '';
        return;
      }

      const text = await file.text();
      const importData = JSON.parse(text);

      // v3 新增：先讓使用者選擇目標專案
      const targetProjectId = await this.showImportProjectSelector();
      if (!targetProjectId) {
        // 使用者取消
        event.target.value = '';
        return;
      }

      // 保存目標專案以供後續使用
      this.pendingImportData = { importData, targetProjectId };

      // 驗證導入數據
      const result = await this.importExportManager.importFromJSON(importData);

      if (result.conflicts.length > 0) {
        // 顯示衝突確認對話框
        this.showConflictDialog(result);
      } else {
        // 直接導入
        await this.performImport(importData, targetProjectId);
      }
    } catch (error) {
      alert('導入失敗：' + error.message);
    }

    // 重置檔案輸入
    event.target.value = '';
  }

  /**
   * v3 新增：顯示導入目標專案選擇對話框
   */
  async showImportProjectSelector() {
    return new Promise((resolve) => {
      const modal = document.getElementById('importProjectModal');
      const selector = document.getElementById('importTargetProject');

      if (!modal || !selector) {
        // 如果沒有 UI 元素，返回當前專案
        resolve(this.projectManager.getCurrentProjectId());
        return;
      }

      // 初始化專案選擇器
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

      // 顯示對話框
      modal.style.display = 'flex';

      // 處理確認
      const confirmBtn = document.getElementById('btnConfirmImportProject');
      const cancelBtn = document.getElementById('btnCloseImportProject');

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

      const cleanup = () => {
        confirmBtn.removeEventListener('click', handleConfirm);
        cancelBtn.removeEventListener('click', handleCancel);
      };

      confirmBtn.addEventListener('click', handleConfirm);
      cancelBtn.addEventListener('click', handleCancel);
    });
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
      const conflicts = await this.importExportManager._detectConflicts(this.pendingImportData.versions);
      for (const conflict of conflicts) {
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
  async performImport(importInfo, resolutions = {}) {
    try {
      // 支持兩種格式：
      // 1. importInfo = { importData, targetProjectId }
      // 2. importInfo = jsonData（舊格式，使用當前專案）
      let jsonData, targetProjectId;

      if (importInfo.importData) {
        // v3 新格式
        jsonData = importInfo.importData;
        targetProjectId = importInfo.targetProjectId;
      } else {
        // 舊格式或只傳遞 jsonData
        jsonData = importInfo;
        targetProjectId = this.projectManager.getCurrentProjectId();
      }

      const results = await this.importExportManager.executeImport(jsonData, resolutions, targetProjectId);

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
   * 切換專案
   */
  async switchProject(projectId) {
    try {
      await this.projectManager.setCurrentProject(projectId);
      console.log('✓ 已切換到專案:', projectId);

      // 更新版本樹
      await this.loadVersionTree();

      // 清空編輯器
      if (this.monacoEditor) {
        this.monacoEditor.setValue('');
        this.updateEditorStats();
      }

      // 更新選擇器UI
      await this.updateProjectSelector();
    } catch (error) {
      console.error('切換專案失敗:', error);
      alert('切換專案失敗：' + error.message);
    }
  }

  /**
   * 顯示建立專案對話框
   */
  showCreateProjectDialog() {
    const projectName = prompt('請輸入新專案名稱：');
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
      const project = await this.projectManager.createProject(projectName);
      console.log('✓ 已建立新專案:', project.projectName);

      // 自動切換到新專案
      await this.switchProject(project.projectId);

      alert(`已成功建立新專案「${projectName}」`);
    } catch (error) {
      console.error('建立專案失敗:', error);
      alert('建立專案失敗：' + error.message);
    }
  }

  /**
   * 顯示刪除專案對話框
   */
  showDeleteProjectDialog() {
    const projects = this.projectManager.getProjects();
    const currentProjectId = this.projectManager.getCurrentProjectId();
    
    if (projects.length <= 1) {
      alert('至少需要保留一個專案，無法刪除。');
      return;
    }
    
    // 建立選項文字，顯示所有專案
    let message = '請選擇要刪除的專案：\n\n';
    projects.forEach((proj, index) => {
      const isCurrent = proj.projectId === currentProjectId;
      message += `${index + 1}. ${proj.projectName}${isCurrent ? ' (當前專案)' : ''}\n`;
    });
    
    const selection = prompt(message + '\n請輸入專案編號（1-' + projects.length + '）：');
    
    if (!selection) {
      return;  // 用戶取消
    }
    
    const index = parseInt(selection) - 1;
    if (isNaN(index) || index < 0 || index >= projects.length) {
      alert('無效的選擇');
      return;
    }
    
    const projectToDelete = projects[index];
    this.deleteProject(projectToDelete.projectId, projectToDelete.projectName);
  }

  /**
   * 刪除專案
   */
  async deleteProject(projectId, projectName) {
    const currentProjectId = this.projectManager.getCurrentProjectId();
    const isCurrentProject = projectId === currentProjectId;
    
    // 二次確認
    const confirmed = confirm(
      `確定要刪除專案「${projectName}」嗎？\n\n` +
      '⚠️ 警告：此操作將刪除該專案下的所有版本記錄，且無法復原！'
    );
    
    if (!confirmed) {
      return;
    }
    
    try {
      // 如果要刪除的是當前專案，先切換到其他專案
      if (isCurrentProject) {
        const projects = this.projectManager.getProjects();
        const otherProject = projects.find(p => p.projectId !== projectId);
        
        if (otherProject) {
          console.log(`正在切換到專案「${otherProject.projectName}」...`);
          await this.switchProject(otherProject.projectId);
        }
      }
      
      // 執行刪除（現在可以安全刪除了）
      await this.projectManager.deleteProject(projectId);
      console.log(`✓ 專案「${projectName}」已成功刪除`);
      
      // 更新專案選擇器
      await this.updateProjectSelector();
      
      // 重新加載版本列表
      await this.loadVersionTree();
      
      alert(`專案「${projectName}」已成功刪除`);
    } catch (error) {
      console.error('刪除專案失敗:', error);
      alert('刪除專案失敗：' + error.message);
    }
  }

  // ========== 完整備份與還原功能 ==========

  /**
   * 顯示完整備份對話框
   */
  async showFullBackupDialog() {
    try {
      // 獲取統計資訊
      const allProjects = await this.importExportManager._getAllProjects();
      const allVersions = await this.db.getAllVersions();
      const allTags = await this.importExportManager._getAllTags();
      const allComments = await this.importExportManager._getAllComments();

      // 更新統計顯示
      document.getElementById('statsProjects').textContent = allProjects.length;
      document.getElementById('statsVersions').textContent = allVersions.length;
      document.getElementById('statsTags').textContent = allTags.length;
      document.getElementById('statsComments').textContent = allComments.length;

      // 顯示對話框
      document.getElementById('fullBackupModal').style.display = 'flex';
    } catch (error) {
      console.error('載入統計資訊失敗:', error);
      alert('載入統計資訊失敗：' + error.message);
    }
  }

  /**
   * 執行完整備份
   */
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
      alert('完整資料庫備份成功！');
      
      document.getElementById('fullBackupModal').style.display = 'none';
    } catch (error) {
      console.error('完整備份失敗:', error);
      alert('完整備份失敗：' + error.message);
    }
  }

  /**
   * 顯示完整還原對話框
   */
  showFullRestoreDialog() {
    // 觸發檔案選擇
    document.getElementById('fullRestoreFileInput').click();
  }

  /**
   * 處理完整還原檔案
   */
  async handleFullRestoreFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
      if (!file.name.endsWith('.json')) {
        alert('請選擇 JSON 備份檔案');
        event.target.value = '';
        return;
      }

      console.log('正在讀取備份檔案...');
      const text = await file.text();
      const jsonData = JSON.parse(text);

      // 驗證是否為完整備份檔案
      if (jsonData.formatVersion !== '2.0' || jsonData.exportType !== 'full') {
        alert('這不是有效的完整備份檔案（需要 formatVersion 2.0 且 exportType 為 full）');
        event.target.value = '';
        return;
      }

      // 顯示檔案資訊
      const restoreFileInfo = document.getElementById('restoreFileInfo');
      const restoreStats = document.getElementById('restoreStats');
      
      restoreStats.innerHTML = `
        <div class="stats-grid">
          <div><strong>匯出日期：</strong>${new Date(jsonData.exportDate).toLocaleString('zh-TW')}</div>
          <div><strong>格式版本：</strong>${jsonData.formatVersion}</div>
          <div><strong>專案數：</strong>${jsonData.totalProjects || 0}</div>
          <div><strong>版本數：</strong>${jsonData.totalVersions || 0}</div>
          <div><strong>標籤數：</strong>${jsonData.totalTags || 0}</div>
          <div><strong>批註數：</strong>${jsonData.totalComments || 0}</div>
        </div>
      `;
      
      restoreFileInfo.style.display = 'block';

      // 保存資料供還原使用
      this.pendingRestoreData = jsonData;

      // 顯示還原對話框
      document.getElementById('fullRestoreModal').style.display = 'flex';
    } catch (error) {
      console.error('讀取備份檔案失敗:', error);
      alert('讀取備份檔案失敗：' + error.message);
    }

    // 重置檔案輸入
    event.target.value = '';
  }

  /**
   * 執行完整還原
   */
  async performFullRestore() {
    if (!this.pendingRestoreData) {
      alert('請先選擇備份檔案');
      return;
    }

    const strategy = document.querySelector('input[name="restoreStrategy"]:checked').value;
    const clearExisting = document.getElementById('restoreClearExisting').checked;

    // 如果選擇清空現有資料，需要二次確認
    if (clearExisting) {
      const confirmed = confirm(
        '⚠️ 警告：您選擇了「清空所有現有資料」選項！\n\n' +
        '此操作將永久刪除資料庫中的所有專案、版本、標籤和批註，\n' +
        '然後匯入備份檔案的內容。\n\n' +
        '此操作無法復原！是否確定要繼續？'
      );

      if (!confirmed) {
        return;
      }

      // 第三次確認（因為這是非常危險的操作）
      const finalConfirm = confirm(
        '最後確認：\n\n' +
        '您真的要清空所有現有資料並還原備份嗎？\n' +
        '點擊「確定」將開始執行，點擊「取消」將中止操作。'
      );

      if (!finalConfirm) {
        return;
      }
    }

    try {
      console.log('開始完整資料庫還原...');
      console.log(`  - 衝突策略: ${strategy}`);
      console.log(`  - 清空現有資料: ${clearExisting}`);

      const results = await this.importExportManager.importFullDatabase(this.pendingRestoreData, {
        conflictStrategy: strategy,
        clearExisting: clearExisting
      });

      // 組合結果訊息
      let message = '完整資料庫還原完成！\n\n';
      message += `專案：新增 ${results.projects.imported}, 覆蓋 ${results.projects.overwritten}, 跳過 ${results.projects.skipped}\n`;
      message += `版本：新增 ${results.versions.imported}, 覆蓋 ${results.versions.overwritten}, 合併 ${results.versions.merged}, 跳過 ${results.versions.skipped}\n`;
      message += `標籤：新增 ${results.tags.imported}, 跳過 ${results.tags.skipped}\n`;
      message += `批註：新增 ${results.comments.imported}, 跳過 ${results.comments.skipped}`;

      if (results.metadata.imported > 0) {
        message += `\n元數據：新增 ${results.metadata.imported}`;
      }

      // 檢查錯誤
      const totalErrors = 
        results.projects.errors.length +
        results.versions.errors.length +
        results.tags.errors.length +
        results.comments.errors.length +
        results.metadata.errors.length;

      if (totalErrors > 0) {
        message += `\n\n⚠️ 發生 ${totalErrors} 個錯誤`;
        console.warn('還原錯誤詳情:', results);
      }

      alert(message);

      // 關閉對話框
      document.getElementById('fullRestoreModal').style.display = 'none';

      // 清除暫存資料
      this.pendingRestoreData = null;

      // 重新載入專案清單（確保還原後的專案出現在下拉選單）
      await this.projectManager.loadProjects();

      // 若當前專案已不存在，切換到第一個可用專案
      const projects = this.projectManager.getProjects();
      if (projects.length > 0) {
        const currentId = this.projectManager.getCurrentProjectId();
        if (!projects.some(p => p.projectId === currentId)) {
          await this.projectManager.setCurrentProject(projects[0].projectId);
        }
      }

      // 重新初始化專案選擇器
      await this.updateProjectSelector();

      // 重新加載版本列表
      await this.loadVersionTree();

      console.log('✓ 完整還原完成並已重新載入');
    } catch (error) {
      console.error('完整還原失敗:', error);
      alert('完整還原失敗：' + error.message);
    }
  }

  /**
   * 初始化 Monaco Editor
   */
  async initMonacoEditor() {
    return new Promise((resolve, reject) => {
      require(['vs/editor/editor.main'], () => {
        try {
          // 初始化主編輯器
          this.monacoEditor = monaco.editor.create(document.getElementById('monacoEditor'), {
            value: '',
            language: 'sql',
            theme: this.currentTheme === 'dark' ? 'vs-dark' : 'vs',
            automaticLayout: true,
            minimap: { enabled: true },
            fontSize: 14,
            lineNumbers: 'on',
            roundedSelection: true,
            scrollBeyondLastLine: false,
            readOnly: false,
            cursorStyle: 'line',
            wordWrap: 'on',
            tabSize: 2
          });

          // 監聽內容變化更新統計
          this.monacoEditor.onDidChangeModelContent(() => {
            this.updateEditorStats();
            this.updateStatusBar();
          });

          // 監聽游標位置變化
          this.monacoEditor.onDidChangeCursorPosition(() => {
            this.updateStatusBar();
          });

          // 監聽選擇變化
          this.monacoEditor.onDidChangeCursorSelection(() => {
            this.updateStatusBar();
          });

          console.log('Monaco Editor 初始化成功');
          resolve();
        } catch (error) {
          console.error('Monaco Editor 初始化失敗:', error);
          reject(error);
        }
      });
    });
  }

  /**
   * 更新編輯器統計信息
   */
  updateEditorStats() {
    if (this.monacoEditor) {
      const model = this.monacoEditor.getModel();
      if (model) {
        const lineCount = model.getLineCount();
        const charCount = model.getValue().length;
        document.getElementById('lineCount').textContent = lineCount;
        document.getElementById('charCount').textContent = charCount;
      }
    }
  }

  /**
   * 更新狀態欄
   */
  updateStatusBar() {
    if (this.monacoEditor) {
      const position = this.monacoEditor.getPosition();
      const selection = this.monacoEditor.getSelection();
      
      document.getElementById('statusPosition').textContent = `行 ${position.lineNumber}, 列 ${position.column}`;
      
      if (selection && !selection.isEmpty()) {
        const model = this.monacoEditor.getModel();
        const selectedText = model.getValueInRange(selection);
        document.getElementById('statusSelection').textContent = `已選擇 ${selectedText.length}`;
      } else {
        document.getElementById('statusSelection').textContent = '已選擇 0';
      }
    }
  }

  /**
   * 格式化 SQL（使用 sql-formatter）
   */
  formatSQL() {
    if (!this.monacoEditor) return;
    
    try {
      const sql = this.monacoEditor.getValue();
      if (!sql.trim()) {
        alert('編輯器內容為空');
        return;
      }

      // 使用 sql-formatter 進行格式化
      const formatted = sqlFormatter.format(sql, {
        language: 'mysql',
        indent: '  ',
        uppercase: true,
        linesBetweenQueries: 2
      });

      this.monacoEditor.setValue(formatted);
      this.monacoEditor.getAction('editor.action.formatDocument').run();
    } catch (error) {
      console.error('格式化失敗:', error);
      alert('SQL 格式化失敗：' + error.message);
    }
  }

  /**
   * 加載主題設定
   */
  async loadTheme() {
    try {
      const prefs = await this.db.getMetadata('userPreferences');
      this.currentTheme = prefs?.value?.theme || 'light';
      this.applyTheme(this.currentTheme);
    } catch (error) {
      console.warn('加載主題設定失敗:', error);
      this.applyTheme('light');
    }
  }

  /**
   * 應用主題
   */
  applyTheme(theme) {
    this.currentTheme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    
    // 更新 Monaco Editor 主題
    if (this.monacoEditor) {
      monaco.editor.setTheme(theme === 'dark' ? 'vs-dark' : 'vs');
    }
    if (this.leftMonacoEditor) {
      monaco.editor.setTheme(theme === 'dark' ? 'vs-dark' : 'vs');
    }
    if (this.rightMonacoEditor) {
      monaco.editor.setTheme(theme === 'dark' ? 'vs-dark' : 'vs');
    }
    
    // 更新主題按鈕文字
    const btn = document.getElementById('btnThemeToggle');
    const icon = btn.querySelector('.icon');
    const text = btn.querySelector('span:not(.icon)');
    
    if (theme === 'dark') {
      icon.textContent = '☀️';
      text.textContent = '淺色模式';
    } else {
      icon.textContent = '🌙';
      text.textContent = '深色模式';
    }
  }

  /**
   * 切換主題
   */
  async toggleTheme() {
    const newTheme = this.currentTheme === 'light' ? 'dark' : 'light';
    this.applyTheme(newTheme);
    
    // 保存到 IndexedDB
    try {
      const prefs = await this.db.getMetadata('userPreferences') || { key: 'userPreferences', value: {} };
      prefs.value.theme = newTheme;
      await this.db.saveMetadata('userPreferences', prefs.value);
    } catch (error) {
      console.error('保存主題設定失敗:', error);
    }
  }

  /**
   * 切換比較模式
   */
  async toggleCompareMode() {
    this.isSplitView = !this.isSplitView;
    
    const singleCard = document.getElementById('singleEditorCard');
    const splitCard = document.getElementById('splitEditorCard');
    
    if (this.isSplitView) {
      // 進入分割視圖
      singleCard.style.display = 'none';
      splitCard.style.display = 'block';
      
      // 初始化分割編輯器（如果尚未初始化）
      if (!this.leftMonacoEditor || !this.rightMonacoEditor) {
        await this.initSplitEditors();
      }
      
      // 載入當前版本和前一版本
      await this.loadDefaultComparison();
    } else {
      // 返回單一視圖
      singleCard.style.display = 'block';
      splitCard.style.display = 'none';
    }
  }

  /**
   * 初始化分割編輯器
   */
  async initSplitEditors() {
    return new Promise((resolve) => {
      require(['vs/editor/editor.main'], () => {
        const editorOptions = {
          language: 'sql',
          theme: this.currentTheme === 'dark' ? 'vs-dark' : 'vs',
          automaticLayout: true,
          minimap: { enabled: false },
          fontSize: 14,
          lineNumbers: 'on',
          readOnly: true,
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          tabSize: 2
        };

        this.leftMonacoEditor = monaco.editor.create(
          document.getElementById('leftMonacoEditor'),
          { ...editorOptions, value: '' }
        );

        this.rightMonacoEditor = monaco.editor.create(
          document.getElementById('rightMonacoEditor'),
          { ...editorOptions, value: '' }
        );

        // 綁定同步捲動
        this.setupSyncScroll();

        console.log('分割編輯器初始化成功');
        resolve();
      });
    });
  }

  /**
   * 設置同步捲動
   */
  setupSyncScroll() {
    this.leftMonacoEditor.onDidScrollChange(() => {
      if (this.isSyncScroll && this.rightMonacoEditor) {
        this.rightMonacoEditor.setScrollPosition({
          scrollTop: this.leftMonacoEditor.getScrollTop()
        });
      }
    });

    this.rightMonacoEditor.onDidScrollChange(() => {
      if (this.isSyncScroll && this.leftMonacoEditor) {
        this.leftMonacoEditor.setScrollPosition({
          scrollTop: this.rightMonacoEditor.getScrollTop()
        });
      }
    });
  }

  /**
   * 切換同步捲動
   */
  toggleSyncScroll() {
    this.isSyncScroll = !this.isSyncScroll;
    const btn = document.getElementById('btnSyncScroll');
    btn.style.opacity = this.isSyncScroll ? '1' : '0.5';
    btn.title = this.isSyncScroll ? '同步捲動（已啟用）' : '同步捲動（已停用）';
  }

  /**
   * 載入預設比較（當前版本 vs 前一版本）
   */
  async loadDefaultComparison() {
    const versions = await this.versionManager.getAllVersions();
    if (versions.length < 2) {
      alert('至少需要兩個版本才能進行比較');
      return;
    }

    // 更新版本選擇下拉選單
    await this.updateVersionSelects();

    // 載入最新兩個版本
    await this.loadVersionToSplit('left', versions[1].versionId);
    await this.loadVersionToSplit('right', versions[0].versionId);
  }

  /**
   * 更新版本選擇下拉選單
   */
  async updateVersionSelects() {
    const versions = await this.versionManager.getAllVersions();
    const leftSelect = document.getElementById('leftVersionSelect');
    const rightSelect = document.getElementById('rightVersionSelect');

    leftSelect.innerHTML = '<option value="">選擇版本...</option>';
    rightSelect.innerHTML = '<option value="">選擇版本...</option>';

    versions.forEach(v => {
      const option = `<option value="${v.versionId}">${v.versionId.substring(0, 8)} - ${v.label}</option>`;
      leftSelect.innerHTML += option;
      rightSelect.innerHTML += option;
    });
  }

  /**
   * 載入版本到分割視圖
   */
  async loadVersionToSplit(side, versionId) {
    if (!versionId) return;

    try {
      const content = await this.versionManager.getVersionContent(versionId);
      const version = await this.versionManager.db.getVersion(versionId);

      if (side === 'left') {
        this.leftMonacoEditor.setValue(content);
        document.getElementById('leftVersionLabel').textContent = version.label || '版本 A';
        document.getElementById('leftLineCount').textContent = content.split('\n').length;
        document.getElementById('leftVersionSelect').value = versionId;
      } else {
        this.rightMonacoEditor.setValue(content);
        document.getElementById('rightVersionLabel').textContent = version.label || '版本 B';
        document.getElementById('rightLineCount').textContent = content.split('\n').length;
        document.getElementById('rightVersionSelect').value = versionId;
      }

      // 計算差異
      await this.calculateSplitDiff();
    } catch (error) {
      console.error('載入版本失敗:', error);
      alert('載入版本失敗：' + error.message);
    }
  }

  /**
   * 計算分割視圖的差異
   */
  async calculateSplitDiff() {
    const leftId = document.getElementById('leftVersionSelect').value;
    const rightId = document.getElementById('rightVersionSelect').value;

    if (!leftId || !rightId) return;

    try {
      const comparison = await this.versionManager.compareVersions(leftId, rightId);
      
      document.getElementById('diffAdded').textContent = comparison.stats.linesAdded;
      document.getElementById('diffRemoved').textContent = comparison.stats.linesRemoved;

      // 使用 Monaco Editor 的 Decorations API 高亮差異
      this.highlightDifferences(comparison.lineDiffs);
    } catch (error) {
      console.error('計算差異失敗:', error);
    }
  }

  /**
   * 高亮差異行
   */
  highlightDifferences(lineDiffs) {
    if (!this.leftMonacoEditor || !this.rightMonacoEditor) return;

    const leftDecorations = [];
    const rightDecorations = [];

    lineDiffs.forEach((diff, index) => {
      const lineNumber = index + 1;

      if (diff.type === 'removed') {
        leftDecorations.push({
          range: new monaco.Range(lineNumber, 1, lineNumber, 1),
          options: {
            isWholeLine: true,
            className: 'diff-highlight-removed'
          }
        });
      } else if (diff.type === 'added') {
        rightDecorations.push({
          range: new monaco.Range(lineNumber, 1, lineNumber, 1),
          options: {
            isWholeLine: true,
            className: 'diff-highlight-added'
          }
        });
      }
    });

    this.leftMonacoEditor.deltaDecorations([], leftDecorations);
    this.rightMonacoEditor.deltaDecorations([], rightDecorations);
  }

  /**
   * 關閉分割視圖
   */
  closeSplitView() {
    this.isSplitView = false;
    document.getElementById('singleEditorCard').style.display = 'block';
    document.getElementById('splitEditorCard').style.display = 'none';
  }

  /**
   * 與當前版本比較（右鍵選單觸發）
   */
  async compareWithCurrent(selectedVersionId) {
    // 進入分割視圖
    this.isSplitView = true;
    document.getElementById('singleEditorCard').style.display = 'none';
    document.getElementById('splitEditorCard').style.display = 'block';

    // 初始化分割編輯器（如果尚未初始化）
    if (!this.leftMonacoEditor || !this.rightMonacoEditor) {
      await this.initSplitEditors();
    }

    await this.updateVersionSelects();

    // 左側載入選中的版本，右側載入當前編輯器內容
    await this.loadVersionToSplit('left', selectedVersionId);
    
    // 右側顯示當前編輯器內容
    const currentContent = this.monacoEditor.getValue();
    this.rightMonacoEditor.setValue(currentContent);
    document.getElementById('rightVersionLabel').textContent = '當前編輯器';
    document.getElementById('rightLineCount').textContent = currentContent.split('\n').length;
    document.getElementById('rightVersionSelect').value = '';
  }

  /**
   * 處理鍵盤快捷鍵
   */
  handleKeyboardShortcuts(e) {
    // Ctrl+S - 保存版本
    if (e.ctrlKey && e.key === 's') {
      e.preventDefault();
      this.showSaveVersionDialog();
    }
    
    // Ctrl+Shift+F - 格式化
    if (e.ctrlKey && e.shiftKey && e.key === 'F') {
      e.preventDefault();
      this.formatSQL();
    }
    
    // Ctrl+D - 切換比較模式
    if (e.ctrlKey && e.key === 'd') {
      e.preventDefault();
      this.toggleCompareMode();
    }
    
    // Ctrl+F - 搜尋（使用 Monaco 內建）
    // Monaco Editor 自動處理，不需要額外代碼
  }
}

// 應用初始化
const app = new SQLVersionApp();
document.addEventListener('DOMContentLoaded', () => {
  app.init();
});
