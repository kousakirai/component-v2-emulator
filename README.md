# Discord Component Preview for VS Code

discord.py ComponentV2 (Buttons, Select Menus, Text Inputs, Modals) のライブプレビューと開発支援を提供するVS Code拡張機能です。

## ✨ 主な機能

### 1. リアルタイムプレビュー
- **ActionRow構造**：Discordの実際のレイアウトに合わせたActionRowごとの表示
- **全コンポーネント対応**：Button、SelectMenu、TextInput、Modal
- **インタラクティブ**：コンポーネントをクリックしてコールバック関数へジャンプ
- **ホットリロード**：コード変更時に自動的にプレビューを更新（500msデバウンス）

### 2. Discord API検証
- **自動検証**：
  - ボタン数上限（25個/メッセージ）
  - ActionRow数上限（5行）
  - 行あたりコンポーネント数（5個まで）
  - ラベル・custom_id・URLの長さ制限
  - リンクボタンのURL必須チェック
- **アクセシビリティチェック**：
  - 絵文字のみのボタン警告
  - 短すぎるラベルの警告

### 3. エラーハイライト
- **インラインエラー表示**：エディタ内で直接エラーと警告を確認
- **DiagnosticCollection統合**：VS Code標準の問題パネルに統合
- **リアルタイム**：入力中にも検証を実行

### 4. View/Modal構造の可視化
- **クラス検出**：discord.ui.Viewまたはdiscord.ui.Modal継承を自動検出
- **コンポーネント数表示**：各Viewに含まれるコンポーネントの数を表示
- **階層構造**：Viewとコンポーネントの関係を視覚化

### 5. コンポーネントテンプレート
- **8つの組み込みテンプレート**：
  - Confirmation Dialog（確認ダイアログ）
  - Pagination Buttons（ページネーション）
  - Role Selection Menu（ロール選択）
  - Feedback Modal（フィードバックフォーム）
  - Link Button（リンクボタン）
  - Page Selector（ページ選択）
  - Color Picker（カラーピッカー）
  - Delete Confirmation（削除確認）
- **カテゴリ分類**：Dialogs、Navigation、Selection、Forms、Links
- **ワンクリック挿入**：カーソル位置に適切なインデントで挿入

### 6. GUIビルダー（コード生成）
- **プレビューから直接追加**：「Add Button」「Add Select Menu」ボタン
- **対話式設定**：ラベル、スタイルなどをQuickPickで選択
- **自動コード生成**：
  - デコレータベースのメソッド生成
  - 適切なインデント
  - コールバック関数のテンプレート

### 7. プロジェクト全体ビュー
- **ワークスペーススキャン**：全Pythonファイルから自動検出
- **統計サマリー**：
  - 総コンポーネント数
  - Views/Modals数
  - ボタン/SelectMenu/TextInput数
- **ファイル別表示**：各ファイルのコンポーネント一覧と統計

### 8. エクスポート機能
- **JSON形式**：Discord Interaction JSON互換フォーマット
- **Markdown形式**：
  - 統計情報
  - Viewリスト
  - コンポーネント表（Button、SelectMenu、TextInput別）
- **ファイル保存**：保存後に即座に開く機能

### 9. テーマ切り替え
- **ダークモード**：Discord公式ダークテーマ
- **ライトモード**：Discord公式ライトテーマ
- **状態保存**：テーマ設定をWebviewの状態として保存
- **スムーズアニメーション**：0.3秒のトランジション

## � 対応コンポーネント定義パターン

この拡張機能は、discord.pyで使用される**あらゆる**コンポーネント定義パターンを検出します：

### ✅ サポート済みパターン（11種類）

#### 1. モジュールレベルのグローバル変数
```python
import discord

global_button = discord.ui.Button(label="Global", custom_id="global_btn")
global_select = discord.ui.Select(placeholder="Global Select")
```

#### 2. デコレータベース（最も一般的）
```python
class MyView(discord.ui.View):
    @discord.ui.button(label="Click", style=discord.ButtonStyle.primary)
    async def my_button(self, interaction, button):
        await interaction.response.send_message("Clicked!")
    
    @ui.button(label="Short", style=ui.ButtonStyle.secondary)  # 短縮形も対応
    async def short_form(self, interaction, button):
        pass
```

#### 3. 変数に対するデコレータ（LayoutView、ActionRowなど）
```python
class InfoView(ui.LayoutView):
    row1 = ui.ActionRow()
    
    @row1.select(
        cls=ui.Select,
        placeholder='選択してください',
        max_values=1
    )
    async def select_callback(self, inter: Interaction, select: ui.Select):
        await inter.response.send_message(f'選択: {select.values[0]}')
    
    @row1.button(label='送信')
    async def submit_callback(self, inter: Interaction, button: ui.Button):
        await inter.response.send_message('送信しました')
```

