import * as vscode from 'vscode';
import * as fs from 'fs';
import { parseComponents, isDiscordPyFile } from './pythonBridge';
import { WebviewManager } from './webview';
import { getPythonPath, getPythonVersion } from './pythonInterpreter';
import { COMPONENT_TEMPLATES, getAllCategories, getTemplatesByCategory } from './templates';
import { ProjectScanner } from './projectScanner';
import { ComponentExporter } from './exporter';
import { ConfigurationManager } from './config';
import { ComponentSearch } from './search';
import * as path from 'path';

let webviewManager: WebviewManager;
let currentDocument: vscode.TextDocument | undefined;
let updateTimeout: NodeJS.Timeout | undefined;
let diagnosticCollection: vscode.DiagnosticCollection;
const DEBOUNCE_DELAY = 500; // ms

/**
 * Activate the extension
 */
export function activate(context: vscode.ExtensionContext) {
    console.log('Discord Component Preview extension is now active');

    // Initialize webview manager
    webviewManager = WebviewManager.getInstance(context.extensionUri);

    // Initialize diagnostic collection
    diagnosticCollection = vscode.languages.createDiagnosticCollection('discord-components');

    // Register command to show preview
    const showPreviewCommand = vscode.commands.registerCommand(
        'discord-preview.showPreview',
        async () => {
            await showPreview();
        }
    );

    // Register command to insert template
    const insertTemplateCommand = vscode.commands.registerCommand(
        'discord-preview.insertTemplate',
        async () => {
            await insertTemplate();
        }
    );

    // Register command to show project overview
    const showProjectOverviewCommand = vscode.commands.registerCommand(
        'discord-preview.showProjectOverview',
        async () => {
            await showProjectOverview();
        }
    );

    // Register command to export components
    const exportComponentsCommand = vscode.commands.registerCommand(
        'discord-preview.exportComponents',
        async () => {
            await exportComponents();
        }
    );

    // Listen for file save events
    const saveListener = vscode.workspace.onDidSaveTextDocument(async (document) => {
        // Only process Python files
        if (document.languageId !== 'python') {
            return;
        }

        // Only update if preview is already visible
        if (webviewManager.isVisible()) {
            await updatePreviewForDocument(document);
        }
    });

    // Listen for active editor changes
    const editorChangeListener = vscode.window.onDidChangeActiveTextEditor(async (editor) => {
        if (!editor || !webviewManager.isVisible()) {
            return;
        }

        const document = editor.document;
        if (document.languageId === 'python') {
            currentDocument = document;
            await updatePreviewForDocument(document);
        }
    });

    // Listen for text document changes (hot reload)
    const textChangeListener = vscode.workspace.onDidChangeTextDocument(async (event) => {
        if (!webviewManager.isVisible()) {
            return;
        }

        const document = event.document;
        if (document.languageId !== 'python') {
            return;
        }

        // Debounce updates
        if (updateTimeout) {
            clearTimeout(updateTimeout);
        }

        updateTimeout = setTimeout(async () => {
            await updatePreviewForDocument(document);
        }, DEBOUNCE_DELAY);
    });

    // Add subscriptions
    context.subscriptions.push(
        showPreviewCommand,
        insertTemplateCommand,
        showProjectOverviewCommand,
        exportComponentsCommand,
        saveListener,
        editorChangeListener,
        textChangeListener,
        diagnosticCollection
    );

    // Register settings commands
    context.subscriptions.push(
        vscode.commands.registerCommand('discord-preview.openSettings', async () => {
            await ConfigurationManager.openSettings();
        }),
        vscode.commands.registerCommand('discord-preview.resetSettings', async () => {
            const confirm = await vscode.window.showWarningMessage(
                'Are you sure you want to reset all Discord Component Preview settings to default?',
                'Reset', 'Cancel'
            );
            if (confirm === 'Reset') {
                await ConfigurationManager.resetToDefault();
            }
        }),
        vscode.commands.registerCommand('discord-preview.searchComponents', async () => {
            await ComponentSearch.searchInWorkspace();
        })
    );

    // Watch for configuration changes
    context.subscriptions.push(
        ConfigurationManager.onDidChange((e) => {
            if (e.affectsConfiguration('discord-preview.theme')) {
                vscode.window.showInformationMessage('Theme changed. Please refresh the preview.');
            }
            if (e.affectsConfiguration('discord-preview.enableCache')) {
                const enabled = ConfigurationManager.get('enableCache', true);
                vscode.window.showInformationMessage(`Parse cache ${enabled ? 'enabled' : 'disabled'}`);
            }
        })
    );

    // Show Python version in status bar (optional, for debugging)
    showPythonVersionStatus(context);
}

