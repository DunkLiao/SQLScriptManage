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
   * 導出為 SQL 和 JSON 檔案
   * 返回 { sqlContent, jsonContent }
   */
  async exportToSQLAndJSON(options = {}) {
    const {
      includeDelta = false,
      includeTags = true,
      includeComments = true
    } = options;

    const allVersions = await this.db.getAllVersions();

    // 生成 SQL 檔案內容
    let sqlContent = '';
    sqlContent += '-- ==========================================\n';
    sqlContent += '-- SQL Version Archive\n';
    sqlContent += `-- Generated: ${new Date().toISOString()}\n`;
    sqlContent += `-- Total Versions: ${allVersions.length}\n`;
    sqlContent += '-- ==========================================\n\n';

    // 按時間排序版本
    const sortedVersions = [...allVersions].sort((a, b) => a.timestamp - b.timestamp);

    for (const version of sortedVersions) {
      const content = await this.versionManager.getVersionContent(version.versionId);
      const timestamp = new Date(version.timestamp).toLocaleString('zh-TW');
      
      sqlContent += `-- ===== Version: ${version.versionId} [${timestamp}] | ${version.label} | ${version.author} =====\n`;
      sqlContent += content;
      sqlContent += '\n\n';
    }

    // 生成 JSON 元數據
    const jsonMetadata = {
      formatVersion: '1.0',
      exportDate: new Date().toISOString(),
      totalVersions: sortedVersions.length,
      includeDelta,
      includeTags,
      includeComments,
      versions: [],
      tags: [],
      comments: []
    };

    // 收集版本詳細信息
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
        depth: version.depth
      };

      // 包含差異數據
      if (includeDelta && version.isDeltaMode && version.diffData) {
        versionData.diffData = version.diffData;
      }

      jsonMetadata.versions.push(versionData);
    }

    // 收集標籤
    if (includeTags) {
      for (const version of sortedVersions) {
        const tags = await this.db.getVersionTags(version.versionId);
        jsonMetadata.tags.push(...tags);
      }
    }

    // 收集批註
    if (includeComments) {
      for (const version of sortedVersions) {
        const comments = await this.db.getVersionComments(version.versionId);
        jsonMetadata.comments.push(...comments);
      }
    }

    // 添加校驗和
    const jsonString = JSON.stringify(jsonMetadata.versions);
    const checksum = await this.diffEngine.computeHash(jsonString);
    jsonMetadata.checksum = checksum;

    const jsonContent = JSON.stringify(jsonMetadata, null, 2);

    return {
      sqlContent,
      jsonContent,
      filename: `sql_versions_${Date.now()}`
    };
  }

  /**
   * 下載為 ZIP 檔案
   */
  async downloadAsZip(sqlContent, jsonContent, filename) {
    // 檢查 JSZip 是否可用
    if (typeof JSZip === 'undefined') {
      console.warn('JSZip 庫未加載，改為分別下載檔案');
      this.downloadFile(sqlContent, `${filename}.sql`, 'text/plain');
      this.downloadFile(jsonContent, `${filename}.json`, 'application/json');
      return;
    }

    const zip = new JSZip();
    zip.file(`${filename}.sql`, sqlContent);
    zip.file(`${filename}.json`, jsonContent);

    const blob = await zip.generateAsync({ type: 'blob' });
    this.downloadFile(blob, `${filename}.zip`, 'application/zip');
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
        const resolution = conflictResolutions[importVersion.versionId] || 'skip';
        const localExists = await this.db.getVersion(importVersion.versionId);

        if (localExists && resolution !== 'skip') {
          if (resolution === 'overwrite') {
            // 覆蓋現有版本
            await new Promise((resolve, reject) => {
              const tx = this.db.db.transaction('versions', 'readwrite');
              const req = tx.objectStore('versions').put(importVersion);
              req.onsuccess = () => resolve();
              req.onerror = () => reject(req.error);
            });
            results.overwritten++;
          } else if (resolution === 'merge') {
            // 作為新版本保存（更改 versionId 和 parentVersionId）
            const newVersionId = this.versionManager._generateVersionId();
            importVersion.versionId = newVersionId;
            importVersion.parentVersionId = importVersion.versionId;
            
            await this.db.saveVersion(importVersion);
            results.merged++;
          }
        } else if (!localExists) {
          // 直接導入
          await this.db.saveVersion(importVersion);
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

  /**
   * 從 ZIP 檔案解析 SQL 和 JSON
   */
  async parseZipFile(zipBlob) {
    if (typeof JSZip === 'undefined') {
      throw new Error('JSZip 庫未加載');
    }

    const zip = new JSZip();
    await zip.loadAsync(zipBlob);

    const files = Object.keys(zip.files);
    const sqlFile = files.find(f => f.endsWith('.sql'));
    const jsonFile = files.find(f => f.endsWith('.json'));

    const result = {};

    if (sqlFile) {
      result.sqlContent = await zip.file(sqlFile).async('text');
    }

    if (jsonFile) {
      const jsonText = await zip.file(jsonFile).async('text');
      result.jsonContent = JSON.parse(jsonText);
    }

    return result;
  }

  /**
   * 從 SQL 檔案中提取版本（簡化版本）
   * 實際上 SQL 檔案用於備份，完整的版本信息在 JSON 中
   */
  async extractVersionsFromSQL(sqlContent) {
    const versionPattern = /-- ===== Version: (v_\d+_\d+) \[(.*?)\] \| (.*?) \| (.*?) =====/g;
    const versions = [];
    let match;

    while ((match = versionPattern.exec(sqlContent)) !== null) {
      versions.push({
        versionId: match[1],
        timestamp: new Date(match[2]).getTime(),
        label: match[3],
        author: match[4]
      });
    }

    return versions;
  }
}

// 導出全局實例
const importExportManager = new ImportExportManager();
