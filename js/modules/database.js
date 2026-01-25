/**
 * IndexedDB 數據庫初始化和操作模組
 */

class DatabaseManager {
  constructor(dbName = 'SQLVersionControl', version = 1) {
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

        request.onsuccess = () => {
          this.db = request.result;
          const dbVersion = this.db.version;
          console.log('✓ 數據庫初始化成功');
          console.log('  - 數據庫名稱:', this.dbName);
          console.log('  - 當前版本:', dbVersion);
          console.log('  - ObjectStores:', Array.from(this.db.objectStoreNames).join(', '));
          resolve(this.db);
        };

        request.onupgradeneeded = (event) => {
          const db = event.target.result;
          const oldVersion = event.oldVersion;
          const newVersion = event.newVersion;
          
          console.log('執行數據庫升級或初始化...');
          console.log('  - 舊版本:', oldVersion);
          console.log('  - 新版本:', newVersion);

          // 1. 創建 versions ObjectStore
          if (!db.objectStoreNames.contains('versions')) {
            const versionStore = db.createObjectStore('versions', 
              { keyPath: 'versionId' }
            );
            versionStore.createIndex('parentId', 'parentVersionId');
            versionStore.createIndex('timestamp', 'timestamp');
            versionStore.createIndex('depth', 'depth');
            versionStore.createIndex('label', 'label', { unique: true });
            console.log('✓ 版本 ObjectStore 創建成功');
          }

          // 2. 創建 tags ObjectStore
          if (!db.objectStoreNames.contains('tags')) {
            const tagStore = db.createObjectStore('tags',
              { keyPath: 'tagId' }
            );
            tagStore.createIndex('versionId', 'versionId');
            tagStore.createIndex('tagName', 'tagName', { unique: true });
            tagStore.createIndex('type', 'type');
            console.log('✓ 標籤 ObjectStore 創建成功');
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
        // 按時間戳排序
        versions.sort((a, b) => a.timestamp - b.timestamp);
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
      request.onerror = () => reject(request.error);
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

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(
        ['versions', 'tags', 'comments', 'metadata'],
        'readwrite'
      );

      tx.objectStore('versions').clear();
      tx.objectStore('tags').clear();
      tx.objectStore('comments').clear();
      tx.objectStore('metadata').clear();

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
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
}

// 導出全局實例
const db = new DatabaseManager();