/**
 * Show preview for the active Python file
 */
async function showPreview(): Promise<void> {
    const editor = vscode.window.activeTextEditor;

    if (!editor) {
        vscode.window.showWarningMessage('No active editor found. Please open a Python file.');
        return;
    }

    const document = editor.document;

    if (document.languageId !== 'python') {
        vscode.window.showWarningMessage('Please open a Python file to preview Discord components.');
        return;
    }

    // Save current document reference
    currentDocument = document;

    // Create or show the webview
    webviewManager.createOrShow();

    // Update preview with current document
    await updatePreviewForDocument(document);
}

/**
 * Update preview for a specific document
 */
async function updatePreviewForDocument(document: vscode.TextDocument): Promise<void> {
    try {
        // Check Python interpreter availability
        try {
            await getPythonPath();
        } catch (error) {
            vscode.window.showErrorMessage(
                `Python interpreter not found: ${error instanceof Error ? error.message : String(error)}`
            );
            webviewManager.updatePreview([], [{
                severity: 'error',
                message: 'Python interpreter not found. Please install Python or configure the Python extension.'
            }], [], undefined, undefined, document);
            return;
        }

        // Parse the document
        const filePath = document.uri.fsPath;
        const result = await parseComponents(filePath);

        // Read source code for interactive features
        let sourceCode: string | undefined;
        try {
            sourceCode = fs.readFileSync(filePath, 'utf-8');
        } catch (error) {
            console.error('Failed to read source code:', error);
        }

        // Check for critical errors
        const criticalErrors = result.errors.filter(e => e.severity === 'error');
        if (criticalErrors.length > 0) {
            // Show notification for syntax errors or critical parsing errors
            const firstError = criticalErrors[0];
            const lineInfo = firstError.line ? ` at line ${firstError.line}` : '';
            vscode.window.showWarningMessage(
                `Parse error${lineInfo}: ${firstError.message}`
            );
        }

        // Update the webview
        webviewManager.updatePreview(result.components, result.errors, result.warnings || [], sourceCode, result.views, document);

        // Update diagnostics
        updateDiagnostics(document, result.errors, result.warnings || []);

        // Show info message if components were found
        if (result.components.length > 0) {
            console.log(`Found ${result.components.length} component(s) in ${document.fileName}`);
        }

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        // Check if it's a timeout error
        if (errorMessage.includes('timed out')) {
            vscode.window.showErrorMessage(
                'Python script execution timed out. The file might be too large or complex.'
            );
        } else {
            vscode.window.showErrorMessage(
                `Failed to parse file: ${errorMessage}`
            );
        }

        webviewManager.updatePreview([], [{
            severity: 'error',
            message: errorMessage
        }], [], undefined, undefined, document);
    }
}

/**
 * Show Python version in status bar (for debugging purposes)
 */
async function showPythonVersionStatus(context: vscode.ExtensionContext): Promise<void> {
    try {
        const version = await getPythonVersion();
        const statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100
        );
        statusBarItem.text = `$(python) ${version}`;
        statusBarItem.tooltip = 'Python version used by Discord Component Preview';
        statusBarItem.show();
        context.subscriptions.push(statusBarItem);
    } catch (error) {
        // Silently fail if Python is not available yet
        console.log('Could not determine Python version:', error);
    }
}

/**
 * Update diagnostics for a document
 */
function updateDiagnostics(document: vscode.TextDocument, errors: any[], warnings: any[]): void {
    const diagnostics: vscode.Diagnostic[] = [];

    // Add errors
    errors.forEach(error => {
        if (error.line) {
            const line = error.line - 1; // Convert to 0-based
            const range = new vscode.Range(line, 0, line, Number.MAX_VALUE);
            const severity = error.severity === 'error' 
                ? vscode.DiagnosticSeverity.Error 
                : vscode.DiagnosticSeverity.Warning;
            
            const diagnostic = new vscode.Diagnostic(range, error.message, severity);
            diagnostic.source = 'Discord Components';
            diagnostics.push(diagnostic);
        }
    });

    // Add validation warnings
    warnings.forEach(warning => {
        if (warning.line) {
            const line = warning.line - 1; // Convert to 0-based
            const range = new vscode.Range(line, 0, line, Number.MAX_VALUE);
            const severity = warning.severity === 'error'
                ? vscode.DiagnosticSeverity.Error
                : vscode.DiagnosticSeverity.Warning;
            
            const diagnostic = new vscode.Diagnostic(range, warning.message, severity);
            diagnostic.source = 'Discord Components';
            diagnostic.code = warning.code;
            diagnostics.push(diagnostic);
        }
    });

    diagnosticCollection.set(document.uri, diagnostics);
}

