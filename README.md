# Discord Component Preview for VS Code

discord.py v2.6+ LayoutView / ComponentV2 のビジュアル開発ツールです。ドラッグ＆ドロップのUI Builder、リアルタイムプレビュー、コード生成、IntelliSense支援を提供します。

![Version](https://img.shields.io/badge/version-0.2.0-blue)
![discord.py](https://img.shields.io/badge/discord.py-v2.6+-green)

## ✨ 主な機能

### 🎨 UI Builder (LayoutView)
ドラッグ＆ドロップでLayoutViewコンポーネントを視覚的に構築できます。

- **対応コンポーネント**：
  - **Layout**: ActionRow, Container, Section
  - **Interactive**: Button, Select, UserSelect, RoleSelect, ChannelSelect
  - **Display**: TextDisplay, Separator, MediaGallery, File, Thumbnail

- **編集機能**：
  - ドラッグ＆ドロップでコンポーネント配置
  - プロパティパネルで詳細設定
  - 階層ツリービューでナビゲーション
  - Undo/Redo (50ステップ履歴)
  - Copy/Cut/Paste (Ctrl+C, X, V)
  - 複製 (Ctrl+D)
  - 上下移動 (Ctrl+↑/↓)

- **プレビュー**：
  - Discordテーマでリアルタイムプレビュー
  - ズーム機能 (50%-200%, Ctrl+Scroll)
  - テーマカスタマイズ (Dark/Light/AMOLED/Discord)
  - インタラクションアニメーション

- **コード生成**：
  - Python構文ハイライト付きプレビュー
  - クリップボードへコピー
  - ファイルへ直接挿入
  - discord.py v2.6互換コード

- **制限チェック**：
  - LayoutView: 最大10個のトップレベルコンポーネント
  - ActionRow: 最大5個のボタン/セレクト
  - Container: 最大10個の子コンポーネント
  - Section: 最大3つのTextDisplay

### 👁️ リアルタイムプレビュー
既存のPythonコードからコンポーネントを自動検出してプレビュー表示します。

- **自動検出**：discord.ui.View, Modal, LayoutView
- **ホットリロード**：コード変更時に自動更新
- **インタラクティブ**：クリックでコード位置へジャンプ
- **統計表示**：コンポーネント数をバッジ表示

### 📝 テンプレート挿入
よく使うパターンをワンクリックで挿入できます。

- **カテゴリ**：Dialogs, Navigation, Selection, Forms, Links, LayoutView
- **LayoutViewテンプレート**：
  - Basic LayoutView with Container
  - Section with Thumbnail
  - Media Gallery View
  - Interactive Dashboard

### 💡 IntelliSense支援
discord.pyコンポーネントの入力補完とシグネチャヘルプを提供します。

- **自動補完**：`discord.ui.`で全コンポーネント候補を表示
- **シグネチャヘルプ**：パラメータ情報をツールチップ表示
- **ドキュメント表示**：各パラメータの説明

### 🔧 Quick Fix (CodeAction)
コードの問題を自動修正する提案を表示します。

- `import discord` の自動追加
- `View` → `LayoutView` への変換
- `custom_id` の自動生成
- `ActionRow` でラップ
- `timeout` パラメータ追加
- `ButtonStyle` enum への変換
- `async` キーワード追加

### 📊 discord.py バージョン検出
現在のPython環境のdiscord.pyバージョンを検出し、機能サポート状況を表示します。

- ステータスバーにバージョン表示
- LayoutViewサポート状況の確認
- バージョンアップグレードのガイド

---

## 📦 コマンド

コマンドパレット (`Ctrl+Shift+P`) から以下のコマンドを実行できます：

| コマンド | 説明 |
|---------|------|
| `Discord: Show Component Preview` | コンポーネントプレビューを表示 |
| `Discord: Open UI Builder (LayoutView)` | UI Builderを開く |
| `Discord: Insert Component Template` | テンプレートを挿入 |
| `Discord: Insert Component Preset` | プリセットを挿入 |
| `Discord: Save Selection as Preset` | 選択範囲をプリセットとして保存 |
| `Discord: Edit Component` | カーソル位置のコンポーネントを編集 |
| `Discord: Refresh Preview` | プレビューを更新 |
| `Discord: Show discord.py Version Info` | バージョン情報を表示 |
| `Discord: Refresh discord.py Version` | バージョン検出を更新 |

---

## ⌨️ キーボードショートカット

### UI Builder内

| ショートカット | 機能 |
|---------------|------|
| `Ctrl+Z` | 元に戻す |
| `Ctrl+Y` / `Ctrl+Shift+Z` | やり直し |
| `Delete` / `Backspace` | 選択コンポーネントを削除 |
| `Ctrl+D` | 選択コンポーネントを複製 |
| `Ctrl+↑` | 上に移動 |
| `Ctrl+↓` | 下に移動 |
| `Ctrl+C` | コピー |
| `Ctrl+X` | カット |
| `Ctrl+V` | ペースト |
| `Escape` | 選択解除 |
| `Ctrl+Scroll` | ズーム |

---

## 🚀 使い方

### UI Builderでの開発

1. コマンドパレットから `Discord: Open UI Builder (LayoutView)` を実行
2. 左パネルからコンポーネントをドラッグ＆ドロップ
3. 右パネルでプロパティを編集
4. 「Generate & Insert」でコードを生成

### 既存コードのプレビュー

1. Pythonファイルを開く
2. コマンドパレットから `Discord: Show Component Preview` を実行
3. プレビューパネルでコンポーネントを確認
4. コンポーネントをクリックしてコード位置へジャンプ

---

## 📋 対応パターン

### デコレータベース
```python
class MyView(discord.ui.View):
    @discord.ui.button(label="Click", style=discord.ButtonStyle.primary)
    async def my_button(self, interaction, button):
        await interaction.response.send_message("Clicked!")
```

### ActionRow変数ベース (LayoutView)
```python
class InfoView(discord.ui.LayoutView):
    row1 = discord.ui.ActionRow()
    
    @row1.button(label='送信', style=discord.ButtonStyle.primary)
    async def submit_callback(self, interaction, button):
        await interaction.response.send_message('送信しました')
```

### Container / Section
```python
class MyLayoutView(discord.ui.LayoutView):
    container = discord.ui.Container(
        discord.ui.TextDisplay("Welcome!"),
        discord.ui.Separator(),
        accent_colour=discord.Colour.blurple()
    )
    
    section = discord.ui.Section(
        discord.ui.TextDisplay("Content here"),
        accessory=discord.ui.Thumbnail(media="https://example.com/image.png")
    )
```

### add_item()
```python
class MyView(discord.ui.View):
    def __init__(self):
        super().__init__()
        self.add_item(discord.ui.Button(label="Dynamic"))
```

---

## ⚙️ 要件

- **VS Code**: 1.80.0以上
- **Python**: 3.8以上
- **discord.py**: 2.6.0以上（LayoutView機能を使用する場合）

---

## 📄 ライセンス

MIT License
