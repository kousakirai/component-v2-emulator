import * as vscode from 'vscode';
import * as path from 'path';
import { spawn } from 'child_process';

/**
 * Component Editor - Interactive GUI-based Component Editing System
 * 
 * Features:
 * - Visual property editing with forms
 * - Real-time preview synchronization
 * - AST-based code manipulation
 * - Support for all 12 components
 */

export interface ComponentProperty {
    name: string;
    type: 'string' | 'number' | 'boolean' | 'enum' | 'array';
    value?: any;
    options?: string[]; // For enum types
    required?: boolean;
}

export interface EditableComponent {
    type: string;
    line: number;
    properties: Record<string, any>;
    variableName?: string;
    callback?: string;
}

export class ComponentEditor {
    private panel: vscode.WebviewPanel | undefined;
    private currentDocument: vscode.TextDocument | undefined;
    private currentComponent: EditableComponent | undefined;
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    /**
     * Open interactive editor for a component at cursor position
     */
    public async openEditor(document: vscode.TextDocument, position: vscode.Position): Promise<void> {
        const targetLine = position.line + 1;
        await this.openEditorAtLine(document, targetLine);
    }

    /**
     * Open interactive editor for a component at specific line number
     */
    public async openEditorAtLine(document: vscode.TextDocument, lineNumber: number): Promise<void> {
        this.currentDocument = document;

        // Parse file to find component at line
        try {
            const parseResult = await this.parseFile(document.uri.fsPath);
            const components = parseResult.components || parseResult;

            // Debug: Show available components
            console.log('Available components:', components.length);
            console.log('Looking for line:', lineNumber);

            // Try to find component at exact line or nearby lines
            let component = this.findComponentAtLine(components, lineNumber);

            // If not found, try searching within a few lines range
            if (!component) {
                for (let offset = -2; offset <= 2; offset++) {
                    component = this.findComponentAtLine(components, lineNumber + offset);
                    if (component) {
                        break;
                    }
                }
            }

            if (!component) {
                const availableLines = components.map((c: any) => c.line).filter((l: any) => l).join(', ');
                vscode.window.showInformationMessage(
                    `No editable component found at line ${lineNumber}. ` +
                    `Available components at lines: ${availableLines || 'none'}`
                );
                return;
            }

            this.currentComponent = component;
            this.showEditorPanel();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to parse file: ${error}`);
        }
    }

    /**
     * Parse Python file using existing AST parser
     */
    private async parseFile(filePath: string): Promise<any> {
        return new Promise((resolve, reject) => {
            const parserPath = path.join(this.context.extensionPath, 'src', 'parsers', 'buttonParser.py');
            const pythonProcess = spawn('python3', [parserPath, filePath]);

            let output = '';
            let errorOutput = '';

            pythonProcess.stdout.on('data', (data) => {
                output += data.toString();
            });

            pythonProcess.stderr.on('data', (data) => {
                errorOutput += data.toString();
            });

            pythonProcess.on('close', (code) => {
                if (code === 0) {
                    try {
                        const result = JSON.parse(output);
                        console.log('Parser result:', JSON.stringify(result, null, 2));
                        resolve(result);
                    } catch (e) {
                        reject(new Error(`Failed to parse component data: ${e}`));
                    }
                } else {
                    reject(new Error(`Parser failed with code ${code}: ${errorOutput}`));
                }
            });

            pythonProcess.on('error', (err) => {
                reject(new Error(`Failed to spawn parser: ${err.message}`));
            });
        });
    }

    /**
     * Find component at specific line number
     */
    private findComponentAtLine(components: any[], lineNumber: number): EditableComponent | undefined {
        console.log(`Searching for component at line ${lineNumber}`);

        const component = components.find(c => {
            const hasLine = c.line === lineNumber;
            if (hasLine) {
                console.log(`Found component at line ${lineNumber}:`, c);
            }
            return hasLine;
        });

        if (!component) {
            console.log(`No component found at line ${lineNumber}`);
            return undefined;
        }

        return {
            type: component.type,
            line: component.line,
            properties: component.properties || {},
            variableName: component.variableName,
            callback: component.callback
        };
    }

    /**
     * Show webview panel with editing form
     */
    private showEditorPanel(): void {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.Beside);
        } else {
            this.panel = vscode.window.createWebviewPanel(
                'componentEditor',
                'Edit Component',
                vscode.ViewColumn.Beside,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true
                }
            );

            this.panel.onDidDispose(() => {
                this.panel = undefined;
            });

            // Handle messages from webview
            this.panel.webview.onDidReceiveMessage(
                message => this.handleWebviewMessage(message),
                undefined,
                this.context.subscriptions
            );
        }

        this.panel.webview.html = this.getEditorHtml();
    }

    /**
     * Handle messages from webview
     */
    private async handleWebviewMessage(message: any): Promise<void> {
        switch (message.command) {
            case 'updateProperty':
                await this.updateComponentProperty(message.propertyName, message.value);
                break;
            case 'save':
                await this.saveChanges();
                break;
            case 'cancel':
                this.panel?.dispose();
                break;
        }
    }

    /**
     * Update component property in memory
     */
    private async updateComponentProperty(propertyName: string, value: any): Promise<void> {
        if (!this.currentComponent) {
            return;
        }

        this.currentComponent.properties[propertyName] = value;

        // Trigger preview update
        vscode.commands.executeCommand('discord-preview.refresh');
    }

    /**
     * Save changes back to Python file
     */
    private async saveChanges(): Promise<void> {
        if (!this.currentDocument || !this.currentComponent) {
            return;
        }

        const editor = await vscode.window.showTextDocument(this.currentDocument);
        const lineIndex = this.currentComponent.line - 1;
        const line = this.currentDocument.lineAt(lineIndex);

        // Generate new component code
        const newCode = this.generateComponentCode(this.currentComponent);

        // Replace the line
        await editor.edit(editBuilder => {
            editBuilder.replace(line.range, newCode);
        });

        vscode.window.showInformationMessage('Component updated successfully');
        this.panel?.dispose();
    }

    /**
     * Generate Python code for component
     */
    private generateComponentCode(component: EditableComponent): string {
        const { type, properties } = component;
        const componentName = this.getComponentClassName(type);

        // Build parameter list
        const params: string[] = [];

        // Component-specific parameter ordering
        const paramOrder = this.getParameterOrder(type);

        for (const param of paramOrder) {
            if (properties.hasOwnProperty(param) && properties[param] !== undefined && properties[param] !== null) {
                const value = this.formatPropertyValue(param, properties[param], type);
                params.push(`${param}=${value}`);
            }
        }

        const indent = '        '; // 8 spaces for typical indentation
        return `${indent}${componentName}(${params.join(', ')})`;
    }

    /**
     * Get component class name from type
     */
    private getComponentClassName(type: string): string {
        const typeMap: Record<string, string> = {
            'button': 'discord.ui.Button',
            'select': 'discord.ui.Select',
            'text_input': 'discord.ui.TextInput',
            'modal': 'discord.ui.Modal',
            'container': 'discord.ui.Container',
            'section': 'discord.ui.Section',
            'action_row': 'discord.ui.ActionRow',
            'text_display': 'discord.ui.TextDisplay',
            'label': 'discord.ui.Label',
            'separator': 'discord.ui.Separator',
            'thumbnail': 'discord.ui.Thumbnail',
            'file': 'discord.ui.File',
            'media_gallery': 'discord.ui.MediaGallery',
            'file_upload': 'discord.ui.FileUpload'
        };
        return typeMap[type] || type;
    }

    /**
     * Get parameter order for component type
     */
    private getParameterOrder(type: string): string[] {
        const orders: Record<string, string[]> = {
            'button': ['label', 'style', 'custom_id', 'url', 'disabled', 'emoji', 'row'],
            'select': ['placeholder', 'custom_id', 'min_values', 'max_values', 'disabled', 'options', 'row'],
            'text_input': ['label', 'style', 'custom_id', 'placeholder', 'default', 'required', 'min_length', 'max_length', 'row'],
            'modal': ['title', 'custom_id', 'timeout'],
            'text_display': ['content', 'style'],
            'label': ['text', 'icon'],
            'separator': ['spacing'],
            'thumbnail': ['url', 'width', 'height'],
            'file': ['filename', 'description'],
            'media_gallery': ['items'],
            'file_upload': ['custom_id', 'label'],
            'container': ['title'],
            'section': ['label'],
            'action_row': []
        };
        return orders[type] || [];
    }

    /**
     * Format property value for Python code
     */
    private formatPropertyValue(param: string, value: any, componentType: string): string {
        if (value === null || value === undefined) {
            return 'None';
        }

        // Boolean values
        if (typeof value === 'boolean') {
            return value ? 'True' : 'False';
        }

        // Number values
        if (typeof value === 'number') {
            return value.toString();
        }

        // String values
        if (typeof value === 'string') {
            // Check if it's an enum value (e.g., ButtonStyle.primary)
            if (this.isEnumValue(param, value, componentType)) {
                return value; // Return as-is (e.g., "ButtonStyle.primary")
            }
            // Regular string
            return `"${value.replace(/"/g, '\\"')}"`;
        }

        // Array values (for options, etc.)
        if (Array.isArray(value)) {
            const items = value.map(v => this.formatPropertyValue(param, v, componentType));
            return `[${items.join(', ')}]`;
        }

        return String(value);
    }

    /**
     * Check if value is an enum constant
     */
    private isEnumValue(param: string, value: string, componentType: string): boolean {
        const enumParams: Record<string, string[]> = {
            'style': ['ButtonStyle.', 'TextInputStyle.', 'TextStyle.'],
            'spacing': ['SeparatorSpacing.']
        };

        if (enumParams[param]) {
            return enumParams[param].some(prefix => value.startsWith(prefix));
        }

        return false;
    }

    /**
     * Generate HTML for editor webview
     */
    private getEditorHtml(): string {
        if (!this.currentComponent) {
            return '<html><body>No component selected</body></html>';
        }

        const { type, properties } = this.currentComponent;
        const schema = this.getComponentSchema(type);

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Edit ${type}</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
        }
        h1 {
            color: var(--vscode-titleBar-activeForeground);
            margin-bottom: 20px;
        }
        .form-group {
            margin-bottom: 15px;
        }
        label {
            display: block;
            margin-bottom: 5px;
            font-weight: bold;
        }
        input, select, textarea {
            width: 100%;
            padding: 8px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 2px;
        }
        input[type="checkbox"] {
            width: auto;
            margin-right: 5px;
        }
        .button-group {
            margin-top: 20px;
            display: flex;
            gap: 10px;
        }
        button {
            padding: 8px 16px;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            cursor: pointer;
            border-radius: 2px;
        }
        button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        button.secondary {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        button.secondary:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }
        .help-text {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            margin-top: 3px;
        }
    </style>
