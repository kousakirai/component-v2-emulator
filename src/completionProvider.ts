import * as vscode from 'vscode';

/**
 * Completion provider for discord.py Components v2
 * Provides IntelliSense suggestions for all 12 component types
 */
export class ComponentCompletionProvider implements vscode.CompletionItemProvider {

    /**
     * Provide completion items based on current context
     */
    provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
        context: vscode.CompletionContext
    ): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList> {

        const linePrefix = document.lineAt(position).text.substring(0, position.character);

        // Check if we're after "discord.ui." or "ui."
        if (linePrefix.match(/discord\.ui\.\w*$/) || linePrefix.match(/\bui\.\w*$/)) {
            return this.getComponentCompletions();
        }

        // Check if we're in a class definition that might be a View/Modal
        if (linePrefix.match(/class\s+\w*$/)) {
            return this.getViewCompletions();
        }

        // Check if we're trying to add a style
        if (linePrefix.match(/style\s*=\s*\w*$/)) {
            return this.getStyleCompletions(document, position);
        }

        return undefined;
    }

    /**
     * Get all component type completions
     */
    private getComponentCompletions(): vscode.CompletionItem[] {
        const components = [
            // Basic components
            {
                name: 'Button',
                detail: 'Button component',
                description: 'Interactive button with callbacks',
                snippet: 'Button(label="${1:Click me}", style=ButtonStyle.${2:primary}${3:, custom_id="${4:button_id}"})',
                category: 'Basic'
            },
            {
                name: 'Select',
                detail: 'Select menu component',
                description: 'Dropdown selection menu',
                snippet: 'Select(\n\tplaceholder="${1:Select an option}",\n\toptions=[\n\t\tSelectOption(label="${2:Option 1}", value="${3:opt1}"),\n\t\tSelectOption(label="${4:Option 2}", value="${5:opt2}")\n\t]${6:,\n\tcustom_id="${7:select_id}"}\n)',
                category: 'Basic'
            },
            {
                name: 'TextInput',
                detail: 'Text input component (Modal only)',
                description: 'Single or multi-line text input field',
                snippet: 'TextInput(\n\tlabel="${1:Input Label}",\n\tstyle=TextStyle.${2:short}${3:,\n\tplaceholder="${4:Enter text...}"}${5:,\n\trequired=${6:True}}\n)',
                category: 'Basic'
            },
            {
                name: 'Modal',
                detail: 'Modal dialog form',
                description: 'Pop-up form with text inputs',
                snippet: 'Modal(title="${1:Modal Title}"${2:, custom_id="${3:modal_id}"})',
                category: 'Basic'
            },

            // Components v2 - Layout
            {
                name: 'View',
                detail: 'Message component container',
                description: 'Standard view with automatic layout',
                snippet: 'class ${1:MyView}(View):\n\tdef __init__(self):\n\t\tsuper().__init__()\n\t\t${0}',
                category: 'Layout'
            },
            {
                name: 'LayoutView',
                detail: 'Manual layout view (Components v2)',
                description: 'Advanced view requiring manual positioning',
                snippet: 'class ${1:MyLayoutView}(LayoutView):\n\tdef __init__(self):\n\t\tsuper().__init__()\n\t\t${0}',
                category: 'Components v2'
            },
            {
                name: 'Section',
                detail: 'Section container (Components v2)',
                description: 'Grouping container for components',
                snippet: 'Section(${1:label="${2:Section Label}"})',
                category: 'Components v2'
            },
            {
                name: 'Container',
                detail: 'Generic container (Components v2)',
                description: 'Generic component container',
                snippet: 'Container()',
                category: 'Components v2'
            },
            {
                name: 'ActionRow',
                detail: 'Action row container',
                description: 'Horizontal row for up to 5 components',
                snippet: 'ActionRow()',
                category: 'Layout'
            },

            // Components v2 - Display
            {
                name: 'TextDisplay',
                detail: 'Static text display (Components v2)',
                description: 'Display-only text component',
                snippet: 'TextDisplay(content="${1:Display text}"${2:, style="${3:plain}"})',
                category: 'Components v2'
            },
            {
                name: 'Label',
                detail: 'Label component (Components v2)',
                description: 'Text label for form elements',
                snippet: 'Label(text="${1:Label text}"${2:, for_="${3:component_id}"})',
                category: 'Components v2'
            },
            {
                name: 'Separator',
                detail: 'Visual separator (Components v2)',
                description: 'Horizontal divider line',
                snippet: 'Separator(${1:spacing="${2:medium}"})',
                category: 'Components v2'
            },
            {
                name: 'Thumbnail',
                detail: 'Thumbnail image (Components v2)',
                description: 'Small image display',
                snippet: 'Thumbnail(\n\turl="${1:https://example.com/image.png}"${2:,\n\talt="${3:Image description}"}${4:,\n\twidth=${5:80}, height=${6:80}}\n)',
                category: 'Components v2'
            },

            // Components v2 - File
            {
                name: 'File',
                detail: 'File display component (Components v2)',
                description: 'Display file information',
                snippet: 'File(\n\tfilename="${1:document.pdf}"${2:,\n\turl="${3:https://example.com/file.pdf}"}${4:,\n\tsize=${5:1048576}}\n)',
                category: 'Components v2'
            },
            {
                name: 'MediaGallery',
                detail: 'Media gallery (Components v2)',
                description: 'Display multiple media items',
                snippet: 'MediaGallery(\n\titems=[\n\t\t${1:{"url": "https://example.com/image1.png"}},\n\t\t${2:{"url": "https://example.com/image2.png"}}\n\t]\n)',
                category: 'Components v2'
            },
            {
                name: 'FileUpload',
                detail: 'File upload component (Components v2)',
                description: 'Allow users to upload files',
                snippet: 'FileUpload(${1:accept=["${2:.jpg}", "${3:.png}"], multiple=${4:True}})',
                category: 'Components v2'
            }
        ];

        return components.map(comp => {
            const item = new vscode.CompletionItem(comp.name, vscode.CompletionItemKind.Class);
            item.detail = `${comp.detail} [${comp.category}]`;
            item.documentation = new vscode.MarkdownString(
                `**${comp.name}** - ${comp.description}\n\n` +
                `Category: \`${comp.category}\`\n\n` +
                `**Example:**\n\`\`\`python\n${comp.snippet.replace(/\$\{\d+:([^}]+)\}/g, '$1').replace(/\$\d+/g, '')}\n\`\`\``
            );
            item.insertText = new vscode.SnippetString(comp.snippet);
            item.sortText = `0_${comp.category}_${comp.name}`;
            return item;
        });
    }

    /**
     * Get View/Modal class completions
     */
    private getViewCompletions(): vscode.CompletionItem[] {
        const views = [
            {
                name: 'View',
                snippet: '${1:MyView}(discord.ui.View):\n\tdef __init__(self):\n\t\tsuper().__init__()\n\t\t${0}'
            },
            {
                name: 'Modal',
                snippet: '${1:MyModal}(discord.ui.Modal, title="${2:Modal Title}"):\n\t${0}'
            },
            {
                name: 'LayoutView',
                snippet: '${1:MyLayoutView}(discord.ui.LayoutView):\n\tdef __init__(self):\n\t\tsuper().__init__()\n\t\t${0}'
            }
        ];

        return views.map(view => {
            const item = new vscode.CompletionItem(view.name, vscode.CompletionItemKind.Class);
            item.detail = `discord.ui.${view.name} class`;
            item.insertText = new vscode.SnippetString(view.snippet);
            return item;
        });
    }

    /**
     * Get style completions based on context
     */
    private getStyleCompletions(document: vscode.TextDocument, position: vscode.Position): vscode.CompletionItem[] {
        const text = document.getText(new vscode.Range(new vscode.Position(Math.max(0, position.line - 5), 0), position));

        // Button styles
        if (text.includes('Button(') || text.includes('button(')) {
            return this.createEnumCompletions('ButtonStyle', [
                { name: 'primary', color: '#5865F2', description: 'Blurple button' },
                { name: 'secondary', color: '#4E5058', description: 'Gray button' },
                { name: 'success', color: '#3BA55D', description: 'Green button' },
                { name: 'danger', color: '#ED4245', description: 'Red button' },
                { name: 'link', color: '#00AFF4', description: 'Link-style button (requires URL)' }
            ]);
        }

        // TextInput styles
        if (text.includes('TextInput(')) {
            return this.createEnumCompletions('TextStyle', [
                { name: 'short', description: 'Single-line text input' },
                { name: 'paragraph', description: 'Multi-line text input' }
            ]);
        }

        // TextDisplay styles
        if (text.includes('TextDisplay(')) {
            return this.createEnumCompletions('TextDisplayStyle', [
                { name: 'plain', description: 'Plain text' },
                { name: 'bold', description: 'Bold text' },
                { name: 'italic', description: 'Italic text' }
            ]);
        }

        // Separator spacing
        if (text.includes('Separator(')) {
            return this.createEnumCompletions('SeparatorSpacing', [
                { name: 'small', description: 'Small spacing (8px)' },
                { name: 'medium', description: 'Medium spacing (16px)' },
                { name: 'large', description: 'Large spacing (24px)' }
            ]);
        }

        return [];
    }

    /**
     * Create enum-style completions
     */
    private createEnumCompletions(
        enumName: string,
        values: Array<{ name: string; color?: string; description: string }>
    ): vscode.CompletionItem[] {
        return values.map(val => {
            const item = new vscode.CompletionItem(val.name, vscode.CompletionItemKind.EnumMember);
            item.detail = `${enumName}.${val.name}`;
            const colorBadge = val.color ? ` $(circle-filled)` : '';
            item.documentation = new vscode.MarkdownString(
                `**${enumName}.${val.name}**${colorBadge}\n\n${val.description}` +
                (val.color ? `\n\nColor: \`${val.color}\`` : '')
            );
            item.insertText = `${enumName}.${val.name}`;
            return item;
        });
    }
}

