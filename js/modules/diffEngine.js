/**
 * SQL 差異比對引擎（Diff Engine）
 * 基於 Myers 演算法的 diff-match-patch 庫
 */

class SQLDiffEngine {
  constructor() {
    // 檢查 diff_match_patch 是否可用
    if (typeof diff_match_patch === 'undefined') {
      console.error('diff_match_patch 庫未加載！');
      throw new Error('diff_match_patch 庫未加載，請確保 CDN 正確引入');
    }
    
    this.dmp = new diff_match_patch();
    this.dmp.Diff_Timeout = 1.0;  // 1 秒超時
    console.log('✓ SQLDiffEngine 初始化成功');
  }

  /**
   * 規範化 SQL 代碼
   * 目的：減少虛假差異，提高比對準確度
   * 公開方法，供外部使用
   */
  normalizeSql(sql) {
    if (!sql) return '';

    return sql
      // 1. 分行處理
      .split('\n')
      // 2. 去除行首尾空白
      .map(line => line.trim())
      // 3. 去除空行
      .filter(line => line.length > 0)
      // 4. 規範化多個空白為單一空白
      .map(line => line.replace(/\s+/g, ' '))
      // 5. 重新加入換行符
      .join('\n');
  }

  /**
   * 規範化 SQL 代碼（私有方法，內部使用）
   * 目的：減少虛假差異，提高比對準確度
   */
  _normalizeSql(sql) {
    return this.normalizeSql(sql);
  }

  /**
   * 計算兩個 SQL 版本之間的差異
   * @param {string} oldSQL - 舊版本 SQL
   * @param {string} newSQL - 新版本 SQL
   * @returns {object} { lineDiffs, stats }
   */
  computeDiff(oldSQL, newSQL) {
    // 規範化
    const normalizedOld = this._normalizeSql(oldSQL);
    const normalizedNew = this._normalizeSql(newSQL);

    // 執行 Myers diff（返回字符級別的差異）
    const diffs = this.dmp.diff_main(normalizedOld, normalizedNew);

    // 清理差異
    this.dmp.diff_cleanupSemantic(diffs);
    this.dmp.diff_cleanupEfficiency(diffs);

    // 轉換為行級別差異
    const lineDiffs = this._convertToLineDiffs(diffs);

    // 計算統計信息
    const stats = this._calculateStats(lineDiffs);

    return { lineDiffs, stats };
  }

  /**
   * 將字符級差異轉換為行級差異
   * diff 格式：[[操作碼, 內容], ...]
   * 操作碼：-1=刪除, 0=不變, 1=插入
   */
  _convertToLineDiffs(charDiffs) {
    const lineDiffs = [];
    let currentLine = '';
    let currentOp = null;  // 追蹤當前行的操作碼

    for (const [op, text] of charDiffs) {
      const lines = text.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const part = lines[i];

        // 如果操作碼改變，先保存前一行
        if (currentOp !== null && currentOp !== op && currentLine) {
          lineDiffs.push([currentOp, currentLine]);
          currentLine = '';
        }

        currentLine += part;
        currentOp = op;

        // 遇到換行符（除了最後一行），保存當前行
        if (i < lines.length - 1) {
          if (currentLine) {
            lineDiffs.push([op, currentLine]);
          }
          currentLine = '';
          currentOp = null;
        }
      }
    }

    // 保存最後一行
    if (currentLine && currentOp !== null) {
      lineDiffs.push([currentOp, currentLine]);
    }

    return lineDiffs;
  }

  /**
   * 計算統計信息
   */
  _calculateStats(lineDiffs) {
    let linesAdded = 0;
    let linesRemoved = 0;
    let linesUnchanged = 0;

    for (const [op, content] of lineDiffs) {
      if (op === 1) linesAdded++;           // 插入
      else if (op === -1) linesRemoved++;   // 刪除
      else if (op === 0) linesUnchanged++;  // 不變
    }

    return {
      linesAdded,
      linesRemoved,
      linesUnchanged,
      totalLines: linesAdded + linesUnchanged,
      diffSize: JSON.stringify(lineDiffs).length
    };
  }

  /**
   * 應用差異重建版本內容
   * 注意：lineDiffs 實際上已經包含了目標狀態的完整信息
   * 只需要提取操作碼為 0（不變）和 1（插入）的行
   * @param {string} baseSQL - 基礎 SQL 內容（在此實現中不使用）
   * @param {array} lineDiffs - 差異數組
   * @returns {string} 重建後的 SQL
   */
  applyDiff(baseSQL, lineDiffs) {
    const result = [];

    for (const [op, content] of lineDiffs) {
      // op === 0: 不變的行
      // op === 1: 新增的行
      // op === -1: 刪除的行（跳過）
      if (op === 0 || op === 1) {
        result.push(content);
      }
    }

    return result.join('\n');
  }

  /**
   * 計算內容的 SHA-256 哈希
   * 用於驗證版本內容完整性
   */
  async computeHash(content) {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);

    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * 驗證內容哈希
   */
  async verifyHash(content, expectedHash) {
    const actualHash = await this.computeHash(content);
    return actualHash === expectedHash;
  }

  /**
   * 獲取 Diff 的簡易文本摘要
   */
  getDiffSummary(lineDiffs) {
    const stats = this._calculateStats(lineDiffs);
    const added = stats.linesAdded > 0 ? `+${stats.linesAdded}` : '';
    const removed = stats.linesRemoved > 0 ? `-${stats.linesRemoved}` : '';
    
    const parts = [added, removed].filter(p => p);
    return parts.length > 0 ? parts.join(' ') : '無變化';
  }

  /**
   * 壓縮差異數據（用於存儲）
   */
  compressDiffData(lineDiffs) {
    // 簡化：直接返回 JSON 字符串
    // 在實際應用中可以使用 gzip 進行壓縮
    return JSON.stringify(lineDiffs);
  }

  /**
   * 解壓縮差異數據
   */
  decompressDiffData(compressedData) {
    if (typeof compressedData === 'string') {
      return JSON.parse(compressedData);
    }
    return compressedData;
  }

  /**
   * 決策：是否應該創建完整快照
   */
  shouldCreateSnapshot(stats, versionDepth = 1) {
    // 如果差異數據很大（>500KB）
    if (stats.diffSize > 500 * 1024) return true;

    // 如果版本深度超過 10
    if (versionDepth > 10) return true;

    // 如果刪除行數超過 50%
    if (stats.totalLines > 0) {
      const deleteRatio = stats.linesRemoved / stats.totalLines;
      if (deleteRatio > 0.5) return true;
    }

    return false;
  }
}

// 導出全局實例
const diffEngine = new SQLDiffEngine();
