# ccundo Turn Features - 對話輪次功能完整操作文檔

## 📖 概述

ccundo 的 Turn 功能讓你可以將 Claude Code 會話中的操作按「問答輪次」分組，並支援整輪撤銷。一個 Turn 代表你提出一個問題，Claude 回答並執行的所有相關操作。

## 🎯 核心概念

### Turn（對話輪次）
- **定義**：一次完整的問答互動中產生的所有操作
- **包含**：檔案建立、編輯、刪除、bash 命令等
- **自動分組**：基於時間間隔智能分組操作
- **描述性摘要**：如「3 file ops + 2 commands」

### Session vs Turn
- **Session**：整次 Claude Code 對話
- **Turn**：Session 中的一個問答輪次
- **Operation**：單一檔案或命令操作

## 🚀 功能列表

### 基本命令

| 命令 | 功能 | 說明 |
|------|------|------|
| `ccundo turns` | 列出所有對話輪次 | 顯示已分組的輪次 |
| `ccundo turns --auto-group` | 自動分組操作 | 將操作智能分組為輪次 |
| `ccundo preview-turn` | 預覽輪次撤銷效果 | 顯示撤銷前的詳細預覽 |
| `ccundo undo-turn` | 撤銷整個輪次 | 交互式選擇並撤銷 |
| `ccundo group-turns` | 手動分組 | 自定義分組參數 |

## 📋 詳細操作指南

### 1. 檢查當前狀態

```bash
# 查看所有操作
ccundo list

# 查看輪次狀態（可能顯示未分組）
ccundo turns
```

**預期輸出**：
```
Conversation Turns:

1. UNGROUPED - 48 operations
   Description: Ungrouped operations

Total: 1 groups, 48 operations
```

### 2. 自動分組操作為輪次

```bash
# 使用預設 5 分鐘間隔分組
ccundo turns --auto-group

# 使用自定義時間間隔（10 分鐘）
ccundo turns --auto-group --gap 10
```

**預期輸出**：
```
Auto-grouping operations into turns...
✅ Created 6 turns from 48 operations
```

### 3. 查看分組結果

```bash
ccundo turns
```

**預期輸出**：
```
Conversation Turns:

1. TURN - 2h ago (45s)
   ID: a1b2c3d4-e5f6-7890-abcd-ef1234567890
   Description: 2 file ops + 3 commands
   Operations: 5
   Range: 2h ago → 2h ago

2. TURN - 1h ago (120s)
   ID: b2c3d4e5-f6g7-8901-bcde-f23456789012
   Description: Created 3 files
   Operations: 3
   Range: 1h ago → 1h ago

3. UNGROUPED - 2 operations
   Description: Ungrouped operations

Total: 3 groups, 48 operations
```

### 4. 預覽輪次撤銷效果

在實際撤銷前，建議先預覽會發生什麼變更：

```bash
# 交互式選擇輪次並預覽
ccundo preview-turn

# 預覽特定輪次
ccundo preview-turn a1b2c3d4-e5f6-7890-abcd-ef1234567890

# 顯示詳細差異預覽
ccundo preview-turn --detailed
```

**預期輸出**：
```
🔍 Generating turn preview...

📋 Turn Preview: 2 file ops + 3 commands
   Time: 8/29/2025, 5:35:49 PM
   Duration: 45s
   Operations: 5 total, 4 can undo
   ⚠️  1 operations have warnings

📝 Operations to be undone:

1. ✅ file_create - 2h ago
   ID: toolu_01ABC123
   Preview: Will delete file: /path/to/newfile.js
   ... (15 more lines, use --detailed for full preview)

2. ✅ file_edit - 2h ago
   ID: toolu_01DEF456
   Preview: Will revert file: /path/to/existing.js
   
3. ❌ bash_command - 2h ago
   ID: toolu_01GHI789
   ⚠️  Warning: Cannot auto-undo bash command
   Preview: Cannot auto-undo bash command: npm install package

📊 Summary:
   • 4 operations can be undone automatically
   • 1 operations require manual intervention
   • 1 operations have warnings

🎯 Next steps:
   • To proceed: ccundo undo-turn a1b2c3d4-e5f6-7890-abcd-ef1234567890
   • To proceed without confirmation: ccundo undo-turn --yes a1b2c3d4-e5f6-7890-abcd-ef1234567890
   • To see all turns: ccundo turns
```