#### 4. クラス変数（直接インスタンス化）
```python
from discord.ui import Button, Select

class MyView(discord.ui.View):
    my_button = Button(label="Class Variable", style=ButtonStyle.primary)
    my_select = Select(placeholder="Choose one")
```

#### 5. `__init__`メソッド内で`add_item()`
```python
class MyView(discord.ui.View):
    def __init__(self):
        super().__init__()
        self.add_item(Button(label="Dynamic", custom_id="dyn_btn"))
        self.add_item(Select(placeholder="Dynamic Select"))
```

#### 6. 型アノテーション付きクラス変数
```python
class MyView(discord.ui.View):
    annotated_button: Button = Button(label="Annotated", style=ButtonStyle.success)
    annotated_select: Select = Select(placeholder="Annotated Select")
```

#### 7. Modal内のTextInput
```python
class FeedbackModal(discord.ui.Modal):
    name_input = discord.ui.TextInput(label="Name", placeholder="Your name")
    feedback = ui.TextInput(label="Feedback", style=TextStyle.paragraph)  # 短縮形も対応
```

#### 8. 複合パターン（デコレータ + add_item）
```python
class MyView(discord.ui.View):
    @discord.ui.button(label="Decorator", style=ButtonStyle.primary)
    async def decorator_button(self, interaction, button):
        pass
    
    def __init__(self):
        super().__init__()
        self.add_item(Button(label="Added", style=ButtonStyle.secondary))
```

#### 9. リンクボタン
```python
class MyView(discord.ui.View):
    link_button = Button(label="GitHub", url="https://github.com", style=ButtonStyle.link)
```

#### 10. 無効化されたコンポーネント
```python
class MyView(discord.ui.View):
    disabled_btn = Button(label="Disabled", disabled=True)
    
    @discord.ui.button(label="Also Disabled", disabled=True)
    async def disabled_decorator(self, interaction, button):
        pass
```

#### 10. row指定（ActionRow配置）
```python
class MyView(discord.ui.View):
    @discord.ui.button(label="Row 0", row=0)
    async def btn_row0(self, interaction, button):
        pass
    
    @discord.ui.button(label="Row 1", row=1)
    async def btn_row1(self, interaction, button):
        pass
```

### 🔧 インポート形式とオプション定義の柔軟性

#### インポート形式
以下のすべてのインポート形式に対応：
```python
# フル修飾名
discord.ui.Button(...)
discord.ui.Select(...)
discord.ui.TextInput(...)

# 短縮形
ui.Button(...)
ui.Select(...)

# 直接インポート
from discord.ui import Button, Select, TextInput
Button(...)
Select(...)
TextInput(...)

# 変数に対するデコレータ（LayoutView、ActionRowなど）
row1 = ui.ActionRow()
@row1.button(...)
@row1.select(...)
```

#### SelectMenuのoptions定義
SelectOptionsの配列定義パターンをすべてサポート：
```python
# 1. 直接配列
@ui.select(options=[
    SelectOption(label='Option 1', value='1'),
    SelectOption(label='Option 2', value='2')
])

# 2. 変数参照（静的配列）
my_options = [SelectOption(label='A', value='a'), SelectOption(label='B', value='b')]
@ui.select(options=my_options)

# 3. リスト内包表記
hours = [SelectOption(label=f'{i}時間', value=str(i)) for i in range(1, 9)]
@ui.select(options=hours)

# 4. 複雑なリスト内包
colors = ['red', 'blue', 'green']
options = [SelectOption(label=c.capitalize(), value=c, emoji='🎨') for c in colors]
@ui.select(options=options)

# 5. 三項演算子（条件分岐）
admin_opts = [SelectOption(label='Admin', value='admin')]
user_opts = [SelectOption(label='User', value='user')]
options = admin_opts if is_admin else user_opts
@ui.select(options=options)

# 6. 三項演算子（直接配列）
options = [
    SelectOption(label='A', value='a')
] if condition else [
    SelectOption(label='B', value='b')
]
@ui.select(options=options)

# 7. ネストした三項演算子
options = opt1 if level == 1 else opt2 if level == 2 else opt3
@ui.select(options=options)
```

### 🎯 検出技術

