import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * Cached Python interpreter path
 */
let cachedPythonPath: string | null = null;

/**
 * Get the Python interpreter path
 * Priority:
 * 1. VS Code Python extension setting
 * 2. python3 command
 * 3. python command
 */
export async function getPythonPath(): Promise<string> {
    // Return cached path if available
    if (cachedPythonPath) {
        return cachedPythonPath;
    }

    // Try to get from VS Code Python extension
    try {
        const pythonExtension = vscode.extensions.getExtension('ms-python.python');
        if (pythonExtension) {
            if (!pythonExtension.isActive) {
                await pythonExtension.activate();
            }

            // Try to get the Python path from the extension API
            const pythonApi = pythonExtension.exports;
            if (pythonApi && pythonApi.settings) {
                const pythonPathFromApi = pythonApi.settings.getExecutionDetails?.()?.execCommand?.[0];
                if (pythonPathFromApi && await isValidPython(pythonPathFromApi)) {
                    cachedPythonPath = pythonPathFromApi;
                    return pythonPathFromApi;
                }
            }
        }

        // Try workspace configuration
        const config = vscode.workspace.getConfiguration('python');
        const pythonPathFromConfig = config.get<string>('pythonPath') || config.get<string>('defaultInterpreterPath');
        if (pythonPathFromConfig && await isValidPython(pythonPathFromConfig)) {
            cachedPythonPath = pythonPathFromConfig;
            return pythonPathFromConfig;
        }
    } catch (error) {
        console.log('Could not get Python path from extension:', error);
    }

    // Fallback: try python3, then python
    const candidates = ['python3', 'python'];
    
    for (const candidate of candidates) {
        if (await isValidPython(candidate)) {
            cachedPythonPath = candidate;
            return candidate;
        }
    }

    throw new Error('Python interpreter not found. Please install Python or configure the Python extension.');
}

/**
 * Check if a Python path is valid by running --version
 */
async function isValidPython(pythonPath: string): Promise<boolean> {
    try {
        const { stdout } = await execFileAsync(pythonPath, ['--version'], {
            timeout: 5000
        });
        return stdout.toLowerCase().includes('python');
    } catch {
        return false;
    }
}

/**
 * Clear the cached Python path (useful for testing or when settings change)
 */
export function clearPythonPathCache(): void {
    cachedPythonPath = null;
}

/**
 * Get Python version information
 */
export async function getPythonVersion(): Promise<string> {
    try {
        const pythonPath = await getPythonPath();
        const { stdout } = await execFileAsync(pythonPath, ['--version'], {
            timeout: 5000
        });
        return stdout.trim();
    } catch (error) {
        return 'Unknown';
    }
}