### 5. 撤銷整個對話輪次

#### 5.1 交互式選擇

```bash
ccundo undo-turn
```

**預期流程**：
```
? Select turn to undo:
❯ 2 file ops + 3 commands - 2h ago (5 ops)
  Created 3 files - 1h ago (3 ops)
```

#### 5.2 指定輪次 ID

```bash
ccundo undo-turn a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

#### 5.3 跳過確認

```bash
ccundo undo-turn --yes
```

### 6. 撤銷過程詳情

**確認提示**：
```
This will undo the entire turn:

Description: 2 file ops + 3 commands
Operations: 5
Time: 8/29/2025, 5:35:49 PM

  1. file_create - 2h ago
  2. file_edit - 2h ago
  3. bash_command - 2h ago
  4. bash_command - 2h ago
  5. file_delete - 2h ago

? Are you sure you want to undo this entire turn? (y/N)
```

**執行過程**：
```
🔄 Undoing turn: 2 file ops + 3 commands
   Operations: 5
   Time: 8/29/2025, 5:35:49 PM

   ✅ File deleted: /path/to/file.js
      Backup: ~/.ccundo/backups/toolu_01ABC123-deleted
   ✅ File edit reverted: /path/to/another.js
      Backup: ~/.ccundo/backups/toolu_01DEF456-current
   ❌ Cannot auto-undo bash command: npm install package
      Please manually revert any changes.
   ✅ File edit reverted: /path/to/config.json
   ✅ File recreated: /path/to/deleted.txt

✅ Turn undo completed: 4 successful, 1 failed
```

## 🔧 高級功能

### 自定義分組參數

```bash
# 使用更大的時間間隔（30 分鐘）
ccundo group-turns --gap 30

# 清除現有分組後重新分組
ccundo group-turns --clear --gap 10
```

### 查看特定輪次詳情

透過 `ccundo turns` 輸出的 Turn ID，可以：

1. **記錄重要輪次**：保存輪次 ID 供日後參考
2. **精確撤銷**：使用 ID 直接撤銷特定輪次
3. **腳本化操作**：在自動化腳本中使用

## 📊 使用場景

### 場景 1：開發新功能時撤銷

```bash
# 1. 開發了一個新功能，包含多個檔案
# 你問：「幫我實作用戶登入功能」
# Claude 創建了：LoginForm.js, AuthService.js, 修改了 App.js

# 2. 發現問題，想撤銷整個功能
ccundo turns --auto-group
ccundo preview-turn  # 先預覽會撤銷什麼
ccundo undo-turn     # 選擇 "2 file ops + 1 command" 輪次
```

### 場景 2：實驗性修改的快速回滾

```bash
# 1. 嘗試了一些實驗性修改
# 你問：「試試看用 TypeScript 重寫這個檔案」
# Claude 修改了多個檔案的語法

# 2. 決定不採用，先預覽再回滾
ccundo turns --auto-group
ccundo preview-turn --detailed  # 詳細查看會撤銷的內容
ccundo undo-turn --yes          # 撤銷最新的輪次
```

### 場景 3：多步驟任務的部分撤銷

```bash
# 1. 一個複雜的重構任務
# 你問：「重構這個專案的架構」
# Claude 執行了多個步驟

# 2. 只想撤銷某個特定步驟
ccundo turns --auto-group
ccundo turns                         # 查看所有輪次
ccundo preview-turn <specific-turn-id>  # 預覽特定輪次的變更
ccundo undo-turn <specific-turn-id>     # 撤銷特定輪次
```

## 🛡️ 安全特性

### 備份機制

- **自動備份**：每次撤銷前都會建立備份
- **備份位置**：`~/.ccundo/backups/`
- **備份命名**：`操作ID-backup類型`
- **備份類型**：`current`（當前內容）、`deleted`（已刪檔案）、`redo`（重做備份）

### 確認機制

- **預設確認**：所有撤銷操作都需要確認
- **預覽功能**：顯示將要撤銷的操作列表
- **跳過選項**：`--yes` 參數可跳過確認

### 狀態追蹤

- **操作狀態**：追蹤每個操作的撤銷狀態
- **輪次完整性**：確保輪次內操作的一致性
- **錯誤處理**：對無法撤銷的操作（如 bash 命令）提供明確提示

## 📁 設定檔案

### 輪次資料存放

```
~/.ccundo/
├── turns.json              # 輪次分組資料
├── config.json             # 語言和其他設定
├── undone-operations.json  # 已撤銷操作記錄
└── backups/                # 備份檔案目錄
    ├── toolu_01ABC123-current
    ├── toolu_01DEF456-deleted
    └── toolu_01GHI789-redo
