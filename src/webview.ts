import * as vscode from 'vscode';
import { ComponentData, ParseError, ButtonStyle, ValidationWarning } from './types';
import { groupByRow } from './validator';

/**
 * Manages the webview panel for Discord component preview (read-only)
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

        // Handle messages from webview (preview only - no editing)
        this.panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'showCallback':
                        this.handleShowCallback(message.callback, message.line);
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

        // Generate View/Modal structures HTML with hierarchy
        const viewsHtml = views && views.length > 0 ? this.generateHierarchicalViewsHtml(views, sourceCode) : '';

        // Generate components HTML with ActionRow structure (legacy flat view)
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
            --bg-message: #313338;
            --bg-message-hover: #2e3035;
            --text-primary: #ffffff;
            --text-secondary: #dcddde;
            --text-muted: #b9bbbe;
            --text-disabled: #72767d;
            --accent-primary: #5865F2;
            --accent-success: #3BA55D;
            --accent-warning: #FEE75C;
            --accent-danger: #ED4245;
            --button-secondary-bg: #4E5058;
            --shadow-color: rgba(0, 0, 0, 0.2);
        }

        :root[data-theme="light"] {
            --bg-primary: #ffffff;
            --bg-secondary: #f2f3f5;
            --bg-tertiary: #e3e5e8;
            --bg-modifier: #d4d7dc;
            --bg-message: #ffffff;
            --bg-message-hover: #f9f9f9;
            --text-primary: #060607;
            --text-secondary: #2e3338;
            --text-muted: #5c5e66;
            --text-disabled: #9a9c9f;
            --accent-primary: #5865F2;
            --accent-success: #3BA55D;
            --accent-warning: #FEE75C;
            --accent-danger: #ED4245;
            --button-secondary-bg: #e3e5e8;
            --shadow-color: rgba(0, 0, 0, 0.1);
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'gg sans', 'Noto Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif;
            background-color: var(--bg-primary);
            color: var(--text-secondary);
            padding: 20px;
            transition: background-color 0.3s, color 0.3s;
        }

        .container {
            max-width: 900px;
            margin: 0 auto;
        }

        /* Discord Message Preview Styles */
        .discord-message-preview {
            background-color: var(--bg-message);
            padding: 16px 16px 16px 72px;
            position: relative;
            border-radius: 8px;
            margin-bottom: 16px;
            transition: background-color 0.1s ease;
        }

        .discord-message-preview:hover {
            background-color: var(--bg-message-hover);
        }

        .message-avatar {
            position: absolute;
            left: 16px;
            top: 16px;
            width: 40px;
            height: 40px;
            border-radius: 50%;
            background: linear-gradient(135deg, #5865F2 0%, #7289da 100%);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 20px;
            color: white;
            cursor: pointer;
        }

        .message-header {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 4px;
        }

        .message-username {
            font-weight: 600;
            font-size: 16px;
            color: var(--text-primary);
            cursor: pointer;
        }

        .message-username:hover {
            text-decoration: underline;
        }

        .bot-tag {
            display: inline-flex;
            align-items: center;
            background-color: var(--accent-primary);
            color: white;
            font-size: 10px;
            font-weight: 500;
            padding: 0 4px;
            border-radius: 3px;
            height: 16px;
            line-height: 16px;
            text-transform: uppercase;
            letter-spacing: 0.02em;
        }

        .message-timestamp {
            color: var(--text-muted);
            font-size: 12px;
            font-weight: 400;
            margin-left: 4px;
        }

        .message-content {
            color: var(--text-secondary);
            font-size: 16px;
            line-height: 1.375;
            margin-bottom: 8px;
            word-wrap: break-word;
        }

        .message-components {
            display: flex;
            flex-direction: column;
            gap: 8px;
            margin-top: 4px;
        }

        .message-action-row {
            display: flex;
            flex-wrap: wrap;
            gap: 12px;
        }

        /* View Title in Message */
        .view-title-badge {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            background-color: var(--bg-tertiary);
            color: var(--text-muted);
            padding: 4px 10px;
            border-radius: 4px;
            font-size: 12px;
            margin-bottom: 8px;
        }

        .view-title-badge .view-icon {
            font-size: 14px;
        }

        /* Modal Overlay Preview */
        .modal-overlay-preview {
            position: relative;
            background: rgba(0, 0, 0, 0.85);
            border-radius: 8px;
            padding: 40px;
            margin-bottom: 16px;
            display: flex;
            justify-content: center;
            align-items: flex-start;
        }

        .discord-modal-preview {
            background-color: var(--bg-secondary);
            border-radius: 4px;
            width: 100%;
            max-width: 440px;
            box-shadow: 0 0 0 1px rgba(0,0,0,.2), 0 8px 16px rgba(0,0,0,.24);
            overflow: hidden;
        }

        .modal-header {
            padding: 16px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .modal-title {
            font-size: 20px;
            font-weight: 600;
            color: var(--text-primary);
            line-height: 24px;
        }

        .modal-close-btn {
            width: 24px;
            height: 24px;
            border: none;
            background: transparent;
            color: var(--text-muted);
            cursor: pointer;
            font-size: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 4px;
            transition: background-color 0.2s, color 0.2s;
        }

        .modal-close-btn:hover {
            background-color: var(--bg-modifier);
            color: var(--text-primary);
        }

        .modal-body {
            padding: 0 16px 20px;
        }

        .modal-input-group {
            margin-bottom: 20px;
        }

        .modal-input-group:last-child {
            margin-bottom: 0;
        }

        .modal-input-label {
            display: block;
            color: var(--text-primary);
            font-size: 12px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.02em;
            margin-bottom: 8px;
        }

        .modal-input-label .required {
            color: var(--accent-danger);
            padding-left: 4px;
        }

        .modal-footer {
            padding: 16px;
            background-color: var(--bg-tertiary);
            display: flex;
            justify-content: flex-end;
            gap: 8px;
        }

        /* Preview Mode Tabs */
        .preview-mode-tabs {
            display: flex;
            gap: 4px;
            margin-bottom: 16px;
            background-color: var(--bg-tertiary);
            padding: 4px;
            border-radius: 6px;
            width: fit-content;
        }

        .preview-mode-tab {
            padding: 8px 16px;
            background: transparent;
            border: none;
            border-radius: 4px;
            color: var(--text-muted);
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .preview-mode-tab:hover {
            color: var(--text-primary);
            background-color: var(--bg-modifier);
        }

        .preview-mode-tab.active {
            color: var(--text-primary);
            background-color: var(--bg-secondary);
        }

        /* Discord Channel Header */
        .discord-channel-header {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 12px 16px;
            background-color: var(--bg-secondary);
            border-bottom: 1px solid var(--bg-tertiary);
            border-radius: 8px 8px 0 0;
            margin-bottom: 0;
        }

        .channel-hash {
            color: var(--text-muted);
            font-size: 24px;
            font-weight: 400;
        }

        .channel-name {
            color: var(--text-primary);
            font-weight: 600;
            font-size: 16px;
        }

        .discord-channel-content {
            background-color: var(--bg-primary);
            padding: 16px 0;
            border-radius: 0 0 8px 8px;
            min-height: 200px;
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

/* Component animations */
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateX(-20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        .component-item,
        .hierarchy-item,
        .discord-button,
        .discord-select {
          animation: fadeIn 0.3s ease-out;
        }

        .action-row {
          animation: slideIn 0.4s ease-out;
        }

        .preview-section {
          background-color: var(--bg-secondary);
          border-radius: 8px;
          padding: 20px;
          margin-bottom: 20px;
          transition: box-shadow 0.3s ease;
        }

        .preview-section:hover {
          box-shadow: 0 4px 12px var(--shadow-color);
        }

        .section-title {
            color: var(--text-primary);
            font-size: 16px;
            margin-bottom: 16px;
            font-weight: 600;
        }

        .component-group {
            margin-bottom: 20px;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .editable-component {
            position: relative;
            border-radius: 8px;
            padding: 8px;
            margin: -8px;
        }

        .editable-component:hover {
            background-color: rgba(88, 101, 242, 0.1);
            transform: translateY(-1px);
        }

        .editable-component .edit-hint {
            opacity: 0;
            transition: opacity 0.2s ease;
            color: var(--accent-primary);
            font-size: 12px;
            margin-left: 8px;
        }

        .editable-component:hover .edit-hint {
            opacity: 1;
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

        /* Hierarchical View Styles */
        .view-hierarchy {
            background-color: var(--bg-tertiary);
            border-radius: 8px;
            margin-bottom: 16px;
            border-left: 4px solid var(--accent-primary);
            overflow: hidden;
        }

        .view-hierarchy.view-modal {
            border-left-color: var(--accent-success);
        }

        .view-hierarchy.collapsed .view-body {
            display: none;
        }

        .view-hierarchy.collapsed .collapse-icon {
            transform: rotate(-90deg);
        }

        .view-hierarchy .view-header {
            padding: 16px;
            cursor: pointer;
            user-select: none;
            transition: background-color 0.2s;
        }

        .view-hierarchy .view-header:hover {
            background-color: rgba(255, 255, 255, 0.05);
        }

        .collapse-icon {
            display: inline-block;
            transition: transform 0.2s;
            font-size: 12px;
            color: var(--text-muted);
        }

        .view-body {
            padding: 0 16px 16px 16px;
        }

        .empty-view {
            color: var(--text-muted);
            font-style: italic;
            padding: 12px;
            text-align: center;
        }

        /* Hierarchy Node Styles */
        .hierarchy-node {
            margin: 8px 0;
            border-radius: 6px;
            overflow: hidden;
        }

        .hierarchy-node.collapsed .node-children {
            display: none;
        }

        .hierarchy-node.collapsed .collapse-icon {
            transform: rotate(-90deg);
        }

        .node-header {
            padding: 10px 12px;
            background-color: rgba(255, 255, 255, 0.03);
            cursor: pointer;
            user-select: none;
            display: flex;
            align-items: center;
            gap: 8px;
            transition: background-color 0.2s;
        }

        .node-header:hover {
            background-color: rgba(255, 255, 255, 0.08);
        }

        .node-icon {
            font-size: 16px;
        }

        .node-label {
            color: var(--text-primary);
            font-weight: 500;
            font-size: 14px;
        }

        .node-type {
            color: var(--text-muted);
            font-size: 12px;
            background-color: rgba(255, 255, 255, 0.05);
            padding: 2px 6px;
            border-radius: 3px;
        }

        .node-count {
            color: var(--text-disabled);
            font-size: 12px;
            margin-left: auto;
        }

        .node-line {
            color: var(--text-disabled);
            font-size: 11px;
            margin-left: auto;
        }

        .node-children {
            padding: 8px 0 8px 20px;
        }

        .node-items-grid {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            padding: 12px;
            background-color: rgba(0, 0, 0, 0.1);
        }

        .container-node {
            border-left: 3px solid #5865F2;
        }

        .section-node {
            border-left: 3px solid #3BA55D;
        }

        .actionrow-node {
            border-left: 3px solid #FEE75C;
        }

        .actionrow-node.row-error {
            border-left-color: var(--accent-danger);
            background-color: rgba(237, 66, 69, 0.05);
        }

        .hierarchy-button {
            margin: 0 !important;
        }

        .hierarchy-select,
        .hierarchy-textinput {
            margin: 8px 0;
        }

        .hierarchy-textinput label {
            display: block;
            color: var(--text-primary);
            font-size: 13px;
            font-weight: 600;
            margin-bottom: 6px;
        }

        .discord-input {
            background-color: #1e1f22;
            border: 1px solid #1e1f22;
            border-radius: 3px;
            color: #dbdee1;
            font-size: 14px;
            padding: 8px 12px;
            width: 100%;
            max-width: 400px;
        }

        .discord-input:focus {
            border-color: #00AFF4;
            outline: none;
        }

        /* New Component Styles */
        .hierarchy-textdisplay {
            margin: 8px 0;
            padding: 12px;
            background-color: rgba(255, 255, 255, 0.02);
            border-radius: 4px;
            border-left: 3px solid #99AAB5;
        }

        .text-display-content {
            color: var(--text-primary);
            font-size: 14px;
            line-height: 1.6;
        }

        .text-display-bold .text-display-content {
            font-weight: 600;
        }

        .text-display-italic .text-display-content {
            font-style: italic;
        }

        .hierarchy-label {
            margin: 8px 0;
        }

        .discord-label {
            display: inline-block;
            color: var(--text-muted);
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .hierarchy-separator {
            margin: 12px 0;
        }

        .discord-separator {
            border: none;
            border-top: 1px solid var(--bg-modifier);
            margin: 0;
        }

        .separator-small {
            margin: 6px 0;
        }

        .separator-medium {
            margin: 12px 0;
        }

        .separator-large {
            margin: 24px 0;
        }

        .hierarchy-thumbnail {
            margin: 8px 0;
            display: flex;
            justify-content: flex-start;
        }

        .discord-thumbnail {
            border-radius: 8px;
            border: 2px solid var(--bg-modifier);
            object-fit: cover;
        }

        /* File Component */
        .hierarchy-file {
            margin: 8px 0;
        }

        .discord-file {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px 16px;
            background-color: var(--bg-elevated);
            border-radius: 4px;
            border-left: 3px solid #7289da;
        }

        .file-icon {
            font-size: 32px;
            line-height: 1;
        }

        .file-info {
            flex: 1;
        }

        .file-name {
            font-weight: 600;
            color: var(--text-normal);
            margin-bottom: 4px;
        }

        .file-size {
            font-size: 12px;
            color: var(--text-muted);
        }

        .file-url {
            font-size: 11px;
            color: var(--text-faint);
            margin-top: 4px;
            word-break: break-all;
        }

        /* MediaGallery Component */
        .hierarchy-media-gallery {
            margin: 8px 0;
        }

        .discord-media-gallery {
            padding: 12px 16px;
            background-color: var(--bg-elevated);
            border-radius: 4px;
            border-left: 3px solid #43b581;
        }

        .media-gallery-header {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 12px;
        }

        .media-gallery-icon {
            font-size: 20px;
        }

        .media-gallery-title {
            font-weight: 600;
            color: var(--text-normal);
        }

        .media-gallery-preview {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
        }

        .media-placeholder {
            width: 80px;
            height: 80px;
            background: linear-gradient(135deg, #5865f2 0%, #7289da 100%);
            border-radius: 4px;
            position: relative;
            overflow: hidden;
        }

        .media-placeholder::after {
            content: '🖼️';
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            font-size: 24px;
            opacity: 0.6;
        }

        /* FileUpload Component */
        .hierarchy-file-upload {
            margin: 8px 0;
        }

        .discord-file-upload {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px 16px;
            background-color: var(--bg-elevated);
            border-radius: 4px;
            border: 2px dashed #5865f2;
        }

        .file-upload-icon {
            font-size: 32px;
            line-height: 1;
            opacity: 0.8;
        }

        .file-upload-info {
            flex: 1;
        }

        .file-upload-label {
            font-weight: 600;
            color: var(--text-normal);
            margin-bottom: 6px;
        }

        .file-upload-details {
            font-size: 12px;
            color: var(--text-muted);
        }

        .file-upload-details > div {
            margin-top: 2px;
        }

        /* LayoutView Badge */
        .layout-badge {
            background-color: #FEE75C;
            color: #2C2F33;
            padding: 2px 8px;
            border-radius: 3px;
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
        }

        .view-hierarchy.view-layoutview {
            border-left-color: #FEE75C;
        }

        .view-hierarchy.layout-view .view-header::after {
            content: '';
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
        
        <h1>🎮 Discord Component Preview</h1>
        <p class="subtitle">Live preview of discord.py ComponentV2 elements</p>

        ${errorsHtml}
        ${warningsHtml}

        <!-- Preview Mode Tabs -->
        <div class="preview-mode-tabs">
            <button class="preview-mode-tab active" onclick="setPreviewMode('message')" data-mode="message">💬 Message View</button>
            <button class="preview-mode-tab" onclick="setPreviewMode('hierarchy')" data-mode="hierarchy">🏗️ Hierarchy View</button>
        </div>

        <!-- Message Preview Mode -->
        <div id="message-preview-mode">
            ${viewsHtml}
        </div>

        <!-- Hierarchy Preview Mode (Hidden by default) -->
        <div id="hierarchy-preview-mode" style="display: none;">
            <div class="preview-section">
                <div class="section-title">📊 Action Rows & Components</div>
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
        </div>

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

        <!-- GUI Builder -->
        <div class="preview-section" style="margin-top: 16px;">
            <div class="section-title">🛠️ Quick Add</div>
            <div class="gui-builder">
                <button class="add-component-btn" onclick="addComponent('button')">➕ Add Button</button>
                <button class="add-component-btn" onclick="addComponent('select')">➕ Add Select Menu</button>
            </div>
        </div>
    </div>
    <script>
        const vscode = acquireVsCodeApi();
        
        // Theme management
        let currentTheme = 'dark';
        let currentPreviewMode = 'message';

        function setPreviewMode(mode) {
            currentPreviewMode = mode;
            
            // Update tabs
            document.querySelectorAll('.preview-mode-tab').forEach(tab => {
                tab.classList.toggle('active', tab.dataset.mode === mode);
            });
            
            // Update visibility
            document.getElementById('message-preview-mode').style.display = mode === 'message' ? 'block' : 'none';
            document.getElementById('hierarchy-preview-mode').style.display = mode === 'hierarchy' ? 'block' : 'none';
            
            // Save state
            const state = vscode.getState() || {};
            state.previewMode = mode;
            vscode.setState(state);
        }
        
        function toggleTheme() {
            currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', currentTheme);
            
            // Update button text
            const btn = document.querySelector('.theme-toggle');
            btn.textContent = currentTheme === 'dark' ? '☀️ Toggle Theme' : '🌙 Toggle Theme';
            
            // Save theme preference
            const state = vscode.getState() || {};
            state.theme = currentTheme;
            vscode.setState(state);
        }
        
        // Restore state
        const state = vscode.getState();
        if (state) {
            if (state.theme) {
                currentTheme = state.theme;
                document.documentElement.setAttribute('data-theme', currentTheme);
                const btn = document.querySelector('.theme-toggle');
                btn.textContent = currentTheme === 'dark' ? '☀️ Toggle Theme' : '🌙 Toggle Theme';
            }
            if (state.previewMode) {
                setPreviewMode(state.previewMode);
            }
        }

        // Drag and Drop functionality
        let draggedElement = null;
        let draggedIndex = null;
        let isDragging = false;

        function enableDragAndDrop() {
            const components = document.querySelectorAll('[data-component-index]');
            
            components.forEach((component, index) => {
                component.setAttribute('draggable', 'true');
                
                component.addEventListener('dragstart', (e) => {
                    isDragging = true;
                    draggedElement = component;
                    draggedIndex = parseInt(component.getAttribute('data-component-index'));
                    component.style.opacity = '0.5';
                    e.dataTransfer.effectAllowed = 'move';
                });
                
                component.addEventListener('dragend', (e) => {
                    setTimeout(() => { isDragging = false; }, 100);
                    component.style.opacity = '1';
                    draggedElement = null;
                    draggedIndex = null;
                });
                
                component.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    
                    if (draggedElement && draggedElement !== component) {
                        const rect = component.getBoundingClientRect();
                        const midpoint = rect.top + rect.height / 2;
                        
                        if (e.clientY < midpoint) {
                            component.style.borderTop = '3px solid var(--accent-primary)';
                            component.style.borderBottom = '';
                        } else {
                            component.style.borderBottom = '3px solid var(--accent-primary)';
                            component.style.borderTop = '';
                        }
                    }
                });
                
                component.addEventListener('dragleave', (e) => {
                    component.style.borderTop = '';
                    component.style.borderBottom = '';
                });
                
                component.addEventListener('drop', (e) => {
                    e.preventDefault();
                    component.style.borderTop = '';
                    component.style.borderBottom = '';
                    
                    if (draggedElement && draggedElement !== component) {
                        const targetIndex = parseInt(component.getAttribute('data-component-index'));
                        const rect = component.getBoundingClientRect();
                        const midpoint = rect.top + rect.height / 2;
                        const insertBefore = e.clientY < midpoint;
                        
                        vscode.postMessage({
                            command: 'reorderComponents',
                            sourceIndex: draggedIndex,
                            targetIndex: targetIndex,
                            insertBefore: insertBefore
                        });
                    }
                });
            });
        }

        // Initialize drag and drop after DOM is loaded
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', enableDragAndDrop);
        } else {
            enableDragAndDrop();
        }

        // Handle component clicks (distinguish from drag)
        document.addEventListener('click', (e) => {
            if (isDragging) {
                return; // Ignore clicks during drag
            }

            const component = e.target.closest('.editable-component');
            if (component) {
                const line = parseInt(component.getAttribute('data-line'));
                if (line > 0) {
                    editComponentAtLine(line);
                }
            }
        });
        
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

        // Handle edit component at line (from preview click)
        function editComponentAtLine(line) {
            if (line > 0) {
                vscode.postMessage({
                    command: 'editComponent',
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
     * Generate HTML for View/Modal structures (legacy flat view)
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
     * Generate HTML for hierarchical View/Modal structures as Discord message format
     */
    private generateHierarchicalViewsHtml(views: any[], sourceCode?: string): string {
        if (views.length === 0) {
            return `
                <div class="discord-channel-header">
                    <span class="channel-hash">#</span>
                    <span class="channel-name">preview-channel</span>
                </div>
                <div class="discord-channel-content">
                    <div class="discord-message-preview">
                        <div class="message-avatar">🤖</div>
                        <div class="message-header">
                            <span class="message-username">Bot</span>
                            <span class="bot-tag">BOT</span>
                            <span class="message-timestamp">Today at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <div class="message-content">
                            <em style="color: var(--text-muted);">No components detected. Add View or Modal classes to preview.</em>
                        </div>
                    </div>
                </div>
            `;
        }

        const viewsHtml = views.map(view => {
            const isModal = view.type === 'Modal';

            if (isModal) {
                return this.renderModalPreview(view, sourceCode);
            } else {
                return this.renderMessagePreview(view, sourceCode);
            }
        }).join('');

        return `
            <div class="discord-channel-header">
                <span class="channel-hash">#</span>
                <span class="channel-name">preview-channel</span>
            </div>
            <div class="discord-channel-content">
                ${viewsHtml}
            </div>
        `;
    }

    /**
     * Render View as Discord message preview
     */
    private renderMessagePreview(view: any, sourceCode?: string): string {
        const hasHierarchy = view.children && view.children.length > 0;
        const hasComponents = view.components && view.components.length > 0;
        const isLayoutView = view.isLayoutView || view.type === 'LayoutView';
        const typeIcon = isLayoutView ? '🎨' : '📦';

        // Collect all components - combine hierarchy children and direct components
        let actionRows: any[] = [];

        // Start with hierarchy children
        if (hasHierarchy) {
            actionRows = this.collectActionRows(view.children);
        }

        // Also include components that might not be in children (e.g., decorator-based)
        if (hasComponents) {
            const componentRows = this.groupComponentsIntoRows(view.components);
            actionRows = this.mergeActionRows(actionRows, componentRows);
        }

        const hasContent = actionRows.length > 0;

        return `
            <div class="discord-message-preview">
                <div class="message-avatar">🤖</div>
                <div class="message-header">
                    <span class="message-username">${this.escapeHtml(view.name)}</span>
                    <span class="bot-tag">BOT</span>
                    <span class="message-timestamp">Today at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div class="view-title-badge" onclick="jumpToLine(${view.line})" style="cursor: pointer;">
                    <span class="view-icon">${typeIcon}</span>
                    <span>${view.type}${isLayoutView ? ' (Manual Layout)' : ''}</span>
                    <span style="color: var(--text-disabled);">Line ${view.line}</span>
                </div>
                <div class="message-components">
                    ${hasContent
                ? this.renderMessageActionRows(actionRows, sourceCode)
                : '<p class="no-components" style="margin: 0; font-size: 14px;">No components in this view</p>'
            }
                </div>
            </div>
        `;
    }

    /**
     * Render Modal as overlay preview
     */
    private renderModalPreview(view: any, sourceCode?: string): string {
        const hasHierarchy = view.children && view.children.length > 0;
        const hasComponents = view.components && view.components.length > 0;

        // Collect text inputs from hierarchy and components
        let textInputs = this.collectTextInputs(view.children || []);

        // Also include text inputs from components (for class-level TextInput attributes)
        if (hasComponents) {
            const componentInputs = view.components.filter((c: any) => c.type === 'text_input');
            // Avoid duplicates by line number
            const seenLines = new Set(textInputs.map((t: any) => t.line));
            for (const input of componentInputs) {
                if (!seenLines.has(input.line)) {
                    textInputs.push(input);
                }
            }
        }

        return `
            <div class="modal-overlay-preview">
                <div class="discord-modal-preview">
                    <div class="modal-header">
                        <span class="modal-title">${this.escapeHtml(view.name)}</span>
                        <button class="modal-close-btn">✕</button>
                    </div>
                    <div class="modal-body">
                        ${textInputs.length > 0
                ? textInputs.map((input: any) => this.renderModalTextInput(input)).join('')
                : '<p style="color: var(--text-muted); text-align: center; padding: 20px;">No text inputs in this modal</p>'
            }
                    </div>
                    <div class="modal-footer">
                        <button class="discord-button button-secondary">Cancel</button>
                        <button class="discord-button button-primary">Submit</button>
                    </div>
                </div>
            </div>
            <div style="text-align: center; color: var(--text-muted); font-size: 12px; margin-bottom: 16px;">
                📋 Modal: ${this.escapeHtml(view.name)} • <span onclick="jumpToLine(${view.line})" style="cursor: pointer; text-decoration: underline;">Line ${view.line}</span>
            </div>
        `;
    }

    /**
     * Render text input in modal style
     */
    private renderModalTextInput(textInput: any): string {
        const props = textInput.properties || {};
        const label = props.label || 'Input';
        const placeholder = props.placeholder || '';
        const required = props.required || false;
        const style = props.style || 'short';
        const isParagraph = style === 'paragraph';

        return `
            <div class="modal-input-group">
                <label class="modal-input-label">
                    ${this.escapeHtml(label)}
                    ${required ? '<span class="required">*</span>' : ''}
                </label>
                ${isParagraph
                ? `<textarea class="discord-text-input discord-textarea" placeholder="${this.escapeHtml(placeholder)}"></textarea>`
                : `<input type="text" class="discord-text-input" placeholder="${this.escapeHtml(placeholder)}" />`
            }
            </div>
        `;
    }

    /**
     * Collect ActionRows from hierarchy, grouping items by row
     */
    private collectActionRows(nodes: any[]): any[] {
        const actionRows: any[] = [];
        const itemsByRow: Map<number, any[]> = new Map();

        const traverse = (items: any[]) => {
            for (const node of items) {
                if (node.nodeType === 'actionrow') {
                    // Explicit ActionRow node
                    actionRows.push(node);
                } else if (node.nodeType === 'item') {
                    // Direct item - group by row number
                    const rowNum = node.data?.properties?.row ?? node.data?.row ?? 0;
                    if (!itemsByRow.has(rowNum)) {
                        itemsByRow.set(rowNum, []);
                    }
                    itemsByRow.get(rowNum)!.push(node);
                } else if (node.children) {
                    traverse(node.children);
                }
            }
        };

        traverse(nodes);

        // Convert itemsByRow to ActionRow-like structures
        const sortedRows = Array.from(itemsByRow.keys()).sort((a, b) => a - b);
        for (const rowNum of sortedRows) {
            const items = itemsByRow.get(rowNum)!;
            actionRows.push({
                nodeType: 'actionrow',
                row: rowNum,
                children: items
            });
        }

        // Sort actionRows by row number
        actionRows.sort((a, b) => (a.row ?? 0) - (b.row ?? 0));

        return actionRows;
    }

    /**
     * Group components directly into rows (fallback when no hierarchy)
     */
    private groupComponentsIntoRows(components: any[]): any[] {
        const rowMap: Map<number, any[]> = new Map();

        for (const component of components) {
            const rowNum = component.properties?.row ?? component.row ?? 0;
            if (!rowMap.has(rowNum)) {
                rowMap.set(rowNum, []);
            }
            rowMap.get(rowNum)!.push({
                nodeType: 'item',
                data: component
            });
        }

        const sortedRows = Array.from(rowMap.keys()).sort((a, b) => a - b);
        return sortedRows.map(rowNum => ({
            nodeType: 'actionrow',
            row: rowNum,
            children: rowMap.get(rowNum)!
        }));
    }

    /**
     * Merge two sets of action rows, avoiding duplicates based on line number
     */
    private mergeActionRows(rows1: any[], rows2: any[]): any[] {
        const rowMap: Map<number, any[]> = new Map();
        const seenLines: Set<number> = new Set();

        // Helper to add items from a row
        const addRowItems = (row: any) => {
            const rowNum = row.row ?? 0;
            if (!rowMap.has(rowNum)) {
                rowMap.set(rowNum, []);
            }
            const items = row.children || [];
            for (const item of items) {
                const line = item.data?.line || item.line || 0;
                if (line > 0 && seenLines.has(line)) {
                    continue; // Skip duplicate
                }
                if (line > 0) {
                    seenLines.add(line);
                }
                rowMap.get(rowNum)!.push(item);
            }
        };

        // Process both sets of rows
        for (const row of rows1) {
            addRowItems(row);
        }
        for (const row of rows2) {
            addRowItems(row);
        }

        // Convert back to array
        const sortedRows = Array.from(rowMap.keys()).sort((a, b) => a - b);
        return sortedRows.map(rowNum => ({
            nodeType: 'actionrow',
            row: rowNum,
            children: rowMap.get(rowNum)!
        }));
    }

    /**
     * Collect TextInputs from hierarchy
     */
    private collectTextInputs(nodes: any[]): any[] {
        const inputs: any[] = [];

        const traverse = (items: any[]) => {
            for (const node of items) {
                if (node.nodeType === 'item' && node.data?.type === 'text_input') {
                    inputs.push(node.data);
                } else if (node.children) {
                    traverse(node.children);
                }
            }
        };

        traverse(nodes);
        return inputs;
    }

    /**
     * Render ActionRows in message format (horizontal layout)
     */
    private renderMessageActionRows(actionRows: any[], sourceCode?: string): string {
        if (actionRows.length === 0) {
            return '';
        }

        return actionRows.map(row => {
            const children = row.children || [];
            const itemCount = children.length;
            const isOverLimit = itemCount > 5;

            return `
                <div class="message-action-row ${isOverLimit ? 'row-error' : ''}" 
                     style="${isOverLimit ? 'outline: 2px solid var(--accent-danger); outline-offset: 2px; border-radius: 4px;' : ''}">
                    ${children.map((child: any) => this.renderMessageComponent(child, sourceCode)).join('')}
                </div>
                ${isOverLimit ? `<div style="color: var(--accent-danger); font-size: 11px; margin-top: -4px;">⚠️ Row has ${itemCount} components (max 5)</div>` : ''}
            `;
        }).join('');
    }

    /**
     * Render a single component in message format
     */
    private renderMessageComponent(node: any, sourceCode?: string): string {
        if (node.nodeType !== 'item' || !node.data) {
            return '';
        }

        const data = node.data;

        switch (data.type) {
            case 'button':
                return this.renderMessageButton(data, sourceCode);
            case 'select_menu':
                return this.renderMessageSelect(data);
            case 'text_display':
                return this.renderMessageTextDisplay(data);
            default:
                return '';
        }
    }

    /**
     * Render Button in message format
     */
    private renderMessageButton(button: any, sourceCode?: string): string {
        const props = button.properties || {};
        const style = props.style || 'secondary';
        const label = props.label || 'Button';
        const disabled = props.disabled || false;
        const emoji = props.emoji || '';
        const callback = props.callback || '';
        const line = button.line || 0;

        const styleClass = `button-${style}`;
        const disabledAttr = disabled ? 'disabled' : '';
        const emojiHtml = emoji ? `<span class="emoji">${this.escapeHtml(emoji)}</span>` : '';
        const dataAttrs = `data-callback="${this.escapeHtml(callback)}" data-line="${line}"`;

        return `
            <button class="discord-button ${styleClass} editable-component" 
                    ${disabledAttr} ${dataAttrs} 
                    title="${callback ? `Callback: ${callback}() • Line ${line}` : `Line ${line}`}"
                    onclick="event.stopPropagation(); editComponentAtLine(${line})">
                ${emojiHtml}
                ${this.escapeHtml(label)}
            </button>
        `;
    }

    /**
     * Render Select in message format
     */
    private renderMessageSelect(select: any): string {
        const props = select.properties || {};
        const placeholder = props.placeholder || 'Make a selection';
        const disabled = props.disabled || false;
        const line = select.line || 0;

        return `
            <div class="editable-component" style="flex: 1; max-width: 400px;" 
                 data-line="${line}"
                 onclick="editComponentAtLine(${line})">
                <select class="discord-select" ${disabled ? 'disabled' : ''} style="width: 100%;">
                    <option class="select-placeholder">${this.escapeHtml(placeholder)}</option>
                </select>
            </div>
        `;
    }

    /**
     * Render TextDisplay in message format
     */
    private renderMessageTextDisplay(textDisplay: any): string {
        const props = textDisplay.properties || {};
        const content = props.content || '';
        const line = textDisplay.line || 0;

        return `
            <div class="editable-component" style="width: 100%; padding: 8px 0;" 
                 data-line="${line}"
                 onclick="editComponentAtLine(${line})">
                <span style="color: var(--text-secondary);">${this.escapeHtml(content)}</span>
            </div>
        `;
    }

    /**
     * Generate HTML for hierarchical View/Modal structures (legacy hierarchy view)
     */
    private generateLegacyHierarchicalViewsHtml(views: any[], sourceCode?: string): string {
        if (views.length === 0) {
            return '';
        }

        const viewsHtml = views.map(view => {
            const typeIcon = view.type === 'Modal' ? '📋' : (view.type === 'LayoutView' ? '🎨' : '📦');
            const typeClass = view.type === 'Modal' ? 'view-modal' : (view.type === 'LayoutView' ? 'view-layoutview layout-view' : 'view-view');
            const hasHierarchy = view.children && view.children.length > 0;
            const isLayoutView = view.isLayoutView || view.type === 'LayoutView';

            return `
                <div class="view-hierarchy ${typeClass}">
                    <div class="view-header" onclick="this.parentElement.classList.toggle('collapsed')">
                        <span class="collapse-icon">▼</span>
                        <span class="view-icon">${typeIcon}</span>
                        <span class="view-name">${this.escapeHtml(view.name)}</span>
                        <span class="view-type">${view.type}</span>
                        ${isLayoutView ? '<span class="layout-badge">Manual Layout</span>' : ''}
                        <span class="view-line">Line ${view.line}</span>
                    </div>
                    <div class="view-body">
                        ${hasHierarchy
                    ? this.renderHierarchyChildren(view.children, 0, sourceCode)
                    : '<div class="empty-view">No components</div>'
                }
                    </div>
                </div>
            `;
        }).join('');

        return `
            <div class="preview-section">
                <div class="section-title">📐 Hierarchical Structure (${views.length} View${views.length > 1 ? 's' : ''})</div>
                ${viewsHtml}
            </div>
        `;
    }

    /**
     * Render hierarchy children recursively
     */
    private renderHierarchyChildren(nodes: any[], depth: number, sourceCode?: string): string {
        if (!nodes || nodes.length === 0) {
            return '';
        }

        return nodes.map(node => {
            const indent = depth * 20;

            switch (node.nodeType) {
                case 'container':
                    return this.renderContainer(node, indent);
                case 'section':
                    return this.renderSection(node, indent);
                case 'actionrow':
                    return this.renderHierarchicalActionRow(node, indent, sourceCode);
                case 'item':
                    return this.renderItem(node, indent, sourceCode);
                default:
                    return '';
            }
        }).join('');
    }

    /**
     * Render Container node
     */
    private renderContainer(node: any, indent: number): string {
        const label = node.properties?.label || 'Container';
        const hasChildren = node.children && node.children.length > 0;

        return `
            <div class="hierarchy-node container-node" style="margin-left: ${indent}px">
                <div class="node-header" onclick="this.parentElement.classList.toggle('collapsed')">
                    <span class="collapse-icon">▼</span>
                    <span class="node-icon">📦</span>
                    <span class="node-label">${this.escapeHtml(label)}</span>
                    <span class="node-type">Container</span>
                    ${node.line ? `<span class="node-line">Line ${node.line}</span>` : ''}
                </div>
                <div class="node-children">
                    ${hasChildren ? this.renderHierarchyChildren(node.children, 1, undefined) : ''}
                </div>
            </div>
        `;
    }

    /**
     * Render Section node
     */
    private renderSection(node: any, indent: number): string {
        const label = node.properties?.label || 'Section';
        const hasChildren = node.children && node.children.length > 0;

        return `
            <div class="hierarchy-node section-node" style="margin-left: ${indent}px">
                <div class="node-header" onclick="this.parentElement.classList.toggle('collapsed')">
                    <span class="collapse-icon">▼</span>
                    <span class="node-icon">📑</span>
                    <span class="node-label">${this.escapeHtml(label)}</span>
                    <span class="node-type">Section</span>
                    ${node.line ? `<span class="node-line">Line ${node.line}</span>` : ''}
                </div>
                <div class="node-children">
                    ${hasChildren ? this.renderHierarchyChildren(node.children, 1, undefined) : ''}
                </div>
            </div>
        `;
    }

    /**
     * Render ActionRow node in hierarchy
     */
    private renderHierarchicalActionRow(node: any, indent: number, sourceCode?: string): string {
        const rowNumber = node.row !== undefined ? node.row : 0;
        const hasChildren = node.children && node.children.length > 0;
        const itemCount = node.children ? node.children.length : 0;
        const limitClass = itemCount > 5 ? 'row-error' : '';

        return `
            <div class="hierarchy-node actionrow-node ${limitClass}" style="margin-left: ${indent}px">
                <div class="node-header" onclick="this.parentElement.classList.toggle('collapsed')">
                    <span class="collapse-icon">▼</span>
                    <span class="node-icon">📊</span>
                    <span class="node-label">Row ${rowNumber}</span>
                    <span class="node-count">${itemCount}/5 items</span>
                    ${node.line ? `<span class="node-line">Line ${node.line}</span>` : ''}
                </div>
                <div class="node-children node-items-grid">
                    ${hasChildren ? this.renderHierarchyChildren(node.children, 1, sourceCode) : ''}
                </div>
            </div>
        `;
    }

    /**
     * Render Item node (Button, Select, etc.)
     */
    private renderItem(node: any, indent: number, sourceCode?: string): string {
        const data = node.data;
        if (!data) {
            return '';
        }

        switch (data.type) {
            case 'button':
                return this.renderHierarchicalButton(data, indent, sourceCode);
            case 'select_menu':
                return this.renderHierarchicalSelect(data, indent);
            case 'text_input':
                return this.renderHierarchicalTextInput(data, indent);
            case 'text_display':
                return this.renderTextDisplay(data, indent);
            case 'label':
                return this.renderLabel(data, indent);
            case 'separator':
                return this.renderSeparator(data, indent);
            case 'thumbnail':
                return this.renderThumbnail(data, indent);
            case 'file':
                return this.renderFile(data, indent);
            case 'media_gallery':
                return this.renderMediaGallery(data, indent);
            case 'file_upload':
                return this.renderFileUpload(data, indent);
            default:
                return '';
        }
    }

    /**
     * Render Button in hierarchy
     */
    private renderHierarchicalButton(button: any, indent: number, sourceCode?: string): string {
        const props = button.properties || {};
        const style = props.style || 'secondary';
        const label = props.label || 'Button';
        const disabled = props.disabled || false;
        const emoji = props.emoji || '';
        const callback = props.callback || '';
        const line = button.line || 0;

        const styleClass = `button-${style}`;
        const disabledAttr = disabled ? 'disabled' : '';
        const emojiHtml = emoji ? `<span class="emoji">${this.escapeHtml(emoji)}</span>` : '';
        const dataAttrs = callback ? `data-callback="${this.escapeHtml(callback)}" data-line="${line}"` : '';

        return `
            <button class="discord-button ${styleClass} hierarchy-button" ${disabledAttr} ${dataAttrs} 
                    style="margin-left: ${indent}px" title="${callback ? `Callback: ${callback}()` : ''}">
                ${emojiHtml}
                ${this.escapeHtml(label)}
                ${callback ? '<span class="callback-badge">📞</span>' : ''}
            </button>
        `;
    }

    /**
     * Render Select Menu in hierarchy
     */
    private renderHierarchicalSelect(select: any, indent: number): string {
        const props = select.properties || {};
        const placeholder = props.placeholder || 'Select an option';
        const disabled = props.disabled || false;

        return `
            <div class="hierarchy-select" style="margin-left: ${indent}px">
                <select class="discord-select" ${disabled ? 'disabled' : ''}>
                    <option>${this.escapeHtml(placeholder)}</option>
                </select>
            </div>
        `;
    }

    /**
     * Render Text Input in hierarchy
     */
    private renderHierarchicalTextInput(textInput: any, indent: number): string {
        const props = textInput.properties || {};
        const label = props.label || 'Input';
        const placeholder = props.placeholder || '';

        return `
            <div class="hierarchy-textinput" style="margin-left: ${indent}px">
                <label>${this.escapeHtml(label)}</label>
                <input type="text" placeholder="${this.escapeHtml(placeholder)}" class="discord-input" />
            </div>
        `;
    }

    /**
     * Render TextDisplay component
     */
    private renderTextDisplay(textDisplay: any, indent: number): string {
        const props = textDisplay.properties || {};
        const content = props.content || '';
        const style = props.style || 'plain';
        const styleClass = `text-display-${style}`;

        return `
            <div class="hierarchy-textdisplay ${styleClass}" style="margin-left: ${indent}px">
                <div class="text-display-content">
                    ${this.escapeHtml(content)}
                </div>
            </div>
        `;
    }

    /**
     * Render Label component
     */
    private renderLabel(label: any, indent: number): string {
        const props = label.properties || {};
        const text = props.text || '';

        return `
            <div class="hierarchy-label" style="margin-left: ${indent}px">
                <label class="discord-label">
                    ${this.escapeHtml(text)}
                </label>
            </div>
        `;
    }

    /**
     * Render Separator component
     */
    private renderSeparator(separator: any, indent: number): string {
        const props = separator.properties || {};
        const spacing = props.spacing || 'medium';
        const spacingClass = `separator-${spacing}`;

        return `
            <div class="hierarchy-separator ${spacingClass}" style="margin-left: ${indent}px">
                <hr class="discord-separator" />
            </div>
        `;
    }

    /**
     * Render Thumbnail component
     */
    private renderThumbnail(thumbnail: any, indent: number): string {
        const props = thumbnail.properties || {};
        const url = props.url || '';
        const alt = props.alt || 'Thumbnail';
        const width = props.width || 80;
        const height = props.height || 80;

        return `
            <div class="hierarchy-thumbnail" style="margin-left: ${indent}px">
                <img src="${this.escapeHtml(url)}" 
                     alt="${this.escapeHtml(alt)}"
                     width="${width}"
                     height="${height}"
                     class="discord-thumbnail"
                     onerror="this.style.display='none'" />
            </div>
        `;
    }

    private renderFile(file: any, indent: number): string {
        const props = file.properties || {};
        const filename = props.filename || 'unknown.file';
        const url = props.url || '';
        const size = props.size ? this.formatFileSize(props.size) : '';

        return `
            <div class="hierarchy-file" style="margin-left: ${indent}px">
                <div class="discord-file">
                    <div class="file-icon">📄</div>
                    <div class="file-info">
                        <div class="file-name">${this.escapeHtml(filename)}</div>
                        ${size ? `<div class="file-size">${size}</div>` : ''}
                        ${url ? `<div class="file-url">${this.escapeHtml(url)}</div>` : ''}
                    </div>
                </div>
            </div>
        `;
    }

    private renderMediaGallery(gallery: any, indent: number): string {
        const props = gallery.properties || {};
        const itemCount = (props as any).item_count || (props.items ? props.items.length : 0);
        const items = props.items || [];

        return `
            <div class="hierarchy-media-gallery" style="margin-left: ${indent}px">
                <div class="discord-media-gallery">
                    <div class="media-gallery-header">
                        <span class="media-gallery-icon">🖼️</span>
                        <span class="media-gallery-title">Media Gallery (${itemCount} items)</span>
                    </div>
                    <div class="media-gallery-preview">
                        ${Array.isArray(items) && items.length > 0
                ? items.slice(0, 3).map(() => '<div class="media-placeholder"></div>').join('')
                : '<div class="media-placeholder"></div>'}
                    </div>
                </div>
            </div>
        `;
    }

    private renderFileUpload(upload: any, indent: number): string {
        const props = upload.properties || {};
        const accept = Array.isArray(props.accept) ? props.accept.join(', ') : (props.accept || 'All files');
        const multiple = props.multiple ? 'Yes' : 'No';

        return `
            <div class="hierarchy-file-upload" style="margin-left: ${indent}px">
                <div class="discord-file-upload">
                    <div class="file-upload-icon">📁</div>
                    <div class="file-upload-info">
                        <div class="file-upload-label">File Upload</div>
                        <div class="file-upload-details">
                            <div>Accept: ${this.escapeHtml(accept)}</div>
                            <div>Multiple: ${multiple}</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    private formatFileSize(bytes: number): string {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
        return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
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
                <div class="component-group editable-component" data-component-index="${index}" data-line="${line}">
                    <div class="button-container">
                        <button class="discord-button ${styleClass}" ${disabledAttr}>
                            ${emojiHtml}
                            ${this.escapeHtml(label)}
                            ${callback ? `<span class="callback-badge">📞 ${this.escapeHtml(callback)}</span>` : ''}
                            ${tooltipHtml}
                        </button>
                    </div>
                    <div class="component-info">${this.escapeHtml(infoText)} <span class="edit-hint">✏️ Click to edit</span></div>
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
