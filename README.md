# SQL 版本控管工具

<div align="center">

📋 **一個輕量級、功能完整的 SQL 腳本版本控制系統**

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.0.0-green.svg)](https://github.com/yourusername/SQLScriptManage)

[功能特性](#功能特性) • [快速開始](#快速開始) • [使用說明](#使用說明) • [技術架構](#技術架構)

</div>

---

## 📖 專案簡介

SQL 版本控管工具是一個基於瀏覽器的 SQL 腳本版本控制系統,提供類似 Git 的版本管理功能,專為資料庫開發人員設計。它允許您追蹤 SQL 腳本的歷史變更、比較不同版本之間的差異,並輕鬆回溯到任何歷史版本。

### ✨ 核心亮點

- 🌐 **純瀏覽器運行** - 無需後端服務器,所有數據本地存儲
- 🔍 **智能差異比對** - 基於 Myers 演算法的高精度差異檢測
- 💾 **混合存儲策略** - 自動優化差異/完整內容存儲模式
- 🏷️ **版本標籤管理** - 支持版本標記、搜索和組織
- 🔐 **數據完整性** - SHA-256 哈希驗證確保數據可靠性

---

## 🎯 功能特性

### 版本管理

- ✅ **新增版本** - 保存 SQL 腳本快照,包含標籤、描述、作者等元數據
- ✅ **版本列表** - 時間線視圖顯示所有歷史版本
- ✅ **版本詳情** - 查看完整的版本信息和統計數據
- ✅ **版本回溯** - 一鍵恢復到任意歷史版本
- ✅ **版本刪除** - 支持刪除不需要的版本記錄

### 差異比對

- 🔍 **行級差異檢測** - 精確識別新增、修改、刪除的代碼行
- 🔍 **雙版本比較** - 選擇任意兩個版本進行對比分析
- 🔍 **差異統計** - 顯示新增/刪除行數統計
- 🔍 **視覺化呈現** - 直觀的差異高亮顯示

### SQL 編輯器

- ✏️ **語法格式化** - 自動格式化 SQL 關鍵字
- ✏️ **實時統計** - 顯示行數、字元數統計
- ✏️ **快速清空** - 一鍵清除編輯器內容

### 導入導出（JSON Only）

- 📤 **導出 JSON** - 匯出完整的元數據、版本、標籤與批註
- 📥 **導入 JSON** - 從 JSON 檔案恢復版本歷史
- 📥 **衝突處理** - 智能檢測並處理導入衝突

### 數據存儲

- 💾 **IndexedDB** - 使用瀏覽器原生數據庫存儲
- 💾 **差異壓縮** - 自動識別適合差異存儲的版本
- 💾 **快照模式** - 重要版本可建立完整快照
- 💾 **數據校驗** - SHA-256 哈希確保數據完整性

---

## 🚀 快速開始

### 系統需求

- 現代瀏覽器 (Chrome 80+, Firefox 75+, Edge 80+, Safari 13+)
- 支持 IndexedDB 和 ES6+ JavaScript
- 網絡連接 (僅首次加載 CDN 資源時需要)

### 安裝步驟

1. **克隆專案**

   ```bash
   git clone https://github.com/DunkLiao/SQLScriptManage.git
   cd SQLScriptManage
   ```

2. **啟動應用**

   直接打開 HTML 檔案

   ```bash
   # 雙擊打開 index.html
   # 或使用瀏覽器打開 file:///path/to/index.html
   ```

3. **開始使用**
   - 在 SQL 編輯器中輸入或貼上 SQL 腳本
   - 點擊「新增版本」保存第一個版本
   - 修改 SQL 內容後再次保存,建立版本歷史

---

## 📚 使用說明

### 基本工作流程

1. **創建第一個版本**

   ```
   1. 在 SQL 編輯器中輸入腳本
   2. 點擊頂部導航欄的「新增版本」按鈕
   3. 填寫版本標籤(如 v1.0.0)和作者信息
   4. 點擊「保存版本」
   ```

2. **修改並保存新版本**

   ```
   1. 在編輯器中修改 SQL 內容
   2. 再次點擊「新增版本」
   3. 輸入新的版本標籤(如 v1.1.0)
   4. 系統自動計算差異並保存
   ```

3. **查看版本歷史**

   ```
   1. 右側版本列表顯示所有歷史版本
   2. 點擊任意版本查看詳細信息
   3. 編輯器自動載入該版本的 SQL 內容
   ```

4. **比較版本差異**
   ```
   1. 點擊「差異比對」按鈕
   2. 選擇要比較的兩個版本
   3. 點擊「執行比對」
   4. 查看差異高亮顯示結果
   ```

### 進階功能

#### 導出版本歷史（JSON）

```
1. 點擊頂部導航欄「導出」按鈕
2. 勾選需要的選項（標籤 / 批註）
3. 點擊「開始導出」下載單一 .json 檔案
```

#### 導入版本歷史（JSON）

```
1. 點擊頂部導航欄「導入」按鈕
2. 選擇 JSON 檔案
3. 系統自動檢測版本衝突
4. 選擇衝突處理策略（跳過 / 覆蓋 / 合併）
5. 確認導入完成
```

#### 版本回溯

```
1. 在版本列表中選擇要回溯的版本
2. 點擊「回溯版本」按鈕
3. 編輯器自動載入該版本的內容
4. 可選擇保存為新版本或直接使用
```

---

## 🏗️ 技術架構

### 專案結構

```
SQLScriptManage/
├── index.html              # 主頁面
├── README.md              # 專案說明文件
├── css/
│   └── styles.css         # 全局樣式表
├── js/
│   ├── app.js             # 主應用控制器
│   └── modules/
│       ├── database.js    # IndexedDB 數據庫管理
│       ├── diffEngine.js  # 差異比對引擎
│       ├── versionManager.js  # 版本管理核心
│       └── importExport.js    # 導入導出功能
└── lib/                   # 第三方庫(目前為空,使用 CDN)
```

### 技術棧

#### 前端技術

- **HTML5** - 語義化標記
- **CSS3** - 響應式設計、Flexbox 布局、CSS 變數
- **JavaScript ES6+** - 模塊化、異步處理、類語法

#### 核心庫

- **diff-match-patch** (1.0.5) - Google 開源的 diff 演算法庫
- **IndexedDB API** - 瀏覽器原生數據庫
- **Web Crypto API** - SHA-256 哈希計算

#### 可選庫

（目前無）

### 架構設計

#### 模塊化設計

```javascript
// 1. 數據庫層 (database.js)
class DatabaseManager {
  - initialize()          // 初始化 IndexedDB
  - saveVersion()         // 保存版本記錄
  - getVersion()          // 獲取版本記錄
  - getAllVersions()      // 獲取所有版本
  - deleteVersion()       // 刪除版本
  - getVersionChain()     // 獲取版本鏈
}

// 2. 差異引擎 (diffEngine.js)
class SQLDiffEngine {
  - computeDiff()         // 計算差異
  - applyDiff()           // 應用差異重建內容
  - normalizeSql()        // SQL 規範化
  - computeHash()         // 計算 SHA-256 哈希
  - verifyHash()          // 驗證哈希
}

// 3. 版本管理 (versionManager.js)
class VersionManager {
  - saveVersion()         // 保存新版本
  - getVersionContent()   // 獲取版本完整內容
  - compareVersions()     // 比較兩個版本
  - revertToVersion()     // 回溯版本
  - updateVersionLabel()  // 更新版本標籤
}

// 4. 導入導出 (importExport.js)
class ImportExportManager {
  - exportToJSON()        // 導出為 JSON
  - importFromJSON()      // 從 JSON 導入
  - downloadFile()        // 檔案下載
  - _detectConflicts()    // 檢測導入衝突
}

// 5. 應用控制器 (app.js)
class SQLVersionApp {
  - init()                // 初始化應用
  - bindUIEvents()        // 綁定 UI 事件
  - loadVersionTree()     // 加載版本列表
  - selectVersion()       // 選擇版本
  - confirmSaveVersion()  // 確認保存版本
}
```

#### 數據模型

**版本記錄 (Version Record)**

```javascript
{
  versionId: String,         // 版本 ID (v_timestamp_sequence)
  parentVersionId: String,   // 父版本 ID
  timestamp: Number,         // 時間戳
  label: String,             // 版本標籤(唯一)
  description: String,       // 描述
  author: String,            // 作者
  contentHash: String,       // SHA-256 哈希
  isDeltaMode: Boolean,      // 是否使用差異模式
  diffData: Array,           // 差異數據
  fullContent: String,       // 完整內容
  stats: {
    linesAdded: Number,      // 新增行數
    linesRemoved: Number,    // 刪除行數
    linesUnchanged: Number,  // 不變行數
    totalLines: Number,      // 總行數
    diffSize: Number         // 差異數據大小
  },
  tags: Array,               // 標籤列表
  depth: Number,             // 版本深度
  createdAt: Number,         // 創建時間
  updatedAt: Number          // 更新時間
}
```

**差異數據格式**

```javascript
// lineDiffs: Array<[op, content]>
// op: -1=刪除, 0=不變, 1=插入
[
  [0, "SELECT * FROM users"], // 不變
  [-1, "WHERE status = 'active'"], // 刪除
  [1, "WHERE status = 'enabled'"], // 插入
  [0, "ORDER BY created_at DESC"], // 不變
];
```

### 存儲優化策略

#### 混合存儲模式

系統根據差異大小自動選擇存儲策略:

```javascript
// 差異模式:適合小幅修改
if (diffSize < fullContentSize * 0.6) {
  存儲: 差異數據 + 完整內容(驗證用);
  優點: (節省空間, 版本鏈完整);
}

// 快照模式:適合大幅修改
else {
  存儲: 完整內容;
  優點: (快速訪問, 無需重建);
}
```

#### 差異演算法

- **Myers 差異演算法** - O(ND) 時間複雜度,最優化差異序列
- **語義清理** - 減少虛假差異,提高可讀性
- **效率清理** - 優化差異數據結構

---

## 🎨 UI/UX 設計

### 色彩系統

```css
--primary: #9a0036; /* 品牌主色(紅色) */
--primary-light: #eebac0; /* 次要元素(粉紅) */
--primary-dark: #941c61; /* 深色變體(紫紅) */
--accent-gold: #d4a574; /* 強調色(金色) */
--accent-orange: #ff9800; /* 重要資訊(橙色) */
```

### 布局結構

- **響應式設計** - 適配不同屏幕尺寸
- **雙欄布局** - 左側編輯器 + 右側版本列表
- **卡片化設計** - 功能區塊清晰分離
- **模態對話框** - 非侵入式交互

### 交互特性

- **即時反饋** - 操作結果實時顯示
- **視覺引導** - 清晰的按鈕圖標和狀態提示
- **鍵盤支持** - Enter 鍵快速提交
- **錯誤處理** - 友好的錯誤提示信息

---

## 🔒 數據安全

### 數據完整性保障

1. **SHA-256 哈希驗證**
   - 每個版本計算內容哈希
   - 讀取時驗證哈希值
   - 檢測數據損壞

2. **雙重存儲策略**
   - 同時存儲差異和完整內容
   - 差異重建失敗時使用完整內容
   - 提供數據冗餘保護

3. **導入導出校驗**
   - 導出時生成 checksum
   - 導入時驗證 checksum
   - 防止數據傳輸損壞

### 隱私保護

- ✅ 所有數據存儲在本地瀏覽器
- ✅ 不上傳任何數據到服務器
- ✅ 支持離線使用
- ✅ 用戶完全控制數據

---

## 📋 未來規劃

### 即將實現的功能

- [ ] **分支管理** - 支持多分支開發
- [ ] **標籤系統** - 為版本添加自定義標籤
- [ ] **批註功能** - 為特定代碼行添加註解
- [ ] **衝突解決** - 圖形化的合併衝突解決工具
- [ ] **協作功能** - 多人協作和權限管理
- [ ] **SQL 語法高亮** - 集成 CodeMirror 或 Monaco Editor
- [ ] **自動格式化** - 專業的 SQL 格式化工具
- [ ] **歷史圖表** - 可視化版本演進圖
- [ ] **性能優化** - 大型 SQL 文件的虛擬滾動
- [ ] **雲端同步** - 可選的雲端備份功能

### 技術改進計劃

- [ ] TypeScript 重構 - 提供類型安全
- [ ] 單元測試 - Jest/Mocha 測試覆蓋
- [ ] E2E 測試 - Playwright 自動化測試
- [ ] PWA 支持 - 離線可用、可安裝
- [ ] Service Worker - 資源緩存
- [ ] WebAssembly - 性能關鍵路徑優化

---

## 🤝 貢獻指南

歡迎各種形式的貢獻!

### 如何貢獻

1. Fork 本專案
2. 創建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 提交 Pull Request

### 代碼規範

- 使用 ES6+ 語法
- 遵循 JavaScript Standard Style
- 添加必要的註解
- 確保代碼可讀性

### 問題回報

如果發現 bug 或有功能建議,請[提交 Issue](https://github.com/DunkLiao/SQLScriptManage/issues)。

---

## 📄 授權協議

本專案採用 [MIT License](LICENSE) 授權。

---

## 👨‍💻 作者

**您的名字**

- GitHub: [@DunkLiao](https://github.com/DunkLiao)
- Email: your.email@example.com

---

## 🙏 致謝

- [diff-match-patch](https://github.com/google/diff-match-patch) - Google 開源的差異演算法
- [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API) - W3C 標準的瀏覽器數據庫

---

## 📞 支持

如有任何問題或建議,歡迎通過以下方式聯繫:

- 📧 Email: your.email@example.com
- 💬 GitHub Issues: [提交問題](https://github.com/DunkLiao/SQLScriptManage/issues)
- 📖 Wiki: [查看文檔](https://github.com/DunkLiao/SQLScriptManage/wiki)

---

<div align="center">

**如果這個專案對您有幫助,請給個 ⭐️ Star 支持一下!**

Made with ❤️ by [Your Name]

</div>
