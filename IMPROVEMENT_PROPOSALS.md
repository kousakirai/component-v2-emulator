# Discord Component Preview - 改善提案書

## 📋 目次
1. [パフォーマンス最適化](#1-パフォーマンス最適化)
2. [ユーザビリティ向上](#2-ユーザビリティ向上)
3. [機能拡張](#3-機能拡張)
4. [エラーハンドリング強化](#4-エラーハンドリング強化)
5. [コード品質向上](#5-コード品質向上)
6. [ドキュメント改善](#6-ドキュメント改善)

---

## 1. パフォーマンス最適化

### 1.1 Python AST解析のキャッシュ機構
**現状の問題**:
- ファイル変更のたびにPythonプロセスを起動してAST解析を実行
- 大きなファイルで500msのデバウンス後も処理に時間がかかる

**改善案**:
```typescript
// src/parseCache.ts (新規)
interface CacheEntry {
    content: string;
    result: ParseResult;
    timestamp: number;
}

class ParseCache {
    private cache = new Map<string, CacheEntry>();
    private maxAge = 30000; // 30秒

    get(filePath: string, content: string): ParseResult | null {
        const entry = this.cache.get(filePath);
        if (!entry) return null;
        
        // Content changed - invalidate
        if (entry.content !== content) {
            this.cache.delete(filePath);
            return null;
        }
        
        // Expired - invalidate
        if (Date.now() - entry.timestamp > this.maxAge) {
            this.cache.delete(filePath);
            return null;
        }
        
        return entry.result;
    }

    set(filePath: string, content: string, result: ParseResult): void {
        this.cache.set(filePath, {
            content,
            result,
            timestamp: Date.now()
        });
    }
}
```

**効果**: 同一ファイルの再解析を50-90%削減

### 1.2 インクリメンタル解析
**改善案**:
- ファイルの変更差分を検出
- 変更された関数/クラスのみを再解析
- 変更されていない部分は既存の結果を再利用

**実装優先度**: 中（大規模プロジェクトで効果大）

### 1.3 Webviewの仮想スクロール
**現状の問題**:
- 100個以上のコンポーネントがあるとDOM要素が重くなる

**改善案**:
```html
<!-- 表示領域外の要素は遅延レンダリング -->
<div class="virtual-scroll-container" style="height: 500px; overflow-y: auto;">
    <!-- 可視領域のみレンダリング -->
</div>
```

**効果**: 大量コンポーネント表示時のメモリ使用量を60-80%削減

---

## 2. ユーザビリティ向上

### 2.1 コンポーネントのライブ編集
**新機能**:
プレビュー上で直接プロパティを編集し、コードに反映

```typescript
// プレビューでラベルをクリック → インライン編集モード
handleLabelEdit(componentId: string, newLabel: string) {
    // 元のコード内のlabel="..."を検索して置換
    const edit = new vscode.WorkspaceEdit();
    // ...コード更新
    await vscode.workspace.applyEdit(edit);
}
```

**効果**: コード↔プレビュー往復の手間を削減

### 2.2 コンポーネントのドラッグ&ドロップ
**新機能**:
プレビュー内でコンポーネントをドラッグして`row`パラメータを変更

```typescript
// ActionRow間でドラッグ&ドロップ
handleDrop(componentId: string, targetRow: number) {
    // row=X パラメータを更新
}
```

### 2.3 カラーピッカーでButtonStyle選択
**改善案**:
GUIビルダーでボタンスタイルを視覚的に選択

```html
<!-- 現在: QuickPickで "primary", "secondary"... -->
<!-- 改善後: カラーパレット -->
<div class="style-picker">
    <div class="style-option primary" data-style="primary">Primary</div>
    <div class="style-option secondary" data-style="secondary">Secondary</div>
    <div class="style-option success" data-style="success">Success</div>
    <div class="style-option danger" data-style="danger">Danger</div>
</div>
```

### 2.4 コンポーネント検索機能
**新機能**:
プロジェクト全体から特定のコンポーネントを検索

```typescript
// コマンド: "Discord: Find Component by Label"
findComponentByLabel(label: string): ComponentLocation[] {
    // 全Pythonファイルをスキャン
    // ラベルが一致するコンポーネントの場所を返す
}
```

### 2.5 エラー箇所へのクイックジャンプ
**改善案**:
検証エラーをクリック → 該当コード行へジャンプ

```typescript
// プレビューのエラーメッセージにリンク追加
<div class="error" onclick="jumpToLine(${error.line})">
    ${error.message}
</div>
```

---

## 3. 機能拡張

### 3.1 スナップショットテスト
**新機能**:
コンポーネント構成を保存して変更を検出

```typescript
// コマンド: "Discord: Create Component Snapshot"
createSnapshot() {
    const snapshot = {
        timestamp: Date.now(),
        components: currentComponents,
        hash: calculateHash(currentComponents)
    };
    fs.writeFileSync('snapshots/components.json', JSON.stringify(snapshot));
}

// コマンド: "Discord: Compare with Snapshot"
compareWithSnapshot() {
    // 差分を表示
}
```

**効果**: リファクタリング時の安全性向上

### 3.2 Discord Botへの直接デプロイ
**新機能**:
プレビューから直接Discord Botにコンポーネントを送信してテスト

```typescript
// 設定でBot Tokenを登録
// コマンド: "Discord: Send to Test Channel"
async sendToDiscord(channelId: string) {
    // Discord APIを使用してメッセージ送信
    const response = await fetch('https://discord.com/api/v10/channels/.../messages', {
        method: 'POST',
        headers: { 'Authorization': `Bot ${token}` },
        body: JSON.stringify({
            content: 'Component Preview',
            components: convertToDiscordFormat(components)
        })
    });
}
```

### 3.3 コンポーネントのバリエーション生成
**新機能**:
1つのコンポーネントから複数のバリエーションを自動生成

```python
# 元のボタン
@ui.button(label="Submit", style=ButtonStyle.primary)

# 生成されるバリエーション:
@ui.button(label="Submit", style=ButtonStyle.secondary)  # 色違い
@ui.button(label="Submit", style=ButtonStyle.primary, disabled=True)  # 無効版
@ui.button(label="Submit", style=ButtonStyle.primary, emoji="✅")  # 絵文字付き
```

### 3.4 国際化対応（i18n）
**新機能**:
ラベルの多言語対応を支援

```python
# labels.json
{
    "submit": {
        "en": "Submit",
        "ja": "送信",
        "es": "Enviar"
    }
}

# 生成されるコード
@ui.button(label=get_label("submit", locale))
```

### 3.5 Viewの継承ツリー可視化
**新機能**:
複雑なView継承関係を図で表示

```
MyBaseView
  ├─ AdminView
  │   ├─ UserManagementView
  │   └─ ServerSettingsView
  └─ MemberView
      └─ ProfileView
```

---

## 4. エラーハンドリング強化

### 4.1 詳細なエラーメッセージ
**現状**:
```
Failed to parse file: Python process exited with code 1
```

**改善後**:
```
Failed to parse file: Python process exited with code 1

Traceback:
  File "buttonParser.py", line 145, in _extract_button_properties
    KeyError: 'label'

Suggestion: Ensure all buttons have a 'label' parameter.
```

### 4.2 リカバリー機能
**新機能**:
解析エラー時も部分的な結果を表示

```typescript
try {
    const result = await parseComponents(filePath);
} catch (error) {
    // 部分的な結果があれば表示
    if (partialResult) {
        return {
            ...partialResult,
            warnings: [{
                severity: 'warning',
                message: `Partial parse only: ${error.message}`
            }]
        };
    }
}
```

### 4.3 Python環境診断ツール
**新機能**:
```typescript
// コマンド: "Discord: Diagnose Python Environment"
async diagnosePythonEnvironment() {
    const checks = [
        { name: 'Python installed', check: () => checkPythonInstalled() },
        { name: 'Python version >= 3.8', check: () => checkPythonVersion() },
        { name: 'discord.py installed', check: () => checkDiscordPyInstalled() },
        { name: 'AST module available', check: () => checkAstModule() }
    ];
    
    // 結果を表示
    showDiagnosticReport(checks);
}
```

---

## 5. コード品質向上

### 5.1 TypeScript型安全性の強化
**改善案**:
```typescript
// 現在: any型が多用されている
const props = component.properties as any;

// 改善後: 厳密な型定義
interface ButtonProperties {
    label?: string;
    style?: ButtonStyle;
    custom_id?: string;
    url?: string;
    disabled?: boolean;
    emoji?: string;
    row?: number;
}

interface SelectMenuProperties {
    placeholder?: string;
    custom_id?: string;
    options?: SelectOption[];
    min_values?: number;
    max_values?: number;
    disabled?: boolean;
    row?: number;
}

type ComponentProperties = ButtonProperties | SelectMenuProperties | TextInputProperties;
```

### 5.2 Python型ヒントの追加
**改善案**:
```python
# buttonParser.py
from typing import List, Dict, Optional, Any, Union

def _extract_button_properties(
    self, 
    call_node: ast.Call, 
    line: Optional[int] = None, 
    callback: Optional[str] = None
) -> None:
    properties: Dict[str, Union[str, int, bool]] = {}
    # ...
```

### 5.3 単体テストの追加
**新規**:
```typescript
// src/test/suite/validator.test.ts
import * as assert from 'assert';
import { validateComponents } from '../../validator';

suite('Validator Test Suite', () => {
    test('Should detect row overflow', () => {
        const components = createMockComponents(6, 0); // 6 components in row 0
        const warnings = validateComponents(components);
        assert.strictEqual(warnings.length, 1);
        assert.strictEqual(warnings[0].code, 'MAX_COMPONENTS_PER_ROW');
    });
    
    test('Should allow 5 components per row', () => {
        const components = createMockComponents(5, 0);
        const warnings = validateComponents(components);
        assert.strictEqual(warnings.length, 0);
    });
});
```

### 5.4 Python単体テストの追加
**新規**:
```python
# src/parsers/test_buttonParser.py
import unittest
from buttonParser import ComponentVisitor

class TestComponentVisitor(unittest.TestCase):
    def test_detect_button_decorator(self):
        code = '''
class MyView(ui.View):
    @ui.button(label="Test")
    async def my_btn(self, inter, button):
        pass
'''
        visitor = ComponentVisitor()
        tree = ast.parse(code)
        visitor.visit(tree)
        
        self.assertEqual(len(visitor.components), 1)
        self.assertEqual(visitor.components[0]['type'], 'button')
        self.assertEqual(visitor.components[0]['properties']['label'], 'Test')
```

### 5.5 継続的インテグレーション（CI）
**新規**:
```yaml
# .github/workflows/ci.yml
name: CI

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - uses: actions/setup-python@v4
        with:
          python-version: '3.10'
      
      - run: npm install
      - run: npm run compile
      - run: npm test
      
      - run: python3 -m pytest src/parsers/
```

---

## 6. ドキュメント改善

### 6.1 インタラクティブチュートリアル
**新機能**:
初回起動時にウォークスルーを表示

```typescript
// コマンド: "Discord: Show Tutorial"
showTutorial() {
    // ステップバイステップのガイド
    // 1. Create a View
    // 2. Add a Button
    // 3. Preview the component
    // 4. Export to JSON
}
```

### 6.2 トラブルシューティングガイド
**追加ドキュメント**:
```markdown
# よくある問題と解決方法

## Q1: プレビューに何も表示されない
- Python環境を確認: `Discord: Diagnose Python Environment`
- ファイルがdiscord.pyのインポートを含んでいるか確認
- 出力パネル（"Discord Component Preview"）でエラーを確認

## Q2: "row=0 overflow"エラーが出る
- `row`パラメータを指定していないコンポーネントも row 0 にカウントされます
- 5個以上のコンポーネントがある場合、`row=1`, `row=2`で分散してください

## Q3: optionsが検出されない
- 変数名を確認（リスト内包表記でも対応）
- 三項演算子も対応済み
- それでも表示されない場合は Issue を報告してください
```

### 6.3 APIリファレンス
**新規ドキュメント**:
```markdown
# API Reference

## Commands

### discord-preview.showPreview
Opens the component preview panel.

**Usage**: Right-click on Python file → "Show Discord Component Preview"

### discord-preview.insertTemplate
Inserts a component template at cursor position.

**Available Categories**:
- Dialogs: Confirmation, Delete Confirmation
- Navigation: Pagination, Page Selector
- Selection: Role Selection, Color Picker
- Forms: Feedback Modal
- Links: Link Button

## Configuration

### discord-preview.pythonPath
Path to Python interpreter.
**Default**: Auto-detect

### discord-preview.debounceDelay
Delay before updating preview after file change (ms).
**Default**: 500

### discord-preview.maxComponents
Maximum components to display in preview.
**Default**: 100
```

### 6.4 ビデオチュートリアル
**推奨**:
- YouTubeまたはGIFアニメーションで基本的な使い方を紹介
- 5分以内の短い動画
- 英語版・日本語版を用意

### 6.5 コントリビューションガイド
**新規ドキュメント**:
```markdown
# Contributing to Discord Component Preview

## Development Setup
1. Clone the repository
2. Run `npm install`
3. Open in VS Code
4. Press F5 to launch Extension Development Host

## Adding a New Component Type
1. Update `types.ts` with new component interface
2. Add detection logic in `buttonParser.py`
3. Update `webview.ts` for rendering
4. Add validation rules in `validator.ts`
5. Write tests
6. Update documentation

## Code Style
- TypeScript: Use ESLint configuration
- Python: Follow PEP 8
- Commit messages: Use conventional commits format
```

---

## 優先順位マトリックス

| 改善項目 | 効果 | 実装コスト | 優先度 |
|---------|------|-----------|--------|
| 1.1 解析キャッシュ | 高 | 低 | ★★★★★ |
| 2.5 エラーへのジャンプ | 高 | 低 | ★★★★★ |
| 4.1 詳細エラーメッセージ | 高 | 低 | ★★★★★ |
| 6.2 トラブルシューティング | 高 | 低 | ★★★★★ |
| 2.1 ライブ編集 | 高 | 中 | ★★★★☆ |
| 3.1 スナップショット | 中 | 低 | ★★★★☆ |
| 5.3 単体テスト | 中 | 中 | ★★★★☆ |
| 2.2 ドラッグ&ドロップ | 中 | 高 | ★★★☆☆ |
| 3.2 Botデプロイ | 中 | 高 | ★★★☆☆ |
| 1.3 仮想スクロール | 低 | 中 | ★★☆☆☆ |
| 3.4 国際化 | 低 | 高 | ★★☆☆☆ |

## 推奨実装順序

### フェーズ1（即座に実装可能）
1. ✅ 解析キャッシュ（1.1）
2. ✅ エラーへのクイックジャンプ（2.5）
3. ✅ 詳細エラーメッセージ（4.1）
4. ✅ トラブルシューティングガイド（6.2）

### フェーズ2（次期バージョン v1.1）
5. コンポーネントのライブ編集（2.1）
6. スナップショットテスト（3.1）
7. 単体テストの追加（5.3）
8. APIリファレンス（6.3）

### フェーズ3（将来のバージョン v2.0）
9. ドラッグ&ドロップ（2.2）
10. Discord Botデプロイ（3.2）
11. 継続的インテグレーション（5.5）
12. ビデオチュートリアル（6.4）

---

## まとめ

この改善提案書では、26項目の改善案を提示しました：

- **パフォーマンス**: 3項目（キャッシュ、インクリメンタル解析、仮想スクロール）
- **ユーザビリティ**: 5項目（ライブ編集、D&D、カラーピッカー、検索、クイックジャンプ）
- **機能拡張**: 5項目（スナップショット、Botデプロイ、バリエーション、i18n、継承ツリー）
- **エラーハンドリング**: 3項目（詳細メッセージ、リカバリー、診断ツール）
- **コード品質**: 5項目（型安全性、Python型ヒント、TS/Pythonテスト、CI）
- **ドキュメント**: 5項目（チュートリアル、トラブルシューティング、API、ビデオ、コントリビューション）

優先度の高い項目から順次実装することで、ユーザー体験とコード品質を大幅に向上できます。
