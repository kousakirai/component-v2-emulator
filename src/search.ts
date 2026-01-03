import * as vscode from 'vscode';
import * as path from 'path';
import { parseComponents } from './pythonBridge';

/**
 * Component search functionality
 */
export class ComponentSearch {
    /**
     * Search for components across workspace
     */
    static async searchInWorkspace(): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            vscode.window.showErrorMessage('No workspace folder open');
            return;
        }

        // Show quick pick for search options
        const searchType = await vscode.window.showQuickPick([
            { label: '$(search) Search by Label', value: 'label' },
            { label: '$(symbol-class) Search by Type', value: 'type' },
            { label: '$(symbol-method) Search by Custom ID', value: 'custom_id' },
            { label: '$(symbol-variable) Search by View Class', value: 'view' },
            { label: '$(list-flat) Show All Components', value: 'all' }
        ], {
            placeHolder: 'Select search type'
        });

        if (!searchType) {
            return;
        }

        let query = '';
        if (searchType.value !== 'all') {
            query = await vscode.window.showInputBox({
                prompt: `Enter search query for ${searchType.label}`,
                placeHolder: `e.g., ${this.getPlaceholder(searchType.value)}`
            }) || '';

            if (!query && searchType.value !== 'all') {
                return;
            }
        }

        // Show progress
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Searching components...',
            cancellable: false
        }, async (progress) => {
            const results = await this.performSearch(searchType.value, query);
            
            if (results.length === 0) {
                vscode.window.showInformationMessage('No components found');
                return;
            }

            // Show results in quick pick
            const items = results.map(r => ({
                label: `$(${this.getIcon(r.type)}) ${r.label || r.placeholder || r.custom_id || 'Unnamed'}`,
                description: `${r.type} in ${path.basename(r.file)}`,
                detail: `Line ${r.line} • ${r.view || 'Unknown View'}`,
                file: r.file,
                line: r.line
            }));

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: `Found ${results.length} component(s)`,
                matchOnDescription: true,
                matchOnDetail: true
            });

            if (selected) {
                await this.openFileAtLine(selected.file, selected.line);
            }
        });
    }

    /**
     * Perform the actual search
     */
    private static async performSearch(type: string, query: string): Promise<SearchResult[]> {
        const results: SearchResult[] = [];
        
        // Find all Python files
        const files = await vscode.workspace.findFiles('**/*.py', '**/node_modules/**');

        for (const file of files) {
            try {
                const parseResult = await parseComponents(file.fsPath);
                
                if (!parseResult.components) {
                    continue;
                }

                for (const component of parseResult.components) {
                    const props: any = component.properties || {};
                    let match = false;

                    switch (type) {
                        case 'label':
                            match = props.label?.toLowerCase().includes(query.toLowerCase()) || false;
                            break;
                        case 'type':
                            match = component.type.toLowerCase().includes(query.toLowerCase());
                            break;
                        case 'custom_id':
                            match = props.custom_id?.toLowerCase().includes(query.toLowerCase()) || false;
                            break;
                        case 'view':
                            // Search in view name from parseResult
                            const viewName = parseResult.views?.find((v: any) => 
                                v.components?.some((c: any) => c === component)
                            )?.name || '';
                            match = viewName.toLowerCase().includes(query.toLowerCase());
                            break;
                        case 'all':
                            match = true;
                            break;
                    }

                    if (match) {
                        results.push({
                            type: component.type,
                            label: props.label,
                            placeholder: props.placeholder,
                            custom_id: props.custom_id,
                            file: file.fsPath,
                            line: component.line || 1,
                            view: parseResult.views?.[0]?.name || 'Unknown'
                        });
                    }
                }
            } catch (error) {
                // Skip files with errors
                continue;
            }
        }

        return results;
    }

    /**
     * Get placeholder text for search input
     */
    private static getPlaceholder(type: string): string {
        switch (type) {
            case 'label':
                return 'Submit, Cancel, Next...';
            case 'type':
                return 'button, select, text_input...';
            case 'custom_id':
                return 'submit_btn, cancel_btn...';
            case 'view':
                return 'MyView, SettingsView...';
            default:
                return '';
        }
    }

    /**
     * Get icon for component type
     */
    private static getIcon(type: string): string {
        switch (type) {
            case 'button':
                return 'debug-stackframe';
            case 'select':
            case 'select_menu':
                return 'list-selection';
            case 'text_input':
                return 'symbol-field';
            default:
                return 'symbol-misc';
        }
    }

    /**
     * Open file at specific line
     */
    private static async openFileAtLine(file: string, line: number): Promise<void> {
        const document = await vscode.workspace.openTextDocument(file);
        const editor = await vscode.window.showTextDocument(document);
        
        const position = new vscode.Position(Math.max(0, line - 1), 0);
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(
            new vscode.Range(position, position),
            vscode.TextEditorRevealType.InCenter
        );
    }

    /**
     * Search components in current file only
     */
    static async searchInCurrentFile(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor');
            return;
        }

        if (editor.document.languageId !== 'python') {
            vscode.window.showErrorMessage('Current file is not a Python file');
            return;
        }

        try {
            const parseResult = await parseComponents(editor.document.fileName);
            
            if (!parseResult.components || parseResult.components.length === 0) {
                vscode.window.showInformationMessage('No components found in current file');
                return;
            }

            // Show components in quick pick
            const items = parseResult.components.map((c: any, index: number) => {
                const props = c.properties || {};
                return {
                    label: `$(${this.getIcon(c.type)}) ${props.label || props.placeholder || props.custom_id || `Component ${index + 1}`}`,
                    description: c.type,
                    detail: `Line ${c.line}`,
                    lineNumber: c.line || 1
                };
            });

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: `Found ${parseResult.components.length} component(s) in current file`
            });

            if (selected) {
                const position = new vscode.Position(Math.max(0, selected.lineNumber - 1), 0);
                editor.selection = new vscode.Selection(position, position);
                editor.revealRange(
                    new vscode.Range(position, position),
                    vscode.TextEditorRevealType.InCenter
                );
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to search components: ${error}`);
        }
    }
}

interface SearchResult {
    type: string;
    label?: string;
    placeholder?: string;
    custom_id?: string;
    file: string;
    line: number;
    view: string;
}
