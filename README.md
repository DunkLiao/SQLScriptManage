## SQLScriptManage

一個純前端的 SQL 腳本版本管理工具，透過瀏覽器 IndexedDB 儲存與比對版本，支援專案化管理、差異檢視、匯入匯出與完整備份/還原。無需後端，直接以瀏覽器載入即可使用。

### 功能特色

- 專案化管理：建立/切換/刪除專案，版本彼此隔離。
- 版本控管：儲存版本（快照或差異模式），提供標籤、批註與哈希驗證。
- 差異比對：在主頁並排比對，或開啟獨立差異頁 `diff.html?from=<v1>&to=<v2>` 檢視行級 diff。
- 匯出/匯入：支援單專案匯出、選擇性匯出、多專案導入，檔案具備校驗碼；衝突可選跳過/覆蓋/合併。
- 完整備份/還原：匯出整個資料庫（專案/版本/標籤/批註/元數據），可選清空後還原。
- 編輯器工具：整合 Monaco Editor、SQL 格式化、主題切換、同步捲動與分割視圖。

### 系統概覽

- 架構：純前端（HTML/CSS/JS）+ IndexedDB 儲存，無需伺服器。
- 主要流程：專案切換 → 編輯 SQL → 保存版本（快照/差異）→ 比對 → 匯出/備份 → 還原/導入。
- 依賴：diff-match-patch、Monaco Editor、sql-formatter、原生 IndexedDB API。

### 技術棧

- 前端：原生 HTML/CSS/JavaScript，無框架。
- 編輯器：Monaco Editor（支援多分頁、同步捲動、分割視圖）。
- Diff：diff-match-patch 行級差異與摘要。
- SQL 工具：sql-formatter（格式化），自訂 normalize 邏輯減少虛假差異。
- 儲存：IndexedDB（projects/versions/tags/comments/metadata ObjectStore）。
- 其他：原生 File/Blob API 下載、localStorage 記錄當前專案。

### 核心流程圖（文字版）

```
啟動
   └─ 載入 index.html → init SQLVersionApp
          ├─ 初始化 DatabaseManager（IndexedDB v3）
          ├─ 初始化 ProjectManager（載入/建立專案）
          ├─ 初始化 VersionManager（快照/差異策略）
          ├─ 初始化 ImportExportManager（匯出/導入/備份）
          └─ 綁定 UI/Monaco/事件

日常操作
   ├─ 新建或切換專案
   ├─ 在 Monaco 編輯 SQL
   ├─ 保存版本
   │    ├─ 規範化 SQL + 計算 diff/hash
   │    ├─ 判斷快照/差異儲存
   │    └─ 寫入 versions（含 fullContent + diffData）
   ├─ 比對版本
   │    ├─ 主頁並排比對；或
   │    └─ 開啟 diff.html?from=...&to=...
   ├─ 標籤/批註管理（tags/comments）
   ├─ 匯出
   │    ├─ 單專案 JSON（含校驗碼）
   │    ├─ 選擇性匯出（多專案/時間區間/版本）
   │    └─ 完整備份（含 metadata）
   └─ 導入/還原
          ├─ 校驗 checksum → 檢測衝突（跳過/覆蓋/合併）
          └─ 可指定目標專案或清空後還原
```

### USLA（使用場景與服務層級假設）

- 可用性：依賴瀏覽器資料儲存，不提供雲端同步；資料清除瀏覽器快取即會遺失，建議每日至少一次匯出。
- 啟動時間：在主流桌面瀏覽器載入 index.html，首次初始化預期 < 2 秒（取決於瀏覽器與硬體）。
- 編輯體驗：Monaco Editor 在 5–10k 行 SQL 內應維持流暢；更大檔案建議分段保存。
- 儲存/比對：單次版本保存/比對預期 < 1 秒（常見 1–2k 行 SQL）。
- 儲存上限：受限於 IndexedDB 配額（依瀏覽器/磁碟而異），建議定期完整備份並清理無用專案。
- 相容性：已知支援 Chromium 系列（Chrome/Edge），Safari/Firefox 行為未全面驗證。

### 角色與操作流程（縮略）

1. 作者：撰寫 SQL → 保存版本（標籤/作者/描述）。
2. 審閱者：選取兩版本 → 差異比對 → 透過標籤/批註記錄意見。
3. 管理者：定期匯出單專案或完整備份；需要時執行還原或跨專案導入。

### 版本與儲存策略補充

- 儲存格式：版本同時保存 `fullContent` 與 `diffData`，避免重建鏈過深導致性能問題。
- 快照策略：當 diff 大於 500KB、版本深度 > 10、或刪除占比 > 50% 時強制完整快照。
- 校驗：保存及載入時使用 SHA-256；匯入時以 checksum 驗證檔案。
- 壓縮維護：`compactLinearChain` 可將長鏈檢查點化，降低讀取成本。

### 操作指南（更細步驟）

