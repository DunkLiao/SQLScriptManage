/**
 * 版本列表、搜尋與右鍵選單 UI 控制器。
 */

class VersionTreeController {
  constructor(options) {
    this.versionManager = options.versionManager;
    this.scriptManager = options.scriptManager;
    this.treeContainer = options.treeContainer;
    this.searchInput = options.searchInput;
    this.searchButton = options.searchButton;
    this.contextMenu = options.contextMenu;
    this.contextCompare = options.contextCompare;
    this.titleElement = options.titleElement;
    this.formatScriptDisplayName = options.formatScriptDisplayName;
    this.onSelectVersion = options.onSelectVersion;
    this.onCompareVersion = options.onCompareVersion;
    this.onError = options.onError;
    this.selectedVersionId = null;
  }

  bindEvents() {
    if (this.searchButton) {
      this.searchButton.addEventListener('click', () => this.searchFromInput());
    }

    if (this.searchInput) {
      this.searchInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') this.searchFromInput();
      });
    }

    if (this.contextMenu) {
      document.addEventListener('contextmenu', () => {
        this.hideContextMenu();
      });
    }

    if (this.contextCompare && this.contextMenu) {
      this.contextCompare.addEventListener('click', () => {
        const versionId = this.contextMenu.dataset.versionId;
        this.hideContextMenu();
        if (versionId && this.onCompareVersion) {
          this.onCompareVersion(versionId);
        }
      });
    }
  }

  async load() {
    try {
      const versions = await this.versionManager.getAllVersions();
      this.renderVersions(versions, '此 SQL 腳本暫無版本');
      this.updateTitle(versions.length);
      console.log('版本列表加載：', versions.map(v => v.versionId));
    } catch (error) {
      this.handleError('載入版本列表失敗：' + error.message);
    }
  }

  async refresh() {
    await this.load();
  }

  async searchFromInput() {
    const keyword = this.searchInput ? this.searchInput.value.trim() : '';
    await this.search(keyword);
  }

  async search(keyword) {
    if (!keyword) {
      await this.load();
      return;
    }

    try {
      const results = await this.versionManager.searchVersions(keyword);
      this.renderVersions(results, '未找到相符的版本');
    } catch (error) {
      this.handleError('搜尋失敗：' + error.message);
    }
  }

  renderVersions(versions, emptyMessage) {
    if (!this.treeContainer) return;
    this.treeContainer.innerHTML = '';

    if (versions.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = emptyMessage;
      this.treeContainer.appendChild(empty);
      return;
    }

    const frag = document.createDocumentFragment();
    for (const version of versions) {
      try {
        frag.appendChild(this.createItem(version));
      } catch (error) {
        console.warn('渲染版本項目失敗：', version.versionId, error);
      }
    }
    this.treeContainer.appendChild(frag);
    this.setSelectedVersion(this.selectedVersionId);
  }

  createItem(version) {
    const item = document.createElement('div');
    item.className = 'version-item';
    item.dataset.versionId = version.versionId;

    const header = document.createElement('div');
    header.className = 'version-item-header';

    const toggle = document.createElement('span');
    toggle.className = 'version-toggle';
    toggle.textContent = '▼';

    const description = document.createElement('span');
    description.className = 'version-description';
    description.textContent = version.description || '(無描述)';

    const id = document.createElement('span');
    id.className = 'version-id';
    id.textContent = version.versionId;

    header.appendChild(toggle);
    header.appendChild(description);
    header.appendChild(id);

    const detail = document.createElement('div');
    detail.className = 'version-item-detail';
    const date = new Date(version.timestamp).toLocaleString('zh-TW');
    detail.textContent = `${date} • ${version.author}`;

    item.appendChild(header);
    item.appendChild(detail);

    item.addEventListener('click', () => {
      this.setSelectedVersion(version.versionId);
      if (this.onSelectVersion) {
        this.onSelectVersion(version.versionId);
      }
    });

    item.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.showContextMenu(event, version.versionId);
    });

    return item;
  }

  setSelectedVersion(versionId) {
    this.selectedVersionId = versionId;

    if (!this.treeContainer) return;
    this.treeContainer.querySelectorAll('.version-item.active').forEach(item => {
      item.classList.remove('active');
    });

    if (!versionId) return;
    const selectedItem = this.treeContainer.querySelector(`[data-version-id="${versionId}"]`);
    if (selectedItem) {
      selectedItem.classList.add('active');
    }
  }

  clearSelection() {
    this.setSelectedVersion(null);
  }

  showContextMenu(event, versionId) {
    if (!this.contextMenu) return;
    this.contextMenu.dataset.versionId = versionId;
    this.contextMenu.style.left = event.clientX + 'px';
    this.contextMenu.style.top = event.clientY + 'px';
    this.contextMenu.style.display = 'block';

    setTimeout(() => {
      document.addEventListener('click', () => {
        this.hideContextMenu();
      }, { once: true });
    }, 0);
  }

  hideContextMenu() {
    if (this.contextMenu) {
      this.contextMenu.style.display = 'none';
    }
  }

  updateTitle(versionCount) {
    if (!this.titleElement) return;

    const currentScript = this.scriptManager?.getCurrentScript();
    const scriptName = currentScript
      ? ` - ${this.formatScriptDisplayName(currentScript.scriptName)}`
      : '';
    this.titleElement.textContent = `版本列表${scriptName}（${versionCount}）`;
  }

  handleError(message) {
    if (this.onError) {
      this.onError(message);
      return;
    }
    alert(message);
  }
}
