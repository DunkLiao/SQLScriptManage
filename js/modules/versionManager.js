/**
 * 版本管理核心邏輯
 */

class VersionManager {
  constructor() {
    this.db = null;
    this.diffEngine = null;
  }

  /**
   * 初始化版本管理器
   */
  async init(dbManager, diffEngineInstance) {
    this.db = dbManager;
    this.diffEngine = diffEngineInstance;
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
   * 保存新版本
   */
  async saveVersion(sqlContent, label, description, author, createSnapshot = false) {
    if (!label || !author) {
      throw new Error('版本標籤和作者不能為空');
    }

    // 1. 獲取最新版本內容（已規範化）
    const latestVersion = await this.db.getLatestVersion();
    const latestContent = latestVersion 
      ? await this.getVersionContent(latestVersion.versionId)
      : '';

    // 2. 規範化新 SQL 內容（確保一致性）
    const normalizedNewSQL = this.diffEngine.normalizeSql(sqlContent);

    // 3. 計算差異（用於顯示和統計）
    const { lineDiffs, stats } = this.diffEngine.computeDiff(
      latestContent,
      normalizedNewSQL  // 使用規範化後的內容計算差異
    );

    // 4. 計算規範化內容的哈希
    const contentHash = await this.diffEngine.computeHash(normalizedNewSQL);

    // 5. 生成版本 ID
    const versionId = this._generateVersionId();

    // 6. 決策：是否使用差異模式
    const versionDepth = (latestVersion?.depth || 0) + 1;
    const shouldSnapshot = createSnapshot || 
                          this.diffEngine.shouldCreateSnapshot(stats, versionDepth);

    // 7. 構建版本記錄
    // 關鍵改變：無論是否差異模式，都同時存儲內容和差異
    // 這樣可以避免差異重建的問題
    const versionRecord = {
      versionId,
      parentVersionId: latestVersion?.versionId || null,
      timestamp: Date.now(),
      label,
      description: description || '',
      author,
      contentHash,
      isDeltaMode: !shouldSnapshot,
      diffData: lineDiffs,  // 總是存儲差異（用於顯示）
      fullContent: normalizedNewSQL,  // 總是存儲完整內容（用於驗證）
      stats,
      tags: [],
      depth: versionDepth,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    // 8. 保存到 IndexedDB
    const savedVersion = await this.db.saveVersion(versionRecord);

    // 9. 更新元數據
    const stats_data = await this.db.getStatistics();
    await this.db.saveMetadata('lastVersionId', versionId);
    await this.db.saveMetadata('stats', stats_data);

    console.log('版本保存成功:', versionId);
    return savedVersion;
  }

  /**
   * 獲取版本完整內容
   * 支持新格式（直接存儲的完整內容）和舊格式（需要重建的差異模式）
   */
  async getVersionContent(versionId) {
    const version = await this.db.getVersion(versionId);
    if (!version) throw new Error(`版本 ${versionId} 不存在`);

    // 新格式：直接存儲了完整內容
    if (version.fullContent) {
      // 驗證哈希
      const hash = await this.diffEngine.computeHash(version.fullContent);
      if (hash !== version.contentHash) {
        throw new Error(`版本 ${versionId} 內容驗證失敗，數據可能已損壞`);
      }
      return version.fullContent;
    }

    // 舊格式：需要從差異重建（向後兼容）
    if (version.isDeltaMode && version.diffData) {
      const parentContent = version.parentVersionId
        ? await this.getVersionContent(version.parentVersionId)
        : '';

      const rebuiltContent = this.diffEngine.applyDiff(parentContent, version.diffData);

      // 驗證哈希
      const hash = await this.diffEngine.computeHash(rebuiltContent);
      if (hash !== version.contentHash) {
        throw new Error(`版本 ${versionId} 內容驗證失敗，數據可能已損壞`);
      }

      return rebuiltContent;
    }

    throw new Error(`版本 ${versionId} 無有效內容`);
  }

  /**
   * 獲取版本鏈（從指定版本回溯到根）
   */
  async getVersionChain(versionId, maxDepth = 50) {
    return await this.db.getVersionChain(versionId, maxDepth);
  }

  /**
   * 獲取所有版本
   */
  async getAllVersions() {
    return await this.db.getAllVersions();
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
   * 刪除所有版本
   */
  async deleteAllVersions() {
    try {
      // 獲取所有版本
      const versions = await this.db.getAllVersions();
      
      // 依次刪除每個版本
      for (const version of versions) {
        await this.db.deleteVersion(version.versionId);
      }
      
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
   * 壓縮版本鏈（定期維護）
   * 將線性鏈上的多個小版本合併為單一快照
   */
  async compactLinearChain(maxDepth = 100) {
    const allVersions = await this.db.getAllVersions();

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
      checkpointVersion.diffData = null;
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
   * 搜尋版本（按 label、description、author）
   */
  async searchVersions(keyword) {
    const allVersions = await this.db.getAllVersions();
    const lowerKeyword = keyword.toLowerCase();

    return allVersions.filter(v => 
      v.label.toLowerCase().includes(lowerKeyword) ||
      v.description.toLowerCase().includes(lowerKeyword) ||
      v.author.toLowerCase().includes(lowerKeyword)
    );
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