/**
 * Signature help provider for component parameters
 */
export class ComponentSignatureHelpProvider implements vscode.SignatureHelpProvider {

    provideSignatureHelp(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
        context: vscode.SignatureHelpContext
    ): vscode.ProviderResult<vscode.SignatureHelp> {

        const line = document.lineAt(position).text;
        const beforeCursor = line.substring(0, position.character);

        // Detect which component we're in
        const match = beforeCursor.match(/(\w+)\s*\([^)]*$/);
        if (!match) {
            return undefined;
        }

        const componentName = match[1];
        const signature = this.getComponentSignature(componentName);

        if (signature) {
            const help = new vscode.SignatureHelp();
            help.signatures = [signature];
            help.activeSignature = 0;
            help.activeParameter = this.getActiveParameter(beforeCursor);
            return help;
        }

        return undefined;
    }

    /**
     * Get signature information for a component
     */
    private getComponentSignature(componentName: string): vscode.SignatureInformation | undefined {
        const signatures: Record<string, { label: string; params: string[]; docs: string }> = {
            'Button': {
                label: 'Button(label: str, style: ButtonStyle, custom_id: str, disabled: bool, emoji: str, url: str, row: int)',
                params: ['label', 'style', 'custom_id', 'disabled', 'emoji', 'url', 'row'],
                docs: 'Create a button component. Link buttons require URL parameter.'
            },
            'TextDisplay': {
                label: 'TextDisplay(content: str, style: str)',
                params: ['content', 'style'],
                docs: 'Display static text. Styles: plain, bold, italic'
            },
            'Label': {
                label: 'Label(text: str, for_: str)',
                params: ['text', 'for_'],
                docs: 'Create a label component. `for_` links to another component ID.'
            },
            'Separator': {
                label: 'Separator(spacing: str)',
                params: ['spacing'],
                docs: 'Visual separator. Spacing: small, medium, large'
            },
            'Thumbnail': {
                label: 'Thumbnail(url: str, alt: str, width: int, height: int)',
                params: ['url', 'alt', 'width', 'height'],
                docs: 'Display thumbnail image with optional dimensions'
            },
            'File': {
                label: 'File(filename: str, url: str, size: int)',
                params: ['filename', 'url', 'size'],
                docs: 'Display file information. Size in bytes.'
            },
            'MediaGallery': {
                label: 'MediaGallery(items: List[dict])',
                params: ['items'],
                docs: 'Display multiple media items as a gallery'
            },
            'FileUpload': {
                label: 'FileUpload(accept: List[str], multiple: bool)',
                params: ['accept', 'multiple'],
                docs: 'Allow file uploads. Accept specifies file types.'
            }
        };

        const sig = signatures[componentName];
        if (!sig) {
            return undefined;
        }

        const sigInfo = new vscode.SignatureInformation(sig.label, sig.docs);
        sigInfo.parameters = sig.params.map(p => new vscode.ParameterInformation(p));

        return sigInfo;
    }

    /**
     * Determine which parameter cursor is on
     */
    private getActiveParameter(text: string): number {
        const afterParen = text.substring(text.lastIndexOf('(') + 1);
        return afterParen.split(',').length - 1;
    }
}