```

### turns.json 結構

```json
{
  "turns": [
    {
      "id": "turn_1693834549123-456789",
      "timestamp": "2025-08-29T12:35:49.123Z",
      "description": "2 file ops + 3 commands",
      "operations": ["toolu_01ABC123", "toolu_01DEF456"],
      "startTime": "2025-08-29T12:35:49.000Z",
      "endTime": "2025-08-29T12:36:34.000Z",
      "completed": true
    }
  ]
}
```

## ⚡ 效能考量

### 分組演算法

- **時間複雜度**：O(n log n) - 基於操作排序
- **記憶體使用**：最小化，只保存必要的 ID 引用
- **檔案 I/O**：批次處理，減少磁碟操作

### 建議使用方式

- **定期分組**：建議在每次重要開發階段後執行分組
- **適當間隔**：根據你的工作習慣調整時間間隔（5-30 分鐘）
- **預覽優先**：撤銷前總是先使用 `preview-turn` 查看會發生什麼
- **清理策略**：定期清理舊的輪次資料和備份檔案

## 🐛 疑難排解

### 常見問題

#### Q: Turn 命令無法使用
```bash
# 確認是否有語法錯誤
node bin/ccundo.js --help

# 檢查是否有 Turn 相關命令
node bin/ccundo.js turns --help
```

#### Q: 自動分組沒有效果
```bash
# 檢查操作數量
ccundo list

# 嘗試較小的時間間隔
ccundo turns --auto-group --gap 1
```

#### Q: 撤銷失敗
```bash
# 檢查檔案權限
ls -la /path/to/file

# 查看詳細錯誤訊息
ccundo undo-turn  # 不使用 --yes 參數
```

#### Q: 備份檔案過多
```bash
# 手動清理舊備份
find ~/.ccundo/backups -name "*" -mtime +30 -delete

# 或者保留最近 100 個
ls -t ~/.ccundo/backups | tail -n +101 | xargs rm --
```

### 日誌和除錯

```bash
# 查看詳細操作記錄
ccundo list --all

# 檢查輪次分組狀態
cat ~/.ccundo/turns.json | jq '.'

# 驗證備份完整性
ls -la ~/.ccundo/backups/
```

## 🔄 最佳實踐

### 工作流程建議

1. **開始新任務前**：檢查當前狀態 `ccundo list`
2. **完成階段性工作後**：分組操作 `ccundo turns --auto-group`
3. **實驗性修改前**：記錄當前輪次狀態
4. **發現問題時**：先預覽 `ccundo preview-turn`，再撤銷相關輪次
5. **完成工作後**：確認所有變更無誤

### 分組策略

- **快速開發**：使用 3-5 分鐘間隔
- **仔細開發**：使用 10-15 分鐘間隔
- **重構工作**：使用 15-30 分鐘間隔

### 命名慣例

雖然系統會自動生成描述，但你可以透過操作模式影響描述：

- 專注單一類型操作會產生如「Created 3 files」
- 混合操作會產生如「2 file ops + 3 commands」
- 保持操作邏輯相關性有助於更好的自動分組

## 🎊 總結

ccundo 的 Turn 功能提供了：

- ✅ **智能分組**：自動將相關操作分組為對話輪次
- ✅ **詳細預覽**：撤銷前完整預覽所有變更內容
- ✅ **整輪撤銷**：一鍵撤銷整個問答的所有操作
- ✅ **安全機制**：完整的備份和確認機制
- ✅ **彈性使用**：支援交互式和命令行模式
- ✅ **效能優化**：高效的分組演算法和儲存機制

這個功能讓你可以更精確地管理 Claude Code 會話中的變更，提供了從單一操作到整個對話輪次的完整撤銷控制。

---

**提示**：開始使用前，建議先在測試專案中熟悉這些命令，確保了解每個功能的行為。