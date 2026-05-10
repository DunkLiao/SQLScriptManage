/**
 * 導入導出功能模組
 */

class ImportExportManager {
  constructor() {
    this.db = null;
    this.versionManager = null;
    this.diffEngine = null;
    this.projectManager = null;
    this.scriptManager = null;
  }

  /**
   * 初始化
   */
  async init(dbManager, vmManager, diffEngineInstance, projectManagerInstance, scriptManagerInstance = null) {
    this.db = dbManager;
    this.versionManager = vmManager;
    this.diffEngine = diffEngineInstance;
    this.projectManager = projectManagerInstance;
    this.scriptManager = scriptManagerInstance;
  }

  /**
   * 僅匯出為 JSON 檔案（支持按專案導出）
   * 返回 { jsonContent, filename }
   */
  async exportToJSON(options = {}) {
    const {
      includeTags = true,
      includeComments = true,
      projectId = null  // v3 新增：支持按專案導出
    } = options;

    // 如果未指定 projectId，使用當前專案
    const targetProjectId = projectId || this.projectManager.getCurrentProjectId();

    // 獲取指定專案的所有版本
    const allVersions = await this.db.getVersionsByProject(targetProjectId);
    const sortedVersions = [...allVersions].sort((a, b) => a.timestamp - b.timestamp);
    const scripts = await this.db.getScriptsByProject(targetProjectId);

    const jsonMetadata = {
      formatVersion: '3.0',
      exportDate: new Date().toISOString(),
      databaseVersion: this.db.version,
      totalScripts: scripts.length,
      totalVersions: sortedVersions.length,
      includeDelta: false,
      includeTags,
      includeComments,
      projectId: targetProjectId,  // v3 新增：記錄來源專案
      scripts,
      versions: [],
      tags: [],
      comments: []
    };

    for (const version of sortedVersions) {
      const versionData = {
        versionId: version.versionId,
        parentVersionId: version.parentVersionId,
        scriptId: version.scriptId,
        timestamp: version.timestamp,
        label: version.label,
        description: version.description,
        author: version.author,
        contentHash: version.contentHash,
        isDeltaMode: version.isDeltaMode,
        stats: version.stats,
        depth: version.depth,
        fullContent: version.fullContent || '',
        createdAt: version.createdAt,
        updatedAt: version.updatedAt,
        projectId: version.projectId  // v3 新增：導出版本的專案 ID
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
      filename: `sql_versions_${targetProjectId}_${Date.now()}`
    };
  }

  /**
   * 匯出完整資料庫（所有專案、版本、標籤、批註、元數據）
   * 返回 { jsonContent, filename }
   */
  async exportFullDatabase(options = {}) {
    const {
      includeTags = true,
      includeComments = true,
      includeMetadata = true
    } = options;

    console.log('開始完整資料庫匯出...');

    // 獲取所有資料
    const allProjects = await this._getAllProjects();
    const allScripts = await this._getAllScripts();
    const allVersions = await this.db.getAllVersions();
    const allTags = includeTags ? await this._getAllTags() : [];
    const allComments = includeComments ? await this._getAllComments() : [];
    const metadata = includeMetadata ? await this._getAllMetadata() : [];

    // 排序版本以確保一致性
    const sortedVersions = [...allVersions].sort((a, b) => a.timestamp - b.timestamp);

    const exportData = {
      formatVersion: '3.0',
      exportType: 'full',
      exportDate: new Date().toISOString(),
      databaseVersion: this.db.version,
      totalProjects: allProjects.length,
      totalScripts: allScripts.length,
      totalVersions: sortedVersions.length,
      totalTags: allTags.length,
      totalComments: allComments.length,
      includeTags,
      includeComments,
      includeMetadata,
      projects: allProjects,
      scripts: allScripts,
      versions: sortedVersions.map(version => ({
        versionId: version.versionId,
        parentVersionId: version.parentVersionId,
        projectId: version.projectId,
        scriptId: version.scriptId,
        timestamp: version.timestamp,
        label: version.label,
        description: version.description,
        author: version.author,
        contentHash: version.contentHash,
        isDeltaMode: version.isDeltaMode,
        stats: version.stats,
        depth: version.depth,
        fullContent: version.fullContent || '',
        createdAt: version.createdAt,
        updatedAt: version.updatedAt
      })),
      tags: allTags,
      comments: allComments,
      metadata: metadata
    };

    // 計算校驗和（使用完整資料結構）
    const dataString = JSON.stringify({
      projects: exportData.projects,
      scripts: exportData.scripts,
      versions: exportData.versions,
      tags: exportData.tags,
      comments: exportData.comments
    });
    const checksum = await this.diffEngine.computeHash(dataString);
    exportData.checksum = checksum;

    const jsonContent = JSON.stringify(exportData, null, 2);
    const timestamp = Date.now();
    
    console.log('✓ 完整資料庫匯出完成');
    console.log(`  - 專案數: ${allProjects.length}`);
    console.log(`  - SQL 腳本數: ${allScripts.length}`);
    console.log(`  - 版本數: ${sortedVersions.length}`);
    console.log(`  - 標籤數: ${allTags.length}`);
    console.log(`  - 批註數: ${allComments.length}`);

    return {
      jsonContent,
      filename: `sql_full_backup_${timestamp}.json`
    };
  }

  /**
   * 擴展版本的匯出功能，支援多專案和時間範圍過濾
   */
  async exportSelective(options = {}) {
    const {
      projectIds = null,  // 專案 ID 陣列，null 表示當前專案
      versionIds = null,  // 特定版本 ID 陣列
      dateRange = null,   // { start: timestamp, end: timestamp }
      includeTags = true,
      includeComments = true
    } = options;

    console.log('開始選擇性匯出...');

    let versions = [];

    // 根據條件過濾版本
    if (versionIds && versionIds.length > 0) {
      // 匯出特定版本
      for (const versionId of versionIds) {
        const version = await this.db.getVersion(versionId);
        if (version) versions.push(version);
      }
    } else if (projectIds && projectIds.length > 0) {
      // 匯出多個專案
      for (const projectId of projectIds) {
        const projectVersions = await this.db.getVersionsByProject(projectId);
        versions.push(...projectVersions);
      }
    } else {
      // 匯出當前專案
      const currentProjectId = this.projectManager.getCurrentProjectId();
      versions = await this.db.getVersionsByProject(currentProjectId);
    }

    // 應用時間範圍過濾
    if (dateRange) {
      const { start, end } = dateRange;
      versions = versions.filter(v => {
        const timestamp = v.timestamp || v.createdAt;
        return (!start || timestamp >= start) && (!end || timestamp <= end);
      });
    }

    // 排序版本
    const sortedVersions = [...versions].sort((a, b) => a.timestamp - b.timestamp);

    // 獲取相關專案資訊
    const projectIdSet = new Set(sortedVersions.map(v => v.projectId));
    const projects = [];
    for (const projectId of projectIdSet) {
      const project = await this._getProject(projectId);
      if (project) projects.push(project);
    }
    const scriptIdSet = new Set(sortedVersions.map(v => v.scriptId).filter(Boolean));
    const scripts = [];
    for (const scriptId of scriptIdSet) {
      const script = await this.db.getScript(scriptId);
      if (script) scripts.push(script);
    }

    const exportData = {
      formatVersion: '3.0',
      exportType: 'selective',
      exportDate: new Date().toISOString(),
      databaseVersion: this.db.version,
      totalProjects: projects.length,
      totalScripts: scripts.length,
      totalVersions: sortedVersions.length,
      includeTags,
      includeComments,
      filters: {
        projectIds: projectIds || null,
        versionIds: versionIds || null,
        dateRange: dateRange || null
      },
      projects: projects,
      scripts: scripts,
      versions: sortedVersions.map(version => ({
        versionId: version.versionId,
        parentVersionId: version.parentVersionId,
        projectId: version.projectId,
        scriptId: version.scriptId,
        timestamp: version.timestamp,
        label: version.label,
        description: version.description,
        author: version.author,
        contentHash: version.contentHash,
        isDeltaMode: version.isDeltaMode,
        stats: version.stats,
        depth: version.depth,
        fullContent: version.fullContent || '',
        createdAt: version.createdAt,
        updatedAt: version.updatedAt
      })),
      tags: [],
      comments: []
    };

    // 收集標籤和批註
    if (includeTags) {
      for (const version of sortedVersions) {
        const tags = await this.db.getVersionTags(version.versionId);
        exportData.tags.push(...tags);
      }
    }

    if (includeComments) {
      for (const version of sortedVersions) {
        const comments = await this.db.getVersionComments(version.versionId);
        exportData.comments.push(...comments);
      }
    }

    // 計算校驗和
    const dataString = JSON.stringify({
      projects: exportData.projects,
      scripts: exportData.scripts,
      versions: exportData.versions,
      tags: exportData.tags,
      comments: exportData.comments
    });
    const checksum = await this.diffEngine.computeHash(dataString);
    exportData.checksum = checksum;

    const jsonContent = JSON.stringify(exportData, null, 2);
    const timestamp = Date.now();
    
    console.log('✓ 選擇性匯出完成');
    console.log(`  - 專案數: ${projects.length}`);
    console.log(`  - 版本數: ${sortedVersions.length}`);

    return {
      jsonContent,
      filename: `sql_selective_backup_${timestamp}.json`
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

  parseJSONContent(jsonContent) {
    try {
      return typeof jsonContent === 'string' ? JSON.parse(jsonContent) : jsonContent;
    } catch (error) {
      throw new Error('無效的 JSON 格式');
    }
  }

  async validateImportData(jsonData, options = {}) {
    const { requireFull = false } = options;
    const data = this.parseJSONContent(jsonData);

    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('JSON 檔案內容必須是物件');
    }

    if (requireFull) {
      if (!['2.0', '3.0'].includes(data.formatVersion) || data.exportType !== 'full') {
        throw new Error('不是有效的完整備份檔案（需要 formatVersion 2.0/3.0 且 exportType 為 full）');
      }
      this._assertArrayField(data, 'projects');
    }

    this._assertArrayField(data, 'versions');
    if (data.scripts !== undefined) this._assertArrayField(data, 'scripts');
    if (data.tags !== undefined) this._assertArrayField(data, 'tags');
    if (data.comments !== undefined) this._assertArrayField(data, 'comments');
    if (data.metadata !== undefined) this._assertArrayField(data, 'metadata');

    await this._verifyChecksum(data);
    await this._verifyVersionRecords(data, { strict: requireFull && data.formatVersion === '3.0' });

    return {
      isValid: true,
      data,
      counts: {
        projects: data.projects?.length || 0,
        scripts: data.scripts?.length || 0,
        versions: data.versions.length,
        tags: data.tags?.length || 0,
        comments: data.comments?.length || 0,
        metadata: data.metadata?.length || 0
      }
    };
  }

  _assertArrayField(data, fieldName) {
    if (!Array.isArray(data[fieldName])) {
      throw new Error(`JSON 檔案不包含有效的 ${fieldName} 陣列`);
    }
  }

  async _verifyChecksum(data) {
    if (!data.checksum) {
      throw new Error('檔案缺少 checksum，無法確認備份內容完整性');
    }

    let checksumSource;
    if (data.exportType === 'full' || data.exportType === 'selective') {
      checksumSource = data.formatVersion === '3.0'
        ? {
          projects: data.projects || [],
          scripts: data.scripts || [],
          versions: data.versions,
          tags: data.tags || [],
          comments: data.comments || []
        }
        : {
          projects: data.projects || [],
          versions: data.versions,
          tags: data.tags || [],
          comments: data.comments || []
        };
    } else {
      checksumSource = data.versions;
    }

    const actualChecksum = await this.diffEngine.computeHash(JSON.stringify(checksumSource));
    if (actualChecksum !== data.checksum) {
      throw new Error('檔案校驗失敗，資料可能已損壞');
    }
  }

  async _verifyVersionRecords(data, options = {}) {
    const { strict = false } = options;
    const requiredFields = strict
      ? ['versionId', 'projectId', 'scriptId', 'timestamp', 'label', 'author', 'contentHash', 'fullContent']
      : ['versionId'];

    for (const version of data.versions) {
      for (const field of requiredFields) {
        if (version[field] === undefined || version[field] === null || version[field] === '') {
          throw new Error(`版本資料缺少必要欄位：${field}`);
        }
      }

      const normalizedVersion = await this._normalizeImportedVersionRecord(version);
      if (normalizedVersion.contentHash) {
        const actualHash = await this.diffEngine.computeHash(normalizedVersion.fullContent || '');
        if (actualHash !== normalizedVersion.contentHash) {
          throw new Error(`版本 ${normalizedVersion.versionId} 內容 hash 驗證失敗`);
        }
      }
    }
  }

  async getFullRestorePreview(jsonData, options = {}) {
    const { conflictStrategy = 'skip', clearExisting = false } = options;
    const validation = await this.validateImportData(jsonData, { requireFull: true });
    const data = validation.data;

    const [localProjects, localScripts, localVersions, localCounts] = await Promise.all([
      this._getAllProjects(),
      this._getAllScripts(),
      this.db.getAllVersions(),
      this.db.getDataCounts()
    ]);

    const localProjectIds = new Set(localProjects.map(project => project.projectId));
    const localScriptIds = new Set(localScripts.map(script => script.scriptId));
    const localVersionIds = new Set(localVersions.map(version => version.versionId));
    const localScriptNames = new Set(localScripts.map(script => `${script.projectId}\u0000${script.scriptName}`));

    const preview = {
      clearExisting,
      clearCounts: clearExisting ? localCounts : null,
      projects: this._previewEntity(data.projects || [], localProjectIds, conflictStrategy),
      scripts: this._previewScripts(data.scripts || [], localScriptIds, localScriptNames, conflictStrategy),
      versions: this._previewEntity(data.versions || [], localVersionIds, conflictStrategy, true),
      tags: { imported: data.tags?.length || 0, skipped: 0, overwritten: 0, merged: 0 },
      comments: { imported: data.comments?.length || 0, skipped: 0, overwritten: 0, merged: 0 },
      metadata: { imported: data.metadata?.length || 0, skipped: 0, overwritten: 0, merged: 0 },
      conflicts: []
    };

    if (clearExisting) {
      for (const key of ['projects', 'scripts', 'versions']) {
        preview[key].imported = data[key]?.length || 0;
        preview[key].skipped = 0;
        preview[key].overwritten = 0;
        preview[key].merged = 0;
      }
    }

    for (const version of data.versions || []) {
      if (localVersionIds.has(version.versionId) && !clearExisting) {
        preview.conflicts.push({
          type: 'version',
          id: version.versionId,
          label: version.label || ''
        });
      }
    }

    return preview;
  }

  _previewEntity(items, localIds, strategy, allowMerge = false) {
    const result = { imported: 0, skipped: 0, overwritten: 0, merged: 0 };
    for (const item of items) {
      const id = item.projectId || item.versionId || item.tagId || item.commentId || item.key;
      if (!localIds.has(id)) {
        result.imported++;
      } else if (allowMerge && strategy === 'merge') {
        result.merged++;
      } else if (strategy === 'overwrite') {
        result.overwritten++;
      } else {
        result.skipped++;
      }
    }
    return result;
  }

  _previewScripts(scripts, localScriptIds, localScriptNames, strategy) {
    const result = { imported: 0, skipped: 0, overwritten: 0, merged: 0 };
    for (const script of scripts) {
      const exists = localScriptIds.has(script.scriptId) ||
        localScriptNames.has(`${script.projectId}\u0000${script.scriptName}`);
      if (!exists) {
        result.imported++;
      } else if (strategy === 'overwrite') {
        result.overwritten++;
      } else {
        result.skipped++;
      }
    }
    return result;
  }

  /**
   * 導入 JSON 檔案
   * 返回 { isValid, conflicts, data }
   */
  async importFromJSON(jsonContent) {
    const validation = await this.validateImportData(jsonContent);
    const jsonData = validation.data;

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
   * 執行導入（支持指定目標專案）
   */
  async executeImport(jsonData, conflictResolutions = {}, targetProjectId = null) {
    // 如果未指定 targetProjectId，使用當前專案
    if (!targetProjectId) {
      targetProjectId = this.projectManager.getCurrentProjectId();
    }

    const importVersions = jsonData.versions;
    const preparedScripts = await this._prepareImportScripts(jsonData, targetProjectId);
    const scriptIdMap = preparedScripts.map;
    const results = {
      scripts: preparedScripts.created,
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
        const versionRecord = await this._normalizeImportedVersionRecord(importVersion);

        // v3 新增：設定目標專案 ID
        versionRecord.projectId = targetProjectId;
        versionRecord.scriptId = scriptIdMap.get(importVersion.scriptId) || scriptIdMap.get('__default');

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

  /**
   * 匯入完整資料庫
   */
  async importFullDatabase(jsonData, options = {}) {
    const {
      conflictStrategy = 'skip',  // 'skip', 'overwrite', 'merge'
      clearExisting = false        // 是否先清空現有資料
    } = options;

    console.log('開始完整資料庫匯入...');
    console.log(`  - 衝突策略: ${conflictStrategy}`);
    console.log(`  - 清空現有資料: ${clearExisting}`);

    const validation = await this.validateImportData(jsonData, { requireFull: true });
    jsonData = validation.data;
    console.log('✓ 備份檔案驗證通過');

    const results = {
      projects: { imported: 0, skipped: 0, overwritten: 0, errors: [] },
      scripts: { imported: 0, skipped: 0, overwritten: 0, errors: [] },
      versions: { imported: 0, skipped: 0, overwritten: 0, merged: 0, errors: [] },
      tags: { imported: 0, skipped: 0, errors: [] },
      comments: { imported: 0, skipped: 0, errors: [] },
      metadata: { imported: 0, skipped: 0, errors: [] }
    };

    try {
      // 步驟 1: 清空現有資料（如果需要）
      if (clearExisting) {
        console.log('清空現有資料...');
        await this._clearAllData();
        console.log('✓ 現有資料已清空');
      }

      // 步驟 2: 匯入專案
      if (jsonData.projects && Array.isArray(jsonData.projects)) {
        console.log(`匯入 ${jsonData.projects.length} 個專案...`);
        for (const project of jsonData.projects) {
          try {
            const existingProject = await this._getProject(project.projectId);
            
            if (existingProject) {
              if (conflictStrategy === 'overwrite') {
                await this._saveProject(project);
                results.projects.overwritten++;
              } else {
                results.projects.skipped++;
              }
            } else {
              await this._saveProject(project);
              results.projects.imported++;
            }
          } catch (error) {
            results.projects.errors.push({
              projectId: project.projectId,
              error: error.message
            });
          }
        }
        console.log(`✓ 專案匯入完成 (新增: ${results.projects.imported}, 覆蓋: ${results.projects.overwritten}, 跳過: ${results.projects.skipped})`);
      }

      // 步驟 3: 匯入版本
      if (jsonData.scripts && Array.isArray(jsonData.scripts)) {
        console.log(`匯入 ${jsonData.scripts.length} 支 SQL 腳本...`);
        for (const script of jsonData.scripts) {
          try {
            const existingScript = await this.db.getScript(script.scriptId);
            const sameNameScript = (await this.db.getScriptsByProject(script.projectId))
              .find(item => item.scriptName === script.scriptName);
            if (existingScript) {
              if (conflictStrategy === 'overwrite') {
                await this._saveScript(script);
                results.scripts.overwritten++;
              } else {
                results.scripts.skipped++;
              }
            } else if (sameNameScript) {
              if (conflictStrategy === 'overwrite') {
                await this._saveScript({ ...script, scriptId: sameNameScript.scriptId });
                results.scripts.overwritten++;
              } else {
                results.scripts.skipped++;
              }
            } else {
              await this.db.saveScript(script);
              results.scripts.imported++;
            }
          } catch (error) {
            results.scripts.errors.push({
              scriptId: script.scriptId,
              error: error.message
            });
          }
        }
        console.log(`✓ SQL 腳本匯入完成 (新增: ${results.scripts.imported}, 覆蓋: ${results.scripts.overwritten}, 跳過: ${results.scripts.skipped})`);
      } else if (jsonData.projects && Array.isArray(jsonData.projects)) {
        for (const project of jsonData.projects) {
          await this._ensureDefaultScript(project.projectId);
        }
      }

      // 步驟 3: 匯入版本
      if (jsonData.versions && Array.isArray(jsonData.versions)) {
        console.log(`匯入 ${jsonData.versions.length} 個版本...`);
        
        for (const importVersion of jsonData.versions) {
          try {
            const versionRecord = await this._normalizeImportedVersionRecord(importVersion);
            if (!versionRecord.scriptId) {
              const defaultScript = await this._ensureDefaultScript(versionRecord.projectId);
              versionRecord.scriptId = defaultScript.scriptId;
            }
            const existingVersion = await this.db.getVersion(versionRecord.versionId);

            if (existingVersion) {
              if (conflictStrategy === 'overwrite') {
                await this._overwriteVersion(versionRecord);
                results.versions.overwritten++;
              } else if (conflictStrategy === 'merge') {
                const newVersionId = this.versionManager._generateVersionId();
                versionRecord.versionId = newVersionId;
                versionRecord.parentVersionId = existingVersion.versionId;
                await this.db.saveVersion(versionRecord);
                results.versions.merged++;
              } else {
                results.versions.skipped++;
              }
            } else {
              await this.db.saveVersion(versionRecord);
              results.versions.imported++;
            }
          } catch (error) {
            results.versions.errors.push({
              versionId: importVersion.versionId,
              error: error.message
            });
          }
        }
        console.log(`✓ 版本匯入完成 (新增: ${results.versions.imported}, 覆蓋: ${results.versions.overwritten}, 合併: ${results.versions.merged}, 跳過: ${results.versions.skipped})`);
      }

      // 步驟 4: 匯入標籤
      if (jsonData.tags && Array.isArray(jsonData.tags)) {
        console.log(`匯入 ${jsonData.tags.length} 個標籤...`);
        for (const tag of jsonData.tags) {
          try {
            await this.db.saveTag(tag);
            results.tags.imported++;
          } catch (error) {
            if (error.name === 'ConstraintError') {
              results.tags.skipped++;
            } else {
              results.tags.errors.push({
                tagId: tag.tagId,
                error: error.message
              });
            }
          }
        }
        console.log(`✓ 標籤匯入完成 (新增: ${results.tags.imported}, 跳過: ${results.tags.skipped})`);
      }

      // 步驟 5: 匯入批註
      if (jsonData.comments && Array.isArray(jsonData.comments)) {
        console.log(`匯入 ${jsonData.comments.length} 個批註...`);
        for (const comment of jsonData.comments) {
          try {
            await this.db.saveComment(comment);
            results.comments.imported++;
          } catch (error) {
            if (error.name === 'ConstraintError') {
              results.comments.skipped++;
            } else {
              results.comments.errors.push({
                commentId: comment.commentId,
                error: error.message
              });
            }
          }
        }
        console.log(`✓ 批註匯入完成 (新增: ${results.comments.imported}, 跳過: ${results.comments.skipped})`);
      }

      // 步驟 6: 匯入元數據
      if (jsonData.metadata && Array.isArray(jsonData.metadata)) {
        console.log(`匯入 ${jsonData.metadata.length} 筆元數據...`);
        for (const meta of jsonData.metadata) {
          try {
            await this._saveMetadata(meta);
            results.metadata.imported++;
          } catch (error) {
            results.metadata.errors.push({
              key: meta.key,
              error: error.message
            });
          }
        }
        console.log(`✓ 元數據匯入完成 (新增: ${results.metadata.imported})`);
      }

      console.log('✓ 完整資料庫匯入完成');

    } catch (error) {
      console.error('完整資料庫匯入失敗:', error);
      throw error;
    }

    return results;
  }

  /**
   * 將舊匯入格式轉為 v4 版本記錄：只寫入 fullContent，不保留 diffData。
   */
  async _normalizeImportedVersionRecord(importVersion) {
    const versionRecord = { ...importVersion };
    let diffData = versionRecord.diffData;

    if (diffData && typeof diffData === 'string') {
      try {
        diffData = this.diffEngine.decompressDiffData(diffData);
      } catch (e) {
        console.warn('diffData 解壓失敗，將以空內容導入:', e.message);
        diffData = null;
      }
    }

    if (versionRecord.fullContent === undefined || versionRecord.fullContent === null) {
      if (diffData) {
        try {
          versionRecord.fullContent = this.diffEngine.applyDiff('', diffData);
        } catch (e) {
          console.warn(`版本 ${versionRecord.versionId || '(未知)'} 內容重建失敗`, e.message);
          versionRecord.fullContent = '';
        }
      } else {
        versionRecord.fullContent = '';
      }
    }

    if (!versionRecord.contentHash) {
      versionRecord.contentHash = await this.diffEngine.computeHash(versionRecord.fullContent);
    }

    versionRecord.isDeltaMode = false;
    delete versionRecord.diffData;

    return versionRecord;
  }

  /**
   * 覆蓋已存在的版本記錄（使用 put 以避免唯一鍵衝突）
   */
  async _overwriteVersion(versionRecord) {
    return new Promise((resolve, reject) => {
      const tx = this.db.db.transaction(['versions', 'metadata'], 'readwrite');
      const versionStore = tx.objectStore('versions');
      const metadataStore = tx.objectStore('metadata');

      const putRequest = versionStore.put(versionRecord);

      putRequest.onsuccess = () => {
        metadataStore.put({
          key: 'lastVersionId',
          value: versionRecord.versionId,
          updatedAt: Date.now()
        });
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || putRequest.error);
    });
  }

  async _prepareImportScripts(jsonData, targetProjectId) {
    const scriptIdMap = new Map();
    let created = 0;

    if (jsonData.scripts && Array.isArray(jsonData.scripts) && jsonData.scripts.length > 0) {
      for (const script of jsonData.scripts) {
        const importedScript = { ...script };
        const originalScriptId = importedScript.scriptId;
        importedScript.projectId = targetProjectId;

        const projectScripts = await this.db.getScriptsByProject(targetProjectId);
        let targetScript = projectScripts.find(item => item.scriptName === importedScript.scriptName);

        if (!targetScript) {
          importedScript.scriptId = `script_${targetProjectId}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
          importedScript.createdAt = importedScript.createdAt || Date.now();
          importedScript.updatedAt = Date.now();
          importedScript.rootVersionId = null;
          await this.db.saveScript(importedScript);
          targetScript = importedScript;
          created++;
        }

        scriptIdMap.set(originalScriptId, targetScript.scriptId);
      }
    }

    if (!scriptIdMap.has('__default')) {
      const defaultScript = await this._ensureDefaultScript(targetProjectId);
      scriptIdMap.set('__default', defaultScript.scriptId);
    }

    return { map: scriptIdMap, created };
  }

  async _ensureDefaultScript(projectId) {
    const scripts = await this.db.getScriptsByProject(projectId);
    const existing = scripts.find(script => script.scriptName === 'main' || script.scriptName === 'main.sql') || scripts[0];
    if (existing) return existing;

    const project = await this.db.getProject(projectId);
    const now = Date.now();
    const script = {
      scriptId: `script_${projectId}_${now}_${Math.random().toString(36).substr(2, 6)}`,
      projectId,
      scriptName: 'main',
      description: '',
      rootVersionId: project?.rootVersionId || null,
      createdAt: project?.createdAt || now,
      updatedAt: now
    };
    await this.db.saveScript(script);
    return script;
  }

  /**
   * 輔助方法：獲取所有專案
   */
  async _getAllProjects() {
    return new Promise((resolve, reject) => {
      const tx = this.db.db.transaction('projects', 'readonly');
      const store = tx.objectStore('projects');
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 輔助方法：獲取所有 SQL 腳本
   */
  async _getAllScripts() {
    return new Promise((resolve, reject) => {
      const tx = this.db.db.transaction('sqlScripts', 'readonly');
      const store = tx.objectStore('sqlScripts');
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 輔助方法：獲取所有標籤
   */
  async _getAllTags() {
    return new Promise((resolve, reject) => {
      const tx = this.db.db.transaction('tags', 'readonly');
      const store = tx.objectStore('tags');
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 輔助方法：獲取所有批註
   */
  async _getAllComments() {
    return new Promise((resolve, reject) => {
      const tx = this.db.db.transaction('comments', 'readonly');
      const store = tx.objectStore('comments');
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 輔助方法：獲取所有元數據
   */
  async _getAllMetadata() {
    if (!this.db.db.objectStoreNames.contains('metadata')) {
      return [];
    }
    
    return new Promise((resolve, reject) => {
      const tx = this.db.db.transaction('metadata', 'readonly');
      const store = tx.objectStore('metadata');
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 輔助方法：獲取單一專案
   */
  async _getProject(projectId) {
    return new Promise((resolve, reject) => {
      const tx = this.db.db.transaction('projects', 'readonly');
      const store = tx.objectStore('projects');
      const request = store.get(projectId);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 輔助方法：儲存專案
   */
  async _saveProject(project) {
    return new Promise((resolve, reject) => {
      const tx = this.db.db.transaction('projects', 'readwrite');
      const store = tx.objectStore('projects');
      const request = store.put(project);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 輔助方法：儲存 SQL 腳本
   */
  async _saveScript(script) {
    return new Promise((resolve, reject) => {
      const tx = this.db.db.transaction('sqlScripts', 'readwrite');
      const store = tx.objectStore('sqlScripts');
      const request = store.put(script);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 輔助方法：儲存元數據
   */
  async _saveMetadata(metadata) {
    if (!this.db.db.objectStoreNames.contains('metadata')) {
      return;
    }

    return new Promise((resolve, reject) => {
      const tx = this.db.db.transaction('metadata', 'readwrite');
      const store = tx.objectStore('metadata');
      const request = store.put(metadata);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 輔助方法：清空所有資料
   */
  async _clearAllData() {
    const stores = ['projects', 'sqlScripts', 'versions', 'tags', 'comments', 'metadata']
      .filter(storeName => this.db.db.objectStoreNames.contains(storeName));

    await new Promise((resolve, reject) => {
      const tx = this.db.db.transaction(stores, 'readwrite');
      for (const storeName of stores) {
        tx.objectStore(storeName).clear();
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('清空資料交易已中止'));
    });
  }

}

// 導出全局實例
const importExportManager = new ImportExportManager();
