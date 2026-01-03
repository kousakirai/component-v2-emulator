import * as vscode from 'vscode';
import { ComponentData, ParseError, ButtonStyle, ValidationWarning } from './types';
import { groupByRow } from './validator';

/**
 * Manages the webview panel for Discord component preview
 */
export class WebviewManager {
    private static instance: WebviewManager | null = null;
    private panel: vscode.WebviewPanel | null = null;
    private extensionUri: vscode.Uri;
    private currentDocument: vscode.TextDocument | null = null;

    private constructor(extensionUri: vscode.Uri) {
        this.extensionUri = extensionUri;
    }

    /**
     * Get or create the singleton instance
     */
    public static getInstance(extensionUri: vscode.Uri): WebviewManager {
        if (!WebviewManager.instance) {
            WebviewManager.instance = new WebviewManager(extensionUri);
        }
        return WebviewManager.instance;
    }

    /**
     * Create or show the webview panel
     */
    public createOrShow(): void {
        const column = vscode.ViewColumn.Two;

        // If panel already exists, show it
        if (this.panel) {
            this.panel.reveal(column);
            return;
        }

        // Create new panel
        this.panel = vscode.window.createWebviewPanel(
            'discordComponentPreview',
            'Discord Component Preview',
            column,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [this.extensionUri]
            }
        );

        // Handle panel disposal
        this.panel.onDidDispose(() => {
            this.panel = null;
        });