1. 啟動：以本機靜態伺服器開啟專案根目錄後造訪 `index.html`。
2. 專案：右上專案選擇器切換或「新增專案」建立；刪除需先換到其他專案。
3. 編輯：在 Monaco 編輯區輸入 SQL，必要時點「格式化」整理排版。
4. 保存：點「保存版本」，填標籤/作者/描述；系統自動決策快照/差異並驗證哈希。
5. 比對：勾選兩版本 → 「差異比對」開新頁；或右鍵「與當前版本比較」並排檢視。
6. 標籤/批註：於版本列表或差異頁新增，便於後續搜尋與審閱。
7. 匯出：
   - 「匯出」：單專案 JSON（可含標籤/批註）。
   - 「更多 → 完整備份」：全專案/全版本/標籤/批註/metadata。
   - 「選擇性匯出」：按專案/版本/時間區間篩選。
8. 導入/還原：選檔後檢視衝突，選擇跳過/覆蓋/合併；完整還原可先清空現有資料。

### 風險與建議

- 本地儲存風險：瀏覽器清除站點資料將失去所有內容，請建立備份習慣（至少每日）。
- 瀏覽器配額：大型專案可能碰到 IndexedDB 配額限制，建議分專案管理並定期匯出。
- 跨裝置：無內建同步，跨裝置需透過匯出/導入或完整備份檔案搬遷。
- 相容性：若需 Safari/Firefox 支援，請先驗證 IndexedDB 實作行為。

### 模組與檔案

- 主介面與事件協調： [js/app.js](js/app.js) — 初始化依賴、Monaco、UI 事件、版本樹、比對、備份還原、專案選擇器。
- 版本管理： [js/modules/versionManager.js](js/modules/versionManager.js) — 儲存版本（同時存完整內容與差異）、內容重建、搜尋、比對、版本鏈壓縮、標籤與批註。
- 差異引擎： [js/modules/diffEngine.js](js/modules/diffEngine.js) — 基於 diff-match-patch 的行級 diff、哈希、摘要與快照決策。
- 導入導出： [js/modules/importExport.js](js/modules/importExport.js) — 單專案匯出、完整匯出、選擇性匯出、多專案導入與衝突處理。
- 專案管理： [js/modules/projectManager.js](js/modules/projectManager.js) — 專案建立/切換/刪除/改名，維護根版本。
- 資料層（IndexedDB）： [js/modules/database.js](js/modules/database.js) — ObjectStore 建立、CRUD、遷移（v3 新增專案隔離與索引）。
- 獨立差異頁： [js/diffPage.js](js/diffPage.js) — 依 `from`/`to` 參數載入版本、忽略空白/大小寫選項、表格化渲染與匯出。

### 資料儲存與版本策略

- 資料庫：IndexedDB，主要 ObjectStore 包含 `projects`、`versions`、`tags`、`comments`、`metadata`。
- 版本記錄：同時保存完整內容 `fullContent` 及差異 `diffData`，附 SHA-256 `contentHash`。
- 快照決策：依差異大小、版本深度、刪除比例決定是否改用完整快照（避免深鏈重建成本）。
- 校驗：載入時會驗證內容哈希，異常將提示可能損壞。

### 使用方式

1. 準備：使用支援 IndexedDB 的現代瀏覽器（Chrome/Edge）；建議以本機靜態伺服器開啟專案根目錄（避免 `file://` 限制）。
2. 啟動：在瀏覽器開啟 `index.html` 即可使用主介面；需要行級差異時可從主介面開啟或直接造訪 `diff.html?from=<版本ID>&to=<版本ID>`。
3. 快速流程：
   - 建立專案 → 在編輯器輸入 SQL → 按「保存版本」填寫標籤/作者 → 版本出現在列表。
   - 勾選兩版本後點「差異比對」可並排檢視；或在右鍵選單「與當前版本比較」。
   - 透過「匯出」可輸出單專案 JSON；「更多」→「完整備份」匯出全部資料；「完整還原」可從備份重建。

### 匯出/還原重點

- 單專案匯出：產生含校驗碼的 JSON，預設包含標籤與批註，可跨專案導入並指定目標專案。
- 完整備份：包含全部專案/版本/標籤/批註/元數據；還原時可選擇清空現有資料或合併。
- 選擇性匯出：可指定專案、版本或時間區間，並決定是否帶標籤/批註。
- 衝突處理：導入時若版本 ID 已存在，可選擇跳過、覆蓋或合併，並提供校驗碼驗證。

### 注意事項

- 所有資料儲存在瀏覽器 IndexedDB，清除站點資料會移除所有版本與專案。
- 不同瀏覽器或不同來源 (origin) 的資料彼此隔離；更換瀏覽器視為新環境。
- 建議定期匯出或完整備份以防瀏覽器資料被清除。

### 版權與授權

- 版權所有 © 2026 DunkLiao。
- 授權條款：MIT License。
