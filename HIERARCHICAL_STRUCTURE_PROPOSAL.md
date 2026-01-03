# Discord.py階層構造サポート - 設計提案

## 📋 概要

現在の実装は個別のコンポーネント（Button、SelectMenu等）を表示していますが、discord.pyの実際の階層構造を再現する必要があります。

## 🎯 目的

GUIビルダーとして機能するために、以下の階層構造を正確に再現・表示する：

```
View/Modal
  └── Container/Section
        └── ActionRow
              └── discord.ui.Item (Button, SelectMenu, TextInput等)
```

## 📊 Discord.pyの階層構造

### 1. コンテナ階層

```python
# 最上位: View または Modal
class MyView(discord.ui.View):
    def __init__(self):
        super().__init__()
        
        # Container/Sectionを使用した構造
        container = discord.ui.Container()
        section = discord.ui.Section()
        
        # ActionRowにItemを追加
        row1 = discord.ui.ActionRow()
        row1.append_item(discord.ui.Button(label="Button 1"))
        row1.append_item(discord.ui.Button(label="Button 2"))
        
        # Sectionに追加
        section.add_row(row1)
        container.add_section(section)
        
        # Viewに追加
        self.add_item(container)
```

### 2. 主要なコンテナタイプ

| クラス | 説明 | 用途 |
|--------|------|------|
| `View` | 最上位のUIコンテナ | メッセージに添付されるUI全体 |
| `Modal` | ダイアログフォーム | フォーム入力用のポップアップ |
| `Container` | グループ化コンテナ | 複数のSectionをまとめる |
| `Section` | セクションコンテナ | ActionRowをグループ化 |
| `ActionRow` | 行コンテナ | 最大5個のItemを横並び |

### 3. Itemの種類

| Item | 継承元 | 配置可能な親 |
|------|--------|--------------|
| `Button` | `discord.ui.Item` | ActionRow |
| `SelectMenu` | `discord.ui.Item` | ActionRow |
| `TextInput` | `discord.ui.Item` | ActionRow (Modalのみ) |

## 🔍 現在の実装の問題点

### 問題1: フラットな表示
```typescript
// 現在: ViewとActionRowが別々に表示
<div class="view-structure">View: MyView</div>
<div class="action-row">Row 1: [Button1] [Button2]</div>
<div class="action-row">Row 2: [Button3]</div>
```

実際のdiscord.pyでは、ActionRowはViewの**中**にあるべき。

### 問題2: Container/Section未サポート
- `Container`と`Section`の概念が型定義に存在しない
- Pythonパーサーがこれらを解析できない
- プレビューで表示できない

### 問題3: 階層的な追加メソッド未対応
```python
# これらのパターンが解析されない
view.add_item(container)
container.add_section(section)
section.add_row(action_row)
action_row.append_item(button)
```

## 🎨 改善提案

### フェーズ1: 型定義の拡張 (1-2時間)

```typescript
// types.ts に追加

/**
 * Container types in discord.py UI hierarchy
 */
export type ContainerType = 'container' | 'section';

/**
 * Container component properties
 */
export interface ContainerProperties {
  type: ContainerType;
  children: ComponentData[]; // Nested components
  label?: string; // Section label
}

/**
 * Enhanced ViewStructure with full hierarchy
 */
export interface ViewStructure {
  name: string;
  type: 'View' | 'Modal';
  line: number;
  children: HierarchyNode[]; // Tree structure
  callback?: string;
}

/**
 * Hierarchical node representing any level of UI structure
 */
export interface HierarchyNode {
  nodeType: 'container' | 'section' | 'actionrow' | 'item';
  data: ComponentData | ContainerProperties | ActionRowProperties;
  children?: HierarchyNode[];
  line?: number;
}

/**
 * ActionRow properties with metadata
 */
export interface ActionRowProperties {
  row: number;
  maxItems: number; // Always 5 for Discord
  currentItems: number;
}
```

### フェーズ2: Pythonパーサーの拡張 (3-4時間)

```python
# buttonParser.py に追加

class ComponentVisitor(ast.NodeVisitor):
    def __init__(self):
        # ... existing code ...
        self.hierarchy_stack: List[Dict[str, Any]] = []
        
    def _extract_container(self, node: ast.Call, line: int) -> Dict[str, Any]:
        """Extract Container/Section from AST"""
        return {
            'nodeType': 'container',
            'type': self._get_container_type(node),
            'children': [],
            'line': line
        }
    
    def _build_hierarchy(self, components: List[Dict]) -> List[Dict]:
        """Build hierarchical tree from flat component list"""
        # Group by parent relationships
        # Track add_item, add_section, add_row calls
        # Return tree structure
        pass
    
    def _track_hierarchy_calls(self, node: ast.Call):
        """Track add_item, add_section, add_row method calls"""
        if isinstance(node.func, ast.Attribute):
            method_name = node.func.attr
            if method_name in ['add_item', 'add_section', 'add_row', 'append_item']:
                # Build parent-child relationship
                pass
```

### フェーズ3: Webview階層的プレビュー (4-5時間)

```typescript
// webview.ts に追加

private generateHierarchicalViewHtml(view: ViewStructure): string {
    return `
        <div class="view-hierarchy">
            <div class="view-header">
                📦 ${view.name} (${view.type})
            </div>
            <div class="view-body">
                ${this.renderHierarchyChildren(view.children, 0)}
            </div>
        </div>
    `;
}

private renderHierarchyChildren(
    nodes: HierarchyNode[], 
    depth: number
): string {
    return nodes.map(node => {
        const indent = depth * 20;
        
        switch (node.nodeType) {
            case 'container':
                return this.renderContainer(node, indent);
            case 'section':
                return this.renderSection(node, indent);
            case 'actionrow':
                return this.renderActionRow(node, indent);
            case 'item':
                return this.renderItem(node, indent);
        }
    }).join('');
}

private renderContainer(node: HierarchyNode, indent: number): string {
    return `
        <div class="hierarchy-container" style="margin-left: ${indent}px">
            <div class="container-header">
                📦 Container
            </div>
            <div class="container-body">
                ${this.renderHierarchyChildren(node.children || [], depth + 1)}
            </div>
        </div>
    `;
}
```

