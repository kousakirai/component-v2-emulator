import * as vscode from 'vscode';
import * as fs from 'fs';
import { parseComponents } from './pythonBridge';
import { WebviewManager } from './webview';
import { getPythonPath, getPythonVersion } from './pythonInterpreter';
import { getAllCategories, getTemplatesByCategory } from './templates';
import { ComponentCompletionProvider, ComponentSignatureHelpProvider } from './completionProvider';
import { PresetManager, showPresetPicker, saveAsPreset } from './presetManager';
import { ComponentEditor } from './componentEditor';
import { UIBuilder } from './uiBuilder';
import { registerCodeActionProvider } from './codeActionProvider';
import { registerVersionDetection, DiscordPyStatusBar } from './versionDetector';

let webviewManager: WebviewManager;
let uiBuilder: UIBuilder;
let currentDocument: vscode.TextDocument | undefined;
let updateTimeout: NodeJS.Timeout | undefined;
let diagnosticCollection: vscode.DiagnosticCollection;
let presetManager: PresetManager;
let componentEditor: ComponentEditor;
let discordPyStatusBar: DiscordPyStatusBar;
const DEBOUNCE_DELAY = 500; // ms

/**
 * Activate the extension
 */
export function activate(context: vscode.ExtensionContext) {
    console.log('Discord Component Preview extension is now active');

    // Initialize webview manager
    webviewManager = WebviewManager.getInstance(context.extensionUri);

    // Initialize UI Builder (with context for state persistence)
    uiBuilder = UIBuilder.getInstance(context.extensionUri, context);

    // Initialize diagnostic collection
    diagnosticCollection = vscode.languages.createDiagnosticCollection('discord-components');

    // Register IntelliSense providers for Python
    const completionProvider = vscode.languages.registerCompletionItemProvider(
        { language: 'python', scheme: 'file' },
        new ComponentCompletionProvider(),
        '.', ' '
    );

    const signatureProvider = vscode.languages.registerSignatureHelpProvider(
        { language: 'python', scheme: 'file' },
        new ComponentSignatureHelpProvider(),
        '(', ','
    );

    context.subscriptions.push(completionProvider, signatureProvider);

    // Register CodeAction provider for Quick Fix suggestions
    const codeActionProvider = registerCodeActionProvider(context);
    context.subscriptions.push(codeActionProvider);

    // Register discord.py version detection and status bar
    discordPyStatusBar = registerVersionDetection(context);

    // Initialize preset manager
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    presetManager = new PresetManager(workspaceFolder?.uri.fsPath);

    // Initialize component editor
    componentEditor = new ComponentEditor(context);

    // === Commands ===

    // Show preview
    context.subscriptions.push(
        vscode.commands.registerCommand('discord-preview.showPreview', async () => {
            await showPreview();
        })
    );

    // Insert template
    context.subscriptions.push(
        vscode.commands.registerCommand('discord-preview.insertTemplate', async () => {
            await insertTemplate();
        })
    );

    // Show preset picker
    context.subscriptions.push(
        vscode.commands.registerCommand('discord-preview.showPresetPicker', async () => {
            await showPresetPicker(presetManager);
        })
    );

    // Save as preset
    context.subscriptions.push(
        vscode.commands.registerCommand('discord-preview.saveAsPreset', async () => {
            await saveAsPreset(presetManager);
        })
    );

    // Edit component interactively
    context.subscriptions.push(
        vscode.commands.registerCommand('discord-preview.editComponent', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showErrorMessage('No active editor');
                return;
            }

            if (editor.document.languageId !== 'python') {
                vscode.window.showErrorMessage('Please open a Python file');
                return;
            }

            await componentEditor.openEditor(editor.document, editor.selection.active);
        })
    );

    // Edit component at specific line (from preview click)
    context.subscriptions.push(
        vscode.commands.registerCommand('discord-preview.editComponentAtLine',
            async (document: vscode.TextDocument, line: number) => {
                await componentEditor.openEditorAtLine(document, line);
            }
        )
    );

    // Open UI Builder for LayoutView
    context.subscriptions.push(
        vscode.commands.registerCommand('discord-preview.openUIBuilder', async () => {
            const editor = vscode.window.activeTextEditor;
            if (editor && editor.document.languageId === 'python') {
                uiBuilder.open(editor.document, editor.selection.active);
            } else {
                uiBuilder.open();
            }
        })
    );

    // Refresh preview (internal)
    context.subscriptions.push(
        vscode.commands.registerCommand('discord-preview.refresh', async () => {
            if (currentDocument) {
                await updatePreviewForDocument(currentDocument);
            }
        })
    );

    // === Event Listeners ===

    // Listen for file save events
    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument(async (document) => {
            if (document.languageId !== 'python') {
                return;
            }
            if (webviewManager.isVisible()) {
                await updatePreviewForDocument(document);
            }
        })
    );

    // Listen for active editor changes
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(async (editor) => {
            if (!editor || !webviewManager.isVisible()) {
                return;
            }

            const document = editor.document;
            if (document.languageId === 'python') {
                currentDocument = document;
                await updatePreviewForDocument(document);
            }
        })
    );

    // Listen for text document changes (hot reload with debounce)
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(async (event) => {
            if (!webviewManager.isVisible()) {
                return;
            }

            const document = event.document;
            if (document.languageId !== 'python') {
                return;
            }

            if (updateTimeout) {
                clearTimeout(updateTimeout);
            }

            updateTimeout = setTimeout(async () => {
                await updatePreviewForDocument(document);
            }, DEBOUNCE_DELAY);
        })
    );

    context.subscriptions.push(diagnosticCollection);

    // Show Python version in status bar
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

    currentDocument = document;
    webviewManager.createOrShow();
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
            const firstError = criticalErrors[0];
            const lineInfo = firstError.line ? ` at line ${firstError.line}` : '';
            vscode.window.showWarningMessage(`Parse error${lineInfo}: ${firstError.message}`);
        }

        // Update the webview
        webviewManager.updatePreview(
            result.components,
            result.errors,
            result.warnings || [],
            sourceCode,
            result.views,
            document
        );

        // Update diagnostics
        updateDiagnostics(document, result.errors, result.warnings || []);

        if (result.components.length > 0) {
            console.log(`Found ${result.components.length} component(s) in ${document.fileName}`);
        }

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        if (errorMessage.includes('timed out')) {
            vscode.window.showErrorMessage(
                'Python script execution timed out. The file might be too large or complex.'
            );
        } else {
            vscode.window.showErrorMessage(`Failed to parse file: ${errorMessage}`);
        }

        webviewManager.updatePreview([], [{
            severity: 'error',
            message: errorMessage
        }], [], undefined, undefined, document);
    }
}

