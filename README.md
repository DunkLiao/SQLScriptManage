# SQLScriptManage

SQLScriptManage 是一個純前端、瀏覽器本機執行的 SQL 腳本版本管理工具。它不需要後端服務，資料儲存在目前瀏覽器來源的 IndexedDB 中，適合用來管理 SQL 變更紀錄、比對版本、匯入匯出專案，以及做完整備份與還原。

## 主要功能

- 專案管理：建立、切換、刪除專案；不同專案的版本資料彼此隔離。
- SQL 編輯：使用 Monaco Editor 編輯 SQL，支援行數/字元統計、游標位置、選取字數與主題切換。
- 版本保存：每次保存會記錄標籤、描述、作者、時間、父版本、完整 SQL 內容、差異統計與 SHA-256 hash。
- 差異比對：支援主頁並排比較與獨立差異頁 `diff.html?from=<versionId>&to=<versionId>`。
- 匯入匯出：可匯出單一專案 JSON，匯入時支援衝突偵測、跳過、覆蓋與合併。
- 完整備份/還原：可匯出所有專案、版本、標籤、批註與 metadata；還原時可選擇合併或清空後還原。
- 本機容量顯示：狀態列會顯示目前 origin 的瀏覽器儲存使用量、總配額與百分比。

## 技術概覽

- 架構：原生 HTML、CSS、JavaScript，無框架、無打包流程。
- 儲存：IndexedDB，資料庫名稱為 `SQLVersionControl`，目前 schema version 為 `4`。
- 編輯器：Monaco Editor，從 CDN 載入。
- 差異引擎：diff-match-patch，使用行級 diff。
- SQL 格式化：sql-formatter，從 CDN 載入。
- 檔案處理：使用瀏覽器 File、Blob、Object URL API 完成匯入與下載。

## 專案結構

```text
.
├── index.html                 # 主應用入口
├── diff.html                  # 獨立差異檢視頁
├── css/
│   ├── styles.css             # 主頁樣式
│   └── diff.css               # diff 頁樣式
├── js/
│   ├── app.js                 # 應用初始化、UI 事件、Monaco 與流程協調
│   ├── diffPage.js            # diff.html 行為
│   └── modules/
│       ├── database.js        # IndexedDB schema、CRUD、遷移
│       ├── diffEngine.js      # SQL normalize、hash、line diff
│       ├── importExport.js    # 匯出、匯入、完整備份/還原
│       ├── projectManager.js  # 專案建立、切換、刪除
│       └── versionManager.js  # 版本保存、讀取、比較、標籤與批註
└── img/
    └── logo.png
```

## 執行方式

這個專案沒有 `package.json` 或建置命令。建議用本機靜態伺服器開啟，避免 `file://` 對 IndexedDB、CDN 腳本或瀏覽器安全策略造成不一致行為。

```bash
python -m http.server 8000
```

或：

```bash
npx serve .
```

啟動後開啟：

```text
http://127.0.0.1:8000/
```

獨立差異頁需先在同一個瀏覽器來源下有版本資料，再透過主頁開啟，或手動造訪：

```text
http://127.0.0.1:8000/diff.html?from=<versionId>&to=<versionId>
```

## 使用流程

1. 開啟主頁後，系統會初始化 IndexedDB 並建立預設專案。
2. 在「專案」下拉選單切換專案，或按「新建」建立新專案。
3. 在 SQL 編輯器輸入內容，必要時按「格式化」整理 SQL。
4. 按「保存版本」，填入版本標籤與作者；描述可選。
5. 在右側版本列表選擇版本，可載入內容與查看版本詳情。
6. 按「比較模式」可在主頁並排選擇兩個版本比較。
7. 「更多 → 差異比對」可用對話框選擇版本並開啟獨立 diff 頁。
8. 「導出」可匯出單一專案 JSON；「更多 → 完整備份」可匯出整個資料庫。
9. 「導入」與「完整還原」可從 JSON 檔恢復資料，遇到衝突時依策略處理。

## 資料模型與儲存策略

IndexedDB 主要 object stores：

- `projects`：專案資料，包含 `projectId`、`projectName`、`rootVersionId`。
- `versions`：版本資料，包含 `versionId`、`projectId`、`parentVersionId`、`fullContent`、`contentHash`、`stats`。
- `tags`：版本標籤，使用 `versionId_tagName` 複合索引避免同版本重複標籤。
- `comments`：版本批註，保留 `versionId`、狀態與行號等資訊。
- `metadata`：目前專案、最後作者、最後版本與統計資訊等應用狀態。

版本內容策略：

- v4 起以 `fullContent` 作為正式內容來源，不再以 delta 作為重建依據。
- 保存前會正規化換行與行尾空白，避免無意義差異。
- 每個版本保存 SHA-256 `contentHash`，讀取內容時會驗證完整性。
- `stats` 保存新增、刪除、不變行數與 diff 大小，用於列表與比對摘要。

## 匯出與還原

- 單專案匯出：產生 `formatVersion: "1.0"` 的 JSON，包含版本資料，可選標籤與批註。
- 完整備份：產生 `formatVersion: "2.0"` 且 `exportType: "full"` 的 JSON，包含所有專案與 metadata。
- 選擇性匯出：模組支援依專案、版本或時間範圍篩選；目前主要 UI 使用單專案匯出與完整備份。
- 匯入衝突：版本 ID 已存在時，可跳過、覆蓋或合併為新版本。
- 完整還原：可保留現有資料合併，也可勾選清空現有資料後還原；清空操作不可復原。

## 狀態列與容量資訊

主頁底部狀態列顯示：

- SQL 語言與 UTF-8 編碼。
- 目前瀏覽器儲存使用量、總容量與百分比。
- Monaco 編輯器游標位置。
- 目前選取字元數。

容量資訊使用 `navigator.storage.estimate()`，回傳的是目前 origin 的瀏覽器儲存估算值，通常包含 IndexedDB，但不是單一 database 或單一 object store 的精確大小。

## 開發與驗證

目前沒有自動化測試框架。修改後建議用 Chrome 或 Edge 透過本機靜態伺服器手動驗證：

- 首次開啟與重新初始化。
- 建立、切換、刪除專案。
- 保存版本、載入版本、刪除版本。
- SQL 格式化與主題切換。
- 主頁比較模式與 `diff.html` 獨立差異頁。
- 單專案匯出、導入與衝突處理。
- 完整備份、完整還原與清空後還原。
- 狀態列容量顯示是否在資料變更後刷新。

若只做 JavaScript 語法檢查，可執行：

```bash
node --check js/app.js
node --check js/diffPage.js
node --check js/modules/database.js
node --check js/modules/diffEngine.js
node --check js/modules/importExport.js
node --check js/modules/projectManager.js
node --check js/modules/versionManager.js
```

## 注意事項

- 所有資料都存在瀏覽器本機 IndexedDB。清除站點資料、換瀏覽器、換 origin 都會看不到原資料。
- 建議定期使用「完整備份」匯出 JSON，尤其是在清理瀏覽器資料或大量修改前。
- CDN 依賴包含 Monaco Editor、diff-match-patch 與 sql-formatter；離線環境需先調整依賴載入方式。
- IndexedDB 配額由瀏覽器與磁碟空間決定；大型 SQL 專案請定期清理與備份。

## 授權

Copyright (c) 2026 DunkLiao

MIT License