### フェーズ4: GUIビルダー機能 (8-10時間)

#### 4.1 ドラッグ&ドロップによる階層構築

```typescript
// Drag and drop API
interface DragDropContext {
    sourceNode: HierarchyNode;
    targetNode: HierarchyNode;
    operation: 'move' | 'copy';
}

// Validation rules
function canDropInto(parent: HierarchyNode, child: HierarchyNode): boolean {
    const rules = {
        'view': ['container', 'section', 'actionrow'],
        'container': ['section'],
        'section': ['actionrow'],
        'actionrow': ['item'],
        'item': [] // Leaf node
    };
    
    return rules[parent.nodeType].includes(child.nodeType);
}
```

#### 4.2 ビジュアルエディタ

```html
<!-- 階層エディタUI -->
<div class="hierarchy-editor">
    <div class="palette">
        <h3>Components</h3>
        <div draggable="true" data-type="button">➕ Button</div>
        <div draggable="true" data-type="select">📋 Select Menu</div>
        <div draggable="true" data-type="actionrow">📊 Action Row</div>
        <div draggable="true" data-type="section">📦 Section</div>
    </div>
    
    <div class="canvas">
        <div class="view-container" data-droppable="true">
            <!-- Hierarchical tree view -->
        </div>
    </div>
    
    <div class="properties-panel">
        <h3>Properties</h3>
        <!-- Selected component properties -->
    </div>
</div>
```

#### 4.3 コード生成

```typescript
function generatePythonCode(hierarchy: ViewStructure): string {
    return `
class ${hierarchy.name}(discord.ui.${hierarchy.type}):
    def __init__(self):
        super().__init__()
        ${generateInitBody(hierarchy.children)}
${generateCallbacks(hierarchy)}
`;
}

function generateInitBody(nodes: HierarchyNode[], indent = 2): string {
    return nodes.map(node => {
        const spaces = ' '.repeat(indent * 4);
        
        switch (node.nodeType) {
            case 'container':
                return `${spaces}container = discord.ui.Container()
${generateInitBody(node.children, indent + 1)}
${spaces}self.add_item(container)`;
                
            case 'actionrow':
                return `${spaces}row = discord.ui.ActionRow()
${generateRowItems(node.children, indent + 1)}`;
                
            case 'item':
                return generateItemCode(node, indent);
        }
    }).join('\n');
}
```

## 📈 実装スケジュール

| フェーズ | 工数 | 優先度 | 依存関係 |
|---------|------|--------|----------|
| フェーズ1: 型定義拡張 | 1-2h | 🔴 高 | なし |
| フェーズ2: パーサー拡張 | 3-4h | 🔴 高 | フェーズ1 |
| フェーズ3: 階層的プレビュー | 4-5h | 🟠 中 | フェーズ2 |
| フェーズ4: GUIビルダー | 8-10h | 🟢 低 | フェーズ3 |

**総工数: 16-21時間**

## ✅ 検証方法

### テストケース1: 単純な階層
```python
class SimpleView(discord.ui.View):
    def __init__(self):
        super().__init__()
        row = discord.ui.ActionRow()
        row.append_item(discord.ui.Button(label="Click"))
        self.add_item(row)
```

期待結果:
```
View: SimpleView
  └── ActionRow (Row 0)
        └── Button: "Click"
```

### テストケース2: Container/Section使用
```python
class ComplexView(discord.ui.View):
    def __init__(self):
        super().__init__()
        container = discord.ui.Container()
        section = discord.ui.Section(label="Main Section")
        
        row1 = discord.ui.ActionRow()
        row1.append_item(discord.ui.Button(label="Button 1"))
        row1.append_item(discord.ui.Button(label="Button 2"))
        
        section.add_row(row1)
        container.add_section(section)
        self.add_item(container)
```

期待結果:
```
View: ComplexView
  └── Container
        └── Section: "Main Section"
              └── ActionRow (Row 0)
                    ├── Button: "Button 1"
                    └── Button: "Button 2"
```

## 🎯 成功基準

1. ✅ すべての階層レベル（View→Container→Section→ActionRow→Item）が正しく解析される
2. ✅ プレビューで階層構造が視覚的にツリー表示される
3. ✅ ドラッグ&ドロップで階層を構築できる
4. ✅ 階層構造から正しいPythonコードが生成される
5. ✅ Discord APIの制約（ActionRowあたり5アイテム等）が検証される

## 💡 今後の拡張案

- **テンプレート機能**: よく使う階層構造をテンプレート化
- **インポート/エクスポート**: JSON形式で階層構造を保存/読込
- **リアルタイムプレビュー**: コード変更時に階層ツリーが自動更新
- **バリデーション**: 階層構造の整合性をリアルタイムチェック
- **アクセシビリティ**: 階層ナビゲーションのキーボードショートカット

## 📚 参考資料

- [Discord.py UI Documentation](https://discordpy.readthedocs.io/en/stable/interactions/api.html#discord.ui)
- Discord API - Message Components
- Material-UI TreeView (参考実装)

---

**作成日**: 2026-01-04  
**最終更新**: 2026-01-04
