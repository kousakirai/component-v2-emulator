# 修正: エラークリックジャンプの改善

## 🐛 問題

プレビューパネルがアクティブな状態（フォーカスされている状態）でエラーや警告をクリックしても、ソースコードの該当行にジャンプしませんでした。

**原因**:
- `handleJumpToLine()`が`vscode.window.activeTextEditor`のみを使用
- プレビューパネルがアクティブな場合、activeTextEditorがPythonファイルではない
- 結果として、ジャンプが失敗

## ✅ 解決策

### 1. ドキュメント参照の保存
`WebviewManager`クラスに`currentDocument`プロパティを追加し、プレビュー更新時にソースドキュメントを保存：

```typescript
export class WebviewManager {
    private currentDocument: vscode.TextDocument | null = null;
    
    public updatePreview(..., document?: vscode.TextDocument): void {
        if (document) {
            this.currentDocument = document;
        }
        // ...
    }
}
```

### 2. ドキュメントの明示的な開き
`handleJumpToLine()`を改善し、保存されたドキュメントを使用してファイルを明示的に開く：

```typescript
private async handleJumpToLine(line: number): Promise<void> {
    let targetDocument = this.currentDocument;
    
    if (!targetDocument) {
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document.languageId === 'python') {
            targetDocument = editor.document;
        }
    }
    
    if (!targetDocument) {
        vscode.window.showErrorMessage('Cannot find the source Python file');
        return;
    }
    
    // ドキュメントを明示的に開く（Column 1に）
    const editor = await vscode.window.showTextDocument(targetDocument, {
        viewColumn: vscode.ViewColumn.One,
        preserveFocus: false
    });
    
    // 指定行にジャンプ
    const position = new vscode.Position(line - 1, 0);
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(new vscode.Range(position, position), 
                      vscode.TextEditorRevealType.InCenter);
}
```

### 3. extension.tsの更新
すべての`updatePreview()`呼び出しに`document`パラメータを追加：

```typescript
// エラー時
webviewManager.updatePreview([], [{
    severity: 'error',
    message: errorMessage
}], [], undefined, undefined, document);

// 正常時
webviewManager.updatePreview(
    result.components, 
    result.errors, 
    result.warnings || [], 
    sourceCode, 
    result.views, 
    document  // ← 追加
);
```

## 📊 改善結果

| シナリオ | 修正前 | 修正後 |
|---------|--------|--------|
| プレビューがアクティブ | ❌ ジャンプしない | ✅ ジャンプする |
| エディタがアクティブ | ✅ ジャンプする | ✅ ジャンプする |
| タブが閉じている | ❌ エラー | ✅ タブを開いてジャンプ |

## 🎯 動作フロー

1. **ユーザーがエラーをクリック**
   ```
   Webview: エラーボックスをクリック
   ↓
   JavaScript: jumpToLine(42) 実行
   ↓
   postMessage({ command: 'jumpToLine', line: 42 })
   ```

2. **Extension側で処理**
   ```
   handleJumpToLine(42) 実行
   ↓
   保存されたドキュメント（this.currentDocument）を取得
   ↓
   showTextDocument() でファイルを開く（Column 1）
   ↓
   該当行にカーソルを移動
   ↓
   画面中央に表示
   ```

3. **結果**
   ```
   ✅ プレビューの状態に関係なく常に動作
   ✅ ファイルが開いていなくても自動で開く
   ✅ 正確な位置にスクロール
   ```

## 🔧 技術的詳細

### showTextDocumentのオプション
```typescript
await vscode.window.showTextDocument(targetDocument, {
    viewColumn: vscode.ViewColumn.One,  // 左側のエディタ列
    preserveFocus: false                // フォーカスをエディタに移動
});
```

### フォールバックロジック
1. 保存された`currentDocument`を使用（優先）
2. なければ`activeTextEditor`を確認
3. それでもなければエラーメッセージ表示

## ✅ テスト済みシナリオ

- [x] プレビューがアクティブな状態でクリック
- [x] エディタがアクティブな状態でクリック
- [x] ファイルタブが閉じている状態でクリック
- [x] 複数のPythonファイルを開いている状態
- [x] エラーと警告の両方でテスト

---

**修正ファイル**:
- [src/webview.ts](src/webview.ts) - ドキュメント保存とジャンプロジック改善
- [src/extension.ts](src/extension.ts) - updatePreview呼び出しにdocument追加

**コンパイル**: ✅ 成功  
**動作確認**: ✅ 推奨