/**
 * Insert a component template at cursor position
 */
async function insertTemplate(): Promise<void> {
    const editor = vscode.window.activeTextEditor;

    if (!editor) {
        vscode.window.showErrorMessage('No active editor found');
        return;
    }

    if (editor.document.languageId !== 'python') {
        vscode.window.showErrorMessage('This command only works in Python files');
        return;
    }

    // Show category picker first
    const categories = getAllCategories();
    const selectedCategory = await vscode.window.showQuickPick(categories, {
        placeHolder: 'Select a template category',
        title: 'Component Templates'
    });

    if (!selectedCategory) {
        return;
    }

    // Show template picker for selected category
    const templates = getTemplatesByCategory(selectedCategory);
    const items = templates.map(t => ({
        label: t.name,
        description: t.description,
        template: t
    }));

    const selectedItem = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a template to insert',
        title: `${selectedCategory} Templates`
    });

    if (!selectedItem) {
        return;
    }

    // Insert template code at cursor position
    const position = editor.selection.active;
    const lineText = editor.document.lineAt(position.line).text;
    const indent = lineText.match(/^\s*/)?.[0] || '';
    
    // Add indentation to template code
    const indentedCode = selectedItem.template.code
        .split('\n')
        .map((line, index) => {
            // Don't indent the first line if inserting at start of line
            if (index === 0 && position.character === 0) {
                return line;
            }
            return indent + line;
        })
        .join('\n');

    await editor.edit(editBuilder => {
        editBuilder.insert(position, indentedCode + '\n\n');
    });

    // Show success message
    vscode.window.showInformationMessage(`Inserted template: ${selectedItem.label}`);
}

/**
 * Show project-wide component overview
 */
async function showProjectOverview(): Promise<void> {
    const files = await ProjectScanner.scanWorkspace();
    
    if (files.length === 0) {
        vscode.window.showInformationMessage('No Discord components found in this workspace');
        return;
    }

    // Create webview panel
    const panel = vscode.window.createWebviewPanel(
        'discordProjectOverview',
        'Discord Component Overview',
        vscode.ViewColumn.One,
        {
            enableScripts: true,
            retainContextWhenHidden: true
        }
    );

    panel.webview.html = ProjectScanner.generateReport(files);
}

/**
 * Export components from current file
 */
async function exportComponents(): Promise<void> {
    const editor = vscode.window.activeTextEditor;

    if (!editor) {
        vscode.window.showErrorMessage('No active editor found');
        return;
    }

    if (editor.document.languageId !== 'python') {
        vscode.window.showErrorMessage('This command only works in Python files');
        return;
    }

    // Parse components
    const result = await parseComponents(editor.document.fileName);

    if (result.components.length === 0) {
        vscode.window.showInformationMessage('No components found in this file');
        return;
    }

    // Ask user which format
    const format = await vscode.window.showQuickPick(
        [
            { label: 'JSON', description: 'Discord Interaction JSON format' },
            { label: 'Markdown', description: 'Markdown documentation' }
        ],
        { placeHolder: 'Select export format' }
    );

    if (!format) {
        return;
    }

    const views = result.views || [];
    const fileName = path.basename(editor.document.fileName, '.py');

    if (format.label === 'JSON') {
        const content = ComponentExporter.exportToJSON(result.components, views);
        await ComponentExporter.saveToFile(
            content,
            `${fileName}_components.json`,
            { 'JSON': ['json'] }
        );
    } else {
        const content = ComponentExporter.exportToMarkdown(
            result.components,
            views,
            editor.document.fileName
        );
        await ComponentExporter.saveToFile(
            content,
            `${fileName}_components.md`,
            { 'Markdown': ['md'] }
        );
    }
}

/**
 * Deactivate the extension
 */
export function deactivate() {
    console.log('Discord Component Preview extension is now deactivated');
    webviewManager.close();
    diagnosticCollection.clear();
    diagnosticCollection.dispose();
}