/**
 * Show Python version in status bar
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
        console.log('Could not determine Python version:', error);
    }
}

/**
 * Update diagnostics for a document
 */
function updateDiagnostics(document: vscode.TextDocument, errors: any[], warnings: any[]): void {
    const diagnostics: vscode.Diagnostic[] = [];

    errors.forEach(error => {
        if (error.line) {
            const line = error.line - 1;
            const range = new vscode.Range(line, 0, line, Number.MAX_VALUE);
            const severity = error.severity === 'error'
                ? vscode.DiagnosticSeverity.Error
                : vscode.DiagnosticSeverity.Warning;

            const diagnostic = new vscode.Diagnostic(range, error.message, severity);
            diagnostic.source = 'Discord Components';
            diagnostics.push(diagnostic);
        }
    });

    warnings.forEach(warning => {
        if (warning.line) {
            const line = warning.line - 1;
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

    const indentedCode = selectedItem.template.code
        .split('\n')
        .map((line, index) => {
            if (index === 0 && position.character === 0) {
                return line;
            }
            return indent + line;
        })
        .join('\n');

    await editor.edit(editBuilder => {
        editBuilder.insert(position, indentedCode + '\n\n');
    });

    vscode.window.showInformationMessage(`Inserted template: ${selectedItem.label}`);
}

/**
 * Deactivate the extension
 */
export function deactivate() {
    console.log('Discord Component Preview extension is now deactivated');
    webviewManager.close();
    uiBuilder.close();
    diagnosticCollection.clear();
    diagnosticCollection.dispose();
}
