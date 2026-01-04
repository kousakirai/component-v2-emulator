import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { execSync, spawn } from 'child_process';
import { getPythonPath } from './pythonInterpreter';

export interface DiscordPyInfo {
    version: string;
    supportsLayoutView: boolean;
    supportsContainers: boolean;
    supportsSections: boolean;
    branch: 'stable' | 'development' | 'unknown';
}

/**
 * Minimum version that supports LayoutView
 */
const LAYOUTVIEW_MIN_VERSION = '2.6.0';

/**
 * Feature support by version
 */
const FEATURE_VERSIONS: Record<string, string> = {
    'LayoutView': '2.6.0',
    'Container': '2.6.0',
    'Section': '2.6.0',
    'MediaGallery': '2.6.0',
    'TextDisplay': '2.6.0',
    'Separator': '2.6.0',
    'File': '2.6.0',
    'Thumbnail': '2.6.0'
};

/**
 * Detect discord.py version from the current Python environment
 */
export async function detectDiscordPyVersion(): Promise<DiscordPyInfo | null> {
    try {
        const pythonPath = await getPythonPath();
        if (!pythonPath) {
            return null;
        }

        // Get discord.py version using Python
        const script = `
import sys
try:
    import discord
    print(discord.__version__)
except ImportError:
    print("NOT_INSTALLED")
except Exception as e:
    print(f"ERROR:{e}")
`;

        const result = execSync(`"${pythonPath}" -c "${script.replace(/\n/g, ';')}"`, {
            encoding: 'utf8',
            timeout: 10000
        }).trim();

        if (result === 'NOT_INSTALLED') {
            return null;
        }

        if (result.startsWith('ERROR:')) {
            console.error('Error detecting discord.py:', result);
            return null;
        }

        const version = result;
        return parseVersionInfo(version);
    } catch (error) {
        console.error('Failed to detect discord.py version:', error);
        return null;
    }
}

/**
 * Parse version string and determine feature support
 */
function parseVersionInfo(version: string): DiscordPyInfo {
    // Determine branch
    let branch: 'stable' | 'development' | 'unknown' = 'unknown';
    if (version.includes('a') || version.includes('b') || version.includes('dev')) {
        branch = 'development';
    } else if (/^\d+\.\d+\.\d+$/.test(version)) {
        branch = 'stable';
    }

    // Check version support
    const supportsLayoutView = compareVersions(version, LAYOUTVIEW_MIN_VERSION) >= 0;
    const supportsContainers = supportsLayoutView;
    const supportsSections = supportsLayoutView;

    return {
        version,
        supportsLayoutView,
        supportsContainers,
        supportsSections,
        branch
    };
}

/**
 * Compare two version strings
 * Returns: positive if v1 > v2, negative if v1 < v2, 0 if equal
 */
function compareVersions(v1: string, v2: string): number {
    // Extract numeric parts
    const parts1 = v1.replace(/[^\d.]/g, '.').split('.').filter(Boolean).map(Number);
    const parts2 = v2.replace(/[^\d.]/g, '.').split('.').filter(Boolean).map(Number);

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
        const num1 = parts1[i] || 0;
        const num2 = parts2[i] || 0;
        if (num1 !== num2) {
            return num1 - num2;
        }
    }
    return 0;
}

/**
 * Check if a specific feature is supported
 */
export function isFeatureSupported(feature: string, version: string): boolean {
    const minVersion = FEATURE_VERSIONS[feature];
    if (!minVersion) {
        return true; // Unknown feature, assume supported
    }
    return compareVersions(version, minVersion) >= 0;
}

/**
 * Get list of unsupported features for current version
 */
export function getUnsupportedFeatures(version: string): string[] {
    const unsupported: string[] = [];
    for (const [feature, minVersion] of Object.entries(FEATURE_VERSIONS)) {
        if (compareVersions(version, minVersion) < 0) {
            unsupported.push(feature);
        }
    }
    return unsupported;
}

/**
 * Show version status in status bar
 */
