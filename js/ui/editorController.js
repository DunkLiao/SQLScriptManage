/**
 * Monaco 編輯器、主題、快捷鍵與分割比較 UI 控制器。
 */

class EditorController {
  constructor(options) {
    this.db = options.db;
    this.versionManager = options.versionManager;
    this.scriptManager = options.scriptManager;
    this.importExportManager = options.importExportManager;
    this.onSaveVersion = options.onSaveVersion;
    this.onError = options.onError || ((message) => {
      if (typeof dialogs !== 'undefined') {
        dialogs.showAlert({ title: '提示', message });
      }
    });
    this.onContentChanged = options.onContentChanged || (() => {});

    this.monacoEditor = null;
    this.leftMonacoEditor = null;
    this.rightMonacoEditor = null;
    this.isSplitView = false;
    this.isSyncScroll = true;
    this.currentTheme = 'light';
    this.leftDecorations = [];
    this.rightDecorations = [];
  }

  async init() {
    await this.initMonacoEditor();
  }

  bindEvents() {
    const btnCloseSplit = document.getElementById('btnCloseSplit');
    if (btnCloseSplit) {
      btnCloseSplit.addEventListener('click', () => this.closeSplitView());
    }

    const btnSyncScroll = document.getElementById('btnSyncScroll');
    if (btnSyncScroll) {
      btnSyncScroll.addEventListener('click', () => this.toggleSyncScroll());
    }

    const leftVersionSelect = document.getElementById('leftVersionSelect');
    if (leftVersionSelect) {
      leftVersionSelect.addEventListener('change', (event) => {
        this.loadVersionToSplit('left', event.target.value);
      });
    }

    const rightVersionSelect = document.getElementById('rightVersionSelect');
    if (rightVersionSelect) {
      rightVersionSelect.addEventListener('change', (event) => {
        this.loadVersionToSplit('right', event.target.value);
      });
    }
  }

  async initMonacoEditor() {
    return new Promise((resolve, reject) => {
      if (typeof require !== 'function' || typeof monaco === 'undefined') {
        reject(new Error('Monaco Editor 未載入，請檢查網路連線後重試。'));
        return;
      }
      require(['vs/editor/editor.main'], () => {
        try {
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

          this.monacoEditor.onDidChangeModelContent(() => {
            this.updateEditorStats();
            this.updateStatusBar();
            this.onContentChanged(this.monacoEditor.getValue());
          });
          this.monacoEditor.onDidChangeCursorPosition(() => this.updateStatusBar());
          this.monacoEditor.onDidChangeCursorSelection(() => this.updateStatusBar());

          console.log('Monaco Editor 初始化成功');
          resolve();
        } catch (error) {
          console.error('Monaco Editor 初始化失敗:', error);
          reject(error);
        }
      });
    });
  }

  getValue() {
    return this.monacoEditor ? this.monacoEditor.getValue() : '';
  }

  setValue(content) {
    if (!this.monacoEditor) return;
    this.monacoEditor.setValue(content || '');
    this.updateEditorStats();
    this.updateStatusBar();
  }

  clear() {
    this.setValue('');
  }

  updateEditorStats() {
    if (!this.monacoEditor) return;

    const model = this.monacoEditor.getModel();
    if (!model) return;

    const lineCount = document.getElementById('lineCount');
    const charCount = document.getElementById('charCount');
    if (lineCount) lineCount.textContent = model.getLineCount();
    if (charCount) charCount.textContent = model.getValue().length;
  }

  updateStatusBar() {
    if (!this.monacoEditor) return;

    const position = this.monacoEditor.getPosition();
    const selection = this.monacoEditor.getSelection();
    const statusPosition = document.getElementById('statusPosition');
    const statusSelection = document.getElementById('statusSelection');

    if (statusPosition && position) {
      statusPosition.textContent = `行 ${position.lineNumber}, 列 ${position.column}`;
    }

    if (!statusSelection) return;
    if (selection && !selection.isEmpty()) {
      const model = this.monacoEditor.getModel();
      const selectedText = model.getValueInRange(selection);
      statusSelection.textContent = `已選擇 ${selectedText.length}`;
    } else {
      statusSelection.textContent = '已選擇 0';
    }
  }

