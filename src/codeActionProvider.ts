import * as vscode from 'vscode';

/**
 * CodeActionProvider for discord.py LayoutView components
 * Provides Quick Fix suggestions for common issues
 */
export class LayoutViewCodeActionProvider implements vscode.CodeActionProvider {
    public static readonly providedCodeActionKinds = [
        vscode.CodeActionKind.QuickFix,
        vscode.CodeActionKind.Refactor
    ];

    provideCodeActions(
        document: vscode.TextDocument,
        range: vscode.Range | vscode.Selection,
        context: vscode.CodeActionContext,
        token: vscode.CancellationToken
    ): vscode.CodeAction[] | undefined {
        const actions: vscode.CodeAction[] = [];
        const line = document.lineAt(range.start.line);
        const text = line.text;
        const documentText = document.getText();

        // Check for common issues and provide fixes

        // 1. Missing discord import
        if (this.needsDiscordImport(documentText, text)) {
            const importFix = this.createAddImportAction(document, 'discord');
            if (importFix) {
                actions.push(importFix);
            }
        }

        // 2. Missing discord.ui import
        if (this.needsDiscordUIImport(documentText, text)) {
            const importFix = this.createAddImportAction(document, 'discord.ui');
            if (importFix) {
                actions.push(importFix);
            }
        }

        // 3. Convert View to LayoutView
        if (text.includes('class') && text.includes('discord.ui.View')) {
            const convertAction = this.createConvertToLayoutViewAction(document, line);
            if (convertAction) {
                actions.push(convertAction);
            }
        }

        // 4. Add missing custom_id to button
        if (text.includes('@discord.ui.button') && !text.includes('custom_id')) {
            const addCustomIdAction = this.createAddCustomIdAction(document, line, 'button');
            if (addCustomIdAction) {
                actions.push(addCustomIdAction);
            }
        }

        // 5. Add missing custom_id to select
        if (text.includes('@discord.ui.select') && !text.includes('custom_id')) {
            const addCustomIdAction = this.createAddCustomIdAction(document, line, 'select');
            if (addCustomIdAction) {
                actions.push(addCustomIdAction);
            }
        }

        // 6. Wrap component in ActionRow
        if (this.isUnwrappedComponent(text)) {
            const wrapAction = this.createWrapInActionRowAction(document, line);
            if (wrapAction) {
                actions.push(wrapAction);
            }
        }

        // 7. Add timeout to LayoutView
        if (text.includes('LayoutView') && text.includes('super().__init__') && !text.includes('timeout')) {
            const addTimeoutAction = this.createAddTimeoutAction(document, line);
            if (addTimeoutAction) {
                actions.push(addTimeoutAction);
            }
        }

        // 8. Fix button style (string to enum)
        const styleMatch = text.match(/style\s*=\s*["'](\w+)["']/);
        if (styleMatch && text.includes('Button')) {
            const fixStyleAction = this.createFixButtonStyleAction(document, line, styleMatch);
            if (fixStyleAction) {
                actions.push(fixStyleAction);
            }
        }

        // 9. Add async to callback method
        if ((text.includes('def ') && text.includes('callback')) && !text.includes('async def')) {
            const addAsyncAction = this.createAddAsyncAction(document, line);
            if (addAsyncAction) {
                actions.push(addAsyncAction);
            }
        }

        // 10. Extract inline button to method
        if (text.includes('discord.ui.Button(') && !text.includes('@')) {
            const extractAction = this.createExtractToMethodAction(document, range, 'Button');
            if (extractAction) {
                actions.push(extractAction);
            }
        }

        return actions;
    }

    private needsDiscordImport(documentText: string, currentLine: string): boolean {
        const usesDiscord = currentLine.includes('discord.') || currentLine.includes('discord.ui.');
        const hasImport = documentText.includes('import discord') || documentText.includes('from discord');
        return usesDiscord && !hasImport;
    }

    private needsDiscordUIImport(documentText: string, currentLine: string): boolean {
        const usesDiscordUI = currentLine.includes('discord.ui.');
        const hasUIImport = documentText.includes('from discord import ui') ||
            documentText.includes('from discord.ui import') ||
            documentText.includes('import discord.ui');
        return usesDiscordUI && !hasUIImport;
    }

    private isUnwrappedComponent(text: string): boolean {
        const components = ['Button(', 'Select(', 'UserSelect(', 'RoleSelect(', 'ChannelSelect('];
        return components.some(comp => text.includes(comp)) &&
            !text.includes('ActionRow') &&
            text.includes('add_item') === false;
    }

    private createAddImportAction(document: vscode.TextDocument, module: string): vscode.CodeAction | undefined {
        const action = new vscode.CodeAction(
            `Add 'import ${module}'`,
            vscode.CodeActionKind.QuickFix
        );

        const edit = new vscode.WorkspaceEdit();
        const firstLine = document.lineAt(0);

        // Find best position for import
        let insertLine = 0;
        for (let i = 0; i < Math.min(document.lineCount, 50); i++) {
            const line = document.lineAt(i).text;
            if (line.startsWith('import ') || line.startsWith('from ')) {
                insertLine = i + 1;
            }
        }

        const importStatement = module === 'discord' ? 'import discord\n' : 'from discord import ui\n';
        edit.insert(document.uri, new vscode.Position(insertLine, 0), importStatement);

        action.edit = edit;
        action.isPreferred = true;
        return action;
    }

    private createConvertToLayoutViewAction(document: vscode.TextDocument, line: vscode.TextLine): vscode.CodeAction | undefined {
        const action = new vscode.CodeAction(
            'Convert to LayoutView',
            vscode.CodeActionKind.Refactor
        );

        const edit = new vscode.WorkspaceEdit();
        const newText = line.text.replace('discord.ui.View', 'discord.ui.LayoutView');
        edit.replace(document.uri, line.range, newText);

        action.edit = edit;
        return action;
    }

    private createAddCustomIdAction(document: vscode.TextDocument, line: vscode.TextLine, componentType: string): vscode.CodeAction | undefined {
        const action = new vscode.CodeAction(
            `Add custom_id to ${componentType}`,
            vscode.CodeActionKind.QuickFix
        );

        const edit = new vscode.WorkspaceEdit();
        // Find the closing parenthesis and add custom_id before it
        const text = line.text;
        const parenIndex = text.lastIndexOf(')');
        if (parenIndex === -1) return undefined;

        const customId = `${componentType}_${Date.now().toString(36)}`;
        const insertion = text.charAt(parenIndex - 1) === '(' ?
            `custom_id="${customId}"` :
            `, custom_id="${customId}"`;

        edit.insert(document.uri, new vscode.Position(line.lineNumber, parenIndex), insertion);

        action.edit = edit;
        action.isPreferred = true;
        return action;
    }

    private createWrapInActionRowAction(document: vscode.TextDocument, line: vscode.TextLine): vscode.CodeAction | undefined {
        const action = new vscode.CodeAction(
            'Wrap in ActionRow',
            vscode.CodeActionKind.Refactor
        );

        const edit = new vscode.WorkspaceEdit();
        const indent = line.text.match(/^\s*/)?.[0] || '';
        const trimmedText = line.text.trim();
        const newText = `${indent}discord.ui.ActionRow(${trimmedText})`;
        edit.replace(document.uri, line.range, newText);

        action.edit = edit;
        return action;
    }

    private createAddTimeoutAction(document: vscode.TextDocument, line: vscode.TextLine): vscode.CodeAction | undefined {
        const action = new vscode.CodeAction(
            'Add timeout parameter',
            vscode.CodeActionKind.QuickFix
        );

        const edit = new vscode.WorkspaceEdit();
        const text = line.text;

        // Find super().__init__() and add timeout
        const superMatch = text.match(/super\(\)\.__init__\(\s*\)/);
        if (superMatch) {
            const newText = text.replace('super().__init__()', 'super().__init__(timeout=180)');
            edit.replace(document.uri, line.range, newText);
        } else {
            const parenMatch = text.match(/super\(\)\.__init__\(/);
            if (parenMatch) {
                const insertPos = text.indexOf('super().__init__(') + 'super().__init__('.length;
                edit.insert(document.uri, new vscode.Position(line.lineNumber, insertPos), 'timeout=180, ');
            }
        }

        action.edit = edit;
        return action;
    }

    private createFixButtonStyleAction(document: vscode.TextDocument, line: vscode.TextLine, styleMatch: RegExpMatchArray): vscode.CodeAction | undefined {
        const styleValue = styleMatch[1].toLowerCase();
        const styleMap: Record<string, string> = {
            'primary': 'discord.ButtonStyle.primary',
            'secondary': 'discord.ButtonStyle.secondary',
            'success': 'discord.ButtonStyle.success',
            'danger': 'discord.ButtonStyle.danger',
            'link': 'discord.ButtonStyle.link',
            'blurple': 'discord.ButtonStyle.blurple',
            'grey': 'discord.ButtonStyle.grey',
            'gray': 'discord.ButtonStyle.gray',
            'green': 'discord.ButtonStyle.green',
            'red': 'discord.ButtonStyle.red'
        };

        const enumValue = styleMap[styleValue];
        if (!enumValue) return undefined;

        const action = new vscode.CodeAction(
            `Use ButtonStyle enum: ${enumValue}`,
            vscode.CodeActionKind.QuickFix
        );

        const edit = new vscode.WorkspaceEdit();
        const newText = line.text.replace(styleMatch[0], `style=${enumValue}`);
        edit.replace(document.uri, line.range, newText);

        action.edit = edit;
        return action;
    }

    private createAddAsyncAction(document: vscode.TextDocument, line: vscode.TextLine): vscode.CodeAction | undefined {
        const action = new vscode.CodeAction(
            'Add async keyword',
            vscode.CodeActionKind.QuickFix
        );

        const edit = new vscode.WorkspaceEdit();
        const newText = line.text.replace('def ', 'async def ');
        edit.replace(document.uri, line.range, newText);

        action.edit = edit;
        action.isPreferred = true;
        return action;
    }

    private createExtractToMethodAction(document: vscode.TextDocument, range: vscode.Range, componentType: string): vscode.CodeAction | undefined {
        const action = new vscode.CodeAction(
            `Extract ${componentType} to decorated method`,
            vscode.CodeActionKind.Refactor
        );

        // This would require more context to implement properly
        // For now, just show the action without implementation
        action.command = {
            command: 'discordComponents.extractToMethod',
            title: 'Extract to Method',
            arguments: [document.uri, range, componentType]
        };

        return action;
    }
}

/**
 * Register the CodeAction provider
 */
export function registerCodeActionProvider(context: vscode.ExtensionContext): vscode.Disposable {
    return vscode.languages.registerCodeActionsProvider(
        { language: 'python', scheme: 'file' },
        new LayoutViewCodeActionProvider(),
        {
            providedCodeActionKinds: LayoutViewCodeActionProvider.providedCodeActionKinds
        }
    );
}
