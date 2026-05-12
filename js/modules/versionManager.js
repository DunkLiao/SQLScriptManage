/**
 * 版本管理核心邏輯
 */

class VersionManager {
  constructor() {
    this.db = null;
    this.diffEngine = null;
    this.projectManager = null;
    this.scriptManager = null;
  }

  /**
   * 初始化版本管理器
   */
  async init(dbManager, diffEngineInstance, projectManagerInstance = null, scriptManagerInstance = null) {
    this.db = dbManager;
    this.diffEngine = diffEngineInstance;
    this.projectManager = projectManagerInstance;
    this.scriptManager = scriptManagerInstance;
  }

  /**
   * 生成版本 ID
   * 格式：v_[時間戳毫秒]_[序號]
   */
  _generateVersionId() {
    const timestamp = Date.now();
    const sequence = Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, '0');
    return `v_${timestamp}_${sequence}`;
  }

  /**
   * 預覽保存新版本時會產生的差異統計。
   */
  async getSavePreview(sqlContent) {
    const projectId = this.projectManager.getCurrentProjectId();
    if (!projectId) {
      throw new Error('未指定專案');
    }
    const scriptId = this.scriptManager?.getCurrentScriptId();
    if (!scriptId) {
      throw new Error('未指定 SQL 腳本');
    }

    const latestVersion = await this.db.getLatestVersionByScript(scriptId, projectId);
    const latestContent = latestVersion
      ? await this.getVersionContent(latestVersion.versionId)
      : '';
    const normalizedNewSQL = this.diffEngine.normalizeSql(sqlContent);
    const { stats } = this.diffEngine.computeDiff(latestContent, normalizedNewSQL);

    return {
      projectId,
      scriptId,
      latestVersion,
      normalizedNewSQL,
      stats
    };
  }

  /**
   * 保存新版本
   */
  async saveVersion(sqlContent, label, description, author, createSnapshot = false) {
    if (!label || !author) {
      throw new Error('版本標籤和作者不能為空');
    }

    const {
      projectId,
      scriptId,
      latestVersion,
      normalizedNewSQL,
      stats
    } = await this.getSavePreview(sqlContent);

    // 4. 計算規範化內容的哈希
    const contentHash = await this.diffEngine.computeHash(normalizedNewSQL);

    // 5. 生成版本 ID
    const versionId = this._generateVersionId();

    // 6. 計算版本深度
    const versionDepth = (latestVersion?.depth || 0) + 1;

    // 7. 構建版本記錄（添加 projectId）
    const versionRecord = {
      versionId,
      projectId,  // v3 新增：專案隔離
      scriptId,   // v5 新增：SQL 腳本隔離
      parentVersionId: latestVersion?.versionId || null,
      timestamp: Date.now(),
      label,
      description: description || '',
      author,
      contentHash,
      isDeltaMode: false,
      fullContent: normalizedNewSQL,
      stats,
      tags: [],
      depth: versionDepth,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    // 8. 保存到 IndexedDB
    const savedVersion = await this.db.saveVersion(versionRecord);

    // 9. 如果這是該 SQL 腳本的第一個版本，設定根版本 ID
    if (versionDepth === 1) {
      await this.scriptManager.setRootVersionId(scriptId, versionId);
      console.log(`✓ 為 SQL 腳本「${scriptId}」設定根版本: ${versionId}`);
    }

    // 10. 更新元數據
    const stats_data = await this.db.getStatistics();
    await this.db.saveMetadata('lastVersionId', versionId);
    await this.db.saveMetadata('stats', stats_data);

    console.log('版本保存成功:', versionId);
    return savedVersion;
  }

  /**
   * 獲取版本完整內容
   * v4 起以 fullContent 作為唯一正式內容來源。
   */
  async getVersionContent(versionId) {
    const version = await this.db.getVersion(versionId);
    if (!version) throw new Error(`版本 ${versionId} 不存在`);

    if (version.fullContent !== undefined && version.fullContent !== null) {
      // 驗證哈希
      const hash = await this.diffEngine.computeHash(version.fullContent);
      if (hash !== version.contentHash) {
        throw new Error(`版本 ${versionId} 內容驗證失敗，數據可能已損壞`);
      }
      return version.fullContent;
    }

    throw new Error(`版本 ${versionId} 無有效內容`);
  }

  async getVersion(versionId) {
    return await this.db.getVersion(versionId);
  }

  /**
   * 獲取版本鏈（從指定版本回溯到根）
   */
  async getVersionChain(versionId, maxDepth = 50) {
    return await this.db.getVersionChain(versionId, maxDepth);
  }

  /**
   * 獲取所有版本（當前專案）
   */
  async getAllVersions(projectId = null) {
    if (projectId) {
      return await this.db.getVersionsByProject(projectId);
    }

    const scriptId = this.scriptManager?.getCurrentScriptId();
    if (!scriptId) return [];
    return await this.db.getVersionsByScript(scriptId);
  }

  async getVersionPage(options = {}) {
    const projectId = options.projectId || this.projectManager?.getCurrentProjectId();
    const scriptId = options.scriptId || this.scriptManager?.getCurrentScriptId();
    if (!scriptId) {
      return { versions: [], hasMore: false, nextCursor: null, total: 0 };
    }

    const query = {
      keyword: (options.keyword || '').trim(),
      sortBy: options.sortBy || 'newest',
      dateFrom: options.dateFrom || '',
      dateTo: options.dateTo || '',
      author: options.author || '',
      tagName: options.tagName || ''
    };
    const hasQuery = Boolean(
      query.keyword ||
      query.dateFrom ||
      query.dateTo ||
      query.author ||
      query.tagName ||
      query.sortBy !== 'newest'
    );

    if (hasQuery) {
      return await this.getFilteredVersionPage(scriptId, projectId, {
        ...query,
        limit: options.limit || 50,
        offset: options.offset || 0
      });
    }

    return await this.db.getVersionPageByScript(scriptId, {
      projectId,
      limit: options.limit || 50,
      beforeTimestamp: options.beforeTimestamp
    }).then(page => this.decorateVersionPageWithTags(page));
  }

  async getFilteredVersionPage(scriptId, projectId, options = {}) {
    const limit = Math.max(1, options.limit || 50);
    const offset = Math.max(0, options.offset || 0);
    let versions = await this.db.getVersionsByScript(scriptId);
    if (projectId) {
      versions = versions.filter(version => version.projectId === projectId);
    }

    const tagsByVersion = await this.db.getTagsForVersionIds(versions.map(version => version.versionId));
    versions = versions.map(version => ({
      ...version,
      displayTags: tagsByVersion[version.versionId] || []
    }));

    const startTime = this.parseDateStart(options.dateFrom);
    const endTime = this.parseDateEnd(options.dateTo);
    const keyword = (options.keyword || '').toLowerCase();

    versions = versions.filter(version => {
      if (startTime !== null && version.timestamp < startTime) return false;
      if (endTime !== null && version.timestamp > endTime) return false;
      if (options.author && version.author !== options.author) return false;
      if (options.tagName && !version.displayTags.some(tag => tag.tagName === options.tagName)) return false;
      if (!keyword) return true;

      const tagText = version.displayTags.map(tag => tag.tagName).join(' ');
      return [
        version.description,
        version.label,
        version.author,
        version.versionId,
        tagText
      ].some(value => (value || '').toLowerCase().includes(keyword));
    });

    this.sortVersions(versions, options.sortBy || 'newest');

    const total = versions.length;
    const pageVersions = versions.slice(offset, offset + limit);
    const nextOffset = offset + pageVersions.length;

    return {
      versions: pageVersions,
      hasMore: nextOffset < total,
      nextCursor: nextOffset < total ? { offset: nextOffset } : null,
      total
    };
  }

  async decorateVersionPageWithTags(page) {
    const tagsByVersion = await this.db.getTagsForVersionIds(page.versions.map(version => version.versionId));
    return {
      ...page,
      versions: page.versions.map(version => ({
        ...version,
        displayTags: tagsByVersion[version.versionId] || []
      }))
    };
  }

  async getVersionFilterOptions(scriptId = null, projectId = null) {
    const targetScriptId = scriptId || this.scriptManager?.getCurrentScriptId();
    const targetProjectId = projectId || this.projectManager?.getCurrentProjectId();
    if (!targetScriptId) {
      return { authors: [], tags: [] };
    }

    const [authors, tags] = await Promise.all([
      this.db.getVersionAuthorsByScript(targetScriptId, targetProjectId),
      this.db.getTagNamesByScript(targetScriptId, targetProjectId)
    ]);

    return { authors, tags };
  }

  parseDateStart(value) {
    if (!value) return null;
    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
  }

  parseDateEnd(value) {
    if (!value) return null;
    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day, 23, 59, 59, 999).getTime();
  }

  sortVersions(versions, sortBy) {
    const textCompare = (a, b) => a.localeCompare(b, 'zh-Hant', { sensitivity: 'base' });
    versions.sort((a, b) => {
      if (sortBy === 'oldest') return a.timestamp - b.timestamp;
      if (sortBy === 'authorAsc') {
        const authorCompare = textCompare(a.author || '', b.author || '');
        return authorCompare || b.timestamp - a.timestamp;
      }
      if (sortBy === 'tagAsc') {
        const tagA = a.displayTags[0]?.tagName || '\uffff';
        const tagB = b.displayTags[0]?.tagName || '\uffff';
        const tagCompare = textCompare(tagA, tagB);
        return tagCompare || b.timestamp - a.timestamp;
      }
      return b.timestamp - a.timestamp;
    });
  }

  async getVersionCount(scriptId = null, projectId = null) {
    const targetScriptId = scriptId || this.scriptManager?.getCurrentScriptId();
    if (!targetScriptId) return 0;
    return await this.db.getVersionCountByScript(
      targetScriptId,
      projectId || this.projectManager?.getCurrentProjectId()
    );
  }

  /**
   * 刪除版本
   */
  async deleteVersion(versionId) {
    const version = await this.db.getVersion(versionId);
    if (!version) throw new Error(`版本 ${versionId} 不存在`);

    // 注意：刪除版本可能導致版本鏈破裂
    // 因此應該謹慎處理
    await this.db.deleteVersion(versionId);
    console.log('版本已刪除:', versionId);
  }

  /**
   * 刪除所有版本（當前專案）
   */
  async deleteAllVersions(projectId = null, scriptId = null) {
    try {
      if (!scriptId) {
        scriptId = this.scriptManager?.getCurrentScriptId();
      }
      if (!scriptId && projectId) {
        const projectVersions = await this.db.getVersionsByProject(projectId);
        for (const version of projectVersions) {
          await this.db.deleteVersion(version.versionId);
        }
        await this.projectManager.setRootVersionId(projectId, null);
        console.log('✓ 專案所有版本已刪除');
        return;
      }
      if (!scriptId) throw new Error('未指定 SQL 腳本');

      // 獲取該 SQL 腳本的所有版本
      const versions = await this.db.getVersionsByScript(scriptId);
      
      // 依次刪除每個版本
      for (const version of versions) {
        await this.db.deleteVersion(version.versionId);
      }

      // 重置該 SQL 腳本的根版本 ID
      await this.scriptManager.setRootVersionId(scriptId, null);
      
      console.log('✓ 所有版本已刪除');
    } catch (error) {
      console.error('❌ 刪除所有版本失敗:', error);
      throw new Error('刪除所有版本失敗：' + error.message);
    }
  }

  /**
   * 更新版本標籤
   */
  async updateVersionLabel(versionId, newLabel) {
    if (!newLabel) throw new Error('標籤不能為空');
    
    const updated = await this.db.updateVersionLabel(versionId, newLabel);
    console.log('版本標籤已更新:', versionId, '->', newLabel);
    return updated;
  }

  /**
   * 兩個版本間的差異比較
   */
  async compareVersions(versionId1, versionId2) {
    const content1 = await this.getVersionContent(versionId1);
    const content2 = await this.getVersionContent(versionId2);

    const { lineDiffs, stats } = this.diffEngine.computeDiff(content1, content2);

    return {
      fromVersion: versionId1,
      toVersion: versionId2,
      additions: lineDiffs.filter(d => d[0] === 1).map(d => d[1]),
      deletions: lineDiffs.filter(d => d[0] === -1).map(d => d[1]),
      unchanged: lineDiffs.filter(d => d[0] === 0).map(d => d[1]),
      lineDiffs,
      stats
    };
  }

  /**
   * 版本回溯（將當前內容設為指定版本的內容）
   * 實際上不修改版本鏈，只是加載版本內容到編輯器
   */
  async revertToVersion(versionId) {
    const content = await this.getVersionContent(versionId);
    console.log('版本已回溯:', versionId);
    return content;
  }

  /**
   * 創建版本標籤
   */
  async createTag(versionId, tagName, type = 'custom', color = '#FF5733', description = '') {
    if (!tagName) throw new Error('標籤名稱不能為空');

    // 生成標籤 ID
    const tagId = `tag_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const tagRecord = {
      tagId,
      tagName,
      versionId,
      type,
      color,
      description,
      createdAt: Date.now()
    };

    const saved = await this.db.saveTag(tagRecord);
    console.log('標籤已創建:', tagName, '->', versionId);
    return saved;
  }

  /**
   * 獲取版本的所有標籤
   */
  async getVersionTags(versionId) {
    return await this.db.getVersionTags(versionId);
  }

  /**
   * 創建批註
   */
  async createComment(versionId, lineNumber, author, content) {
    if (!content) throw new Error('批註內容不能為空');

    const commentId = `cmt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const commentRecord = {
      commentId,
      versionId,
      lineNumber,
      author,
      content,
      status: 'open',
      createdAt: Date.now(),
      resolvedAt: null,
      resolvedBy: null
    };

    const saved = await this.db.saveComment(commentRecord);
    console.log('批註已創建:', commentId);
    return saved;
  }

  /**
   * 獲取版本的所有批註
   */
  async getVersionComments(versionId) {
    return await this.db.getVersionComments(versionId);
  }

  /**
   * 壓縮版本鏈（定期維護，當前專案）
   * 將線性鏈上的多個小版本合併為單一快照
   */
  async compactLinearChain(maxDepth = 100, projectId = null, scriptId = null) {
    if (!scriptId) {
      scriptId = this.scriptManager?.getCurrentScriptId();
    }
    const allVersions = scriptId
      ? await this.db.getVersionsByScript(scriptId)
      : await this.db.getVersionsByProject(projectId || this.projectManager.getCurrentProjectId());

    if (allVersions.length <= maxDepth) {
      console.log('版本鏈無需整合');
      return;
    }

    console.log('開始整合版本鏈...');

    const checkpointInterval = 50;
    const checkpointCount = Math.floor(allVersions.length / checkpointInterval);

    for (let i = 1; i < checkpointCount; i++) {
      const checkpointIdx = i * checkpointInterval;
      const checkpointVersion = allVersions[checkpointIdx];

      // 獲取該版本的完整內容
      const fullContent = await this.getVersionContent(checkpointVersion.versionId);

      // 更新版本記錄（轉換為完整內容模式）
      checkpointVersion.isDeltaMode = false;
      checkpointVersion.fullContent = fullContent;
      checkpointVersion.updatedAt = Date.now();

      // 保存更新
      await new Promise((resolve, reject) => {
        const tx = this.db.db.transaction('versions', 'readwrite');
        const req = tx.objectStore('versions').put(checkpointVersion);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    }

    console.log('版本鏈整合完成');
  }

  /**
   * 搜尋版本（按 SQL 描述）
   */
  async searchVersions(keyword) {
    const page = await this.getVersionPage({
      keyword,
      limit: Number.MAX_SAFE_INTEGER
    });
    return page.versions;
  }

  /**
   * 獲取統計信息
   */
  async getStatistics() {
    return await this.db.getStatistics();
  }

  /**
   * 驗證版本鏈連續性
   */
  async validateVersionChain() {
    const allVersions = await this.db.getAllVersions();
    const issues = [];

    for (const version of allVersions) {
      if (version.parentVersionId) {
        const parent = await this.db.getVersion(version.parentVersionId);
        if (!parent) {
          issues.push({
            type: 'orphan',
            versionId: version.versionId,
            message: `孤立版本：缺失父版本 ${version.parentVersionId}`
          });
        }
      }

      // 驗證哈希
      try {
        const content = await this.getVersionContent(version.versionId);
        const hash = await this.diffEngine.computeHash(content);
        if (hash !== version.contentHash) {
          issues.push({
            type: 'hash_mismatch',
            versionId: version.versionId,
            message: `哈希不匹配：期望 ${version.contentHash}，實際 ${hash}`
          });
        }
      } catch (error) {
        issues.push({
          type: 'content_error',
          versionId: version.versionId,
          message: `無法重建內容：${error.message}`
        });
      }
    }

    return {
      isValid: issues.length === 0,
      issues
    };
  }
}

// 導出全局實例
const versionManager = new VersionManager();
