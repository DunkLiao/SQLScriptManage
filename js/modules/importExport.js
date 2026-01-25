/**
 * 導入導出功能模組
 */

class ImportExportManager {
  constructor() {
    this.db = null;
    this.versionManager = null;
    this.diffEngine = null;
  }

  /**
   * 初始化
   */
  async init(dbManager, vmManager, diffEngineInstance) {
    this.db = dbManager;
    this.versionManager = vmManager;
    this.diffEngine = diffEngineInstance;
  }

  /**
   * 僅匯出為 JSON 檔案
   * 返回 { jsonContent, filename }
   */
  async exportToJSON(options = {}) {
    const {
      includeTags = true,
      includeComments = true
    } = options;

    const allVersions = await this.db.getAllVersions();
    const sortedVersions = [...allVersions].sort((a, b) => a.timestamp - b.timestamp);

    const jsonMetadata = {
      formatVersion: '1.0',
      exportDate: new Date().toISOString(),
      totalVersions: sortedVersions.length,
      includeDelta: false,
      includeTags,
      includeComments,
      versions: [],
      tags: [],
      comments: []
    };

    for (const version of sortedVersions) {
      const versionData = {
        versionId: version.versionId,
        parentVersionId: version.parentVersionId,
        timestamp: version.timestamp,
        label: version.label,
        description: version.description,
        author: version.author,
        contentHash: version.contentHash,
        isDeltaMode: version.isDeltaMode,
        stats: version.stats,
        depth: version.depth,
        // 導出完整內容與差異資料，避免導入後無法顯示內容
        fullContent: version.fullContent || '',
        diffData: version.diffData || null,
        createdAt: version.createdAt,
        updatedAt: version.updatedAt
      };
      jsonMetadata.versions.push(versionData);
    }

    if (includeTags) {
      for (const version of sortedVersions) {
        const tags = await this.db.getVersionTags(version.versionId);
        jsonMetadata.tags.push(...tags);
      }
    }

    if (includeComments) {
      for (const version of sortedVersions) {
        const comments = await this.db.getVersionComments(version.versionId);
        jsonMetadata.comments.push(...comments);
      }
    }

    const jsonString = JSON.stringify(jsonMetadata.versions);
    const checksum = await this.diffEngine.computeHash(jsonString);
    jsonMetadata.checksum = checksum;

    const jsonContent = JSON.stringify(jsonMetadata, null, 2);
    return {
      jsonContent,
      filename: `sql_versions_${Date.now()}`
    };
  }

