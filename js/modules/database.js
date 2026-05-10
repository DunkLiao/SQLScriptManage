/**
 * IndexedDB 數據庫初始化和操作模組
 */

class DatabaseManager {
  constructor(dbName = 'SQLVersionControl', version = 5) {
    this.dbName = dbName;
    this.version = version;
    this.db = null;
  }

  /**
   * 初始化數據庫
   */
  async initialize() {
    return new Promise((resolve, reject) => {
      const openRequest = (requestedVersion) => {
        const request = indexedDB.open(this.dbName, requestedVersion);

        request.onerror = () => {
          const errorMessage = request.error?.message || '未知錯誤';
          console.error('數據庫打開失敗:', errorMessage);
          
          // 如果是版本不匹配的錯誤，嘗試不指定版本重新打開
          if (errorMessage.includes('less than') && requestedVersion !== undefined) {
            console.log('檢測到版本不匹配，嘗試以自動版本模式重新打開...');
            openRequest(undefined);
          } else {
            reject(request.error);
          }
        };

        request.onsuccess = async () => {
          this.db = request.result;
          const dbVersion = this.db.version;
          console.log('✓ 數據庫初始化成功');
          console.log('  - 數據庫名稱:', this.dbName);
          console.log('  - 當前版本:', dbVersion);
          console.log('  - ObjectStores:', Array.from(this.db.objectStoreNames).join(', '));
          
          // 執行數據遷移（v2 → v3）
          if (dbVersion >= 3) {
            await this.migrateToV3().catch(err => {
              console.warn('數據遷移失敗:', err);
              // 不拋出錯誤，讓應用繼續初始化
            });
          }

          // 執行數據遷移（v3 → v4）
          if (dbVersion >= 4) {
            await this.migrateToV4().catch(err => {
              console.warn('v4 數據遷移失敗:', err);
            });
          }

          // 執行數據遷移（v4 → v5）
          if (dbVersion >= 5) {
            await this.migrateToV5().catch(err => {
              console.warn('v5 數據遷移失敗:', err);
            });
          }
          
          resolve(this.db);
        };

        request.onupgradeneeded = (event) => {
          const db = event.target.result;
          const oldVersion = event.oldVersion;
          const newVersion = event.newVersion;
          
          console.log('執行數據庫升級或初始化...');
          console.log('  - 舊版本:', oldVersion);
          console.log('  - 新版本:', newVersion);

          // 0. 建立 projects ObjectStore（v3 新增）
          if (!db.objectStoreNames.contains('projects')) {
            const projectStore = db.createObjectStore('projects', 
              { keyPath: 'projectId' }
            );
            projectStore.createIndex('projectName', 'projectName');
            console.log('✓ 專案 ObjectStore 創建成功');
          }

          // 0.5 建立 sqlScripts ObjectStore（v5 新增）
          if (!db.objectStoreNames.contains('sqlScripts')) {
            const scriptStore = db.createObjectStore('sqlScripts',
              { keyPath: 'scriptId' }
            );
            scriptStore.createIndex('projectId', 'projectId');
            scriptStore.createIndex('projectId_scriptName', ['projectId', 'scriptName'], { unique: true });
            scriptStore.createIndex('updatedAt', 'updatedAt');
            console.log('✓ SQL 腳本 ObjectStore 創建成功');
          }

          // 1. 創建或升級 versions ObjectStore
          if (!db.objectStoreNames.contains('versions')) {
            const versionStore = db.createObjectStore('versions', 
              { keyPath: 'versionId' }
            );
            versionStore.createIndex('parentId', 'parentVersionId');
            versionStore.createIndex('timestamp', 'timestamp');
            versionStore.createIndex('depth', 'depth');
            // v3：添加 projectId 複合索引
            versionStore.createIndex('projectId_timestamp', ['projectId', 'timestamp']);
            versionStore.createIndex('projectId', 'projectId');
            versionStore.createIndex('scriptId', 'scriptId');
            versionStore.createIndex('projectId_scriptId_timestamp', ['projectId', 'scriptId', 'timestamp']);
            // 移除唯一約束，允許標籤重複
            versionStore.createIndex('label', 'label', { unique: false });
            console.log('✓ 版本 ObjectStore 創建成功');
          } else if (oldVersion < 3) {
            // v2 → v3 升級：添加 projectId 相關索引
            const tx = event.target.transaction;
            const versionStore = tx.objectStore('versions');
            try {
              versionStore.createIndex('projectId_timestamp', ['projectId', 'timestamp']);
              console.log('✓ projectId_timestamp 索引已新增');
            } catch (e) {
              console.warn('projectId_timestamp 索引已存在:', e.message);
            }
            try {
              versionStore.createIndex('projectId', 'projectId');
              console.log('✓ projectId 索引已新增');
            } catch (e) {
              console.warn('projectId 索引已存在:', e.message);
            }
          }

          if (db.objectStoreNames.contains('versions') && oldVersion < 5) {
            const tx = event.target.transaction;
            const versionStore = tx.objectStore('versions');
            if (!versionStore.indexNames.contains('scriptId')) {
              versionStore.createIndex('scriptId', 'scriptId');
              console.log('✓ scriptId 索引已新增');
            }
            if (!versionStore.indexNames.contains('projectId_scriptId_timestamp')) {
              versionStore.createIndex('projectId_scriptId_timestamp', ['projectId', 'scriptId', 'timestamp']);
              console.log('✓ projectId_scriptId_timestamp 索引已新增');
            }
          }

          // 2. 創建 tags ObjectStore
          if (!db.objectStoreNames.contains('tags')) {
            const tagStore = db.createObjectStore('tags',
              { keyPath: 'tagId' }
            );
            tagStore.createIndex('versionId', 'versionId');
            tagStore.createIndex('tagName', 'tagName', { unique: false });
            tagStore.createIndex('versionId_tagName', ['versionId', 'tagName'], { unique: true });
            tagStore.createIndex('type', 'type');
            console.log('✓ 標籤 ObjectStore 創建成功');
          } else if (oldVersion < 4) {
            const tx = event.target.transaction;
            const tagStore = tx.objectStore('tags');
            if (tagStore.indexNames.contains('tagName')) {
              tagStore.deleteIndex('tagName');
            }
            tagStore.createIndex('tagName', 'tagName', { unique: false });
            if (!tagStore.indexNames.contains('versionId_tagName')) {
              tagStore.createIndex('versionId_tagName', ['versionId', 'tagName'], { unique: true });
            }
            console.log('✓ 標籤索引已升級為版本範圍唯一');
          }

          // 3. 創建 comments ObjectStore
          if (!db.objectStoreNames.contains('comments')) {
            const commentStore = db.createObjectStore('comments',
              { keyPath: 'commentId' }
            );
            commentStore.createIndex('versionId', 'versionId');
            commentStore.createIndex('status', 'status');
            commentStore.createIndex('lineNumber', 'lineNumber');
            console.log('✓ 批註 ObjectStore 創建成功');
          }

          // 4. 創建 metadata ObjectStore
          if (!db.objectStoreNames.contains('metadata')) {
            db.createObjectStore('metadata', { keyPath: 'key' });
            console.log('✓ 元數據 ObjectStore 創建成功');
          }
        };
      };

      openRequest(this.version);
    });
  }

