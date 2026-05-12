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
    this.sortSelect = options.sortSelect;
    this.dateFromInput = options.dateFromInput;
    this.dateToInput = options.dateToInput;
    this.authorFilter = options.authorFilter;
    this.tagFilter = options.tagFilter;
    this.resetFiltersButton = options.resetFiltersButton;
    this.filterSummary = options.filterSummary;
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

    const reloadOnChange = () => this.reloadCurrentPage();
    [this.sortSelect, this.dateFromInput, this.dateToInput, this.authorFilter, this.tagFilter]
      .filter(Boolean)
      .forEach(element => element.addEventListener('change', reloadOnChange));

    if (this.resetFiltersButton) {
      this.resetFiltersButton.addEventListener('click', () => this.resetFilters());
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
      await this.loadFilterOptions();
      await this.loadFirstPage();
    } catch (error) {
      this.handleError('載入版本列表失敗：' + error.message);
    }
  }

  async refresh() {
    await this.load();
  }

  async searchFromInput() {
    await this.reloadCurrentPage();
  }

  async search(keyword) {
    if (this.searchInput) {
      this.searchInput.value = keyword || '';
    }
    await this.reloadCurrentPage();
  }

  async loadFilterOptions() {
    try {
      const options = await this.versionManager.getVersionFilterOptions();
      this.replaceSelectOptions(this.authorFilter, '全部作者', options.authors, this.authorFilter?.value || '');
      this.replaceSelectOptions(this.tagFilter, '全部標籤', options.tags, this.tagFilter?.value || '');
    } catch (error) {
      this.handleError('載入篩選選項失敗：' + error.message);
    }
  }

  async loadFirstPage() {
    this.setLoadingState('載入版本中...');
    const page = await this.versionManager.getVersionPage({
      ...this.getQueryOptions(),
      limit: this.pageSize
    });
    this.versions = page.versions;
    this.nextCursor = page.nextCursor;
    this.hasMore = page.hasMore;
    this.totalCount = page.total;
    const emptyMessage = this.hasActiveFilters() ? '未找到符合條件的版本' : '此 SQL 腳本暫無版本';
    this.renderVersions(this.versions, emptyMessage);
    this.updateTitle(this.versions.length, this.totalCount);
    this.updateFilterSummary();
    console.log('版本列表加載：', this.versions.map(v => v.versionId));
  }

  async reloadCurrentPage() {
    try {
      await this.loadFirstPage();
    } catch (error) {
      this.handleError('載入版本列表失敗：' + error.message);
    }
  }

  async loadMore() {
    if (!this.hasMore || !this.nextCursor) return;

    try {
      this.setLoadMoreBusy(true);
      const page = await this.versionManager.getVersionPage({
        ...this.getQueryOptions(),
        limit: this.pageSize,
        beforeTimestamp: this.nextCursor.beforeTimestamp,
        offset: this.nextCursor.offset
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

    if (!this.hasMore) return;

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

    if (Array.isArray(version.displayTags) && version.displayTags.length > 0) {
      const tags = document.createElement('div');
      tags.className = 'version-tags';
      for (const tag of version.displayTags) {
        const tagEl = document.createElement('span');
        tagEl.className = 'version-tag';
        tagEl.textContent = tag.tagName;
        if (tag.color) {
          tagEl.style.borderColor = tag.color;
        }
        tags.appendChild(tagEl);
      }
      item.appendChild(tags);
    }

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
    const filterText = this.hasActiveFilters() ? ' 篩選結果' : '';
    this.titleElement.textContent = `版本列表${scriptName}${filterText}（${countText}）`;
  }

  updateFilterSummary() {
    if (!this.filterSummary) return;
    const filters = [];
    const options = this.getQueryOptions();
    if (options.keyword) filters.push(`搜尋「${options.keyword}」`);
    if (options.author) filters.push(`作者「${options.author}」`);
    if (options.tagName) filters.push(`標籤「${options.tagName}」`);
    if (options.dateFrom || options.dateTo) {
      filters.push(`日期 ${options.dateFrom || '不限'} 至 ${options.dateTo || '不限'}`);
    }

    const prefix = filters.length > 0 ? filters.join('、') : '顯示全部版本';
    this.filterSummary.textContent = `${prefix}，目前顯示 ${this.versions.length} / ${this.totalCount}`;
  }

  getQueryOptions() {
    this.currentKeyword = this.searchInput ? this.searchInput.value.trim() : '';
    return {
      keyword: this.currentKeyword,
      sortBy: this.sortSelect?.value || 'newest',
      dateFrom: this.dateFromInput?.value || '',
      dateTo: this.dateToInput?.value || '',
      author: this.authorFilter?.value || '',
      tagName: this.tagFilter?.value || ''
    };
  }

  hasActiveFilters() {
    const options = this.getQueryOptions();
    return Boolean(
      options.keyword ||
      options.dateFrom ||
      options.dateTo ||
      options.author ||
      options.tagName ||
      options.sortBy !== 'newest'
    );
  }

  resetFilters() {
    if (this.searchInput) this.searchInput.value = '';
    if (this.sortSelect) this.sortSelect.value = 'newest';
    if (this.dateFromInput) this.dateFromInput.value = '';
    if (this.dateToInput) this.dateToInput.value = '';
    if (this.authorFilter) this.authorFilter.value = '';
    if (this.tagFilter) this.tagFilter.value = '';
    this.reloadCurrentPage();
  }

  replaceSelectOptions(select, placeholder, values, currentValue) {
    if (!select) return;
    select.replaceChildren();

    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = placeholder;
    select.appendChild(empty);

    for (const value of values) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    }

    select.value = values.includes(currentValue) ? currentValue : '';
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