- **Python AST解析**：抽象構文木を使用した静的解析
- **変数追跡**：クラス変数・モジュール変数の参照を解決
- **リスト内包表記対応**：動的に生成されるオプション配列を検出
- **三項演算子対応**：条件分岐による配列選択を解決（`options_a if condition else options_b`）
- **ネスト構造対応**：多段階の三項演算子もサポート
- **コンテキスト追跡**：クラス・メソッド・スコープを追跡
- **重複排除**：同一コンポーネントの複数検出を防止
- **柔軟なマッチング**：さまざまな命名規則とスタイルに対応
- **変数デコレータ対応**：`@row1.select`、`@row2.button`などの動的パターンをサポート

## �📦 インストール

1. このリポジトリをクローン
```bash
git clone https://github.com/yourusername/component-v2-emulator.git
cd component-v2-emulator
```

2. 依存関係をインストール
```bash
npm install
```

3. コンパイル
```bash
npm run compile
```

4. VS Codeで開発モードで起動
- F5キーを押して拡張機能開発ホストを起動

## 🚀 使い方

### プレビューを表示
1. discord.pyのPythonファイルを開く
2. 右クリック → 「Show Discord Component Preview」
3. または、コマンドパレット（Ctrl+Shift+P）から「Discord: Show Discord Component Preview」

### テンプレート挿入
1. Pythonファイルでカーソル位置を決定
2. 右クリック → 「Insert Component Template」
3. カテゴリを選択 → テンプレートを選択

### GUIビルダーでコンポーネント追加
1. プレビューを開く
2. 「➕ Add Button」または「➕ Add Select Menu」をクリック
3. 設定を入力
4. 自動的にコードが挿入される

### プロジェクト概要を表示
- コマンドパレット → 「Discord: Show Project Component Overview」
- ワークスペース全体のコンポーネントをスキャン

### エクスポート
1. Pythonファイルを開く
2. 右クリック → 「Export Components」
3. フォーマット（JSON/Markdown）を選択
4. 保存先を指定

## 🛠️ 技術スタック

- **VS Code Extension API 1.80.0+**
- **TypeScript（ES2020、strictモード）**
- **Python AST**：Pythonコードの静的解析
- **Node.js child_process**：Pythonスクリプト実行
- **Webview API**：DiscordライクなUIレンダリング
- **DiagnosticCollection API**：エラー・警告の表示

## 📋 コマンド一覧

| コマンド | 説明 | ショートカット |
|---------|------|---------------|
| discord-preview.showPreview | コンポーネントプレビューを表示 | 右クリックメニュー |
| discord-preview.insertTemplate | テンプレートを挿入 | 右クリックメニュー |
| discord-preview.showProjectOverview | プロジェクト全体の概要を表示 | コマンドパレット |
| discord-preview.exportComponents | コンポーネントをエクスポート | 右クリックメニュー |

## 🔍 検証ルール

### Discord API制限
- ✅ 最大25個のボタン/メッセージ
- ✅ 最大5つのActionRow
- ✅ 1行あたり最大5コンポーネント
- ✅ ラベル最大80文字
- ✅ custom_id最大100文字
- ✅ SelectOption最大25個
- ✅ TextInput長さ制限（min_length/max_length）

### ActionRowの配置ルール
- **デフォルト行**: `row`パラメータを指定しない場合、コンポーネントは自動的に`row=0`に配置されます
- **明示的な行指定**: `row=0`, `row=1`, `row=2`などで配置する行を指定できます
- **重要**: `row`パラメータ未指定と`row=0`は**同じ行（Row 0）**に配置されます
  ```python
  # これらは全てRow 0に配置される（合計3個）
  @ui.button(label='Button 1')  # デフォルト = row 0
  @ui.button(label='Button 2', row=0)  # 明示的にrow 0
  @ui.button(label='Button 3')  # デフォルト = row 0
  ```

### アクセシビリティ
- ⚠️ 絵文字のみのボタン（スクリーンリーダー非対応）
- ⚠️ 3文字未満のラベル（視認性低下）

## 🎯 開発ロードマップ

### ✅ 完成済み（v1.0）
- [x] ActionRow構造の実装
- [x] Discord API検証
- [x] インタラクティブプレビュー
- [x] View/Modal構造の可視化
- [x] ホットリロード
- [x] エラーハイライト
- [x] コンポーネントテンプレート
- [x] GUIビルダー（コード生成）
- [x] プロジェクト全体ビュー
- [x] エクスポート機能
- [x] テーマ切り替え
- [x] アクセシビリティチェック

### 🔮 将来の機能（v2.0+）
- [ ] パフォーマンスプロファイリング
- [ ] 国際化（多言語対応）
- [ ] コラボレーション機能（共有プレビュー）

## 📄 ライセンス

MIT License

---

Made with ❤️ for discord.py developers
