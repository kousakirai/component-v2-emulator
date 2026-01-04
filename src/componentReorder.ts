import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Component Reorder Handler - Handles drag and drop reordering of components
 * 
 * Manipulates Python AST to reorder add_item() calls in __init__ method
 */

export interface ReorderRequest {
    sourceIndex: number;
    targetIndex: number;
    insertBefore: boolean;
}

export class ComponentReorderHandler {
    /**
     * Reorder components in Python file based on drag and drop
     */
    public static async reorderComponents(
        document: vscode.TextDocument,
        request: ReorderRequest
    ): Promise<boolean> {
        try {
            const text = document.getText();
            const lines = text.split('\n');

            // Find __init__ method and add_item calls
            const addItemLines = this.findAddItemCalls(lines);

            if (addItemLines.length === 0) {
                vscode.window.showWarningMessage('No add_item() calls found in __init__ method');
                return false;
            }

            // Validate indices
            if (request.sourceIndex < 0 || request.sourceIndex >= addItemLines.length ||
                request.targetIndex < 0 || request.targetIndex >= addItemLines.length) {
                vscode.window.showErrorMessage('Invalid reorder indices');
                return false;
            }

            // Calculate new position
            let newTargetIndex = request.targetIndex;
            if (!request.insertBefore) {
                newTargetIndex++;
            }
            if (request.sourceIndex < newTargetIndex) {
                newTargetIndex--;
            }

            // Reorder the lines
            const reorderedLines = this.reorderLines(lines, addItemLines, request.sourceIndex, newTargetIndex);

            // Apply edit
            const editor = await vscode.window.showTextDocument(document);
            const fullRange = new vscode.Range(
                new vscode.Position(0, 0),
                new vscode.Position(lines.length, 0)
            );

            await editor.edit(editBuilder => {
                editBuilder.replace(fullRange, reorderedLines.join('\n'));
            });

            vscode.window.showInformationMessage('Components reordered successfully');
            return true;

        } catch (error) {
            vscode.window.showErrorMessage(`Failed to reorder: ${error}`);
            return false;
        }
    }

    /**
     * Find all add_item() call lines in __init__ method
     */
    private static findAddItemCalls(lines: string[]): number[] {
        const addItemLines: number[] = [];
        let inInitMethod = false;
        let indentLevel = 0;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();

            // Detect __init__ method start
            if (trimmed.includes('def __init__')) {
                inInitMethod = true;
                indentLevel = this.getIndentLevel(line);
                continue;
            }

            // Exit __init__ when we hit another method at same level
            if (inInitMethod && trimmed.startsWith('def ') && this.getIndentLevel(line) <= indentLevel) {
                break;
            }

            // Detect add_item calls
            if (inInitMethod) {
                if (trimmed.includes('.add_item(') || trimmed.includes('.append_item(')) {
                    addItemLines.push(i);
                }
            }
        }

        return addItemLines;
    }

    /**
     * Get indentation level of a line
     */
    private static getIndentLevel(line: string): number {
        const match = line.match(/^(\s*)/);
        return match ? match[1].length : 0;
    }

    /**
     * Reorder lines based on source and target indices
     */
    private static reorderLines(
        lines: string[],
        addItemLines: number[],
        sourceIndex: number,
        targetIndex: number
    ): string[] {
        if (sourceIndex === targetIndex) {
            return lines;
        }

        const newLines = [...lines];
        const sourceLineIndex = addItemLines[sourceIndex];
        const sourceLine = lines[sourceLineIndex];

        // Remove source line
        newLines.splice(sourceLineIndex, 1);

        // Calculate adjusted target position
        let adjustedTargetLineIndex = addItemLines[targetIndex];
        if (sourceLineIndex < adjustedTargetLineIndex) {
            adjustedTargetLineIndex--;
        }

        // Insert at new position
        newLines.splice(adjustedTargetLineIndex, 0, sourceLine);

        return newLines;
    }

    /**
     * Check if file has add_item calls
     */
    public static hasReorderableComponents(document: vscode.TextDocument): boolean {
        const lines = document.getText().split('\n');
        const addItemLines = this.findAddItemCalls(lines);
        return addItemLines.length > 1; // Need at least 2 to reorder
    }
}
