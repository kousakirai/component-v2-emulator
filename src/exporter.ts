/**
 * Export functionality for discord.py components
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { ComponentData, ViewStructure } from './types';

export class ComponentExporter {
    /**
     * Export components to Discord Interaction JSON format
     */
    public static exportToJSON(
        components: ComponentData[],
        views: ViewStructure[]
    ): string {
        const data = {
            version: '1.0',
            exported_at: new Date().toISOString(),
            views: views.map(view => ({
                name: view.name,
                type: view.type,
                line: view.line,
                component_count: view.components.length
            })),
            components: components.map(comp => {
                const props = comp.properties as any;
                const base = {
                    type: comp.type,
                    line: comp.line
                };

                if (comp.type === 'button') {
                    return {
                        ...base,
                        label: props.label,
                        style: props.style,
                        custom_id: props.custom_id,
                        emoji: props.emoji,
                        url: props.url,
                        disabled: props.disabled,
                        row: props.row
                    };
                } else if (comp.type === 'select_menu') {
                    return {
                        ...base,
                        placeholder: props.placeholder,
                        custom_id: props.custom_id,
                        min_values: props.min_values,
                        max_values: props.max_values,
                        disabled: props.disabled,
                        row: props.row,
                        options: props.options
                    };
                } else if (comp.type === 'text_input') {
                    return {
                        ...base,
                        label: props.label,
                        style: props.style,
                        custom_id: props.custom_id,
                        placeholder: props.placeholder,
                        default_value: props.default,
                        required: props.required,
                        min_length: props.min_length,
                        max_length: props.max_length
                    };
                }

                return base;
            }),
            statistics: {
                total_components: components.length,
                total_views: views.length,
                buttons: components.filter(c => c.type === 'button').length,
                select_menus: components.filter(c => c.type === 'select_menu').length,
                text_inputs: components.filter(c => c.type === 'text_input').length
            }
        };

        return JSON.stringify(data, null, 2);
    }

    /**
     * Export components to Markdown documentation
     */
    public static exportToMarkdown(
        components: ComponentData[],
        views: ViewStructure[],
        fileName: string
    ): string {
        const lines: string[] = [];

        lines.push(`# Discord Component Documentation`);
        lines.push('');
        lines.push(`**File:** \`${fileName}\``);
        lines.push(`**Generated:** ${new Date().toLocaleString()}`);
        lines.push('');

        // Statistics
        lines.push('## 📊 Statistics');
        lines.push('');
        lines.push(`- **Total Components:** ${components.length}`);
        lines.push(`- **Total Views:** ${views.length}`);
        lines.push(`- **Buttons:** ${components.filter(c => c.type === 'button').length}`);
        lines.push(`- **Select Menus:** ${components.filter(c => c.type === 'select_menu').length}`);
        lines.push(`- **Text Inputs:** ${components.filter(c => c.type === 'text_input').length}`);
        lines.push('');

        // Views
        if (views.length > 0) {
            lines.push('## 🏗️ Views & Modals');
            lines.push('');

            views.forEach(view => {
                lines.push(`### ${view.name}`);
                lines.push('');
                lines.push(`- **Type:** ${view.type}`);
                lines.push(`- **Line:** ${view.line}`);
                lines.push(`- **Components:** ${view.components.length}`);
                lines.push('');
            });
        }

        // Components
        lines.push('## 🧩 Components');
        lines.push('');

        const buttons = components.filter(c => c.type === 'button');
        const selectMenus = components.filter(c => c.type === 'select_menu');
        const textInputs = components.filter(c => c.type === 'text_input');

        if (buttons.length > 0) {
            lines.push('### Buttons');
            lines.push('');
            lines.push('| Label | Style | Custom ID | Emoji | Row | Line |');
            lines.push('|-------|-------|-----------|-------|-----|------|');

            buttons.forEach(btn => {
                const props = btn.properties as any;
                lines.push(`| ${props.label || '-'} | ${props.style || '-'} | ${props.custom_id || '-'} | ${props.emoji || '-'} | ${props.row ?? '-'} | ${btn.line} |`);
            });

            lines.push('');
        }

        if (selectMenus.length > 0) {
            lines.push('### Select Menus');
            lines.push('');

            selectMenus.forEach((menu, idx) => {
                const props = menu.properties as any;
                lines.push(`#### ${idx + 1}. ${props.placeholder || 'Select Menu'}`);
                lines.push('');
                lines.push(`- **Custom ID:** ${props.custom_id || 'N/A'}`);
                lines.push(`- **Min Values:** ${props.min_values ?? 1}`);
                lines.push(`- **Max Values:** ${props.max_values ?? 1}`);
                lines.push(`- **Row:** ${props.row ?? 'Auto'}`);
                lines.push(`- **Line:** ${menu.line}`);
                lines.push('');

                if (props.options && props.options.length > 0) {
                    lines.push('**Options:**');
                    lines.push('');
                    props.options.forEach((opt: any) => {
                        const emoji = opt.emoji ? `${opt.emoji} ` : '';
                        const desc = opt.description ? ` - ${opt.description}` : '';
                        lines.push(`- ${emoji}**${opt.label}** (\`${opt.value}\`)${desc}`);
                    });
                    lines.push('');
                }
            });
        }

        if (textInputs.length > 0) {
            lines.push('### Text Inputs');
            lines.push('');
            lines.push('| Label | Style | Placeholder | Required | Min/Max Length | Line |');
            lines.push('|-------|-------|-------------|----------|----------------|------|');

            textInputs.forEach(input => {
                const props = input.properties as any;
                const minMax = `${props.min_length ?? 0}/${props.max_length ?? 4000}`;
                lines.push(`| ${props.label || '-'} | ${props.style || '-'} | ${props.placeholder || '-'} | ${props.required ? 'Yes' : 'No'} | ${minMax} | ${input.line} |`);
            });

            lines.push('');
        }

        return lines.join('\n');
    }

    /**
     * Save exported content to file
     */
    public static async saveToFile(
        content: string,
        defaultFileName: string,
        filters: { [name: string]: string[] }
    ): Promise<void> {
        const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(defaultFileName),
            filters: filters
        });

        if (!uri) {
            return;
        }

        const encoder = new TextEncoder();
        await vscode.workspace.fs.writeFile(uri, encoder.encode(content));

        vscode.window.showInformationMessage(`Exported to ${path.basename(uri.fsPath)}`);

        // Ask if user wants to open the file
        const action = await vscode.window.showInformationMessage(
            'Export completed',
            'Open File'
        );

        if (action === 'Open File') {
            const document = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(document);
        }
    }
}
