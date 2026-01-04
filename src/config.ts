import * as vscode from 'vscode';

/**
 * Extension configuration manager
 */
export class ConfigurationManager {
    private static readonly CONFIG_SECTION = 'discord-preview';

    /**
     * Get configuration value
     */
    static get<T>(key: string, defaultValue: T): T {
        const config = vscode.workspace.getConfiguration(this.CONFIG_SECTION);
        return config.get<T>(key, defaultValue);
    }

    /**
     * Set configuration value
     */
    static async set(key: string, value: any, target?: vscode.ConfigurationTarget): Promise<void> {
        const config = vscode.workspace.getConfiguration(this.CONFIG_SECTION);
        await config.update(key, value, target || vscode.ConfigurationTarget.Global);
    }

    /**
     * Get all configuration
     */
    static getAll(): ExtensionConfig {
        return {
            pythonPath: this.get('pythonPath', 'python3'),
            debounceDelay: this.get('debounceDelay', 500),
            maxComponents: this.get('maxComponents', 100),
            autoRefresh: this.get('autoRefresh', true),
            theme: this.get('theme', 'auto'),
            enableCache: this.get('enableCache', true),
            cacheTTL: this.get('cacheTTL', 30),
            showLineNumbers: this.get('showLineNumbers', true),
            highlightErrors: this.get('highlightErrors', true),
            enableAccessibilityChecks: this.get('enableAccessibilityChecks', true),
            exportFormat: this.get('exportFormat', 'json'),
            compactView: this.get('compactView', false),
        };
    }

    /**
     * Open settings UI
     */
    static async openSettings(): Promise<void> {
        await vscode.commands.executeCommand('workbench.action.openSettings', '@ext:kousakirai.discord-component-preview');
    }

    /**
     * Reset all settings to default
     */
    static async resetToDefault(): Promise<void> {
        const config = vscode.workspace.getConfiguration(this.CONFIG_SECTION);
        const keys = [
            'pythonPath', 'debounceDelay', 'maxComponents', 'autoRefresh',
            'theme', 'enableCache', 'cacheTTL', 'showLineNumbers',
            'highlightErrors', 'enableAccessibilityChecks', 'exportFormat', 'compactView'
        ];

        for (const key of keys) {
            await config.update(key, undefined, vscode.ConfigurationTarget.Global);
        }

        vscode.window.showInformationMessage('Discord Component Preview: Settings reset to default');
    }

    /**
     * Watch for configuration changes
     */
    static onDidChange(callback: (e: vscode.ConfigurationChangeEvent) => void): vscode.Disposable {
        return vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration(this.CONFIG_SECTION)) {
                callback(e);
            }
        });
    }

    /**
     * Export current configuration
     */
    static exportConfig(): string {
        const config = this.getAll();
        return JSON.stringify(config, null, 2);
    }

    /**
     * Import configuration from JSON
     */
    static async importConfig(jsonString: string): Promise<void> {
        try {
            const config = JSON.parse(jsonString);

            for (const [key, value] of Object.entries(config)) {
                await this.set(key, value);
            }

            vscode.window.showInformationMessage('Discord Component Preview: Configuration imported successfully');
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to import configuration: ${error}`);
        }
    }

    /**
     * Validate configuration
     */
    static validateConfig(): { valid: boolean; errors: string[] } {
        const errors: string[] = [];
        const config = this.getAll();

        // Validate debounceDelay
        if (config.debounceDelay < 0 || config.debounceDelay > 5000) {
            errors.push('debounceDelay must be between 0 and 5000ms');
        }

        // Validate maxComponents
        if (config.maxComponents < 1 || config.maxComponents > 1000) {
            errors.push('maxComponents must be between 1 and 1000');
        }

        // Validate cacheTTL
        if (config.cacheTTL < 1 || config.cacheTTL > 3600) {
            errors.push('cacheTTL must be between 1 and 3600 seconds');
        }

        // Validate theme
        if (!['auto', 'light', 'dark'].includes(config.theme)) {
            errors.push('theme must be one of: auto, light, dark');
        }

        // Validate exportFormat
        if (!['json', 'markdown', 'both'].includes(config.exportFormat)) {
            errors.push('exportFormat must be one of: json, markdown, both');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }
}

export interface ExtensionConfig {
    pythonPath: string;
    debounceDelay: number;
    maxComponents: number;
    autoRefresh: boolean;
    theme: 'auto' | 'light' | 'dark';
    enableCache: boolean;
    cacheTTL: number;
    showLineNumbers: boolean;
    highlightErrors: boolean;
    enableAccessibilityChecks: boolean;
    exportFormat: 'json' | 'markdown' | 'both';
    compactView: boolean;
}