  /**
   * 保存版本記錄
   */
  async saveVersion(versionRecord) {
    if (!this.db) throw new Error('數據庫未初始化');

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['versions', 'metadata'], 'readwrite');
      const versionStore = tx.objectStore('versions');
      const metadataStore = tx.objectStore('metadata');

      const addRequest = versionStore.add(versionRecord);

      addRequest.onsuccess = () => {
        // 更新元數據
        metadataStore.put({
          key: 'lastVersionId',
          value: versionRecord.versionId,
          updatedAt: Date.now()
        });

        resolve(versionRecord);
      };

      addRequest.onerror = () => reject(addRequest.error);

      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * 獲取版本記錄
   */
  async getVersion(versionId) {
    if (!this.db) throw new Error('數據庫未初始化');

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('versions', 'readonly');
      const store = tx.objectStore('versions');
      const request = store.get(versionId);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 獲取所有版本
   */
  async getAllVersions() {
    if (!this.db) throw new Error('數據庫未初始化');

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('versions', 'readonly');
      const store = tx.objectStore('versions');
      const request = store.getAll();

      request.onsuccess = () => {
        const versions = request.result;
        // 按時間戳降序排序（最新在上）
        versions.sort((a, b) => b.timestamp - a.timestamp);
        resolve(versions);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 獲取最新版本
   */
  async getLatestVersion() {
    const versions = await this.getAllVersions();
    return versions.length > 0 ? versions[versions.length - 1] : null;
  }

  /**
   * 獲取版本鏈（從指定版本回溯到根）
   */
  async getVersionChain(versionId, maxDepth = 50) {
    const chain = [];
    let currentId = versionId;
    let depth = 0;

    while (currentId && depth < maxDepth) {
      const version = await this.getVersion(currentId);
      if (!version) break;

      chain.push(version);
      currentId = version.parentVersionId;
      depth++;
    }

    return chain;
  }

  /**
   * 刪除版本
   */
  async deleteVersion(versionId) {
    if (!this.db) throw new Error('數據庫未初始化');

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['versions', 'tags', 'comments'], 'readwrite');
      
      // 刪除版本
      const versionStore = tx.objectStore('versions');
      versionStore.delete(versionId);

      // 刪除相關標籤
      const tagStore = tx.objectStore('tags');
      const tagIndex = tagStore.index('versionId');
      tagIndex.openCursor(IDBKeyRange.only(versionId)).onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };

      // 刪除相關批註
      const commentStore = tx.objectStore('comments');
      const commentIndex = commentStore.index('versionId');
      commentIndex.openCursor(IDBKeyRange.only(versionId)).onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * 更新版本 Label
   */
  async updateVersionLabel(versionId, label) {
    const version = await this.getVersion(versionId);
    if (!version) throw new Error('版本不存在');

    version.label = label;
    version.updatedAt = Date.now();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('versions', 'readwrite');
      const store = tx.objectStore('versions');
      const request = store.put(version);

      request.onsuccess = () => resolve(version);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 保存標籤
   */
  async saveTag(tagRecord) {
    if (!this.db) throw new Error('數據庫未初始化');

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('tags', 'readwrite');
      const store = tx.objectStore('tags');
      const request = store.add(tagRecord);

      request.onsuccess = () => resolve(tagRecord);
      request.onerror = () => {
        if (request.error?.name === 'ConstraintError') {
          const error = new Error('同一版本已存在此標籤');
          error.name = 'ConstraintError';
          reject(error);
          return;
        }
        reject(request.error);
      };
    });
  }

  /**
   * 獲取版本的所有標籤
   */
  async getVersionTags(versionId) {
    if (!this.db) throw new Error('數據庫未初始化');

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('tags', 'readonly');
      const store = tx.objectStore('tags');
      const index = store.index('versionId');
      const request = index.getAll(versionId);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 保存批註
   */
  async saveComment(commentRecord) {
    if (!this.db) throw new Error('數據庫未初始化');

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('comments', 'readwrite');
      const store = tx.objectStore('comments');
      const request = store.add(commentRecord);

      request.onsuccess = () => resolve(commentRecord);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 獲取版本的所有批註
   */
  async getVersionComments(versionId) {
    if (!this.db) throw new Error('數據庫未初始化');

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('comments', 'readonly');
      const store = tx.objectStore('comments');
      const index = store.index('versionId');
      const request = index.getAll(versionId);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 保存元數據
   */
  async saveMetadata(key, value) {
    if (!this.db) throw new Error('數據庫未初始化');

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('metadata', 'readwrite');
      const store = tx.objectStore('metadata');
      const record = {
        key,
        value,
        updatedAt: Date.now()
      };

      const request = store.put(record);
      request.onsuccess = () => resolve(record);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 獲取元數據
   */
  async getMetadata(key) {
    if (!this.db) throw new Error('數據庫未初始化');

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('metadata', 'readonly');
      const store = tx.objectStore('metadata');
      const request = store.get(key);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 清空所有數據
   */
  async clearAllData() {
    if (!this.db) throw new Error('數據庫未初始化');

    await new Promise((resolve, reject) => {
      const tx = this.db.transaction(
        ['projects', 'sqlScripts', 'versions', 'tags', 'comments', 'metadata'],
        'readwrite'
      );

      tx.objectStore('projects').clear();
      tx.objectStore('sqlScripts').clear();
      tx.objectStore('versions').clear();
      tx.objectStore('tags').clear();
      tx.objectStore('comments').clear();
      tx.objectStore('metadata').clear();

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    const now = Date.now();
    const defaultProject = {
      projectId: 'default',
      projectName: '預設',
      rootVersionId: null,
      createdAt: now,
      updatedAt: now
    };
    const defaultScript = {
      scriptId: `script_default_${now}`,
      projectId: defaultProject.projectId,
      scriptName: 'main',
      description: '',
      rootVersionId: null,
      createdAt: now,
      updatedAt: now
    };

    await this.saveProject(defaultProject);
    await this.saveScript(defaultScript);
    await this.saveMetadata('currentProjectId', defaultProject.projectId);
    await this.saveMetadata(`currentScriptId:${defaultProject.projectId}`, defaultScript.scriptId);

    return defaultProject;
  }

  /**
   * 批量導入版本
   */
  async batchImportVersions(versions) {
    if (!this.db) throw new Error('數據庫未初始化');

    const batchSize = 50;
    const imported = [];

    for (let i = 0; i < versions.length; i += batchSize) {
      const batch = versions.slice(i, i + batchSize);

      await new Promise((resolve, reject) => {
        const tx = this.db.transaction('versions', 'readwrite');
        const store = tx.objectStore('versions');

        for (const version of batch) {
          store.add(version);
        }

        tx.oncomplete = () => {
          imported.push(...batch);
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      });
    }

    return imported;
  }

  /**
   * 獲取數據庫統計信息
   */
  async getStatistics() {
    const allVersions = await this.getAllVersions();
    
    let totalSize = 0;
    for (const version of allVersions) {
      totalSize += JSON.stringify(version).length;
    }

    return {
      totalVersions: allVersions.length,
      totalSize,
      lastVersionId: allVersions.length > 0 ? allVersions[allVersions.length - 1].versionId : null,
      createdAt: allVersions.length > 0 ? allVersions[0].timestamp : null
    };
  }

  // ========== 專案管理相關方法 (v3 新增) ==========

  /**
   * 保存專案記錄
   */
  async saveProject(projectRecord) {
    if (!this.db) throw new Error('數據庫未初始化');

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('projects', 'readwrite');
      const store = tx.objectStore('projects');
      const request = store.add(projectRecord);

      request.onsuccess = () => resolve(projectRecord);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 獲取專案記錄
   */
  async getProject(projectId) {
    if (!this.db) throw new Error('數據庫未初始化');

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('projects', 'readonly');
      const store = tx.objectStore('projects');
      const request = store.get(projectId);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 獲取所有專案
   */
  async getAllProjects() {
    if (!this.db) throw new Error('數據庫未初始化');

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('projects', 'readonly');
      const store = tx.objectStore('projects');
      const request = store.getAll();

      request.onsuccess = () => {
        const projects = request.result;
        projects.sort((a, b) => a.createdAt - b.createdAt);
        resolve(projects);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 更新專案記錄
   */
  async updateProject(projectId, updates) {
    const project = await this.getProject(projectId);
    if (!project) throw new Error('專案不存在');

    Object.assign(project, updates, { updatedAt: Date.now() });

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('projects', 'readwrite');
      const store = tx.objectStore('projects');
      const request = store.put(project);

      request.onsuccess = () => resolve(project);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 刪除專案及其所有版本
   */
  async deleteProject(projectId) {
    if (!this.db) throw new Error('數據庫未初始化');

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['projects', 'sqlScripts', 'versions', 'tags', 'comments'], 'readwrite');
      
      // 刪除專案
      tx.objectStore('projects').delete(projectId);

      // 刪除該專案的 SQL 腳本
      const scriptStore = tx.objectStore('sqlScripts');
      const scriptIndex = scriptStore.index('projectId');
      scriptIndex.openCursor(IDBKeyRange.only(projectId)).onsuccess = (scriptEvent) => {
        const scriptCursor = scriptEvent.target.result;
        if (scriptCursor) {
          scriptCursor.delete();
          scriptCursor.continue();
        }
      };

      // 刪除該專案的所有版本及其相關的標籤和批註
      const versionStore = tx.objectStore('versions');
      const projectIndex = versionStore.index('projectId');
      
      projectIndex.openCursor(IDBKeyRange.only(projectId)).onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          const versionId = cursor.value.versionId;
          cursor.delete();

          // 刪除相關標籤
          const tagStore = tx.objectStore('tags');
          const tagIndex = tagStore.index('versionId');
          tagIndex.openCursor(IDBKeyRange.only(versionId)).onsuccess = (tagEvent) => {
            const tagCursor = tagEvent.target.result;
            if (tagCursor) {
              tagCursor.delete();
              tagCursor.continue();
            }
          };

          // 刪除相關批註
          const commentStore = tx.objectStore('comments');
          const commentIndex = commentStore.index('versionId');
          commentIndex.openCursor(IDBKeyRange.only(versionId)).onsuccess = (commentEvent) => {
            const commentCursor = commentEvent.target.result;
            if (commentCursor) {
              commentCursor.delete();
              commentCursor.continue();
            }
          };

          cursor.continue();
        }
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // ========== SQL 腳本管理相關方法 (v5 新增) ==========

  async saveScript(scriptRecord) {
    if (!this.db) throw new Error('數據庫未初始化');

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('sqlScripts', 'readwrite');
      const request = tx.objectStore('sqlScripts').add(scriptRecord);

      request.onsuccess = () => resolve(scriptRecord);
      request.onerror = () => reject(request.error);
    });
  }

  async putScript(scriptRecord) {
    if (!this.db) throw new Error('數據庫未初始化');

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('sqlScripts', 'readwrite');
      const request = tx.objectStore('sqlScripts').put(scriptRecord);

      request.onsuccess = () => resolve(scriptRecord);
      request.onerror = () => reject(request.error);
    });
  }

  async getScript(scriptId) {
    if (!this.db) throw new Error('數據庫未初始化');

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('sqlScripts', 'readonly');
      const request = tx.objectStore('sqlScripts').get(scriptId);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async getScriptsByProject(projectId) {
    if (!this.db) throw new Error('數據庫未初始化');

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('sqlScripts', 'readonly');
      const index = tx.objectStore('sqlScripts').index('projectId');
      const request = index.getAll(projectId);

      request.onsuccess = () => {
        const scripts = request.result || [];
        scripts.sort((a, b) => a.createdAt - b.createdAt);
        resolve(scripts);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getAllScripts() {
    if (!this.db) throw new Error('數據庫未初始化');

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('sqlScripts', 'readonly');
      const request = tx.objectStore('sqlScripts').getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async updateScript(scriptId, updates) {
    const script = await this.getScript(scriptId);
    if (!script) throw new Error('SQL 腳本不存在');

    Object.assign(script, updates, { updatedAt: Date.now() });
    return await this.putScript(script);
  }

  async deleteScript(scriptId) {
    if (!this.db) throw new Error('數據庫未初始化');

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['sqlScripts', 'versions', 'tags', 'comments'], 'readwrite');

      tx.objectStore('sqlScripts').delete(scriptId);

      const versionStore = tx.objectStore('versions');
      const scriptIndex = versionStore.index('scriptId');
      scriptIndex.openCursor(IDBKeyRange.only(scriptId)).onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          const versionId = cursor.value.versionId;
          cursor.delete();

          const tagIndex = tx.objectStore('tags').index('versionId');
          tagIndex.openCursor(IDBKeyRange.only(versionId)).onsuccess = (tagEvent) => {
            const tagCursor = tagEvent.target.result;
            if (tagCursor) {
              tagCursor.delete();
              tagCursor.continue();
            }
          };

          const commentIndex = tx.objectStore('comments').index('versionId');
          commentIndex.openCursor(IDBKeyRange.only(versionId)).onsuccess = (commentEvent) => {
            const commentCursor = commentEvent.target.result;
            if (commentCursor) {
              commentCursor.delete();
              commentCursor.continue();
            }
          };

          cursor.continue();
        }
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * 獲取指定專案的所有版本
   */
  async getVersionsByProject(projectId) {
    if (!this.db) throw new Error('數據庫未初始化');

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('versions', 'readonly');
      const store = tx.objectStore('versions');
      const index = store.index('projectId');
      const request = index.getAll(projectId);

      request.onsuccess = () => {
        const versions = request.result;
        versions.sort((a, b) => b.timestamp - a.timestamp);
        resolve(versions);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 獲取指定 SQL 腳本的所有版本
   */
  async getVersionsByScript(scriptId) {
    if (!this.db) throw new Error('數據庫未初始化');

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('versions', 'readonly');
      const store = tx.objectStore('versions');
      const index = store.index('scriptId');
      const request = index.getAll(scriptId);

      request.onsuccess = () => {
        const versions = request.result;
        versions.sort((a, b) => b.timestamp - a.timestamp);
        resolve(versions);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 獲取指定 SQL 腳本的最新版本
   */
  async getLatestVersionByScript(scriptId) {
    const versions = await this.getVersionsByScript(scriptId);
    return versions.length > 0 ? versions[0] : null;
  }

  /**
   * 獲取指定專案的最新版本
   */
  async getLatestVersionByProject(projectId) {
    const versions = await this.getVersionsByProject(projectId);
    return versions.length > 0 ? versions[0] : null;
  }

  /**
   * 數據遷移：v2 → v3（添加專案支持）
   */
  async migrateToV3() {
    console.log('開始檢查數據遷移需求...');
    
    // 檢查是否已存在「預設」專案
    const projects = await this.getAllProjects();
    if (projects.length > 0) {
      console.log('✓ 已存在專案記錄，無需遷移');
      return;
    }

    console.log('開始執行 v2 → v3 數據遷移...');

    // 獲取所有版本
    const allVersions = await this.getAllVersions();
    
    if (allVersions.length === 0) {
      console.log('✓ 資料庫為空，創建預設專案');
      const defaultProject = {
        projectId: 'default',
        projectName: '預設',
        rootVersionId: null,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      await this.saveProject(defaultProject);
      return;
    }

    // 找出最早的根版本（parentVersionId === null）
    let rootVersionId = null;
    const oldestVersion = allVersions[allVersions.length - 1];
    if (oldestVersion.parentVersionId === null) {
      rootVersionId = oldestVersion.versionId;
    } else {
      // 找第一個沒有 parentVersionId 的版本
      for (const version of allVersions) {
        if (version.parentVersionId === null) {
          rootVersionId = version.versionId;
          break;
        }
      }
    }

    console.log('根版本 ID:', rootVersionId);

    // 批量更新現有版本，添加 projectId
    const batchSize = 50;
    let updatedCount = 0;

    for (let i = 0; i < allVersions.length; i += batchSize) {
      const batch = allVersions.slice(i, i + batchSize);

      await new Promise((resolve, reject) => {
        const tx = this.db.transaction('versions', 'readwrite');
        const store = tx.objectStore('versions');

        for (const version of batch) {
          // 如果還沒有 projectId，添加它
          if (!version.projectId) {
            version.projectId = 'default';
            store.put(version);
            updatedCount++;
          }
        }

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }

    console.log(`✓ 已遷移 ${updatedCount} 個版本到預設專案`);

    // 建立預設專案記錄
    const defaultProject = {
      projectId: 'default',
      projectName: '預設',
      rootVersionId: rootVersionId,
      createdAt: allVersions[allVersions.length - 1].timestamp,
      updatedAt: Date.now()
    };

    await this.saveProject(defaultProject);
    console.log('✓ 預設專案建立成功');
    console.log('✅ 數據遷移完成');
  }

  /**
   * 數據遷移：v3 → v4（版本內容改為只保存 fullContent）
   */
  async migrateToV4() {
    const migrated = await this.getMetadata('migration_v4_fullContentOnly');
    if (migrated?.value === true) {
      console.log('✓ v4 數據遷移已完成，無需重複執行');
      return;
    }

    console.log('開始執行 v3 → v4 數據遷移...');
    const allVersions = await this.getAllVersions();
    let updatedCount = 0;

    for (const version of allVersions) {
      let shouldUpdate = false;

      if ((version.fullContent === undefined || version.fullContent === null) && version.diffData) {
        try {
          const diffData = typeof version.diffData === 'string'
            ? JSON.parse(version.diffData)
            : version.diffData;
          version.fullContent = this._applyLineDiffs(diffData);
          shouldUpdate = true;
        } catch (error) {
          console.warn(`版本 ${version.versionId} 的 diffData 轉換失敗，將以空內容遷移`, error);
          version.fullContent = '';
          shouldUpdate = true;
        }
      }

      if (version.fullContent === undefined || version.fullContent === null) {
        version.fullContent = '';
        shouldUpdate = true;
      }

      if (!version.contentHash) {
        version.contentHash = await this._computeHash(version.fullContent);
        shouldUpdate = true;
      }

      if (version.diffData !== undefined) {
        delete version.diffData;
        shouldUpdate = true;
      }

      if (version.isDeltaMode !== false) {
        version.isDeltaMode = false;
        shouldUpdate = true;
      }

      if (shouldUpdate) {
        version.updatedAt = Date.now();
        await this._putVersion(version);
        updatedCount++;
      }
    }

    await this.saveMetadata('migration_v4_fullContentOnly', true);
    console.log(`✓ v4 數據遷移完成，更新 ${updatedCount} 個版本`);
  }

  /**
   * 數據遷移：v4 → v5（添加專案內多 SQL 腳本支持）
   */
  async migrateToV5() {
    const migrated = await this.getMetadata('migration_v5_sqlScripts');
    const allVersions = await this.getAllVersions();
    const versionsNeedScriptId = allVersions.some(version => !version.scriptId);
    const existingScripts = await this.getAllScripts();

    if (migrated?.value === true && existingScripts.length > 0 && !versionsNeedScriptId) {
      console.log('✓ v5 數據遷移已完成，無需重複執行');
      return;
    }

    console.log('開始執行 v4 → v5 數據遷移...');
    const projects = await this.getAllProjects();
    let scriptCount = 0;
    let updatedVersionCount = 0;

    for (const project of projects) {
      let scripts = await this.getScriptsByProject(project.projectId);
      let defaultScript = scripts.find(script => script.scriptName === 'main' || script.scriptName === 'main.sql') || scripts[0];

      if (!defaultScript) {
        const projectVersions = allVersions
          .filter(version => version.projectId === project.projectId)
          .sort((a, b) => a.timestamp - b.timestamp);
        const now = Date.now();
        defaultScript = {
          scriptId: `script_${project.projectId}_${now}_${Math.random().toString(36).substr(2, 6)}`,
          projectId: project.projectId,
          scriptName: 'main',
          description: '',
          rootVersionId: project.rootVersionId || projectVersions[0]?.versionId || null,
          createdAt: project.createdAt || projectVersions[0]?.timestamp || now,
          updatedAt: now
        };
        await this.saveScript(defaultScript);
        await this.saveMetadata(`currentScriptId:${project.projectId}`, defaultScript.scriptId);
        scriptCount++;
      }

      for (const version of allVersions) {
        if (version.projectId === project.projectId && !version.scriptId) {
          version.scriptId = defaultScript.scriptId;
          version.updatedAt = Date.now();
          await this._putVersion(version);
          updatedVersionCount++;
        }
      }
    }

    if (projects.length === 0) {
      const now = Date.now();
      const defaultProject = {
        projectId: 'default',
        projectName: '預設',
        rootVersionId: null,
        createdAt: now,
        updatedAt: now
      };
      await this.saveProject(defaultProject);
      const defaultScript = {
        scriptId: `script_default_${now}`,
        projectId: defaultProject.projectId,
        scriptName: 'main',
        description: '',
        rootVersionId: null,
        createdAt: now,
        updatedAt: now
      };
      await this.saveScript(defaultScript);
      await this.saveMetadata('currentProjectId', defaultProject.projectId);
      await this.saveMetadata(`currentScriptId:${defaultProject.projectId}`, defaultScript.scriptId);
      scriptCount++;
    }

    await this.saveMetadata('migration_v5_sqlScripts', true);
    console.log(`✓ v5 數據遷移完成，建立 ${scriptCount} 支 SQL 腳本，更新 ${updatedVersionCount} 個版本`);
  }

  _applyLineDiffs(lineDiffs) {
    if (!Array.isArray(lineDiffs)) return '';

    const result = [];
    for (const [op, content] of lineDiffs) {
      if (op === 0 || op === 1) {
        result.push(content);
      }
    }
    return result.join('\n');
  }

  async _computeHash(content) {
    const encoder = new TextEncoder();
    const data = encoder.encode(content || '');
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);

    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  async _putVersion(versionRecord) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('versions', 'readwrite');
      const request = tx.objectStore('versions').put(versionRecord);

      request.onsuccess = () => resolve(versionRecord);
      request.onerror = () => reject(request.error);
      tx.onerror = () => reject(tx.error);
    });
  }
}

// 導出全局實例
const db = new DatabaseManager();