  downloadCurrentSQL() {
    if (!this.monacoEditor) return;

    const sql = this.monacoEditor.getValue();
    if (!sql.trim()) {
      this.onError('編輯器內容為空');
      return;
    }

    const currentScript = this.scriptManager?.getCurrentScript();
    const rawName = currentScript?.scriptName || 'sql_script';
    const safeBaseName = rawName
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, ' ')
      .trim() || 'sql_script';
    const filename = safeBaseName.toLowerCase().endsWith('.sql')
      ? safeBaseName
      : `${safeBaseName}.sql`;

    this.importExportManager.downloadFile(sql, filename, 'text/sql;charset=utf-8');
  }

  formatSQL() {
    if (!this.monacoEditor) return;

    try {
      const sql = this.monacoEditor.getValue();
      if (!sql.trim()) {
        this.onError('編輯器內容為空');
        return;
      }
      if (typeof sqlFormatter === 'undefined') {
        this.onError('SQL 格式化工具未載入，請檢查網路連線後重試。');
        return;
      }

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
      this.onError('SQL 格式化失敗：' + error.message);
    }
  }

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

  applyTheme(theme) {
    this.currentTheme = theme;
    document.documentElement.setAttribute('data-theme', theme);

    if (typeof monaco !== 'undefined') {
      monaco.editor.setTheme(theme === 'dark' ? 'vs-dark' : 'vs');
    }

    const btn = document.getElementById('btnThemeToggle');
    if (!btn) return;

    const icon = btn.querySelector('.icon');
    const text = btn.querySelector('span:not(.icon)');
    if (!icon || !text) return;

    if (theme === 'dark') {
      icon.textContent = '☀️';
      text.textContent = '淺色模式';
    } else {
      icon.textContent = '🌙';
      text.textContent = '深色模式';
    }
  }

  async toggleTheme() {
    const newTheme = this.currentTheme === 'light' ? 'dark' : 'light';
    this.applyTheme(newTheme);

    try {
      const prefs = await this.db.getMetadata('userPreferences') || { key: 'userPreferences', value: {} };
      prefs.value.theme = newTheme;
      await this.db.saveMetadata('userPreferences', prefs.value);
    } catch (error) {
      console.error('保存主題設定失敗:', error);
    }
  }

  async toggleCompareMode() {
    this.isSplitView = !this.isSplitView;

    const singleCard = document.getElementById('singleEditorCard');
    const splitCard = document.getElementById('splitEditorCard');
    if (!singleCard || !splitCard) return;

    if (this.isSplitView) {
      singleCard.style.display = 'none';
      splitCard.style.display = 'block';

      if (!this.leftMonacoEditor || !this.rightMonacoEditor) {
        await this.initSplitEditors();
      }

      await this.loadDefaultComparison();
    } else {
      singleCard.style.display = 'block';
      splitCard.style.display = 'none';
    }
  }

  async initSplitEditors() {
    return new Promise((resolve) => {
      if (typeof require !== 'function' || typeof monaco === 'undefined') {
        this.onError('Monaco Editor 未載入，無法開啟比較模式。請檢查網路連線後重試。');
        resolve();
        return;
      }
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

        this.setupSyncScroll();
        console.log('分割編輯器初始化成功');
        resolve();
      });
    });
  }

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

  toggleSyncScroll() {
    this.isSyncScroll = !this.isSyncScroll;
    const btn = document.getElementById('btnSyncScroll');
    if (!btn) return;

    btn.style.opacity = this.isSyncScroll ? '1' : '0.5';
    btn.title = this.isSyncScroll ? '同步捲動（已啟用）' : '同步捲動（已停用）';
  }

  async loadDefaultComparison() {
    this.setSplitBusy(true, '載入比較版本...');
    const page = await this.versionManager.getVersionPage({ limit: 2 });
    const versions = page.versions;
    if (versions.length < 2) {
      this.setSplitBusy(false);
      this.onError('至少需要兩個版本才能進行比較');
      return;
    }

    await this.updateVersionSelects();
    await this.loadVersionToSplit('left', versions[1].versionId);
    await this.loadVersionToSplit('right', versions[0].versionId);
    this.setSplitBusy(false);
  }

  async updateVersionSelects() {
    const versions = await this.loadVersionOptions();
    const leftSelect = document.getElementById('leftVersionSelect');
    const rightSelect = document.getElementById('rightVersionSelect');
    if (!leftSelect || !rightSelect) return;

    this.replaceVersionOptions(leftSelect, versions);
    this.replaceVersionOptions(rightSelect, versions);
  }

  async loadVersionOptions() {
    const versions = [];
    let beforeTimestamp = Number.MAX_SAFE_INTEGER;
    let hasMore = true;

    while (hasMore) {
      const page = await this.versionManager.getVersionPage({
        limit: 200,
        beforeTimestamp
      });
      versions.push(...page.versions);
      hasMore = page.hasMore;
      beforeTimestamp = page.nextCursor?.beforeTimestamp;
      if (!beforeTimestamp) break;
    }

    return versions;
  }

  replaceVersionOptions(select, versions) {
    select.innerHTML = '';

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '選擇版本...';
    select.appendChild(placeholder);

    for (const version of versions) {
      const option = document.createElement('option');
      option.value = version.versionId;
      option.textContent = `${version.versionId.substring(0, 8)} - ${version.label}`;
      select.appendChild(option);
    }
  }

  async loadVersionToSplit(side, versionId) {
    if (!versionId) return;

    try {
      this.setSplitBusy(true, '載入版本內容...');
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

      await this.calculateSplitDiff();
    } catch (error) {
      console.error('載入版本失敗:', error);
      this.onError('載入版本失敗：' + error.message);
    } finally {
      this.setSplitBusy(false);
    }
  }

  async calculateSplitDiff() {
    const leftId = document.getElementById('leftVersionSelect')?.value;
    const rightId = document.getElementById('rightVersionSelect')?.value;
    if (!leftId || !rightId) return;

    try {
      this.setSplitBusy(true, '計算差異...');
      const comparison = await this.versionManager.compareVersions(leftId, rightId);
      document.getElementById('diffAdded').textContent = comparison.stats.linesAdded;
      document.getElementById('diffRemoved').textContent = comparison.stats.linesRemoved;
      this.highlightDifferences(comparison.lineDiffs);
    } catch (error) {
      console.error('計算差異失敗:', error);
    } finally {
      this.setSplitBusy(false);
    }
  }

  highlightDifferences(lineDiffs) {
    if (!this.leftMonacoEditor || !this.rightMonacoEditor) return;

    const leftDecorations = [];
    const rightDecorations = [];

    lineDiffs.forEach(([op], index) => {
      const lineNumber = index + 1;

      if (op === -1) {
        leftDecorations.push({
          range: new monaco.Range(lineNumber, 1, lineNumber, 1),
          options: {
            isWholeLine: true,
            className: 'diff-highlight-removed'
          }
        });
      } else if (op === 1) {
        rightDecorations.push({
          range: new monaco.Range(lineNumber, 1, lineNumber, 1),
          options: {
            isWholeLine: true,
            className: 'diff-highlight-added'
          }
        });
      }
    });

    this.leftDecorations = this.leftMonacoEditor.deltaDecorations(this.leftDecorations, leftDecorations);
    this.rightDecorations = this.rightMonacoEditor.deltaDecorations(this.rightDecorations, rightDecorations);
  }

  closeSplitView() {
    this.isSplitView = false;
    document.getElementById('singleEditorCard').style.display = 'block';
    document.getElementById('splitEditorCard').style.display = 'none';
  }

  async compareWithCurrent(selectedVersionId) {
    this.isSplitView = true;
    document.getElementById('singleEditorCard').style.display = 'none';
    document.getElementById('splitEditorCard').style.display = 'block';

    if (!this.leftMonacoEditor || !this.rightMonacoEditor) {
      await this.initSplitEditors();
    }

    await this.updateVersionSelects();
    await this.loadVersionToSplit('left', selectedVersionId);

    const currentContent = this.getValue();
    this.rightMonacoEditor.setValue(currentContent);
    document.getElementById('rightVersionLabel').textContent = '當前編輯器';
    document.getElementById('rightLineCount').textContent = currentContent.split('\n').length;
    document.getElementById('rightVersionSelect').value = '';
  }

  setSplitBusy(isBusy, message = '') {
    const splitCard = document.getElementById('splitEditorCard');
    if (!splitCard) return;
    splitCard.dataset.loading = isBusy ? 'true' : 'false';
    splitCard.dataset.loadingMessage = message;
  }

  handleKeyboardShortcuts(event) {
    if (event.ctrlKey && event.key === 's') {
      event.preventDefault();
      if (this.onSaveVersion) this.onSaveVersion();
    }

    if (event.ctrlKey && event.shiftKey && event.key === 'F') {
      event.preventDefault();
      this.formatSQL();
    }

    if (event.ctrlKey && event.key === 'd') {
      event.preventDefault();
      this.toggleCompareMode();
    }
  }
}