export class DiscordPyStatusBar {
    private statusBarItem: vscode.StatusBarItem;
    private currentInfo: DiscordPyInfo | null = null;

    constructor() {
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100
        );
        this.statusBarItem.command = 'discordComponents.showVersionInfo';
    }

    async update() {
        this.currentInfo = await detectDiscordPyVersion();

        if (!this.currentInfo) {
            this.statusBarItem.text = '$(warning) discord.py not found';
            this.statusBarItem.tooltip = 'discord.py is not installed in the current Python environment';
            this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        } else {
            const icon = this.currentInfo.supportsLayoutView ? '$(check)' : '$(warning)';
            this.statusBarItem.text = `${icon} discord.py ${this.currentInfo.version}`;

            if (this.currentInfo.supportsLayoutView) {
                this.statusBarItem.tooltip = 'discord.py supports LayoutView components';
                this.statusBarItem.backgroundColor = undefined;
            } else {
                this.statusBarItem.tooltip = `LayoutView requires discord.py ${LAYOUTVIEW_MIN_VERSION} or higher`;
                this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
            }
        }

        this.statusBarItem.show();
    }

    getInfo(): DiscordPyInfo | null {
        return this.currentInfo;
    }

    dispose() {
        this.statusBarItem.dispose();
    }
}

/**
 * Show detailed version information
 */
export async function showVersionInfo(statusBar: DiscordPyStatusBar) {
    const info = statusBar.getInfo();

    if (!info) {
        const action = await vscode.window.showWarningMessage(
            'discord.py is not installed in the current Python environment.',
            'Install discord.py',
            'Change Python Interpreter'
        );

        if (action === 'Install discord.py') {
            const terminal = vscode.window.createTerminal('Install discord.py');
            terminal.show();
            terminal.sendText('pip install discord.py>=2.6.0');
        } else if (action === 'Change Python Interpreter') {
            vscode.commands.executeCommand('python.setInterpreter');
        }
        return;
    }

    const items: vscode.QuickPickItem[] = [
        {
            label: `$(info) Version: ${info.version}`,
            description: info.branch === 'development' ? '(development)' : info.branch === 'stable' ? '(stable)' : '',
            detail: `Branch: ${info.branch}`
        },
        {
            label: info.supportsLayoutView ? '$(check) LayoutView Supported' : '$(x) LayoutView Not Supported',
            description: info.supportsLayoutView ? 'All components available' : `Requires v${LAYOUTVIEW_MIN_VERSION}+`,
            detail: info.supportsLayoutView ? 'You can use all LayoutView components' : 'Please upgrade discord.py to use LayoutView'
        }
    ];

    if (!info.supportsLayoutView) {
        items.push({
            label: '$(cloud-download) Upgrade discord.py',
            description: 'Install the latest version',
            detail: 'pip install discord.py --upgrade'
        });
    }

    const selected = await vscode.window.showQuickPick(items, {
        title: 'discord.py Version Information',
        placeHolder: 'Select an action'
    });

    if (selected?.label.includes('Upgrade')) {
        const terminal = vscode.window.createTerminal('Upgrade discord.py');
        terminal.show();
        terminal.sendText('pip install discord.py --upgrade');
    }
}

/**
 * Register version detection commands and status bar
 */
export function registerVersionDetection(context: vscode.ExtensionContext): DiscordPyStatusBar {
    const statusBar = new DiscordPyStatusBar();

    // Initial update
    statusBar.update();

    // Update on Python interpreter change
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('python.pythonPath') ||
                e.affectsConfiguration('python.defaultInterpreterPath')) {
                statusBar.update();
            }
        })
    );

    // Register command to show version info
    context.subscriptions.push(
        vscode.commands.registerCommand('discordComponents.showVersionInfo', () => {
            showVersionInfo(statusBar);
        })
    );

    // Register command to refresh version detection
    context.subscriptions.push(
        vscode.commands.registerCommand('discordComponents.refreshVersion', () => {
            statusBar.update();
            vscode.window.showInformationMessage('discord.py version detection refreshed');
        })
    );

    context.subscriptions.push(statusBar);

    return statusBar;
}
