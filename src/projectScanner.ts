/**
 * Project-wide component scanner for discord.py ComponentV2
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { parseComponents, isDiscordPyFile } from './pythonBridge';
import { ComponentData, ParseError, ViewStructure } from './types';

export interface FileComponents {
    filePath: string;
    fileName: string;
    relativePath: string;
    components: ComponentData[];
    views: ViewStructure[];
    errors: ParseError[];
    lineCount: number;
}

export class ProjectScanner {
    /**
     * Scan all Python files in the workspace for discord.py components
     */
    public static async scanWorkspace(): Promise<FileComponents[]> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showWarningMessage('No workspace folder found');
            return [];
        }

        // Find all Python files
        const pythonFiles = await vscode.workspace.findFiles(
            '**/*.py',
            '**/node_modules/**'
        );

        const results: FileComponents[] = [];

        // Show progress
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Scanning project for Discord components',
                cancellable: false
            },
            async (progress) => {
                const total = pythonFiles.length;
                let processed = 0;

                for (const fileUri of pythonFiles) {
                    progress.report({
                        message: `Processing ${processed + 1}/${total}: ${path.basename(fileUri.fsPath)}`,
                        increment: (1 / total) * 100
                    });

                    try {
                        const document = await vscode.workspace.openTextDocument(fileUri);
                        const content = document.getText();

                        // Quick check if file likely contains discord.py code
                        if (!isDiscordPyFile(content)) {
                            processed++;
                            continue;
                        }

                        // Parse components
                        const result = await parseComponents(fileUri.fsPath);
                        const views = result.views || [];

                        // Only include files with components or views
                        if (result.components.length > 0 || views.length > 0) {
                            const workspaceFolder = vscode.workspace.getWorkspaceFolder(fileUri);
                            const relativePath = workspaceFolder
                                ? path.relative(workspaceFolder.uri.fsPath, fileUri.fsPath)
                                : fileUri.fsPath;

                            results.push({
                                filePath: fileUri.fsPath,
                                fileName: path.basename(fileUri.fsPath),
                                relativePath: relativePath,
                                components: result.components,
                                views: views,
                                errors: result.errors,
                                lineCount: document.lineCount
                            });
                        }
                    } catch (error) {
                        console.error(`Error scanning ${fileUri.fsPath}:`, error);
                    }

                    processed++;
                }
            }
        );

        // Sort by file name
        results.sort((a, b) => a.fileName.localeCompare(b.fileName));

        return results;
    }

    /**
     * Generate HTML report for project-wide components
     */
    public static generateReport(files: FileComponents[]): string {
        const totalComponents = files.reduce((sum, f) => sum + f.components.length, 0);
        const totalViews = files.reduce((sum, f) => sum + f.views.length, 0);
        const totalButtons = files.reduce(
            (sum, f) => sum + f.components.filter(c => c.type === 'button').length,
            0
        );
        const totalSelectMenus = files.reduce(
            (sum, f) => sum + f.components.filter(c => c.type === 'select_menu').length,
            0
        );
        const totalTextInputs = files.reduce(
            (sum, f) => sum + f.components.filter(c => c.type === 'text_input').length,
            0
        );

        const filesHtml = files.map(file => {
            const componentsHtml = file.components
                .map((comp) => {
                    const props = comp.properties as any;
                    const label = props.label || props.placeholder || comp.type;
                    const customId = props.custom_id ? ` (${props.custom_id})` : '';
                    return `
                        <div class="component-item">
                            <span class="component-type">${comp.type}</span>
                            <span class="component-label">${this.escapeHtml(label)}</span>
                            <span class="component-id">${this.escapeHtml(customId)}</span>
                            <span class="component-line">Line ${comp.line}</span>
                        </div>
                    `;
                })
                .join('');

            const viewsHtml = file.views
                .map((view) => {
                    return `
                        <div class="view-item">
                            <span class="view-type">${view.type}</span>
                            <span class="view-name">${this.escapeHtml(view.name)}</span>
                            <span class="view-count">${view.components.length} components</span>
                            <span class="view-line">Line ${view.line}</span>
                        </div>
                    `;
                })
                .join('');

            return `
                <div class="file-card">
                    <div class="file-header">
                        <span class="file-icon">📄</span>
                        <span class="file-name">${this.escapeHtml(file.fileName)}</span>
                        <span class="file-path">${this.escapeHtml(file.relativePath)}</span>
                    </div>
                    <div class="file-stats">
                        <span class="stat">Components: ${file.components.length}</span>
                        <span class="stat">Views: ${file.views.length}</span>
                        <span class="stat">Lines: ${file.lineCount}</span>
                    </div>
                    ${viewsHtml ? `<div class="views-list">${viewsHtml}</div>` : ''}
                    ${componentsHtml ? `<div class="components-list">${componentsHtml}</div>` : ''}
                </div>
            `;
        }).join('');

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Project Component Overview</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: #36393f;
            color: #dcddde;
            padding: 20px;
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
        }

        h1 {
            color: #ffffff;
            margin-bottom: 10px;
            font-size: 28px;
        }

        .subtitle {
            color: #b9bbbe;
            margin-bottom: 30px;
            font-size: 14px;
        }

        .summary {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 16px;
            margin-bottom: 30px;
        }

        .summary-card {
            background-color: #2f3136;
            border-radius: 8px;
            padding: 20px;
            border-left: 4px solid #5865F2;
        }

        .summary-card.views {
            border-left-color: #3BA55D;
        }

        .summary-card.buttons {
            border-left-color: #5865F2;
        }

        .summary-card.selects {
            border-left-color: #FEE75C;
        }

        .summary-card.inputs {
            border-left-color: #ED4245;
        }

        .summary-label {
            color: #b9bbbe;
            font-size: 12px;
            text-transform: uppercase;
            margin-bottom: 8px;
        }

        .summary-value {
            color: #ffffff;
            font-size: 32px;
            font-weight: 600;
        }

        .file-card {
            background-color: #2f3136;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 16px;
        }

        .file-header {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 12px;
            padding-bottom: 12px;
            border-bottom: 1px solid #40444b;
        }

        .file-icon {
            font-size: 20px;
        }

        .file-name {
            color: #ffffff;
            font-size: 16px;
            font-weight: 600;
        }

        .file-path {
            color: #72767d;
            font-size: 13px;
            margin-left: auto;
        }

        .file-stats {
            display: flex;
            gap: 16px;
            margin-bottom: 16px;
        }

        .stat {
            color: #b9bbbe;
            font-size: 13px;
        }

        .views-list, .components-list {
            margin-top: 12px;
        }

        .view-item, .component-item {
            background-color: #202225;
            padding: 8px 12px;
            margin-bottom: 6px;
            border-radius: 4px;
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .view-type, .component-type {
            background-color: #5865F2;
            color: #ffffff;
            padding: 2px 8px;
            border-radius: 3px;
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
        }

        .view-type {
            background-color: #3BA55D;
        }

        .component-type[data-type="select_menu"] {
            background-color: #FEE75C;
            color: #000000;
        }

        .component-type[data-type="text_input"] {
            background-color: #ED4245;
        }

        .view-name, .component-label {
            color: #ffffff;
            font-weight: 500;
        }

        .view-count, .component-id {
            color: #72767d;
            font-size: 12px;
        }

        .view-line, .component-line {
            color: #72767d;
            font-size: 12px;
            margin-left: auto;
        }

        .no-files {
            text-align: center;
            padding: 40px;
            color: #72767d;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>📊 Project Component Overview</h1>
        <p class="subtitle">Discord.py ComponentV2 usage across ${files.length} file(s)</p>

        <div class="summary">
            <div class="summary-card">
                <div class="summary-label">Total Components</div>
                <div class="summary-value">${totalComponents}</div>
            </div>
            <div class="summary-card views">
                <div class="summary-label">Views & Modals</div>
                <div class="summary-value">${totalViews}</div>
            </div>
            <div class="summary-card buttons">
                <div class="summary-label">Buttons</div>
                <div class="summary-value">${totalButtons}</div>
            </div>
            <div class="summary-card selects">
                <div class="summary-label">Select Menus</div>
                <div class="summary-value">${totalSelectMenus}</div>
            </div>
            <div class="summary-card inputs">
                <div class="summary-label">Text Inputs</div>
                <div class="summary-value">${totalTextInputs}</div>
            </div>
        </div>

        ${files.length > 0 ? filesHtml : '<div class="no-files">No Discord components found in this project</div>'}
    </div>
</body>
</html>`;
    }

    private static escapeHtml(text: string): string {
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
