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
    this.pageSize = options.pageSize || 50;
    this.versions = [];
    this.nextCursor = null;
    this.hasMore = false;
    this.totalCount = 0;
    this.isSearching = false;
    this.currentKeyword = '';
    this.loadMoreButton = null;
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
      this.isSearching = false;
      this.currentKeyword = '';
      await this.loadFirstPage();
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
      this.isSearching = true;
      this.currentKeyword = keyword;
      this.setLoadingState('搜尋中...');
      const results = await this.versionManager.searchVersions(keyword);
      this.versions = results;
      this.hasMore = false;
      this.nextCursor = null;
      this.totalCount = results.length;
      this.renderVersions(results, '未找到相符的版本');
      this.updateTitle(results.length, results.length);
    } catch (error) {
      this.handleError('搜尋失敗：' + error.message);
    }
  }

  async loadFirstPage() {
    this.setLoadingState('載入版本中...');
    const page = await this.versionManager.getVersionPage({ limit: this.pageSize });
    this.versions = page.versions;
    this.nextCursor = page.nextCursor;
    this.hasMore = page.hasMore;
    this.totalCount = page.total;
    this.renderVersions(this.versions, '此 SQL 腳本暫無版本');
    this.updateTitle(this.versions.length, this.totalCount);
    console.log('版本列表加載：', this.versions.map(v => v.versionId));
  }

  async loadMore() {
    if (!this.hasMore || !this.nextCursor || this.isSearching) return;

    try {
      this.setLoadMoreBusy(true);
      const page = await this.versionManager.getVersionPage({
        limit: this.pageSize,
        beforeTimestamp: this.nextCursor.beforeTimestamp
      });
      this.versions.push(...page.versions);
      this.nextCursor = page.nextCursor;
      this.hasMore = page.hasMore;
      this.totalCount = page.total;
      this.appendVersions(page.versions);
      this.renderLoadMore();
      this.updateTitle(this.versions.length, this.totalCount);
    } catch (error) {
      this.handleError('載入更多版本失敗：' + error.message);
    } finally {
      this.setLoadMoreBusy(false);
    }
  }

  setLoadingState(message) {
    if (!this.treeContainer) return;
    const loading = document.createElement('p');
    loading.className = 'empty-state';
    loading.textContent = message;
    this.treeContainer.replaceChildren(loading);
  }

  renderVersions(versions, emptyMessage) {
    if (!this.treeContainer) return;
    this.treeContainer.replaceChildren();

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
    this.renderLoadMore();
    this.setSelectedVersion(this.selectedVersionId);
  }

  appendVersions(versions) {
    if (!this.treeContainer || versions.length === 0) return;
    const frag = document.createDocumentFragment();
    for (const version of versions) {
      try {
        frag.appendChild(this.createItem(version));
      } catch (error) {
        console.warn('渲染版本項目失敗：', version.versionId, error);
      }
    }

    if (this.loadMoreButton && this.loadMoreButton.parentElement === this.treeContainer) {
      this.treeContainer.insertBefore(frag, this.loadMoreButton);
    } else {
      this.treeContainer.appendChild(frag);
    }
    this.setSelectedVersion(this.selectedVersionId);
  }

  renderLoadMore() {
    if (!this.treeContainer) return;
    if (this.loadMoreButton) {
      this.loadMoreButton.remove();
      this.loadMoreButton = null;
    }

    if (!this.hasMore || this.isSearching) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'version-load-more';
    button.textContent = `載入更多（已顯示 ${this.versions.length} / ${this.totalCount}）`;
    button.addEventListener('click', () => this.loadMore());
    this.loadMoreButton = button;
    this.treeContainer.appendChild(button);
  }

  setLoadMoreBusy(isBusy) {
    if (!this.loadMoreButton) return;
    this.loadMoreButton.disabled = isBusy;
    this.loadMoreButton.textContent = isBusy
      ? '載入中...'
      : `載入更多（已顯示 ${this.versions.length} / ${this.totalCount}）`;
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

  updateTitle(loadedCount, totalCount = loadedCount) {
    if (!this.titleElement) return;

    const currentScript = this.scriptManager?.getCurrentScript();
    const scriptName = currentScript
      ? ` - ${this.formatScriptDisplayName(currentScript.scriptName)}`
      : '';
    const countText = totalCount > loadedCount
      ? `${loadedCount} / ${totalCount}`
      : `${loadedCount}`;
    const searchText = this.isSearching ? ' 搜尋結果' : '';
    this.titleElement.textContent = `版本列表${scriptName}${searchText}（${countText}）`;
  }

  handleError(message) {
    if (this.onError) {
      this.onError(message);
      return;
    }
    if (typeof dialogs !== 'undefined') {
      dialogs.showAlert({ title: '操作失敗', message, kind: 'danger' });
    }
  }
}