</head>
<body>
    <h1>Edit ${this.capitalizeFirst(type)}</h1>
    <form id="componentForm">
        ${this.generateFormFields(schema, properties)}
    </form>
    <div class="button-group">
        <button id="saveBtn">Save Changes</button>
        <button id="cancelBtn" class="secondary">Cancel</button>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        // Handle form input changes
        document.querySelectorAll('input, select, textarea').forEach(element => {
            element.addEventListener('change', (e) => {
                const target = e.target;
                let value = target.value;

                if (target.type === 'checkbox') {
                    value = target.checked;
                } else if (target.type === 'number') {
                    value = parseFloat(value);
                }

                vscode.postMessage({
                    command: 'updateProperty',
                    propertyName: target.name,
                    value: value
                });
            });
        });

        // Save button
        document.getElementById('saveBtn').addEventListener('click', () => {
            vscode.postMessage({ command: 'save' });
        });

        // Cancel button
        document.getElementById('cancelBtn').addEventListener('click', () => {
            vscode.postMessage({ command: 'cancel' });
        });
    </script>
</body>
</html>`;
    }

    /**
     * Generate form fields HTML
     */
    private generateFormFields(schema: ComponentProperty[], currentValues: Record<string, any>): string {
        return schema.map(prop => {
            const value = currentValues[prop.name] || '';
            const required = prop.required ? 'required' : '';

            switch (prop.type) {
                case 'boolean':
                    const checked = value ? 'checked' : '';
                    return `
                        <div class="form-group">
                            <label>
                                <input type="checkbox" name="${prop.name}" ${checked} />
                                ${this.capitalizeFirst(prop.name)}
                            </label>
                        </div>`;

                case 'enum':
                    const options = prop.options?.map(opt =>
                        `<option value="${opt}" ${value === opt ? 'selected' : ''}>${opt}</option>`
                    ).join('') || '';
                    return `
                        <div class="form-group">
                            <label for="${prop.name}">${this.capitalizeFirst(prop.name)}</label>
                            <select name="${prop.name}" id="${prop.name}" ${required}>
                                <option value="">-- Select --</option>
                                ${options}
                            </select>
                        </div>`;

                case 'number':
                    return `
                        <div class="form-group">
                            <label for="${prop.name}">${this.capitalizeFirst(prop.name)}</label>
                            <input type="number" name="${prop.name}" id="${prop.name}" value="${value}" ${required} />
                        </div>`;

                default:
                    // String or text
                    if (prop.name === 'content' || prop.name === 'description') {
                        return `
                            <div class="form-group">
                                <label for="${prop.name}">${this.capitalizeFirst(prop.name)}</label>
                                <textarea name="${prop.name}" id="${prop.name}" rows="4" ${required}>${value}</textarea>
                            </div>`;
                    }
                    return `
                        <div class="form-group">
                            <label for="${prop.name}">${this.capitalizeFirst(prop.name)}</label>
                            <input type="text" name="${prop.name}" id="${prop.name}" value="${value}" ${required} />
                        </div>`;
            }
        }).join('');
    }

    /**
     * Get component schema (property definitions)
     */
    private getComponentSchema(type: string): ComponentProperty[] {
        const schemas: Record<string, ComponentProperty[]> = {
            'button': [
                { name: 'label', type: 'string', required: true },
                { name: 'style', type: 'enum', options: ['ButtonStyle.primary', 'ButtonStyle.secondary', 'ButtonStyle.success', 'ButtonStyle.danger', 'ButtonStyle.link'] },
                { name: 'custom_id', type: 'string' },
                { name: 'url', type: 'string' },
                { name: 'disabled', type: 'boolean' },
                { name: 'emoji', type: 'string' },
                { name: 'row', type: 'number' }
            ],
            'select': [
                { name: 'placeholder', type: 'string' },
                { name: 'custom_id', type: 'string', required: true },
                { name: 'min_values', type: 'number' },
                { name: 'max_values', type: 'number' },
                { name: 'disabled', type: 'boolean' }
            ],
            'text_input': [
                { name: 'label', type: 'string', required: true },
                { name: 'style', type: 'enum', options: ['TextInputStyle.short', 'TextInputStyle.paragraph'] },
                { name: 'custom_id', type: 'string', required: true },
                { name: 'placeholder', type: 'string' },
                { name: 'default', type: 'string' },
                { name: 'required', type: 'boolean' },
                { name: 'min_length', type: 'number' },
                { name: 'max_length', type: 'number' }
            ],
            'text_display': [
                { name: 'content', type: 'string', required: true },
                { name: 'style', type: 'enum', options: ['plain', 'bold', 'italic', 'code', 'header'] }
            ],
            'label': [
                { name: 'text', type: 'string', required: true },
                { name: 'icon', type: 'string' }
            ],
            'separator': [
                { name: 'spacing', type: 'enum', options: ['small', 'medium', 'large'] }
            ],
            'thumbnail': [
                { name: 'url', type: 'string', required: true },
                { name: 'width', type: 'number' },
                { name: 'height', type: 'number' }
            ],
            'file': [
                { name: 'filename', type: 'string', required: true },
                { name: 'description', type: 'string' }
            ],
            'file_upload': [
                { name: 'custom_id', type: 'string', required: true },
                { name: 'label', type: 'string', required: true }
            ]
        };

        return schemas[type] || [];
    }

    /**
     * Capitalize first letter
     */
    private capitalizeFirst(str: string): string {
        return str.charAt(0).toUpperCase() + str.slice(1).replace(/_/g, ' ');
    }
}