  /**
   * 下載檔案
   */
  downloadFile(content, filename, mimeType = 'text/plain') {
    let blob;
    if (content instanceof Blob) {
      blob = content;
    } else {
      blob = new Blob([content], { type: mimeType });
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    console.log('檔案下載完成:', filename);
  }

  /**
   * 導入 JSON 檔案
   * 返回 { isValid, conflicts, data }
   */
  async importFromJSON(jsonContent) {
    let jsonData;
    
    try {
      if (typeof jsonContent === 'string') {
        jsonData = JSON.parse(jsonContent);
      } else {
        jsonData = jsonContent;
      }
    } catch (error) {
      throw new Error('無效的 JSON 格式');
    }

    // 驗證格式
    if (!jsonData.versions || !Array.isArray(jsonData.versions)) {
      throw new Error('JSON 檔案不包含 versions 數組');
    }

    // 驗證校驗和
    if (jsonData.checksum) {
      const jsonString = JSON.stringify(jsonData.versions);
      const actualChecksum = await this.diffEngine.computeHash(jsonString);
      if (actualChecksum !== jsonData.checksum) {
        throw new Error('檔案校驗失敗，數據可能已損壞');
      }
    }

    // 基本欄位提示（但不阻斷導入，以便舊匯出檔可被修復性導入）
    for (const version of jsonData.versions) {
      if (!version.fullContent && !version.diffData) {
        console.warn(`版本 ${version.versionId || '(未知)'} 缺少內容，將嘗試以空內容導入`);
      }
    }

    // 檢測衝突
    const conflicts = await this._detectConflicts(jsonData.versions);

    return {
      isValid: true,
      conflicts,
      data: jsonData
    };
  }

  /**
   * 檢測導入衝突
   */
  async _detectConflicts(importVersions) {
    const localVersions = await this.db.getAllVersions();
    const localIds = new Set(localVersions.map(v => v.versionId));
    const conflicts = [];

    for (const importVersion of importVersions) {
      if (localIds.has(importVersion.versionId)) {
        const localVersion = localVersions.find(v => v.versionId === importVersion.versionId);
        
        // 檢查內容是否一致
        const hashMatch = localVersion.contentHash === importVersion.contentHash;
        
        conflicts.push({
          type: 'version_exists',
          versionId: importVersion.versionId,
          local: {
            timestamp: localVersion.timestamp,
            label: localVersion.label,
            author: localVersion.author
          },
          import: {
            timestamp: importVersion.timestamp,
            label: importVersion.label,
            author: importVersion.author
          },
          contentMatch: hashMatch
        });
      }
    }

    // 檢查孤立版本
    for (const importVersion of importVersions) {
      if (importVersion.parentVersionId) {
        const parentExists = importVersions.some(v => v.versionId === importVersion.parentVersionId);
        if (!parentExists && !localIds.has(importVersion.parentVersionId)) {
          conflicts.push({
            type: 'orphan_version',
            versionId: importVersion.versionId,
            parentVersionId: importVersion.parentVersionId,
            message: '缺失父版本'
          });
        }
      }
    }

    return conflicts;
  }

  /**
   * 執行導入
   */
  async executeImport(jsonData, conflictResolutions = {}) {
    const importVersions = jsonData.versions;
    const results = {
      imported: 0,
      skipped: 0,
      overwritten: 0,
      merged: 0,
      errors: []
    };

    for (const importVersion of importVersions) {
      try {
        const originalId = importVersion.versionId;
        const resolution = conflictResolutions[originalId] || 'skip';
        const localExists = await this.db.getVersion(originalId);

        // 避免直接改動原始資料，複製一份可寫入的版本記錄
        const versionRecord = { ...importVersion };

        // 解壓縮 diffData（若為字串）
        if (versionRecord.diffData && typeof versionRecord.diffData === 'string') {
          try {
            versionRecord.diffData = this.diffEngine.decompressDiffData(versionRecord.diffData);
          } catch (e) {
            console.warn('diffData 解壓失敗，將按原樣使用:', e.message);
          }
        }

        // 若缺少 fullContent，嘗試由 diffData 重建；再不行就置空避免阻塞導入
        if (!versionRecord.fullContent) {
          if (versionRecord.diffData) {
            try {
              versionRecord.fullContent = this.diffEngine.applyDiff('', versionRecord.diffData);
            } catch (e) {
              console.warn(`版本 ${originalId} 內容重建失敗，將以空內容導入`, e.message);
              versionRecord.fullContent = '';
            }
          } else {
            versionRecord.fullContent = '';
          }
        }

        // 若缺少哈希，根據內容補計算
        if (!versionRecord.contentHash && versionRecord.fullContent !== undefined) {
          versionRecord.contentHash = await this.diffEngine.computeHash(versionRecord.fullContent);
        }

        if (localExists && resolution !== 'skip') {
          if (resolution === 'overwrite') {
            // 覆蓋現有版本
            await new Promise((resolve, reject) => {
              const tx = this.db.db.transaction('versions', 'readwrite');
              const req = tx.objectStore('versions').put(versionRecord);
              req.onsuccess = () => resolve();
              req.onerror = () => reject(req.error);
            });
            results.overwritten++;
          } else if (resolution === 'merge') {
            // 作為新版本保存（更改 versionId 和 parentVersionId）
            const newVersionId = this.versionManager._generateVersionId();
            const parentId = versionRecord.parentVersionId || localExists.versionId || null;
            versionRecord.versionId = newVersionId;
            versionRecord.parentVersionId = parentId === originalId ? localExists.versionId : parentId;
            
            await this.db.saveVersion(versionRecord);
            results.merged++;
          }
        } else if (!localExists) {
          // 直接導入
          await this.db.saveVersion(versionRecord);
          results.imported++;
        } else {
          // skip
          results.skipped++;
        }
      } catch (error) {
        results.errors.push({
          versionId: importVersion.versionId,
          error: error.message
        });
      }
    }

    // 導入標籤
    if (jsonData.tags && Array.isArray(jsonData.tags)) {
      for (const tag of jsonData.tags) {
        try {
          await this.db.saveTag(tag);
        } catch (error) {
          // 忽略重複的標籤
          console.warn('標籤導入失敗:', tag.tagName, error.message);
        }
      }
    }

    // 導入批註
    if (jsonData.comments && Array.isArray(jsonData.comments)) {
      for (const comment of jsonData.comments) {
        try {
          await this.db.saveComment(comment);
        } catch (error) {
          // 忽略重複的批註
          console.warn('批註導入失敗:', comment.commentId, error.message);
        }
      }
    }

    return results;
  }

}

// 導出全局實例
const importExportManager = new ImportExportManager();
