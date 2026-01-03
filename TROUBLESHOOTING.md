# トラブルシューティングガイド

Discord Component Preview拡張機能で問題が発生した場合は、このガイドを参照してください。

## 📋 目次
- [よくある問題](#よくある問題)
- [Python環境の問題](#python環境の問題)
- [コンポーネント検出の問題](#コンポーネント検出の問題)
- [検証エラー](#検証エラー)
- [パフォーマンスの問題](#パフォーマンスの問題)
- [診断方法](#診断方法)

---

## よくある問題

### Q1: プレビューに何も表示されない

**症状**: 
- プレビューパネルは開くが、「No components found」と表示される
- コンポーネントが定義されているのに検出されない

**解決方法**:

1. **Python環境を確認**
   ```bash
   # VS Codeで使用されているPythonバージョンを確認
   Ctrl+Shift+P → "Python: Select Interpreter"
   ```

2. **ファイルがdiscord.pyのインポートを含んでいるか確認**
   ```python
   # 最低限必要なインポート
   import discord
   from discord import ui
   # または
   from discord.ui import View, Button
   ```

3. **出力パネルでエラーを確認**
   - `View` → `Output` → ドロップダウンから "Discord Component Preview" を選択
   - エラーメッセージの詳細を確認

4. **ファイルを保存**
   - 変更が保存されていることを確認（Ctrl+S）
   - 自動保存が有効な場合は数秒待つ

**それでも解決しない場合**:
- VS Codeをリロード: `Ctrl+Shift+P` → "Developer: Reload Window"
- 拡張機能を再インストール

---

### Q2: "row=0 overflow" エラーが出る

**症状**:
```
ERROR: Row 0 (including components without explicit row parameter): 
Too many components (6/5). Maximum 5 components per row.
```

**原因**:
`row`パラメータを指定していないコンポーネントも**row 0**にカウントされます。

**解決方法**:

```python
# ❌ 間違い: 6個すべてがrow 0に配置される
class MyView(ui.View):
    @ui.button(label='Button 1')  # デフォルト = row 0
    async def btn1(self, inter, button): pass
    
    @ui.button(label='Button 2')  # デフォルト = row 0
    async def btn2(self, inter, button): pass
    
    @ui.button(label='Button 3', row=0)  # 明示的にrow 0
    async def btn3(self, inter, button): pass
    
    # ... さらに3個 → 合計6個がrow 0
```

```python
# ✅ 正しい: rowパラメータで分散
class MyView(ui.View):
    @ui.button(label='Button 1', row=0)
    async def btn1(self, inter, button): pass
    
    @ui.button(label='Button 2', row=0)
    async def btn2(self, inter, button): pass
    
    @ui.button(label='Button 3', row=1)  # row 1に配置
    async def btn3(self, inter, button): pass
    
    @ui.button(label='Button 4', row=1)
    async def btn4(self, inter, button): pass
```

**重要**: 
- 最大5個のコンポーネント/行
- `row`未指定 = `row=0`と同じ

---

### Q3: SelectMenuのoptionsが検出されない

**症状**:
- SelectMenuは検出されるが、`options`プロパティが空
- プレビューにoptionsが表示されない

**原因と解決方法**:

#### パターン1: 変数名のタイポ
```python
# ❌ 間違い: 変数名が違う
my_options = [SelectOption(label='A', value='a')]

@ui.select(options=myoptions)  # タイポ: my_optionsではなくmyoptions
async def select(self, inter, select): pass
```

```python
# ✅ 正しい
my_options = [SelectOption(label='A', value='a')]

@ui.select(options=my_options)  # 正しい変数名
async def select(self, inter, select): pass
```

#### パターン2: クラス外で定義した変数
```python
# ❌ 間違い: クラス外で定義（スコープ外）
options_list = [SelectOption(label='A', value='a')]

class MyView(ui.View):
    @ui.select(options=options_list)  # 検出されない
    async def select(self, inter, select): pass
```

```python
# ✅ 正しい: クラス変数として定義
class MyView(ui.View):
    options_list = [SelectOption(label='A', value='a')]
    
    @ui.select(options=options_list)  # 検出される
    async def select(self, inter, select): pass
```

#### パターン3: 関数呼び出しで生成
```python
# ⚠️ 部分的に対応: 関数呼び出しは静的解析では検出困難
def get_options():
    return [SelectOption(label='A', value='a')]

class MyView(ui.View):
    @ui.select(options=get_options())  # 検出されない
    async def select(self, inter, select): pass
```

```python
# ✅ 回避策: クラス変数に代入
class MyView(ui.View):
    options_list = get_options()
    
    @ui.select(options=options_list)  # 検出される
    async def select(self, inter, select): pass
```

**対応済みパターン**:
- ✅ 直接配列: `options=[SelectOption(...), ...]`
- ✅ 変数参照: `options=my_options`
- ✅ リスト内包表記: `options=[SelectOption(...) for i in range()]`
- ✅ 三項演算子: `options=opt1 if condition else opt2`

---

### Q4: Python実行でタイムアウトエラー

**症状**:
```
ERROR: Python script execution timed out after 10 seconds
```

**原因**:
- ファイルが非常に大きい（数千行以上）
- 無限ループやハングするコード
- Python環境の問題

**解決方法**:

1. **ファイルサイズを確認**
   - 1000行以上の場合、複数ファイルに分割を検討
   
2. **構文エラーを確認**
   - Python標準の構文チェック: `python -m py_compile yourfile.py`

3. **Pythonパスを確認**
   ```
   設定 → "Python: Python Path" → 正しいPython実行ファイルのパスを指定
   ```

4. **拡張機能をリロード**
   - `Ctrl+Shift+P` → "Developer: Reload Window"

---

## Python環境の問題

### discord.pyがインストールされていない

**エラーメッセージ**:
```
Import error: No module named 'discord'

Suggestion: Make sure discord.py is installed in your Python environment.
Run: pip install discord.py
```

**解決方法**:

1. **ターミナルでインストール**
   ```bash
   # Python 3の場合
   pip3 install discord.py
   
   # 仮想環境の場合
   source venv/bin/activate  # Linux/Mac
   venv\Scripts\activate     # Windows
   pip install discord.py
   ```

2. **VS Code内でインストール**
   - `Ctrl+Shift+P` → "Python: Create Terminal"
   - ターミナルで `pip install discord.py`

3. **インストール確認**
   ```bash
   python -c "import discord; print(discord.__version__)"
   ```

### Pythonバージョンが古い

**必要バージョン**: Python 3.8以上

**確認方法**:
```bash
python --version
# または
python3 --version
```

**Python 3.8未満の場合**:
1. 最新のPython 3をインストール: https://www.python.org/downloads/
2. VS Codeで新しいPythonインタプリタを選択

---

## コンポーネント検出の問題

### デコレータが検出されない

**対応パターン**:
```python
# ✅ 対応済み
@discord.ui.button(...)
@ui.button(...)
@row1.button(...)  # 変数デコレータ

# ❌ 未対応
@my_custom_decorator
def button(...): pass
```

### クラス変数が検出されない

```python
# ✅ 検出される
class MyView(ui.View):
    my_button = Button(label='Test')  # クラス変数
    
    annotated: Button = Button(label='Test')  # 型アノテーション付き

# ✅ 検出される
class MyView(ui.View):
    def __init__(self):
        super().__init__()
        self.add_item(Button(label='Test'))  # add_item()

# ❌ 検出されない（インスタンス変数）
class MyView(ui.View):
    def __init__(self):
        super().__init__()
        self.my_button = Button(label='Test')  # インスタンス変数は検出不可
```

**回避策**: クラス変数または`add_item()`を使用

---

## 検証エラー

### ボタン数の上限超過

**エラー**:
```
ERROR: Too many buttons: 26/25. Discord allows maximum 25 buttons per message.
```

**解決方法**:
- 25個以下に減らす
- 複数のメッセージに分割
- 一部をSelectMenuに変更

### カスタムIDの長さ超過

**エラー**:
```
ERROR: Custom ID too long: 105/100 characters.
```

**解決方法**:
```python
# ❌ 長すぎる
@ui.button(custom_id='very_long_custom_id_that_exceeds_100_characters_limit_and_causes_error')

# ✅ 短縮
@ui.button(custom_id='short_id_123')
```

### リンクボタンのURL未指定

**エラー**:
```
ERROR: Link button requires URL parameter.
```

**解決方法**:
```python
# ❌ URL未指定
@ui.button(label='Link', style=ButtonStyle.link)

# ✅ URL指定
@ui.button(label='Link', style=ButtonStyle.link, url='https://example.com')
```

---

## パフォーマンスの問題

### プレビュー更新が遅い

**症状**:
- ファイル変更後、プレビュー更新に数秒かかる

**解決方法**:

1. **キャッシュが有効か確認**
   - 拡張機能を再起動するとキャッシュがクリア
   - 通常は2回目以降の解析が高速化（95%以上）

2. **ファイルサイズを確認**
   - 1000行以上の大きなファイルは分割を検討

3. **不要なコンポーネントを削除**
   - 100個以上のコンポーネントがあると描画が遅くなる

### メモリ使用量が多い

**解決方法**:
- VS Codeを定期的に再起動
- 不要な拡張機能を無効化
- キャッシュをクリア: VS Codeリロード

---

## 診断方法

### 1. 出力パネルを確認

1. `View` → `Output`（または `Ctrl+Shift+U`）
2. ドロップダウンメニューから **"Discord Component Preview"** を選択
3. エラーメッセージの詳細を確認

### 2. Python環境を診断（手動）

```bash
# 1. Pythonバージョン確認
python --version

# 2. discord.py確認
python -c "import discord; print(discord.__version__)"

# 3. ASTモジュール確認（標準ライブラリ）
python -c "import ast; print('AST module available')"

# 4. 構文チェック
python -m py_compile your_file.py
```

### 3. 最小限の再現コード

問題が解決しない場合、最小限のコードで再現を試みる:

```python
import discord
from discord import ui

class TestView(ui.View):
    @ui.button(label='Test')
    async def test_button(self, interaction, button):
        await interaction.response.send_message('Test')
```

このコードでプレビューが表示されれば、元のコードに問題がある可能性が高い。

### 4. 拡張機能のログを確認

開発者コンソールでより詳細なログを確認:
1. `Help` → `Toggle Developer Tools`
2. `Console` タブでエラーメッセージを確認

---

## サポート

### Issue報告

問題が解決しない場合は、GitHubでIssueを報告してください:

**必要な情報**:
1. VS Codeバージョン
2. 拡張機能バージョン
3. Pythonバージョン
4. discord.pyバージョン
5. エラーメッセージ全文
6. 最小限の再現コード

**テンプレート**:
```markdown
## 環境
- OS: [Windows/Mac/Linux]
- VS Code: [バージョン]
- Python: [バージョン]
- discord.py: [バージョン]

## 問題の説明
[問題の詳細]

## 再現手順
1. [ステップ1]
2. [ステップ2]
3. [ステップ3]

## 期待される動作
[期待される動作]

## 実際の動作
[実際の動作]

## エラーメッセージ
```
[エラーメッセージをペースト]
```

## スクリーンショット
[あれば添付]
```

---

## よくあるヒント

### 💡 ベストプラクティス

1. **rowパラメータを明示的に指定**
   ```python
   @ui.button(label='Button 1', row=0)
   @ui.button(label='Button 2', row=0)
   @ui.button(label='Button 3', row=1)
   ```

2. **custom_idは短く意味のある名前に**
   ```python
   @ui.button(label='Submit', custom_id='submit_btn')
   ```

3. **optionsは変数に代入してから使用**
   ```python
   class MyView(ui.View):
       options = [SelectOption(label='A', value='a')]
       
       @ui.select(options=options)
       async def select(...): pass
   ```

4. **コンポーネントは25個以下に**
   - 多すぎる場合はSelectMenuやModalで整理

5. **定期的にファイルを保存**
   - 自動保存を有効化: `File > Auto Save`

---

## 関連ドキュメント

- [README.md](README.md) - 基本的な使い方
- [IMPROVEMENT_PROPOSALS.md](IMPROVEMENT_PROPOSALS.md) - 今後の改善計画
- [IMPLEMENTATION_REPORT.md](IMPLEMENTATION_REPORT.md) - 実装済み機能の詳細

---

**最終更新**: 2026年1月4日