        // Handle messages from webview
        this.panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'showCallback':
                        this.handleShowCallback(message.callback, message.line);
                        break;
                    case 'addComponent':
                        this.handleAddComponent(message.componentType, message.row);
                        break;
                    case 'jumpToLine':
                        this.handleJumpToLine(message.line);
                        break;
                }
            },
            undefined,
            []
        );

        // Set initial content
        this.updatePreview([], [], []);
    }

    /**
     * Handle showing callback code
     */
    private async handleShowCallback(callbackName: string, line?: number): Promise<void> {
        let targetDocument = this.currentDocument;

        // If no stored document, try to get the active text editor
        if (!targetDocument) {
            const editor = vscode.window.activeTextEditor;
            if (editor && editor.document.languageId === 'python') {
                targetDocument = editor.document;
            }
        }

        // If still no document, show error
        if (!targetDocument) {
            vscode.window.showErrorMessage('Cannot find the source Python file');
            return;
        }

        // Open or show the document
        const editor = await vscode.window.showTextDocument(targetDocument, {
            viewColumn: vscode.ViewColumn.One,
            preserveFocus: false
        });

        // If line is provided, jump to that line
        if (line) {
            const position = new vscode.Position(line - 1, 0);
            editor.selection = new vscode.Selection(position, position);
            editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
            vscode.window.setStatusBarMessage(`Jumped to callback '${callbackName}' at line ${line}`, 2000);
            return;
        }

        // Otherwise, search for the callback function definition
        const text = targetDocument.getText();
        const lines = text.split('\n');
        
        // Search for callback definition patterns
        const patterns = [
            new RegExp(`^\\s*async\\s+def\\s+${callbackName}\\s*\\(`),
            new RegExp(`^\\s*def\\s+${callbackName}\\s*\\(`),
        ];

        let foundLine = -1;
        for (let i = 0; i < lines.length; i++) {
            for (const pattern of patterns) {
                if (pattern.test(lines[i])) {
                    foundLine = i;
                    break;
                }
            }
            if (foundLine !== -1) {
                break;
            }
        }

        if (foundLine !== -1) {
            const position = new vscode.Position(foundLine, 0);
            editor.selection = new vscode.Selection(position, position);
            editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
            vscode.window.setStatusBarMessage(`Found callback: ${callbackName}`, 2000);
        } else {
            vscode.window.showWarningMessage(`Callback function '${callbackName}' not found in current file`);
        }
    }

    /**
     * Handle jump to line
     */
    private async handleJumpToLine(line: number): Promise<void> {
        if (line <= 0) {
            return;
        }

        let targetDocument = this.currentDocument;

        // If no stored document, try to get the active text editor
        if (!targetDocument) {
            const editor = vscode.window.activeTextEditor;
            if (editor && editor.document.languageId === 'python') {
                targetDocument = editor.document;
            }
        }

        // If still no document, show error
        if (!targetDocument) {
            vscode.window.showErrorMessage('Cannot find the source Python file');
            return;
        }

        // Open or show the document
        const editor = await vscode.window.showTextDocument(targetDocument, {
            viewColumn: vscode.ViewColumn.One,
            preserveFocus: false
        });

        // Jump to the specified line
        const position = new vscode.Position(line - 1, 0);
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
        
        // Show brief notification
        vscode.window.setStatusBarMessage(`Jumped to line ${line}`, 2000);
    }

    /**
     * Handle adding a new component from GUI
     */
    private async handleAddComponent(componentType: string, row?: number): Promise<void> {
        const { generateButtonDecorator, generateSelectDecorator } = await import('./codeGenerator');
        const editor = vscode.window.activeTextEditor;
        
        if (!editor || editor.document.languageId !== 'python') {
            vscode.window.showErrorMessage('No active Python editor found');
            return;
        }

        let code = '';

        if (componentType === 'button') {
            // Show quick input for button label
            const label = await vscode.window.showInputBox({
                prompt: 'Enter button label',
                value: 'New Button'
            });
            if (!label) {return;}

            // Show style picker
            const style = await vscode.window.showQuickPick(
                ['primary', 'secondary', 'success', 'danger', 'link'],
                { placeHolder: 'Select button style' }
            );
            if (!style) {return;}

            // Generate code
            const methodName = `button_${Date.now()}`;
            code = generateButtonDecorator(methodName, label, style, { row });
        } else if (componentType === 'select') {
            // Show quick input for placeholder
            const placeholder = await vscode.window.showInputBox({
                prompt: 'Enter select menu placeholder',
                value: 'Select an option'
            });
            if (!placeholder) {return;}

            // Generate code with default options
            const methodName = `select_${Date.now()}`;
            code = generateSelectDecorator(
                methodName,
                placeholder,
                [
                    { label: 'Option 1', value: 'opt1' },
                    { label: 'Option 2', value: 'opt2' }
                ],
                { row }
            );
        }

        // Insert code at the end of the file
        const lastLine = editor.document.lineAt(editor.document.lineCount - 1);
        const position = lastLine.range.end;

        await editor.edit(editBuilder => {
            editBuilder.insert(position, '\n\n    ' + code.replace(/\n/g, '\n    '));
        });

        vscode.window.showInformationMessage(`Added ${componentType} to code`);
    }

    /**
     * Update the preview with new components and errors
     */
    public updatePreview(components: ComponentData[], errors: ParseError[], warnings: ValidationWarning[] = [], sourceCode?: string, views?: any[], document?: vscode.TextDocument): void {
        if (!this.panel) {
            return;
        }

        // Store the current document for later use (e.g., jump to line)
        if (document) {
            this.currentDocument = document;
        }

        this.panel.webview.html = this.getWebviewContent(components, errors, warnings, sourceCode, views);
    }

    /**
     * Check if the preview panel is currently visible
     */
    public isVisible(): boolean {
        return this.panel !== null && this.panel.visible;
    }

    /**
     * Close the preview panel
     */
    public close(): void {
        if (this.panel) {
            this.panel.dispose();
            this.panel = null;
        }
    }

    /**
     * Generate HTML content for the webview
     */
    private getWebviewContent(components: ComponentData[], errors: ParseError[], warnings: ValidationWarning[] = [], sourceCode?: string, views?: any[]): string {
        const buttons = components.filter(c => c.type === 'button');
        const selectMenus = components.filter(c => c.type === 'select_menu');
        const textInputs = components.filter(c => c.type === 'text_input');
        const modals = components.filter(c => c.type === 'modal');
        
        // Group components by rows
        const rows = groupByRow(components);
        
        // Generate error messages HTML
        const errorsHtml = errors.length > 0 ? this.generateErrorsHtml(errors) : '';
        
        // Generate warnings HTML
        const warningsHtml = warnings.length > 0 ? this.generateWarningsHtml(warnings) : '';
        
        // Generate View/Modal structures HTML
        const viewsHtml = views && views.length > 0 ? this.generateViewStructuresHtml(views) : '';
        
        // Generate components HTML with ActionRow structure
        const rowsHtml = this.generateActionRowsHtml(rows, sourceCode);

        const selectMenusHtml = selectMenus.length > 0
            ? this.generateSelectMenusHtml(selectMenus)
            : '';
        
        const textInputsHtml = textInputs.length > 0
            ? this.generateTextInputsHtml(textInputs)
            : '';

        return `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Discord Component Preview</title>
    <style>
        :root[data-theme="dark"] {
            --bg-primary: #36393f;
            --bg-secondary: #2f3136;
            --bg-tertiary: #202225;
            --bg-modifier: #40444b;
            --text-primary: #ffffff;
            --text-secondary: #dcddde;
            --text-muted: #b9bbbe;
            --text-disabled: #72767d;
            --accent-primary: #5865F2;
            --accent-success: #3BA55D;
            --accent-warning: #FEE75C;
            --accent-danger: #ED4245;
            --button-secondary-bg: #4E5058;
        }

        :root[data-theme="light"] {
            --bg-primary: #ffffff;
            --bg-secondary: #f2f3f5;
            --bg-tertiary: #e3e5e8;
            --bg-modifier: #d4d7dc;
            --text-primary: #060607;
            --text-secondary: #2e3338;
            --text-muted: #5c5e66;
            --text-disabled: #9a9c9f;
            --accent-primary: #5865F2;
            --accent-success: #3BA55D;
            --accent-warning: #FEE75C;
            --accent-danger: #ED4245;
            --button-secondary-bg: #e3e5e8;
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: var(--bg-primary);
            color: var(--text-secondary);
            padding: 20px;
            transition: background-color 0.3s, color 0.3s;
        }

        .container {
            max-width: 900px;
            margin: 0 auto;
        }

        .theme-toggle {
            position: fixed;
            top: 20px;
            right: 20px;
            background-color: var(--accent-primary);
            color: var(--text-primary);
            border: none;
            border-radius: 20px;
            padding: 8px 16px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            z-index: 1000;
            transition: all 0.2s ease;
        }

        .theme-toggle:hover {
            filter: brightness(1.1);
            transform: translateY(-1px);
        }

        h1 {
            color: var(--text-primary);
            margin-bottom: 10px;
            font-size: 24px;
        }

        .subtitle {
            color: var(--text-muted);
            margin-bottom: 20px;
            font-size: 14px;
        }

        .errors {
            margin-bottom: 20px;
        }

        .error-box {
            background-color: var(--accent-danger);
            border-left: 4px solid #c53030;
            padding: 12px 16px;
            margin-bottom: 8px;
            border-radius: 4px;
            cursor: pointer;
            transition: filter 0.2s;
        }

        .error-box:hover {
            filter: brightness(1.1);
        }

        .warning-box {
            background-color: #faa61a;
            border-left: 4px solid #d88413;
            padding: 12px 16px;
            margin-bottom: 8px;
            border-radius: 4px;
            color: #2c2f33;
            cursor: pointer;
            transition: filter 0.2s;
        }

        .warning-box:hover {
            filter: brightness(1.1);
        }

        .error-message {
            font-size: 14px;
            line-height: 1.4;
        }

        .preview-section {
            background-color: var(--bg-secondary);
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 20px;
        }

        .section-title {
            color: var(--text-primary);
            font-size: 16px;
            margin-bottom: 16px;
            font-weight: 600;
        }

        .component-group {
            margin-bottom: 20px;
        }

        .action-row {
            margin-bottom: 16px;
            padding: 12px;
            background-color: var(--bg-tertiary);
            border-radius: 6px;
            border-left: 3px solid var(--accent-primary);
        }

        .action-row.row-error {
            border-left-color: var(--accent-danger);
            background-color: rgba(237, 66, 69, 0.1);
        }

        .row-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
            padding-bottom: 8px;
            border-bottom: 1px solid var(--bg-modifier);
        }

        .row-label {
            color: var(--text-muted);
            font-size: 13px;
            font-weight: 600;
            text-transform: uppercase;
        }

        .row-count {
            color: var(--text-disabled);
            font-size: 12px;
        }

        .action-row.row-error .row-count {
            color: var(--accent-danger);
            font-weight: 600;
        }

        .view-structure {
            background-color: var(--bg-tertiary);
            border-radius: 8px;
            padding: 16px;
            margin-bottom: 12px;
            border-left: 4px solid var(--accent-primary);
        }

        .view-structure.view-modal {
            border-left-color: var(--accent-success);
        }

        .gui-builder {
            margin-top: 16px;
            padding-top: 16px;
            border-top: 1px solid #40444b;
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
        }

        .add-component-btn {
            padding: 8px 16px;
            background-color: #5865F2;
            color: #ffffff;
            border: none;
            border-radius: 4px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .add-component-btn:hover {
            background-color: #4752C4;
            transform: translateY(-1px);
            box-shadow: 0 2px 8px rgba(88, 101, 242, 0.3);
        }

        .add-component-btn:active {
            transform: translateY(0);
        }

        .view-header {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 8px;
        }

        .view-icon {
            font-size: 20px;
        }

        .view-name {
            color: #ffffff;
            font-size: 16px;
            font-weight: 600;
        }

        .view-type {
            background-color: #5865F2;
            color: white;
            padding: 2px 8px;
            border-radius: 3px;
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
        }

        .view-structure.view-modal .view-type {
            background-color: #3BA55D;
        }

        .view-line {
            color: #72767d;
            font-size: 12px;
            margin-left: auto;
        }

        .view-content {
            padding-left: 32px;
        }

        .view-stats {
            color: #b9bbbe;
            font-size: 13px;
        }

        .button-container {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-bottom: 12px;
        }

        .discord-button {
            padding: 2px 16px;
            height: 32px;
            min-width: 60px;
            min-height: 32px;
            border-radius: 3px;
            font-size: 14px;
            font-weight: 500;
            border: none;
            cursor: pointer;
            transition: all 0.17s ease;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            white-space: nowrap;
            position: relative;
        }

        .discord-button:hover:not(:disabled) {
            filter: brightness(1.15);
            transform: translateY(-1px);
        }

        .discord-button:active:not(:disabled) {
            transform: translateY(0);
        }

        .discord-button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        /* Button Styles - Discord Official Colors */
        .button-primary {
            background-color: #5865F2;
            color: #ffffff;
        }

        .button-secondary {
            background-color: #4E5058;
            color: #ffffff;
        }

        .button-success {
            background-color: #3BA55D;
            color: #ffffff;
        }

        .button-danger {
            background-color: #ED4245;
            color: #ffffff;
        }

        .button-link {
            background-color: transparent;
            color: #00AFF4;
            text-decoration: underline;
        }

        /* Select Menu Styles */
        .discord-select {
            background-color: #1e1f22;
            border: 1px solid #1e1f22;
            border-radius: 3px;
            color: #dbdee1;
            font-size: 14px;
            padding: 8px 12px;
            min-height: 40px;
            width: 100%;
            max-width: 400px;
            cursor: pointer;
            transition: border-color 0.17s ease;
            appearance: none;
            background-image: url("data:image/svg+xml,%3Csvg width='16' height='16' viewBox='0 0 16 16' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M4 6L8 10L12 6' stroke='%23b5bac1' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
            background-repeat: no-repeat;
            background-position: right 8px center;
            padding-right: 32px;
        }

        .discord-select:hover {
            border-color: #040405;
        }

        .discord-select:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .discord-select option {
            background-color: #2b2d31;
            color: #dbdee1;
        }

        .select-placeholder {
            color: #949ba4;
        }

        /* Text Input Styles */
        .discord-text-input {
            background-color: #1e1f22;
            border: 1px solid #1e1f22;
            border-radius: 3px;
            color: #dbdee1;
            font-size: 14px;
            padding: 10px;
            width: 100%;
            max-width: 500px;
            transition: border-color 0.17s ease;
        }

        .discord-text-input:focus {
            outline: none;
            border-color: #00aff4;
        }

        .discord-text-input::placeholder {
            color: #949ba4;
        }

        .discord-textarea {
            min-height: 100px;
            resize: vertical;
            font-family: inherit;
        }

        .input-label {
            color: #b5bac1;
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
            margin-bottom: 8px;
            display: block;
        }

        .emoji {
            font-size: 16px;
            line-height: 1;
        }

        .no-components {
            color: #b9bbbe;
            font-style: italic;
            padding: 20px;
            text-align: center;
        }

        .component-info {
            font-size: 12px;
            color: #72767d;
            margin-top: 4px;
        }

        .callback-badge {
            display: inline-block;
            background-color: #5865f2;
            color: white;
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 11px;
            font-weight: 600;
            margin-left: 8px;
        }

        .stats {
            background-color: #202225;
            border-radius: 4px;
            padding: 12px 16px;
            margin-top: 20px;
            font-size: 13px;
            color: #b9bbbe;
        }

        .stats-item {
            display: inline-block;
            margin-right: 20px;
        }

        .stats-value {
            color: #ffffff;
            font-weight: 600;
        }

        .tooltip {
            position: absolute;
            bottom: 100%;
            left: 50%;
            transform: translateX(-50%);
            background-color: #111214;
            color: #dbdee1;
            padding: 8px 12px;
            border-radius: 4px;
            font-size: 12px;
            white-space: nowrap;
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.2s;
            margin-bottom: 8px;
            z-index: 1000;
        }

        .discord-button:hover .tooltip,
        .discord-select:hover .tooltip,
        .discord-text-input:hover .tooltip {
            opacity: 1;
        }
    </style>
</head>
<body>
    <div class="container">
        <button class="theme-toggle" onclick="toggleTheme()">🌙 Toggle Theme</button>
        
        <h1>Discord Component Preview</h1>
        <p class="subtitle">Live preview of discord.py ComponentV2 elements</p>

        ${errorsHtml}
        ${warningsHtml}

        ${viewsHtml}

        <div class="preview-section">
            <div class="section-title">Action Rows & Components</div>
            ${rowsHtml || '<p class="no-components">No components found.</p>'}
            <div class="gui-builder">
                <button class="add-component-btn" onclick="addComponent('button')">➕ Add Button</button>
                <button class="add-component-btn" onclick="addComponent('select')">➕ Add Select Menu</button>
            </div>
        </div>

        ${selectMenus.length > 0 ? `
        <div class="preview-section">
            <div class="section-title">Select Menus (${selectMenus.length})</div>
            ${selectMenusHtml}
        </div>
        ` : ''}

        ${textInputs.length > 0 ? `
        <div class="preview-section">
            <div class="section-title">Text Inputs (${textInputs.length})</div>
            ${textInputsHtml}
        </div>
        ` : ''}

        <div class="stats">
            <span class="stats-item">
                Total Components: <span class="stats-value">${components.length}</span>
            </span>
            <span class="stats-item">
                Buttons: <span class="stats-value">${buttons.length}</span>
            </span>
            <span class="stats-item">
                Select Menus: <span class="stats-value">${selectMenus.length}</span>
            </span>
            <span class="stats-item">
                Text Inputs: <span class="stats-value">${textInputs.length}</span>
            </span>
            <span class="stats-item">
                Action Rows: <span class="stats-value">${rows.length}</span>
            </span>
            ${errors.length > 0 ? `
            <span class="stats-item">
                Errors: <span class="stats-value">${errors.filter(e => e.severity === 'error').length}</span>
            </span>
            ` : ''}
            ${warnings.length > 0 ? `
            <span class="stats-item">
                Warnings: <span class="stats-value">${warnings.length}</span>
            </span>
            ` : ''}
        </div>
    </div>
    <script>
        const vscode = acquireVsCodeApi();
        
        // Theme management
        let currentTheme = 'dark';
        
        function toggleTheme() {
            currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', currentTheme);
            
            // Update button text
            const btn = document.querySelector('.theme-toggle');
            btn.textContent = currentTheme === 'dark' ? '☀️ Toggle Theme' : '🌙 Toggle Theme';
            
            // Save theme preference
            vscode.setState({ theme: currentTheme });
        }
        
        // Restore theme from saved state
        const state = vscode.getState();
        if (state && state.theme) {
            currentTheme = state.theme;
            document.documentElement.setAttribute('data-theme', currentTheme);
            const btn = document.querySelector('.theme-toggle');
            btn.textContent = currentTheme === 'dark' ? '☀️ Toggle Theme' : '🌙 Toggle Theme';
        }
        
        // Handle component clicks for interactive preview
        document.addEventListener('click', (e) => {
            const target = e.target.closest('[data-callback]');
            if (target) {
                const callback = target.getAttribute('data-callback');
                const line = target.getAttribute('data-line');
                vscode.postMessage({
                    command: 'showCallback',
                    callback: callback,
                    line: line ? parseInt(line) : undefined
                });
            }
        });

        // Handle add component button clicks
        function addComponent(componentType) {
            vscode.postMessage({
                command: 'addComponent',
                componentType: componentType
            });
        }

        // Handle jump to line
        function jumpToLine(line) {
            if (line > 0) {
                vscode.postMessage({
                    command: 'jumpToLine',
                    line: line
                });
            }
        }
    </script>
</body>
</html>`;
    }

    /**
     * Generate HTML for error messages
     */
    private generateErrorsHtml(errors: ParseError[]): string {
        const errorItems = errors.map(error => {
            const boxClass = error.severity === 'error' ? 'error-box' : 'warning-box';
            const lineInfo = error.line ? ` (Line ${error.line})` : '';
            const dataLine = error.line ? ` data-error-line="${error.line}"` : '';
            return `
                <div class="${boxClass}"${dataLine} onclick="jumpToLine(${error.line || 0})">
                    <div class="error-message">
                        <strong>${error.severity.toUpperCase()}${lineInfo}:</strong> ${this.escapeHtml(error.message)}
                        ${error.line ? ' <span style="opacity: 0.7;">(Click to jump)</span>' : ''}
                    </div>
                </div>
            `;
        }).join('');

        return `<div class="errors">${errorItems}</div>`;
    }

    /**
     * Generate HTML for validation warnings
     */
    private generateWarningsHtml(warnings: ValidationWarning[]): string {
        const warningItems = warnings.map(warning => {
            const boxClass = warning.severity === 'error' ? 'error-box' : 'warning-box';
            const lineInfo = warning.line ? ` (Line ${warning.line})` : '';
            const codeInfo = warning.code ? ` [${warning.code}]` : '';
            const dataLine = warning.line ? ` data-warning-line="${warning.line}"` : '';
            return `
                <div class="${boxClass}"${dataLine} onclick="jumpToLine(${warning.line || 0})">
                    <div class="error-message">
                        <strong>${warning.severity.toUpperCase()}${lineInfo}${codeInfo}:</strong> ${this.escapeHtml(warning.message)}
                        ${warning.line ? ' <span style="opacity: 0.7;">(Click to jump)</span>' : ''}
                    </div>
                </div>
            `;
        }).join('');

        return `<div class="errors">${warningItems}</div>`;
    }

    /**
     * Generate HTML for View/Modal structures
     */
    private generateViewStructuresHtml(views: any[]): string {
        if (views.length === 0) {
            return '';
        }

        const viewsHtml = views.map(view => {
            const typeIcon = view.type === 'Modal' ? '📋' : '📦';
            const typeClass = view.type === 'Modal' ? 'view-modal' : 'view-view';
            const componentCount = view.components.length;

            return `
                <div class="view-structure ${typeClass}">
                    <div class="view-header">
                        <span class="view-icon">${typeIcon}</span>
                        <span class="view-name">${this.escapeHtml(view.name)}</span>
                        <span class="view-type">${view.type}</span>
                        <span class="view-line">Line ${view.line}</span>
                    </div>
                    <div class="view-content">
                        <div class="view-stats">
                            ${componentCount} component${componentCount !== 1 ? 's' : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        return `
            <div class="preview-section">
                <div class="section-title">Views & Modals (${views.length})</div>
                ${viewsHtml}
            </div>
        `;
    }

    /**
     * Generate HTML for ActionRows with proper layout
     */
    private generateActionRowsHtml(rows: any[], sourceCode?: string): string {
        if (rows.length === 0) {
            return '<p class="no-components">No components found.</p>';
        }

        return rows.map((row, rowIndex) => {
            const rowComponents = row.components;
            const buttons = rowComponents.filter((c: ComponentData) => c.type === 'button');
            
            const buttonsHtml = buttons.map((button: ComponentData) => {
                return this.generateSingleButtonHtml(button, sourceCode);
            }).join('');

            const rowLabel = row.row === 0 ? 'Default Row' : `Row ${row.row}`;
            const componentCount = rowComponents.length;
            const limitClass = componentCount > 5 ? 'row-error' : '';

            return `
                <div class="action-row ${limitClass}">
                    <div class="row-header">
                        <span class="row-label">${rowLabel}</span>
                        <span class="row-count">${componentCount}/5 components</span>
                    </div>
                    <div class="button-container">
                        ${buttonsHtml}
                    </div>
                </div>
            `;
        }).join('');
    }

    /**
     * Generate HTML for a single button
     */
    private generateSingleButtonHtml(button: ComponentData, sourceCode?: string): string {
        const props = button.properties as any;
        const style = props.style || 'secondary';
        const label = props.label || 'Button';
        const disabled = props.disabled || false;
        const emoji = props.emoji || '';
        const customId = props.custom_id || '';
        const url = props.url || '';
        const callback = props.callback || '';
        const line = button.line || 0;

        const styleClass = `button-${style}`;
        const disabledAttr = disabled ? 'disabled' : '';
        const emojiHtml = emoji ? `<span class="emoji">${this.escapeHtml(emoji)}</span>` : '';
        const dataAttrs = callback ? `data-callback="${this.escapeHtml(callback)}" data-line="${line}"` : '';

        let tooltipText = '';
        if (callback) {
            tooltipText = `Callback: ${callback}()`;
        } else if (customId) {
            tooltipText = `ID: ${customId}`;
        }

        const tooltipHtml = tooltipText ? `<span class="tooltip">${this.escapeHtml(tooltipText)}</span>` : '';

        return `
            <button class="discord-button ${styleClass}" ${disabledAttr} ${dataAttrs} title="${this.escapeHtml(tooltipText)}">
                ${emojiHtml}
                ${this.escapeHtml(label)}
                ${callback ? `<span class="callback-badge">📞</span>` : ''}
                ${tooltipHtml}
            </button>
        `;
    }

    /**
     * Generate HTML for button components
     */
    private generateButtonsHtml(buttons: ComponentData[]): string {
        return buttons.map((button, index) => {
            const props = button.properties as any;
            const style = props.style || 'secondary';
            const label = props.label || 'Button';
            const disabled = props.disabled || false;
            const emoji = props.emoji || '';
            const customId = props.custom_id || '';
            const url = props.url || '';
            const callback = props.callback || '';
            const line = button.line || 0;

            const styleClass = `button-${style}`;
            const disabledAttr = disabled ? 'disabled' : '';
            const emojiHtml = emoji ? `<span class="emoji">${this.escapeHtml(emoji)}</span>` : '';

            let infoText = `Line ${line}`;
            if (customId) {
                infoText += ` • ID: ${customId}`;
            }
            if (url) {
                infoText += ` • URL: ${url}`;
            }
            if (callback) {
                infoText += ` • Callback: ${callback}`;
            }

            const tooltipHtml = callback ? `<span class="tooltip">Callback: ${this.escapeHtml(callback)}()</span>` : '';

            return `
                <div class="component-group">
                    <div class="button-container">
                        <button class="discord-button ${styleClass}" ${disabledAttr}>
                            ${emojiHtml}
                            ${this.escapeHtml(label)}
                            ${callback ? `<span class="callback-badge">📞 ${this.escapeHtml(callback)}</span>` : ''}
                            ${tooltipHtml}
                        </button>
                    </div>
                    <div class="component-info">${this.escapeHtml(infoText)}</div>
                </div>
            `;
        }).join('');
    }

    /**
     * Generate HTML for select menu components
     */
    private generateSelectMenusHtml(selectMenus: ComponentData[]): string {
        return selectMenus.map((select, index) => {
            const props = select.properties as any;
            const placeholder = props.placeholder || 'Select an option';
            const customId = props.custom_id || '';
            const disabled = props.disabled || false;
            const minValues = props.min_values || 1;
            const maxValues = props.max_values || 1;
            const options = props.options || [];
            const callback = props.callback || '';
            const line = select.line || 0;

            const disabledAttr = disabled ? 'disabled' : '';
            
            const optionsHtml = options.map((opt: any) => {
                const optEmoji = opt.emoji ? `${opt.emoji} ` : '';
                const optDesc = opt.description ? ` - ${opt.description}` : '';
                return `<option value="${this.escapeHtml(opt.value || '')}">${optEmoji}${this.escapeHtml(opt.label || '')}${optDesc}</option>`;
            }).join('');

            let infoText = `Line ${line}`;
            if (customId) {
                infoText += ` • ID: ${customId}`;
            }
            if (minValues !== 1 || maxValues !== 1) {
                infoText += ` • Values: ${minValues}-${maxValues}`;
            }
            if (callback) {
                infoText += ` • Callback: ${callback}`;
            }

            const tooltipHtml = callback ? `<span class="tooltip">Callback: ${this.escapeHtml(callback)}()</span>` : '';

            return `
                <div class="component-group">
                    <select class="discord-select" ${disabledAttr} ${maxValues > 1 ? 'multiple' : ''}>
                        <option class="select-placeholder" disabled selected>${this.escapeHtml(placeholder)}</option>
                        ${optionsHtml}
                        ${tooltipHtml}
                    </select>
                    ${callback ? `<span class="callback-badge">📞 ${this.escapeHtml(callback)}</span>` : ''}
                    <div class="component-info">${this.escapeHtml(infoText)}</div>
                </div>
            `;
        }).join('');
    }

    /**
     * Generate HTML for text input components
     */
    private generateTextInputsHtml(textInputs: ComponentData[]): string {
        return textInputs.map((input, index) => {
            const props = input.properties as any;
            const label = props.label || 'Input';
            const style = props.style || 'short';
            const placeholder = props.placeholder || '';
            const defaultValue = props.default || '';
            const customId = props.custom_id || '';
            const required = props.required || false;
            const minLength = props.min_length || 0;
            const maxLength = props.max_length || 4000;
            const line = input.line || 0;

            const isParagraph = style === 'paragraph';
            const inputType = isParagraph ? 'textarea' : 'input';
            const inputClass = isParagraph ? 'discord-text-input discord-textarea' : 'discord-text-input';

            let infoText = `Line ${line} • Style: ${style}`;
            if (customId) {
                infoText += ` • ID: ${customId}`;
            }
            if (required) {
                infoText += ` • Required`;
            }
            if (minLength > 0 || maxLength < 4000) {
                infoText += ` • Length: ${minLength}-${maxLength}`;
            }

            const inputHtml = isParagraph
                ? `<textarea class="${inputClass}" placeholder="${this.escapeHtml(placeholder)}" ${required ? 'required' : ''} minlength="${minLength}" maxlength="${maxLength}">${this.escapeHtml(defaultValue)}</textarea>`
                : `<input type="text" class="${inputClass}" placeholder="${this.escapeHtml(placeholder)}" value="${this.escapeHtml(defaultValue)}" ${required ? 'required' : ''} minlength="${minLength}" maxlength="${maxLength}">`;

            return `
                <div class="component-group">
                    <label class="input-label">${this.escapeHtml(label)}</label>
                    ${inputHtml}
                    <div class="component-info">${this.escapeHtml(infoText)}</div>
                </div>
            `;
        }).join('');
    }

    /**
     * Escape HTML special characters
     */
    private escapeHtml(text: string): string {
        const map: { [key: string]: string } = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    }
}
