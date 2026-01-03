import * as vscode from 'vscode';
import { spawn } from 'child_process';
import * as path from 'path';
import { getPythonPath } from './pythonInterpreter';
import { ParseResult, ComponentData, ParseError, ValidationWarning } from './types';
import { validateComponents, checkAccessibility } from './validator';

/**
 * Timeout for Python process execution (10 seconds)
 */
const PYTHON_TIMEOUT = 10000;

/**
 * Parse components from a Python file using the Python AST parser
 */
export async function parseComponents(filePath: string): Promise<ParseResult> {
    try {
        const pythonPath = await getPythonPath();
        const parserScriptPath = path.join(__dirname, '..', 'src', 'parsers', 'buttonParser.py');

        const result = await executePythonScript(pythonPath, parserScriptPath, [filePath]);
        
        // Add validation warnings
        const validationWarnings = validateComponents(result.components);
        const accessibilityWarnings = checkAccessibility(result.components);
        
        result.warnings = [...validationWarnings, ...accessibilityWarnings];
        
        return result;
    } catch (error) {
        return {
            components: [],
            errors: [{
                severity: 'error',
                message: `Failed to parse file: ${error instanceof Error ? error.message : String(error)}`
            }],
            warnings: []
        };
    }
}

/**
 * Execute Python script and return parsed result
 */
async function executePythonScript(
    pythonPath: string,
    scriptPath: string,
    args: string[]
): Promise<ParseResult> {
    return new Promise((resolve, reject) => {
        let stdout = '';
        let stderr = '';
        let timeoutId: NodeJS.Timeout;

        const pythonProcess = spawn(pythonPath, [scriptPath, ...args]);

        // Set timeout
        timeoutId = setTimeout(() => {
            pythonProcess.kill();
            reject(new Error('Python script execution timed out after 10 seconds'));
        }, PYTHON_TIMEOUT);

        // Collect stdout
        pythonProcess.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        // Collect stderr
        pythonProcess.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        // Handle process exit
        pythonProcess.on('close', (code) => {
            clearTimeout(timeoutId);

            if (code !== 0) {
                reject(new Error(`Python process exited with code ${code}: ${stderr}`));
                return;
            }

            // Parse JSON output
            try {
                const result = JSON.parse(stdout);
                
                // Validate the result structure
                if (!result.components || !Array.isArray(result.components)) {
                    reject(new Error('Invalid parser output: missing components array'));
                    return;
                }
                
                if (!result.errors || !Array.isArray(result.errors)) {
                    result.errors = [];
                }

                resolve({
                    components: result.components as ComponentData[],
                    errors: result.errors as ParseError[],
                    warnings: [],
                    views: result.views || []
                });
            } catch (error) {
                reject(new Error(`Failed to parse JSON output: ${error instanceof Error ? error.message : String(error)}\nOutput: ${stdout}`));
            }
        });

        // Handle process errors
        pythonProcess.on('error', (error) => {
            clearTimeout(timeoutId);
            reject(new Error(`Failed to spawn Python process: ${error.message}`));
        });
    });
}

/**
 * Check if a file likely contains discord.py code
 */
/**
 * Check if a document or text content contains discord.py code
 */
export function isDiscordPyFile(document: vscode.TextDocument): boolean;
export function isDiscordPyFile(content: string): boolean;
export function isDiscordPyFile(input: vscode.TextDocument | string): boolean {
    const text = typeof input === 'string' ? input : input.getText();
    
    // Quick heuristic: check for common discord.py imports
    const discordPatterns = [
        /import\s+discord/,
        /from\s+discord/,
        /discord\.ui\./,
        /discord\.Button/,
        /@.*\.button\(/
    ];

    return discordPatterns.some(pattern => pattern.test(text));
}
