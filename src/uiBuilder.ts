import * as vscode from 'vscode';

/**
 * LayoutView component types supported by discord.py
 */
export type LayoutComponentType =
    | 'action_row'
    | 'container'
    | 'section'
    | 'text_display'
    | 'media_gallery'
    | 'file'
    | 'separator'
    | 'button'
    | 'select'
    | 'user_select'
    | 'role_select'
    | 'channel_select'
    | 'mentionable_select'
    | 'thumbnail';

/**
 * Component data structure for UI Builder
 */
export interface UIBuilderComponent {
    id: string;
    type: LayoutComponentType;
    properties: Record<string, any>;
    children?: UIBuilderComponent[];
    parentId?: string;
}

/**
 * LayoutView configuration
 */
export interface LayoutViewConfig {
    className: string;
    timeout?: number;
    components: UIBuilderComponent[];
}

/**
 * UIBuilder - Visual LayoutView Builder for discord.py
 * 
 * Provides a GUI for creating discord.ui.LayoutView classes with:
 * - Drag-and-drop component placement
 * - Visual hierarchy editor (Container, Section, ActionRow)
 * - Real-time preview
 * - Python code generation
 */
export class UIBuilder {
    private static instance: UIBuilder | null = null;
    private panel: vscode.WebviewPanel | null = null;
    private extensionUri: vscode.Uri;
    private currentConfig: LayoutViewConfig;
    private targetDocument: vscode.TextDocument | null = null;
    private insertPosition: vscode.Position | null = null;
    private context: vscode.ExtensionContext | null = null;

    // Undo/Redo history
    private history: LayoutViewConfig[] = [];
    private historyIndex: number = -1;
    private readonly MAX_HISTORY = 50;
    private isUndoRedoOperation: boolean = false;
    private static readonly STATE_KEY = 'uiBuilderState';

    private constructor(extensionUri: vscode.Uri) {
        this.extensionUri = extensionUri;
        this.currentConfig = {
            className: 'MyLayoutView',
            timeout: 180,
            components: []
        };
        this.saveToHistory();
    }

    /**
     * Get or create the singleton instance
     */
    public static getInstance(extensionUri: vscode.Uri, context?: vscode.ExtensionContext): UIBuilder {
        if (!UIBuilder.instance) {
            UIBuilder.instance = new UIBuilder(extensionUri);
        }
        if (context) {
            UIBuilder.instance.context = context;
            UIBuilder.instance.restoreState();
        }
        return UIBuilder.instance;
    }

    /**
     * Save current state to workspace storage
     */
    private saveState(): void {
        if (this.context) {
            this.context.workspaceState.update(UIBuilder.STATE_KEY, {
                config: this.currentConfig,
                timestamp: Date.now()
            });
        }
    }

    /**
     * Restore state from workspace storage
     */
    private restoreState(): void {
        if (this.context) {
            const saved = this.context.workspaceState.get<{ config: LayoutViewConfig; timestamp: number }>(UIBuilder.STATE_KEY);
            if (saved && saved.config) {
                // Only restore if saved within last 24 hours
                const oneDay = 24 * 60 * 60 * 1000;
                if (Date.now() - saved.timestamp < oneDay) {
                    this.currentConfig = saved.config;
                    this.history = [JSON.parse(JSON.stringify(saved.config))];
                    this.historyIndex = 0;
                }
            }
        }
    }

    /**
     * Open the UI Builder panel
     */
    public open(document?: vscode.TextDocument, position?: vscode.Position): void {
        this.targetDocument = document || null;
        this.insertPosition = position || null;

        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.Two);
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'discordUIBuilder',
            'Discord UI Builder',
            vscode.ViewColumn.Two,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [this.extensionUri]
            }
        );

        this.panel.onDidDispose(() => {
            this.panel = null;
        });

        this.panel.webview.onDidReceiveMessage(
            message => this.handleMessage(message),
            undefined,
            []
        );

        this.updatePanel();
    }

    /**
     * Handle messages from webview
     */
    private async handleMessage(message: any): Promise<void> {
        switch (message.command) {
            case 'updateConfig':
                this.currentConfig = message.config;
                break;

            case 'addComponent':
                this.addComponent(message.componentType, message.parentId);
                break;

            case 'duplicateComponent':
                this.duplicateComponent(message.componentId);
                break;

            case 'updateComponent':
                this.updateComponent(message.componentId, message.properties);
                break;

            case 'removeComponent':
                this.removeComponent(message.componentId);
                break;

            case 'moveComponent':
                this.moveComponent(message.componentId, message.newParentId, message.newIndex);
                break;

            case 'generateCode':
                await this.generateAndInsertCode();
                break;

            case 'exportCode':
                await this.exportCode();
                break;

            case 'setClassName':
                this.currentConfig.className = message.className;
                this.updatePanel();
                break;

            case 'setTimeout':
                this.currentConfig.timeout = message.timeout;
                break;

            case 'showCodePreview':
                this.showCodePreview();
                break;

            case 'clearAll':
                this.currentConfig.components = [];
                this.saveToHistory();
                this.updatePanel();
                break;

            case 'addSelectOption':
                this.addSelectOption(message.componentId);
                break;

            case 'removeSelectOption':
                this.removeSelectOption(message.componentId, message.optionIndex);
                break;

            case 'updateSelectOption':
                this.updateSelectOption(message.componentId, message.optionIndex, message.option);
                break;

            case 'moveComponentUp':
                this.moveComponentInOrder(message.componentId, 'up');
                break;

            case 'moveComponentDown':
                this.moveComponentInOrder(message.componentId, 'down');
                break;

            case 'undo':
                this.undo();
                break;

            case 'redo':
                this.redo();
                break;

            case 'copyComponent':
                this.copyComponent(message.componentId);
                break;

            case 'cutComponent':
                this.cutComponent(message.componentId);
                break;

            case 'pasteComponent':
                this.pasteComponent(message.parentId);
                break;

            case 'importComponents':
                this.importComponents(message.json);
                break;

            case 'exportComponents':
                this.exportComponentsAsJson();
                break;
        }
    }

    /**
     * Save current state to history
     */
    private saveToHistory(): void {
        if (this.isUndoRedoOperation) return;

        // Remove any future states if we're in the middle of history
        if (this.historyIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.historyIndex + 1);
        }

        // Deep clone the config
        const snapshot = JSON.parse(JSON.stringify(this.currentConfig));
        this.history.push(snapshot);

        // Limit history size
        if (this.history.length > this.MAX_HISTORY) {
            this.history.shift();
        } else {
            this.historyIndex++;
        }

        this.updateUndoRedoState();
        this.saveState();
    }

    /**
     * Undo last action
     */
    private undo(): void {
        if (this.historyIndex > 0) {
            this.isUndoRedoOperation = true;
            this.historyIndex--;
            this.currentConfig = JSON.parse(JSON.stringify(this.history[this.historyIndex]));
            this.updatePanel();
            this.isUndoRedoOperation = false;
            this.updateUndoRedoState();
        }
    }

    /**
     * Redo last undone action
     */
    private redo(): void {
        if (this.historyIndex < this.history.length - 1) {
            this.isUndoRedoOperation = true;
            this.historyIndex++;
            this.currentConfig = JSON.parse(JSON.stringify(this.history[this.historyIndex]));
            this.updatePanel();
            this.isUndoRedoOperation = false;
            this.updateUndoRedoState();
        }
    }

    /**
     * Update undo/redo button states in webview
     */
    private updateUndoRedoState(): void {
        if (this.panel) {
            this.panel.webview.postMessage({
                command: 'updateUndoRedoState',
                canUndo: this.historyIndex > 0,
                canRedo: this.historyIndex < this.history.length - 1
            });
        }
    }

    /**
     * Component limits for discord.py LayoutView
     */
    private static readonly COMPONENT_LIMITS = {
        TOP_LEVEL: 10,          // Max top-level components in LayoutView
        ACTION_ROW: 5,          // Max items in ActionRow
        CONTAINER: 10,          // Max items in Container
        SECTION_TEXT: 3,        // Max TextDisplays in Section
    };

    /**
     * Check if adding a component would exceed limits
     * Returns error message if limit exceeded, null if OK
     */
    private checkComponentLimit(type: LayoutComponentType, parentId?: string): string | null {
        if (parentId) {
            const parent = this.findComponent(this.currentConfig.components, parentId);
            if (!parent) return null;

            const currentCount = parent.children?.length || 0;

            switch (parent.type) {
                case 'action_row':
                    if (currentCount >= UIBuilder.COMPONENT_LIMITS.ACTION_ROW) {
                        return `ActionRow can have maximum ${UIBuilder.COMPONENT_LIMITS.ACTION_ROW} items (currently ${currentCount})`;
                    }
                    // Only buttons and selects can be in ActionRow
                    if (!['button', 'select', 'user_select', 'role_select', 'channel_select', 'mentionable_select'].includes(type)) {
                        return `ActionRow can only contain buttons and select menus`;
                    }
                    break;

                case 'container':
                    if (currentCount >= UIBuilder.COMPONENT_LIMITS.CONTAINER) {
                        return `Container can have maximum ${UIBuilder.COMPONENT_LIMITS.CONTAINER} items (currently ${currentCount})`;
                    }
                    break;

                case 'section':
                    // Section can only have TextDisplays as children
                    if (type !== 'text_display') {
                        return `Section can only contain TextDisplay components`;
                    }
                    const textCount = parent.children?.filter(c => c.type === 'text_display').length || 0;
                    if (textCount >= UIBuilder.COMPONENT_LIMITS.SECTION_TEXT) {
                        return `Section can have maximum ${UIBuilder.COMPONENT_LIMITS.SECTION_TEXT} TextDisplays (currently ${textCount})`;
                    }
                    break;
            }
        } else {
            // Top-level component
            if (this.currentConfig.components.length >= UIBuilder.COMPONENT_LIMITS.TOP_LEVEL) {
                return `LayoutView can have maximum ${UIBuilder.COMPONENT_LIMITS.TOP_LEVEL} top-level components (currently ${this.currentConfig.components.length})`;
            }
        }

        return null;
    }

    /**
     * Add a component to the builder
     */
    private addComponent(type: LayoutComponentType, parentId?: string): void {
        // Check component limits
        const limitError = this.checkComponentLimit(type, parentId);
        if (limitError) {
            vscode.window.showWarningMessage(limitError);
            this.sendLimitError(limitError);
            return;
        }

        const id = `comp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const component: UIBuilderComponent = {
            id,
            type,
            properties: this.getDefaultProperties(type),
            children: this.canHaveChildren(type) ? [] : undefined,
            parentId
        };

        if (parentId) {
            const parent = this.findComponent(this.currentConfig.components, parentId);
            if (parent && parent.children) {
                parent.children.push(component);
            }
        } else {
            this.currentConfig.components.push(component);
        }

        this.saveToHistory();
        this.updatePanel();
    }

    /**
     * Send limit error to webview
     */
    private sendLimitError(message: string): void {
        this.panel?.webview.postMessage({
            command: 'showError',
            message
        });
    }

    /**
     * Duplicate a component
     */
    private duplicateComponent(componentId: string): void {
        const component = this.findComponent(this.currentConfig.components, componentId);
        if (!component) return;

        // Check component limits before duplicating
        const limitError = this.checkComponentLimit(component.type, component.parentId);
        if (limitError) {
            vscode.window.showWarningMessage(limitError);
            this.sendLimitError(limitError);
            return;
        }

        const cloned = this.deepCloneComponent(component);

        if (component.parentId) {
            const parent = this.findComponent(this.currentConfig.components, component.parentId);
            if (parent && parent.children) {
                parent.children.push(cloned);
            }
        } else {
            this.currentConfig.components.push(cloned);
        }

        this.saveToHistory();
        this.updatePanel();
    }

    /**
     * Deep clone a component with new IDs
     */
    private deepCloneComponent(comp: UIBuilderComponent): UIBuilderComponent {
        const newId = `comp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const cloned: UIBuilderComponent = {
            id: newId,
            type: comp.type,
            properties: { ...comp.properties },
            parentId: comp.parentId
        };
        if (comp.children) {
            cloned.children = comp.children.map(c => {
                const childClone = this.deepCloneComponent(c);
                childClone.parentId = newId;
                return childClone;
            });
        }
        return cloned;
    }

    // Clipboard for copy/paste
    private clipboard: UIBuilderComponent | null = null;

    /**
     * Copy component to clipboard
     */
    private copyComponent(componentId: string): void {
        const component = this.findComponent(this.currentConfig.components, componentId);
        if (component) {
            this.clipboard = JSON.parse(JSON.stringify(component));
            this.notifyClipboardState();
            vscode.window.showInformationMessage(`Copied ${component.type} to clipboard`);
        }
    }

    /**
     * Cut component (copy and remove)
     */
    private cutComponent(componentId: string): void {
        const component = this.findComponent(this.currentConfig.components, componentId);
        if (component) {
            this.clipboard = JSON.parse(JSON.stringify(component));
            this.removeComponent(componentId);
            this.notifyClipboardState();
            vscode.window.showInformationMessage(`Cut ${component.type} to clipboard`);
        }
    }

    /**
     * Paste component from clipboard
     */
    private pasteComponent(parentId?: string): void {
        if (!this.clipboard) {
            vscode.window.showWarningMessage('Clipboard is empty');
            return;
        }

        // Check component limits before pasting
        const limitError = this.checkComponentLimit(this.clipboard.type, parentId);
        if (limitError) {
            vscode.window.showWarningMessage(limitError);
            this.sendLimitError(limitError);
            return;
        }

        const cloned = this.deepCloneComponent(this.clipboard);
        cloned.parentId = parentId;

        if (parentId) {
            const parent = this.findComponent(this.currentConfig.components, parentId);
            if (parent && parent.children) {
                parent.children.push(cloned);
            }
        } else {
            this.currentConfig.components.push(cloned);
        }

        this.saveToHistory();
        this.updatePanel();
    }

    /**
     * Notify webview about clipboard state
     */
    private notifyClipboardState(): void {
        if (this.panel) {
            this.panel.webview.postMessage({
                command: 'clipboardUpdate',
                hasContent: this.clipboard !== null,
                contentType: this.clipboard?.type
            });
        }
    }

    /**
     * Export components as JSON
     */
    private async exportComponentsAsJson(): Promise<void> {
        const json = JSON.stringify(this.currentConfig, null, 2);
        await vscode.env.clipboard.writeText(json);
        vscode.window.showInformationMessage('Components exported to clipboard as JSON');
    }

    /**
     * Import components from JSON
     */
    private importComponents(json: string): void {
        try {
            const config = JSON.parse(json);
            if (config.components && Array.isArray(config.components)) {
                this.currentConfig = config;
                this.saveToHistory();
                this.updatePanel();
                vscode.window.showInformationMessage('Components imported successfully');
            } else {
                vscode.window.showErrorMessage('Invalid JSON format');
            }
        } catch (e) {
            vscode.window.showErrorMessage('Failed to parse JSON');
        }
    }

    /**
     * Add option to select menu (without full panel refresh)
     */
    private addSelectOption(componentId: string): void {
        const component = this.findComponent(this.currentConfig.components, componentId);
        if (!component) return;

        if (!component.properties.options) {
            component.properties.options = [];
        }
        component.properties.options.push({
            label: `Option ${component.properties.options.length + 1}`,
            value: `option_${component.properties.options.length + 1}`,
            description: ''
        });
        // Send update to refresh only properties panel, keeping selection
        this.sendPropertiesUpdate(component);
    }

    /**
     * Remove option from select menu
     */
    private removeSelectOption(componentId: string, optionIndex: number): void {
        const component = this.findComponent(this.currentConfig.components, componentId);
        if (!component || !component.properties.options) return;

        component.properties.options.splice(optionIndex, 1);
        this.sendPropertiesUpdate(component);
    }

    /**
     * Update select option (no refresh needed, just update data)
     */
    private updateSelectOption(componentId: string, optionIndex: number, option: any): void {
        const component = this.findComponent(this.currentConfig.components, componentId);
        if (!component || !component.properties.options) return;

        component.properties.options[optionIndex] = { ...component.properties.options[optionIndex], ...option };
        // Don't refresh panel to keep focus
    }

    /**
     * Send properties update to webview without full refresh
     */
    private sendPropertiesUpdate(component: UIBuilderComponent): void {
        if (!this.panel) return;
        this.panel.webview.postMessage({
            command: 'updateProperties',
            component: component
        });
    }

    /**
     * Move component up/down in its parent
     */
    private moveComponentInOrder(componentId: string, direction: 'up' | 'down'): void {
        const component = this.findComponent(this.currentConfig.components, componentId);
        if (!component) return;

        // Find parent array
        let parentArray: UIBuilderComponent[];
        if (component.parentId) {
            const parent = this.findComponent(this.currentConfig.components, component.parentId);
            if (!parent || !parent.children) return;
            parentArray = parent.children;
        } else {
            parentArray = this.currentConfig.components;
        }

        // Find current index
        const currentIndex = parentArray.findIndex(c => c.id === componentId);
        if (currentIndex === -1) return;

        // Calculate new index
        const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
        if (newIndex < 0 || newIndex >= parentArray.length) return;

        // Swap
        [parentArray[currentIndex], parentArray[newIndex]] = [parentArray[newIndex], parentArray[currentIndex]];

        this.saveToHistory();
        this.updatePanel();
    }

    /**
     * Show code preview in the builder panel
     */
    private showCodePreview(): void {
        const code = this.generateCode();
        const fullCode = `import discord\nfrom discord import ui\n\n${code}`;
        if (this.panel) {
            this.panel.webview.postMessage({
                command: 'showCodePreviewInline',
                code: fullCode
            });
        }
    }

    /**
     * Update a component's properties
     */
    private updateComponent(componentId: string, properties: Record<string, any>): void {
        const component = this.findComponent(this.currentConfig.components, componentId);
        if (component) {
            component.properties = { ...component.properties, ...properties };
            this.saveToHistory();
            this.updatePanel();
        }
    }

    /**
     * Remove a component
     */
    private removeComponent(componentId: string): void {
        this.currentConfig.components = this.removeFromTree(this.currentConfig.components, componentId);
        this.saveToHistory();
        this.updatePanel();
    }

    /**
     * Move a component to a new position
     */
    private moveComponent(componentId: string, newParentId: string | null, newIndex: number): void {
        const component = this.findComponent(this.currentConfig.components, componentId);
        if (!component) return;

        // Remove from current position
        this.currentConfig.components = this.removeFromTree(this.currentConfig.components, componentId);

        // Add to new position
        component.parentId = newParentId || undefined;

        if (newParentId) {
            const newParent = this.findComponent(this.currentConfig.components, newParentId);
            if (newParent && newParent.children) {
                newParent.children.splice(newIndex, 0, component);
            }
        } else {
            this.currentConfig.components.splice(newIndex, 0, component);
        }

        this.saveToHistory();
        this.updatePanel();
    }

    /**
     * Count total components including children
     */
    private countTotalComponents(components?: UIBuilderComponent[]): number {
        const comps = components || this.currentConfig.components;
        let count = comps.length;
        for (const comp of comps) {
            if (comp.children) {
                count += this.countTotalComponents(comp.children);
            }
        }
        return count;
    }

    /**
     * Find a component by ID in the tree
     */
    private findComponent(components: UIBuilderComponent[], id: string): UIBuilderComponent | null {
        for (const comp of components) {
            if (comp.id === id) return comp;
            if (comp.children) {
                const found = this.findComponent(comp.children, id);
                if (found) return found;
            }
        }
        return null;
    }

    /**
     * Remove a component from the tree by ID
     */
    private removeFromTree(components: UIBuilderComponent[], id: string): UIBuilderComponent[] {
        return components.filter(comp => {
            if (comp.id === id) return false;
            if (comp.children) {
                comp.children = this.removeFromTree(comp.children, id);
            }
            return true;
        });
    }

    /**
     * Check if component type can have children
     */
    private canHaveChildren(type: LayoutComponentType): boolean {
        return ['action_row', 'container', 'section'].includes(type);
    }

    /**
     * Get default properties for a component type
     */
    private getDefaultProperties(type: LayoutComponentType): Record<string, any> {
        switch (type) {
            case 'button':
                return { label: 'Button', style: 'primary', custom_id: '', disabled: false };
            case 'select':
                return { placeholder: 'Select an option', options: [], min_values: 1, max_values: 1 };
            case 'user_select':
            case 'role_select':
            case 'channel_select':
            case 'mentionable_select':
                return { placeholder: 'Make a selection', min_values: 1, max_values: 1 };
            case 'text_display':
                return { content: 'Text content here' };
            case 'container':
                return { accent_colour: null, spoiler: false };
            case 'section':
                return { accessory_type: 'thumbnail', accessory_media: '' };
            case 'separator':
                return { visible: true, spacing: 'small' };
            case 'thumbnail':
                return { media: '', description: '', spoiler: false };
            case 'media_gallery':
                return { items: [] };
            case 'file':
                return { media: '', spoiler: false };
            case 'action_row':
                return {};
            default:
                return {};
        }
    }

    /**
     * Generate Python code for the LayoutView
     */
    public generateCode(): string {
        const config = this.currentConfig;
        const lines: string[] = [];

        // Class definition
        lines.push(`class ${config.className}(discord.ui.LayoutView):`);

        // Class docstring
        lines.push(`    """A custom LayoutView created with UI Builder."""`);
        lines.push('');

        // Generate component definitions as class attributes
        const { attributes, callbacks, initCode } = this.generateComponentCode(config.components);

        // Add class-level attributes
        if (attributes.length > 0) {
            lines.push(...attributes.map(a => `    ${a}`));
            lines.push('');
        }

        // Add __init__ if needed
        if (initCode.length > 0) {
            lines.push(`    def __init__(self):`);
            lines.push(`        super().__init__(timeout=${config.timeout || 'None'})`);
            lines.push(...initCode.map(c => `        ${c}`));
            lines.push('');
        }

        // Add callback methods
        if (callbacks.length > 0) {
            lines.push(...callbacks);
        }

        // If empty class, add pass
        if (attributes.length === 0 && initCode.length === 0 && callbacks.length === 0) {
            lines.push('    pass');
        }

        return lines.join('\n');
    }

    /**
     * Generate component code (attributes, callbacks, init code)
     */
    private generateComponentCode(components: UIBuilderComponent[], indent: number = 0): {
        attributes: string[];
        callbacks: string[];
        initCode: string[];
    } {
        const attributes: string[] = [];
        const callbacks: string[] = [];
        const initCode: string[] = [];

        for (const comp of components) {
            const result = this.generateSingleComponentCode(comp);
            attributes.push(...result.attributes);
            callbacks.push(...result.callbacks);
            initCode.push(...result.initCode);
        }

        return { attributes, callbacks, initCode };
    }

    /**
     * Generate code for a single component
     */
    private generateSingleComponentCode(comp: UIBuilderComponent): {
        attributes: string[];
        callbacks: string[];
        initCode: string[];
    } {
        const attributes: string[] = [];
        const callbacks: string[] = [];
        const initCode: string[] = [];
        const props = comp.properties;
        const varName = this.generateVarName(comp);

        switch (comp.type) {
            case 'action_row': {
                attributes.push(`${varName} = discord.ui.ActionRow()`);

                // Process children (buttons/selects) with unique index for each type
                if (comp.children) {
                    let buttonIndex = 0;
                    let selectIndex = 0;

                    for (const child of comp.children) {
                        if (child.type === 'button') {
                            // Use custom_id or index to generate unique callback name
                            const customId = child.properties.custom_id;
                            const callbackSuffix = customId
                                ? this.sanitizeCallbackName(customId)
                                : (buttonIndex === 0 ? 'button' : `button${buttonIndex + 1}`);
                            const callbackName = `${varName}_${callbackSuffix}_callback`;
                            const btnProps = this.formatButtonProps(child.properties);
                            callbacks.push(`    @${varName}.button(${btnProps})`);
                            callbacks.push(`    async def ${callbackName}(self, interaction: discord.Interaction, button: discord.ui.Button):`);
                            callbacks.push(`        await interaction.response.send_message('Button clicked!', ephemeral=True)`);
                            callbacks.push('');
                            buttonIndex++;
                        } else if (child.type.includes('select')) {
                            // Use custom_id or index to generate unique callback name
                            const customId = child.properties.custom_id;
                            const selectType = child.type.replace('_select', '').replace('select', 'string');
                            const callbackSuffix = customId
                                ? this.sanitizeCallbackName(customId)
                                : (selectIndex === 0 ? `${selectType}_select` : `${selectType}_select${selectIndex + 1}`);
                            const callbackName = `${varName}_${callbackSuffix}_callback`;
                            const selectProps = this.formatSelectProps(child.properties, child.type);
                            callbacks.push(`    @${varName}.select(${selectProps})`);
                            callbacks.push(`    async def ${callbackName}(self, interaction: discord.Interaction, select: discord.ui.Select):`);
                            callbacks.push(`        await interaction.response.send_message(f'Selected: {select.values}', ephemeral=True)`);
                            callbacks.push('');
                            selectIndex++;
                        }
                    }
                }
                break;
            }

            case 'container': {
                const containerChildren: string[] = [];
                if (comp.children) {
                    for (const child of comp.children) {
                        const childCode = this.generateInlineComponent(child);
                        if (childCode) containerChildren.push(childCode);
                    }
                }
                const childrenStr = containerChildren.length > 0
                    ? '\n        ' + containerChildren.join(',\n        ') + ',\n    '
                    : '';
                const accent = props.accent_colour ? `, accent_colour=discord.Colour.from_str('${props.accent_colour}')` : '';
                const spoiler = props.spoiler ? ', spoiler=True' : '';
                attributes.push(`${varName} = discord.ui.Container(${childrenStr}${accent}${spoiler})`);
                break;
            }

            case 'section': {
                const sectionTexts: string[] = [];
                if (comp.children) {
                    for (const child of comp.children) {
                        if (child.type === 'text_display') {
                            sectionTexts.push(`discord.ui.TextDisplay('${this.escapeString(child.properties.content)}')`);
                        }
                    }
                }
                const textsStr = sectionTexts.join(',\n        ');
                let accessory = '';
                if (props.accessory_type === 'thumbnail') {
                    accessory = `accessory=discord.ui.Thumbnail(media='${props.accessory_media || ''}')`;
                } else if (props.accessory_type === 'button') {
                    accessory = `accessory=discord.ui.Button(label='Click', style=discord.ButtonStyle.primary)`;
                }
                attributes.push(`${varName} = discord.ui.Section(\n        ${textsStr},\n        ${accessory}\n    )`);
                break;
            }

            case 'text_display': {
                const content = this.escapeString(props.content || '');
                initCode.push(`self.add_item(discord.ui.TextDisplay('${content}'))`);
                break;
            }

            case 'separator': {
                const visible = props.visible !== false ? 'True' : 'False';
                const spacing = props.spacing === 'large' ? 'discord.SeparatorSpacing.large' : 'discord.SeparatorSpacing.small';
                initCode.push(`self.add_item(discord.ui.Separator(visible=${visible}, spacing=${spacing}))`);
                break;
            }

            case 'media_gallery': {
                const items = (props.items || []).map((item: any) =>
                    `discord.MediaGalleryItem(media='${item.media || ''}'${item.description ? `, description='${this.escapeString(item.description)}'` : ''})`
                ).join(',\n            ');
                initCode.push(`self.add_item(discord.ui.MediaGallery(\n            ${items}\n        ))`);
                break;
            }

            case 'file': {
                const spoiler = props.spoiler ? ', spoiler=True' : '';
                initCode.push(`self.add_item(discord.ui.File('${props.media || ''}'${spoiler}))`);
                break;
            }

            default:
                break;
        }

        return { attributes, callbacks, initCode };
    }

    /**
     * Generate inline component code for containers/sections
     */
    private generateInlineComponent(comp: UIBuilderComponent): string | null {
        const props = comp.properties;

        switch (comp.type) {
            case 'text_display':
                return `discord.ui.TextDisplay('${this.escapeString(props.content || '')}')`;
            case 'separator':
                const visible = props.visible !== false ? 'True' : 'False';
                const spacing = props.spacing === 'large' ? 'discord.SeparatorSpacing.large' : 'discord.SeparatorSpacing.small';
                return `discord.ui.Separator(visible=${visible}, spacing=${spacing})`;
            case 'action_row':
                // ActionRow inside container
                const children = (comp.children || []).map(c => this.generateInlineComponent(c)).filter(Boolean);
                return `discord.ui.ActionRow(${children.join(', ')})`;
            case 'button':
                return `discord.ui.Button(${this.formatButtonProps(props)})`;
            default:
                return null;
        }
    }

    /**
     * Format button properties for code generation
     */
    private formatButtonProps(props: Record<string, any>): string {
        const parts: string[] = [];
        if (props.label) parts.push(`label='${this.escapeString(props.label)}'`);
        if (props.style) parts.push(`style=discord.ButtonStyle.${props.style}`);
        if (props.custom_id) parts.push(`custom_id='${props.custom_id}'`);
        if (props.disabled) parts.push('disabled=True');
        if (props.emoji) parts.push(`emoji='${props.emoji}'`);
        if (props.url) parts.push(`url='${props.url}'`);
        return parts.join(', ');
    }

    /**
     * Format select properties for code generation
     */
    private formatSelectProps(props: Record<string, any>, selectType: string): string {
        const parts: string[] = [];

        // Add cls parameter for typed selects
        if (selectType === 'user_select') parts.push('cls=discord.ui.UserSelect');
        else if (selectType === 'role_select') parts.push('cls=discord.ui.RoleSelect');
        else if (selectType === 'channel_select') parts.push('cls=discord.ui.ChannelSelect');
        else if (selectType === 'mentionable_select') parts.push('cls=discord.ui.MentionableSelect');

        if (props.placeholder) parts.push(`placeholder='${this.escapeString(props.placeholder)}'`);
        if (props.min_values !== 1) parts.push(`min_values=${props.min_values}`);
        if (props.max_values !== 1) parts.push(`max_values=${props.max_values}`);

        return parts.join(', ');
    }

    /**
     * Generate variable name from component
     */
    private generateVarName(comp: UIBuilderComponent): string {
        const prefix = comp.type.replace(/_/g, '');
        return `${prefix}_${comp.id.slice(-6)}`;
    }

    /**
     * Sanitize callback name from custom_id
     * Converts custom_id to valid Python function name
     */
    private sanitizeCallbackName(customId: string): string {
        // Replace non-alphanumeric characters with underscore
        let name = customId.replace(/[^a-zA-Z0-9_]/g, '_');
        // Remove consecutive underscores
        name = name.replace(/_+/g, '_');
        // Remove leading/trailing underscores
        name = name.replace(/^_+|_+$/g, '');
        // Ensure it doesn't start with a number
        if (/^[0-9]/.test(name)) {
            name = 'id_' + name;
        }
        // Default if empty
        if (!name) {
            name = 'item';
        }
        return name.toLowerCase();
    }

    /**
     * Escape string for Python
     */
    private escapeString(str: string): string {
        return str.replace(/'/g, "\\'").replace(/\n/g, '\\n');
    }

    /**
     * Generate code and insert into document
     */
    private async generateAndInsertCode(): Promise<void> {
        const code = this.generateCode();

        // If we have a target document, insert there
        if (this.targetDocument && this.insertPosition) {
            const editor = await vscode.window.showTextDocument(this.targetDocument);
            await editor.edit(editBuilder => {
                editBuilder.insert(this.insertPosition!, '\n' + code + '\n');
            });
            vscode.window.showInformationMessage(`Inserted ${this.currentConfig.className} class`);
        } else {
            // Otherwise, create a new file or show in new editor
            const doc = await vscode.workspace.openTextDocument({
                content: `import discord\nfrom discord import ui\n\n${code}`,
                language: 'python'
            });
            await vscode.window.showTextDocument(doc);
        }
    }

    /**
     * Export code to clipboard
     */
    private async exportCode(): Promise<void> {
        const code = this.generateCode();
        await vscode.env.clipboard.writeText(code);
        vscode.window.showInformationMessage('LayoutView code copied to clipboard!');
    }

    /**
     * Update the webview panel
     */
    private updatePanel(): void {
        if (!this.panel) return;
        this.panel.webview.html = this.getWebviewContent();
    }

    /**
     * Generate webview HTML content
     */
    private getWebviewContent(): string {
        const config = JSON.stringify(this.currentConfig);

        return `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Discord UI Builder</title>
    <style>
        ${this.getStyles()}
    </style>
</head>
<body>
    <div class="app">
        <header class="header">
            <div class="header-left">
                <h1>🎨 Discord UI Builder</h1>
                <span class="subtitle">LayoutView Visual Editor</span>
                <span class="component-counter" id="componentCounter" title="Total components">${this.countTotalComponents()} components</span>
            </div>
            <div class="mobile-toggle-btns">
                <button class="mobile-toggle-btn" onclick="togglePalette()" title="Toggle Components">📦</button>
                <button class="mobile-toggle-btn" onclick="toggleProperties()" title="Toggle Properties">⚙️</button>
            </div>
            <div class="header-right">
                <div class="history-btns">
                    <button class="btn btn-small btn-secondary" id="undoBtn" onclick="undo()" title="Undo (Ctrl+Z)" disabled>↶</button>
                    <button class="btn btn-small btn-secondary" id="redoBtn" onclick="redo()" title="Redo (Ctrl+Y)" disabled>↷</button>
                </div>
                <button class="btn btn-small btn-danger" onclick="clearAll()" title="Clear all components">🗑️</button>
                <button class="btn btn-secondary" onclick="showCodePreview()">👁️ Preview Code</button>
                <button class="btn btn-secondary" onclick="exportCode()">📋 Copy Code</button>
                <button class="btn btn-primary" onclick="generateCode()">⚡ Generate & Insert</button>
            </div>
        </header>

        <div class="mobile-overlay" id="mobileOverlay" onclick="closeAllPanels()"></div>

        <div class="main-container">
            <!-- Left Panel: Component Palette -->
            <aside class="palette" id="palettePanel">
                <h3>Components</h3>
                <div class="palette-search">
                    <input type="text" id="componentSearch" placeholder="🔍 Search components..." oninput="filterComponents(this.value)">
                </div>
                
                <div class="palette-section" data-section="layout">
                    <h4>Layout</h4>
                    <div class="palette-items">
                        <div class="palette-item" draggable="true" data-type="action_row" data-search="actionrow action row">
                            <span class="icon">📦</span> ActionRow
                        </div>
                        <div class="palette-item" draggable="true" data-type="container" data-search="container box">
                            <span class="icon">🗃️</span> Container
                        </div>
                        <div class="palette-item" draggable="true" data-type="section" data-search="section group">
                            <span class="icon">📑</span> Section
                        </div>
                    </div>
                </div>

                <div class="palette-section" data-section="interactive">
                    <h4>Interactive</h4>
                    <div class="palette-items">
                        <div class="palette-item" draggable="true" data-type="button" data-search="button click">
                            <span class="icon">🔘</span> Button
                        </div>
                        <div class="palette-item" draggable="true" data-type="select" data-search="select menu dropdown">
                            <span class="icon">📋</span> Select Menu
                        </div>
                        <div class="palette-item" draggable="true" data-type="user_select" data-search="user select member">
                            <span class="icon">👤</span> User Select
                        </div>
                        <div class="palette-item" draggable="true" data-type="role_select" data-search="role select permission">
                            <span class="icon">🎭</span> Role Select
                        </div>
                        <div class="palette-item" draggable="true" data-type="channel_select" data-search="channel select text voice">
                            <span class="icon">#️⃣</span> Channel Select
                        </div>
                    </div>
                </div>

                <div class="palette-section" data-section="display">
                    <h4>Display</h4>
                    <div class="palette-items">
                        <div class="palette-item" draggable="true" data-type="text_display" data-search="text display label message">
                            <span class="icon">📝</span> TextDisplay
                        </div>
                        <div class="palette-item" draggable="true" data-type="separator" data-search="separator line divider">
                            <span class="icon">➖</span> Separator
                        </div>
                        <div class="palette-item" draggable="true" data-type="media_gallery" data-search="media gallery image photo">
                            <span class="icon">🖼️</span> MediaGallery
                        </div>
                        <div class="palette-item" draggable="true" data-type="file" data-search="file attachment upload">
                            <span class="icon">📁</span> File
                        </div>
                        <div class="palette-item" draggable="true" data-type="thumbnail" data-search="thumbnail image preview">
                            <span class="icon">🖼️</span> Thumbnail
                        </div>
                    </div>
                </div>
            </aside>

            <!-- Center: Canvas -->
            <main class="canvas-area">
                <div class="canvas-header">
                    <div class="class-name-input">
                        <label>Class Name:</label>
                        <input type="text" id="className" value="${this.currentConfig.className}" 
                            onchange="setClassName(this.value)" placeholder="MyLayoutView">
                    </div>
                    <div class="timeout-input">
                        <label>Timeout:</label>
                        <input type="number" id="timeout" value="${this.currentConfig.timeout || ''}" 
                            onchange="setTimeout(this.value)" placeholder="180">
                        <span>seconds</span>
                    </div>
                </div>

                <div class="canvas" id="canvas">
                    <div class="drop-zone root-drop-zone" data-parent-id="">
                        ${this.renderComponents(this.currentConfig.components)}
                        ${this.currentConfig.components.length === 0 ? `
                            <div class="empty-canvas">
                                <p>Drag components here to build your LayoutView</p>
                                <p class="hint">Drop ActionRow, Container, or Section to start</p>
                            </div>
                        ` : ''}
                    </div>
                </div>

                <!-- Preview -->
                <div class="preview-section">
                    <div class="preview-header">
                        <h3>Preview</h3>
                        <div class="preview-toolbar">
                            <div class="zoom-controls">
                                <button class="zoom-btn" onclick="zoomOut()" title="Zoom Out">−</button>
                                <span class="zoom-level" id="zoomLevel">100%</span>
                                <button class="zoom-btn" onclick="zoomIn()" title="Zoom In">+</button>
                                <button class="zoom-btn" onclick="resetZoom()" title="Reset Zoom">↺</button>
                            </div>
                            <button class="toolbar-btn" onclick="openThemeSettings()" title="Theme Settings">🎨</button>
                        </div>
                    </div>
                    <div class="discord-preview" id="discordPreview" style="transform-origin: top left;">
                        ${this.renderPreview()}
                    </div>
                </div>

                <!-- Theme Settings Modal -->
                <div class="modal-overlay" id="themeModal" style="display: none;">
                    <div class="modal-content theme-modal">
                        <h3>🎨 Theme Settings</h3>
                        <div class="theme-settings-grid">
                            <div class="theme-setting">
                                <label>Background Color</label>
                                <input type="color" id="themeBgColor" value="#313338" onchange="updateTheme()">
                            </div>
                            <div class="theme-setting">
                                <label>Accent Color</label>
                                <input type="color" id="themeAccentColor" value="#5865f2" onchange="updateTheme()">
                            </div>
                            <div class="theme-setting">
                                <label>Text Color</label>
                                <input type="color" id="themeTextColor" value="#ffffff" onchange="updateTheme()">
                            </div>
                            <div class="theme-setting">
                                <label>Border Color</label>
                                <input type="color" id="themeBorderColor" value="#1e1f22" onchange="updateTheme()">
                            </div>
                        </div>
                        <div class="theme-presets">
                            <h4>Presets</h4>
                            <div class="preset-buttons">
                                <button class="preset-btn" onclick="applyPreset('dark')">🌙 Dark</button>
                                <button class="preset-btn" onclick="applyPreset('light')">☀️ Light</button>
                                <button class="preset-btn" onclick="applyPreset('amoled')">⬛ AMOLED</button>
                                <button class="preset-btn" onclick="applyPreset('discord')">💬 Discord</button>
                            </div>
                        </div>
                        <div class="modal-actions">
                            <button class="btn btn-secondary" onclick="resetTheme()">Reset</button>
                            <button class="btn btn-primary" onclick="closeThemeModal()">Done</button>
                        </div>
                    </div>
                </div>

                <!-- Code Preview -->
                <div class="code-preview-section" id="codePreviewSection" style="display: none;">
                    <div class="code-preview-header">
                        <h3>Generated Code</h3>
                        <button class="btn btn-small btn-secondary" onclick="hideCodePreview()">✕ Close</button>
                    </div>
                    <pre class="code-preview-content" id="codePreviewContent"></pre>
                </div>
            </main>

            <!-- Right: Properties Panel -->
            <aside class="properties-panel" id="propertiesPanel">
                <h3>Properties</h3>
                <div class="no-selection">
                    <p>Select a component to edit its properties</p>
                </div>
                
                <!-- Hierarchy Tree View -->
                <div class="hierarchy-section">
                    <h3>🌲 Hierarchy</h3>
                    <div class="hierarchy-tree" id="hierarchyTree">
                        ${this.renderHierarchyTree()}
                    </div>
                </div>
            </aside>
        </div>
    </div>

    <script>
        ${this.getScript()}
    </script>
</body>
</html>`;
    }

    /**
     * Render hierarchy tree view
     */
    private renderHierarchyTree(): string {
        if (this.currentConfig.components.length === 0) {
            return '<div class="hierarchy-empty">No components yet</div>';
        }
        return this.renderHierarchyNodes(this.currentConfig.components, 0);
    }

    private renderHierarchyNodes(components: UIBuilderComponent[], depth: number): string {
        return components.map(comp => {
            const indent = depth * 16;
            const hasChildren = comp.children && comp.children.length > 0;
            const icon = this.getComponentIcon(comp.type);
            const name = comp.properties.label || comp.properties.custom_id || comp.type;

            let html = `
                <div class="hierarchy-node" data-id="${comp.id}" style="padding-left: ${indent}px;" onclick="selectFromHierarchy('${comp.id}')">
                    <span class="hierarchy-toggle ${hasChildren ? 'has-children expanded' : ''}" onclick="event.stopPropagation(); toggleHierarchyNode('${comp.id}')">
                        ${hasChildren ? '▶' : '•'}
                    </span>
                    <span class="hierarchy-icon">${icon}</span>
                    <span class="hierarchy-label">${this.escapeHtml(String(name))}</span>
                </div>
            `;

            if (hasChildren) {
                html += `<div class="hierarchy-children expanded" id="hierarchy-children-${comp.id}">
                    ${this.renderHierarchyNodes(comp.children!, depth + 1)}
                </div>`;
            }

            return html;
        }).join('');
    }

    private getComponentIcon(type: string): string {
        const icons: Record<string, string> = {
            'action_row': '📦',
            'container': '🗃️',
            'section': '📑',
            'button': '🔘',
            'select': '📋',
            'user_select': '👤',
            'role_select': '🎭',
            'channel_select': '#️⃣',
            'text_display': '📝',
            'separator': '➖',
            'media_gallery': '🖼️',
            'file': '📁',
            'thumbnail': '🖼️'
        };
        return icons[type] || '📦';
    }

    /**
     * Render components in the canvas
     */
    private renderComponents(components: UIBuilderComponent[], depth: number = 0): string {
        return components.map(comp => this.renderComponent(comp, depth)).join('');
    }

    /**
     * Render a single component
     */
    private renderComponent(comp: UIBuilderComponent, depth: number): string {
        const indent = depth * 20;
        const hasChildren = this.canHaveChildren(comp.type);
        const typeIcon = this.getTypeIcon(comp.type);
        const typeLabel = this.getTypeLabel(comp.type);
        const summary = this.getComponentSummary(comp);
        const childCount = comp.children?.length || 0;

        let childrenHtml = '';
        if (hasChildren) {
            const allowedTypes = this.getAllowedChildTypes(comp.type);
            childrenHtml = `
                <div class="component-children drop-zone" data-parent-id="${comp.id}" data-allowed-types="${allowedTypes.join(',')}">
                    ${comp.children && comp.children.length > 0 ? this.renderComponents(comp.children, depth + 1) : ''}
                    <div class="drop-placeholder">${this.getDropPlaceholderText(comp.type)}</div>
                </div>
            `;
        }

        return `
            <div class="component-item" data-id="${comp.id}" data-type="${comp.type}" 
                 style="margin-left: ${indent}px" draggable="true">
                <div class="component-header" onclick="selectComponent('${comp.id}')">
                    <span class="drag-handle">⋮⋮</span>
                    <span class="component-icon">${typeIcon}</span>
                    <span class="component-type">${typeLabel}</span>
                    <span class="component-summary">${this.escapeHtml(summary)}</span>
                    <span class="child-count">${hasChildren ? `(${childCount})` : ''}</span>
                    <div class="component-actions">
                        <button class="action-btn move-btn" onclick="event.stopPropagation(); moveComponentUp('${comp.id}')" title="Move Up">▲</button>
                        <button class="action-btn move-btn" onclick="event.stopPropagation(); moveComponentDown('${comp.id}')" title="Move Down">▼</button>
                        <button class="action-btn duplicate-btn" onclick="event.stopPropagation(); duplicateComponent('${comp.id}')" title="Duplicate">📋</button>
                        <button class="action-btn delete-btn" onclick="event.stopPropagation(); deleteComponent('${comp.id}')" title="Delete">✕</button>
                    </div>
                </div>
                ${childrenHtml}
            </div>
        `;
    }

    /**
     * Get allowed child types for a component
     */
    private getAllowedChildTypes(type: LayoutComponentType): LayoutComponentType[] {
        switch (type) {
            case 'action_row':
                return ['button', 'select', 'user_select', 'role_select', 'channel_select', 'mentionable_select'];
            case 'container':
                return ['action_row', 'text_display', 'section', 'separator', 'media_gallery', 'file'];
            case 'section':
                return ['text_display'];
            default:
                return [];
        }
    }

    /**
     * Get placeholder text for drop zone
     */
    private getDropPlaceholderText(type: LayoutComponentType): string {
        switch (type) {
            case 'action_row':
                return '⬇️ Drop Button or Select here';
            case 'container':
                return '⬇️ Drop ActionRow, TextDisplay, Section, etc.';
            case 'section':
                return '⬇️ Drop TextDisplay here (max 3)';
            default:
                return '⬇️ Drop here';
        }
    }

    /**
     * Get icon for component type
     */
    private getTypeIcon(type: LayoutComponentType): string {
        const icons: Record<string, string> = {
            action_row: '📦',
            container: '🗃️',
            section: '📑',
            button: '🔘',
            select: '📋',
            user_select: '👤',
            role_select: '🎭',
            channel_select: '#️⃣',
            mentionable_select: '📢',
            text_display: '📝',
            separator: '➖',
            media_gallery: '🖼️',
            file: '📁',
            thumbnail: '🖼️'
        };
        return icons[type] || '❓';
    }

    /**
     * Get label for component type
     */
    private getTypeLabel(type: LayoutComponentType): string {
        const labels: Record<string, string> = {
            action_row: 'ActionRow',
            container: 'Container',
            section: 'Section',
            button: 'Button',
            select: 'Select',
            user_select: 'UserSelect',
            role_select: 'RoleSelect',
            channel_select: 'ChannelSelect',
            mentionable_select: 'MentionableSelect',
            text_display: 'TextDisplay',
            separator: 'Separator',
            media_gallery: 'MediaGallery',
            file: 'File',
            thumbnail: 'Thumbnail'
        };
        return labels[type] || type;
    }

    /**
     * Get summary for a component
     */
    private getComponentSummary(comp: UIBuilderComponent): string {
        const props = comp.properties;
        switch (comp.type) {
            case 'button':
                return props.label || 'Button';
            case 'text_display':
                return (props.content || '').substring(0, 30) + (props.content?.length > 30 ? '...' : '');
            case 'select':
            case 'user_select':
            case 'role_select':
            case 'channel_select':
            case 'mentionable_select':
                return props.placeholder || 'Select...';
            case 'container':
                return `${comp.children?.length || 0} items`;
            case 'section':
                return `${comp.children?.length || 0} texts`;
            case 'action_row':
                return `${comp.children?.length || 0}/5 items`;
            default:
                return '';
        }
    }

    /**
     * Render Discord preview
     */
    private renderPreview(): string {
        if (this.currentConfig.components.length === 0) {
            return `<div class="preview-empty">No components to preview</div>`;
        }

        return `
            <div class="preview-message">
                <div class="preview-avatar">🤖</div>
                <div class="preview-content">
                    <div class="preview-header">
                        <span class="preview-username">${this.escapeHtml(this.currentConfig.className)}</span>
                        <span class="bot-tag">BOT</span>
                    </div>
                    <div class="preview-components">
                        ${this.renderPreviewComponents(this.currentConfig.components)}
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Render components for preview
     */
    private renderPreviewComponents(components: UIBuilderComponent[]): string {
        return components.map(comp => this.renderPreviewComponent(comp)).join('');
    }

    /**
     * Render single component for preview
     */
    private renderPreviewComponent(comp: UIBuilderComponent): string {
        const props = comp.properties;

        switch (comp.type) {
            case 'action_row':
                return `
                    <div class="preview-action-row">
                        ${comp.children ? this.renderPreviewComponents(comp.children) : ''}
                    </div>
                `;

            case 'container':
                return `
                    <div class="preview-container" ${props.accent_colour ? `style="border-left: 4px solid ${props.accent_colour}"` : ''}>
                        ${comp.children ? this.renderPreviewComponents(comp.children) : ''}
                    </div>
                `;

            case 'section':
                return `
                    <div class="preview-section">
                        <div class="section-content">
                            ${comp.children ? this.renderPreviewComponents(comp.children) : ''}
                        </div>
                        <div class="section-accessory">
                            ${props.accessory_type === 'thumbnail' ? '🖼️' : '🔘'}
                        </div>
                    </div>
                `;

            case 'button':
                const styleClass = `btn-${props.style || 'secondary'}`;
                return `<button class="preview-button ${styleClass}" ${props.disabled ? 'disabled' : ''}>${props.emoji || ''} ${this.escapeHtml(props.label || 'Button')}</button>`;

            case 'select':
            case 'user_select':
            case 'role_select':
            case 'channel_select':
            case 'mentionable_select':
                return `<div class="preview-select">${this.escapeHtml(props.placeholder || 'Select...')}</div>`;

            case 'text_display':
                return `<div class="preview-text">${this.escapeHtml(props.content || '')}</div>`;

            case 'separator':
                return `<div class="preview-separator ${props.visible ? '' : 'invisible'}" style="margin: ${props.spacing === 'large' ? '16px' : '8px'} 0;"></div>`;

            case 'media_gallery':
                const galleryItems = props.items || [];
                return `<div class="preview-media-gallery">
                    ${galleryItems.length > 0
                        ? galleryItems.map((item: any) => `<div class="gallery-item">${item.media ? `<img src="${this.escapeHtml(item.media)}" alt="Media" onerror="this.outerHTML='🖼️'">` : '🖼️'}</div>`).join('')
                        : '<span class="placeholder">[Empty Gallery]</span>'
                    }
                </div>`;

            case 'file':
                return `<div class="preview-file">📁 ${this.escapeHtml(props.media || 'attachment://file')}</div>`;

            case 'thumbnail':
                const thumbUrl = props.media || '';
                return `<div class="preview-thumbnail">
                    ${thumbUrl ? `<img src="${this.escapeHtml(thumbUrl)}" alt="${this.escapeHtml(props.description || 'Thumbnail')}" onerror="this.outerHTML='🖼️'">` : '🖼️'}
                    ${props.description ? `<span class="thumb-desc">${this.escapeHtml(props.description)}</span>` : ''}
                </div>`;

            default:
                return '';
        }
    }

    /**
     * Escape HTML
     */
    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    /**
     * Get CSS styles
     */
    private getStyles(): string {
        return `
            :root {
                --bg-primary: #36393f;
                --bg-secondary: #2f3136;
                --bg-tertiary: #202225;
                --bg-accent: #40444b;
                --text-primary: #ffffff;
                --text-secondary: #b9bbbe;
                --text-muted: #72767d;
                --accent-primary: #5865f2;
                --accent-success: #3ba55d;
                --accent-danger: #ed4245;
                --accent-warning: #faa61a;
                --border-color: #40444b;
            }

            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }

            body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                background: var(--bg-primary);
                color: var(--text-primary);
                height: 100vh;
                overflow: hidden;
            }

            .app {
                display: flex;
                flex-direction: column;
                height: 100vh;
            }

            .header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 12px 20px;
                background: var(--bg-secondary);
                border-bottom: 1px solid var(--border-color);
            }

            .header h1 {
                font-size: 18px;
                margin: 0;
            }

            .subtitle {
                color: var(--text-muted);
                font-size: 12px;
                margin-left: 10px;
            }

            .component-counter {
                background: var(--accent-primary);
                color: white;
                font-size: 11px;
                padding: 4px 8px;
                border-radius: 12px;
                margin-left: 10px;
            }

            .history-btns {
                display: flex;
                gap: 4px;
                margin-right: 8px;
            }

            .history-btns .btn:disabled {
                opacity: 0.4;
                cursor: not-allowed;
            }

            .header-right {
                display: flex;
                gap: 10px;
            }

            .btn {
                padding: 8px 16px;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
                transition: all 0.2s;
            }

            .btn-small {
                padding: 6px 10px;
                font-size: 12px;
            }

            .btn-danger {
                background: var(--accent-danger);
                color: white;
            }

            .btn-danger:hover {
                background: #c43c3f;
            }

            .btn-primary {
                background: var(--accent-primary);
                color: white;
            }

            .btn-primary:hover {
                background: #4752c4;
            }

            .btn-secondary {
                background: var(--bg-accent);
                color: var(--text-primary);
            }

            .btn-secondary:hover {
                background: #4f545c;
            }

            .main-container {
                display: flex;
                flex: 1;
                overflow: hidden;
            }

            /* Palette */
            .palette {
                width: 220px;
                background: var(--bg-secondary);
                border-right: 1px solid var(--border-color);
                padding: 16px;
                overflow-y: auto;
            }

            .palette h3 {
                font-size: 14px;
                color: var(--text-secondary);
                margin-bottom: 12px;
                text-transform: uppercase;
            }

            .palette-search {
                margin-bottom: 12px;
            }

            .palette-search input {
                width: 100%;
                padding: 8px 12px;
                background: var(--bg-accent);
                border: 1px solid transparent;
                border-radius: 4px;
                color: var(--text-primary);
                font-size: 12px;
                transition: all 0.2s;
            }

            .palette-search input:focus {
                outline: none;
                border-color: var(--blurple);
                background: var(--bg-primary);
            }

            .palette-search input::placeholder {
                color: var(--text-muted);
            }

            .palette-section {
                margin-bottom: 20px;
            }

            .palette-section h4 {
                font-size: 12px;
                color: var(--text-muted);
                margin-bottom: 8px;
            }

            .palette-items {
                display: flex;
                flex-direction: column;
                gap: 4px;
            }

            .palette-item {
                padding: 8px 12px;
                background: var(--bg-accent);
                border-radius: 4px;
                cursor: grab;
                transition: all 0.2s;
                font-size: 13px;
            }

            .palette-item:hover {
                background: #4f545c;
            }

            .palette-item:active {
                cursor: grabbing;
            }

            .palette-item .icon {
                margin-right: 8px;
            }

            .palette-item.hidden {
                display: none;
            }

            .palette-section.hidden {
                display: none;
            }

            /* Canvas */
            .canvas-area {
                flex: 1;
                display: flex;
                flex-direction: column;
                overflow: hidden;
            }

            .canvas-header {
                display: flex;
                gap: 20px;
                padding: 12px 20px;
                background: var(--bg-tertiary);
                border-bottom: 1px solid var(--border-color);
            }

            .canvas-header label {
                color: var(--text-secondary);
                font-size: 12px;
                margin-right: 8px;
            }

            .canvas-header input {
                background: var(--bg-accent);
                border: 1px solid var(--border-color);
                color: var(--text-primary);
                padding: 6px 10px;
                border-radius: 4px;
                font-size: 14px;
            }

            .timeout-input span {
                color: var(--text-muted);
                font-size: 12px;
                margin-left: 6px;
            }

            .canvas {
                flex: 1;
                padding: 20px;
                overflow-y: auto;
                background: var(--bg-primary);
            }

            .drop-zone {
                min-height: 60px;
                border: 2px dashed var(--border-color);
                border-radius: 8px;
                padding: 10px;
                transition: all 0.2s;
            }

            .drop-zone.drag-over {
                border-color: var(--accent-primary);
                background: rgba(88, 101, 242, 0.1);
            }

            .root-drop-zone {
                min-height: 200px;
            }

            .empty-canvas {
                text-align: center;
                padding: 40px;
                color: var(--text-muted);
            }

            .empty-canvas .hint {
                font-size: 12px;
                margin-top: 8px;
            }

            .component-item {
                background: var(--bg-secondary);
                border-radius: 6px;
                margin-bottom: 8px;
                border: 1px solid var(--border-color);
            }

            .component-item.selected {
                border-color: var(--accent-primary);
            }

            .component-item.dragging {
                opacity: 0.5;
            }

            .component-header {
                display: flex;
                align-items: center;
                padding: 10px 12px;
                cursor: pointer;
                gap: 8px;
            }

            .component-header:hover {
                background: var(--bg-accent);
            }

            .drag-handle {
                color: var(--text-muted);
                cursor: grab;
                font-size: 12px;
                padding: 0 4px;
            }

            .drag-handle:active {
                cursor: grabbing;
            }

            .child-count {
                color: var(--accent-primary);
                font-size: 11px;
                font-weight: 500;
            }

            .component-icon {
                font-size: 16px;
            }

            .component-type {
                font-weight: 500;
                font-size: 13px;
            }

            .component-summary {
                color: var(--text-muted);
                font-size: 12px;
                flex: 1;
            }

            .delete-btn {
                background: none;
                border: none;
                color: var(--text-muted);
                cursor: pointer;
                padding: 4px 8px;
                border-radius: 4px;
            }

            .delete-btn:hover {
                background: var(--accent-danger);
                color: white;
            }

            .component-actions {
                display: flex;
                gap: 4px;
            }

            .action-btn {
                background: none;
                border: none;
                color: var(--text-muted);
                cursor: pointer;
                padding: 4px 6px;
                border-radius: 4px;
                font-size: 12px;
            }

            .action-btn:hover {
                background: var(--bg-accent);
            }

            .duplicate-btn:hover {
                background: var(--accent-primary);
                color: white;
            }

            .component-children {
                margin: 0 12px 12px;
                padding: 12px;
                min-height: 50px;
                background: rgba(0, 0, 0, 0.15);
                border-radius: 6px;
            }

            .drop-placeholder {
                color: var(--text-muted);
                font-size: 12px;
                text-align: center;
                padding: 15px;
                border: 2px dashed var(--border-color);
                border-radius: 6px;
                background: rgba(88, 101, 242, 0.05);
            }

            .component-children:not(:empty) .drop-placeholder {
                margin-top: 8px;
                padding: 8px;
            }

            .drop-zone.drag-over > .drop-placeholder {
                border-color: var(--accent-primary);
                background: rgba(88, 101, 242, 0.15);
                color: var(--accent-primary);
            }

            .drop-zone.drag-invalid {
                border-color: var(--accent-danger) !important;
                background: rgba(237, 66, 69, 0.1) !important;
            }

            /* Preview Section */
            .preview-section {
                border-top: 1px solid var(--border-color);
                padding: 16px 20px;
                background: var(--bg-secondary);
                max-height: 400px;
                overflow: auto;
            }

            .preview-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 12px;
            }

            .preview-section h3 {
                font-size: 12px;
                color: var(--text-muted);
                text-transform: uppercase;
                margin: 0;
            }

            .preview-toolbar {
                display: flex;
                align-items: center;
                gap: 12px;
            }

            .toolbar-btn {
                width: 32px;
                height: 32px;
                border: 1px solid var(--border-color);
                background: var(--bg-accent);
                color: var(--text-primary);
                border-radius: 4px;
                cursor: pointer;
                font-size: 16px;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s;
            }

            .toolbar-btn:hover {
                background: var(--bg-tertiary);
                border-color: var(--blurple);
            }

            .zoom-controls {
                display: flex;
                align-items: center;
                gap: 4px;
            }

            .zoom-btn {
                width: 28px;
                height: 28px;
                border: 1px solid var(--border-color);
                background: var(--bg-accent);
                color: var(--text-primary);
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .zoom-btn:hover {
                background: var(--bg-tertiary);
            }

            .zoom-level {
                font-size: 12px;
                color: var(--text-secondary);
                min-width: 40px;
                text-align: center;
            }

            /* Modal Styles */
            .modal-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.7);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 1000;
            }

            .modal-content {
                background: var(--bg-secondary);
                border-radius: 8px;
                padding: 20px;
                min-width: 400px;
                max-width: 90%;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
            }

            .modal-content h3 {
                margin: 0 0 16px;
                color: var(--text-primary);
                font-size: 16px;
            }

            .theme-settings-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 12px;
                margin-bottom: 16px;
            }

            .theme-setting {
                display: flex;
                flex-direction: column;
                gap: 6px;
            }

            .theme-setting label {
                font-size: 12px;
                color: var(--text-secondary);
            }

            .theme-setting input[type="color"] {
                width: 100%;
                height: 40px;
                border: 1px solid var(--border-color);
                border-radius: 4px;
                cursor: pointer;
                background: var(--bg-accent);
                padding: 4px;
            }

            .theme-presets h4 {
                font-size: 12px;
                color: var(--text-secondary);
                margin: 0 0 8px;
            }

            .preset-buttons {
                display: flex;
                gap: 8px;
                flex-wrap: wrap;
            }

            .preset-btn {
                padding: 8px 12px;
                background: var(--bg-accent);
                border: 1px solid var(--border-color);
                border-radius: 4px;
                color: var(--text-primary);
                cursor: pointer;
                font-size: 12px;
                transition: all 0.2s;
            }

            .preset-btn:hover {
                background: var(--bg-tertiary);
                border-color: var(--blurple);
            }

            .modal-actions {
                display: flex;
                justify-content: flex-end;
                gap: 8px;
                margin-top: 16px;
                padding-top: 16px;
                border-top: 1px solid var(--border-color);
            }

            .discord-preview {
                background: var(--bg-primary);
                border-radius: 8px;
                padding: 16px;
                transition: transform 0.2s ease;
            }

            .preview-message {
                display: flex;
                gap: 16px;
            }

            .preview-avatar {
                width: 40px;
                height: 40px;
                background: var(--accent-primary);
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 20px;
            }

            .preview-content {
                flex: 1;
            }

            .preview-header {
                display: flex;
                align-items: center;
                gap: 8px;
                margin-bottom: 8px;
            }

            .preview-username {
                font-weight: 500;
            }

            .bot-tag {
                background: var(--accent-primary);
                color: white;
                font-size: 10px;
                padding: 2px 4px;
                border-radius: 3px;
            }

            .preview-components {
                display: flex;
                flex-direction: column;
                gap: 8px;
            }

            .preview-action-row {
                display: flex;
                gap: 8px;
                flex-wrap: wrap;
            }

            .preview-button {
                padding: 8px 16px;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
                transition: transform 0.1s, box-shadow 0.2s, filter 0.1s;
                position: relative;
                overflow: hidden;
            }

            .preview-button:hover {
                filter: brightness(1.1);
            }

            .preview-button:active {
                transform: scale(0.95);
            }

            .preview-button.clicked {
                animation: buttonClick 0.3s ease-out;
            }

            @keyframes buttonClick {
                0% { transform: scale(1); }
                50% { transform: scale(0.9); }
                100% { transform: scale(1); }
            }

            .preview-button .ripple {
                position: absolute;
                border-radius: 50%;
                background: rgba(255, 255, 255, 0.4);
                transform: scale(0);
                animation: rippleEffect 0.6s linear;
                pointer-events: none;
            }

            @keyframes rippleEffect {
                to {
                    transform: scale(4);
                    opacity: 0;
                }
            }

            .preview-button.btn-primary { background: var(--accent-primary); color: white; }
            .preview-button.btn-secondary { background: var(--bg-accent); color: var(--text-primary); }
            .preview-button.btn-success { background: var(--accent-success); color: white; }
            .preview-button.btn-danger { background: var(--accent-danger); color: white; }

            .preview-select {
                background: var(--bg-tertiary);
                border: 1px solid var(--border-color);
                padding: 10px 12px;
                border-radius: 4px;
                color: var(--text-muted);
                min-width: 200px;
                cursor: pointer;
                transition: border-color 0.2s, background 0.2s;
                position: relative;
            }

            .preview-select:hover {
                border-color: var(--blurple);
                background: var(--bg-accent);
            }

            .preview-select.expanded {
                border-color: var(--blurple);
            }

            .preview-select .dropdown-arrow {
                position: absolute;
                right: 12px;
                top: 50%;
                transform: translateY(-50%);
                transition: transform 0.2s;
            }

            .preview-select.expanded .dropdown-arrow {
                transform: translateY(-50%) rotate(180deg);
            }

            .select-dropdown {
                position: absolute;
                top: 100%;
                left: 0;
                right: 0;
                background: var(--bg-tertiary);
                border: 1px solid var(--blurple);
                border-top: none;
                border-radius: 0 0 4px 4px;
                max-height: 0;
                overflow: hidden;
                transition: max-height 0.2s ease-out;
                z-index: 10;
            }

            .preview-select.expanded .select-dropdown {
                max-height: 200px;
            }

            .select-option {
                padding: 8px 12px;
                color: var(--text-primary);
                cursor: pointer;
                transition: background 0.1s;
            }

            .select-option:hover {
                background: var(--bg-accent);
            }

            .preview-container {
                background: var(--bg-secondary);
                border-radius: 8px;
                padding: 12px;
                border-left: 4px solid var(--accent-primary);
                transition: border-color 0.3s, box-shadow 0.3s;
            }

            .preview-container:hover {
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
            }

            .preview-section {
                display: flex;
                gap: 12px;
                background: var(--bg-secondary);
                border-radius: 8px;
                padding: 12px;
            }

            .section-content { flex: 1; }
            .section-accessory { font-size: 24px; }

            .preview-text {
                color: var(--text-secondary);
                font-size: 14px;
                line-height: 1.4;
            }

            /* Component entrance animation */
            .component-enter {
                animation: componentEnter 0.3s ease-out;
            }

            @keyframes componentEnter {
                from {
                    opacity: 0;
                    transform: translateY(-10px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }

            /* Pulse animation for selected components */
            .canvas-component.selected::after {
                content: '';
                position: absolute;
                inset: -2px;
                border: 2px solid var(--blurple);
                border-radius: 6px;
                animation: selectedPulse 2s ease-in-out infinite;
            }

            @keyframes selectedPulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.5; }
            }

            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }

            @keyframes slideOut {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(100%); opacity: 0; }
            }

            .preview-separator {
                height: 1px;
                background: var(--border-color);
            }

            .preview-separator.invisible {
                background: transparent;
            }

            .preview-empty {
                color: var(--text-muted);
                text-align: center;
                padding: 20px;
            }

            /* Code Preview Section */
            .code-preview-section {
                border-top: 1px solid var(--border-color);
                background: var(--bg-secondary);
                max-height: 300px;
                display: flex;
                flex-direction: column;
            }

            .code-preview-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 12px 20px;
                border-bottom: 1px solid var(--border-color);
            }

            .code-preview-header h3 {
                font-size: 12px;
                color: var(--text-muted);
                text-transform: uppercase;
                margin: 0;
            }

            .code-preview-content {
                flex: 1;
                margin: 0;
                padding: 16px 20px;
                overflow: auto;
                background: #1e1e1e;
                font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
                font-size: 13px;
                line-height: 1.5;
                color: #d4d4d4;
                white-space: pre;
                tab-size: 4;
            }

            /* Syntax highlighting */
            .code-preview-content .keyword { color: #569cd6; }
            .code-preview-content .string { color: #ce9178; }
            .code-preview-content .number { color: #b5cea8; }
            .code-preview-content .comment { color: #6a9955; font-style: italic; }
            .code-preview-content .class-name { color: #4ec9b0; }
            .code-preview-content .function { color: #dcdcaa; }
            .code-preview-content .decorator { color: #c586c0; }
            .code-preview-content .builtin { color: #4fc1ff; }
            .code-preview-content .operator { color: #d4d4d4; }
            .code-preview-content .parameter { color: #9cdcfe; }

            /* Thumbnail & Media Gallery Preview */
            .preview-thumbnail img {
                max-width: 80px;
                max-height: 80px;
                border-radius: 4px;
                object-fit: cover;
            }

            .thumb-desc {
                font-size: 11px;
                color: var(--text-muted);
                margin-top: 4px;
            }

            .preview-media-gallery {
                display: flex;
                gap: 4px;
                flex-wrap: wrap;
            }

            .gallery-item {
                width: 60px;
                height: 60px;
                border-radius: 4px;
                overflow: hidden;
                background: var(--bg-secondary);
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .gallery-item img {
                width: 100%;
                height: 100%;
                object-fit: cover;
            }

            /* Move Buttons */
            .move-btn {
                font-size: 10px;
                padding: 2px 4px;
                background: var(--bg-secondary);
                border: 1px solid var(--border-color);
                border-radius: 3px;
                cursor: pointer;
                color: var(--text-secondary);
            }

            .move-btn:hover {
                background: var(--bg-tertiary);
                color: var(--text-primary);
            }

            .move-btn:disabled {
                opacity: 0.3;
                cursor: not-allowed;
            }

            /* Properties Panel */
            .properties-panel {
                width: 280px;
                background: var(--bg-secondary);
                border-left: 1px solid var(--border-color);
                padding: 16px;
                overflow-y: auto;
            }

            .properties-panel h3 {
                font-size: 14px;
                color: var(--text-secondary);
                margin-bottom: 12px;
                text-transform: uppercase;
            }

            /* Hierarchy Tree Styles */
            .hierarchy-section {
                margin-top: 20px;
                padding-top: 16px;
                border-top: 1px solid var(--border-color);
            }

            .hierarchy-tree {
                font-size: 12px;
            }

            .hierarchy-empty {
                color: var(--text-muted);
                padding: 8px;
                text-align: center;
            }

            .hierarchy-node {
                display: flex;
                align-items: center;
                gap: 6px;
                padding: 4px 8px;
                border-radius: 4px;
                cursor: pointer;
                transition: background 0.1s;
            }

            .hierarchy-node:hover {
                background: var(--bg-accent);
            }

            .hierarchy-node.selected {
                background: var(--blurple);
            }

            .hierarchy-toggle {
                width: 12px;
                font-size: 8px;
                color: var(--text-muted);
                cursor: pointer;
                transition: transform 0.2s;
            }

            .hierarchy-toggle.has-children {
                cursor: pointer;
            }

            .hierarchy-toggle.expanded {
                transform: rotate(90deg);
            }

            .hierarchy-icon {
                font-size: 14px;
            }

            .hierarchy-label {
                color: var(--text-primary);
                flex: 1;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            .hierarchy-children {
                display: none;
            }

            .hierarchy-children.expanded {
                display: block;
            }

            .no-selection {
                color: var(--text-muted);
                text-align: center;
                padding: 20px;
            }

            /* Breadcrumb Navigation */
            .property-breadcrumb {
                display: flex;
                flex-wrap: wrap;
                align-items: center;
                gap: 4px;
                padding: 8px;
                background: var(--bg-tertiary);
                border-radius: 4px;
                margin-bottom: 12px;
                font-size: 11px;
            }

            .breadcrumb-separator {
                color: var(--text-muted);
            }

            .breadcrumb-link {
                color: var(--blurple);
                cursor: pointer;
                transition: color 0.2s;
            }

            .breadcrumb-link:hover {
                color: #7983f5;
                text-decoration: underline;
            }

            .breadcrumb-current {
                color: var(--text-primary);
                font-weight: 500;
            }

            .property-navigation {
                margin-bottom: 12px;
            }

            .property-navigation button {
                width: 100%;
            }

            .property-group {
                margin-bottom: 16px;
            }

            .property-group label {
                display: block;
                color: var(--text-secondary);
                font-size: 12px;
                margin-bottom: 6px;
            }

            .property-group input,
            .property-group select,
            .property-group textarea {
                width: 100%;
                background: var(--bg-accent);
                border: 1px solid var(--border-color);
                color: var(--text-primary);
                padding: 8px 10px;
                border-radius: 4px;
                font-size: 13px;
            }

            .property-group textarea {
                resize: vertical;
                min-height: 60px;
            }

            .property-checkbox {
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .property-checkbox input {
                width: auto;
            }

            .property-info {
                color: var(--text-muted);
                font-size: 12px;
                padding: 10px;
                background: var(--bg-tertiary);
                border-radius: 4px;
                line-height: 1.4;
            }

            /* Resizable panels */
            .palette, .properties-panel {
                flex-shrink: 0;
            }

            .canvas-area {
                min-width: 300px;
            }

            /* Better textarea */
            .property-group textarea {
                font-family: inherit;
                line-height: 1.4;
            }

            /* Select Options Editor */
            .select-options-list {
                display: flex;
                flex-direction: column;
                gap: 6px;
            }

            .select-option-item {
                display: flex;
                gap: 4px;
            }

            .select-option-item input {
                flex: 1;
                padding: 6px 8px;
                font-size: 12px;
            }

            .option-delete-btn {
                background: none;
                border: none;
                color: var(--text-muted);
                cursor: pointer;
                padding: 4px 8px;
                border-radius: 4px;
            }

            .option-delete-btn:hover {
                background: var(--accent-danger);
                color: white;
            }

            /* Responsive Design */
            @media (max-width: 1200px) {
                .palette {
                    width: 180px;
                    padding: 12px;
                }
                
                .properties-panel {
                    width: 240px;
                    padding: 12px;
                }
            }

            @media (max-width: 900px) {
                .main-container {
                    flex-direction: column;
                    position: relative;
                }
                
                .palette {
                    position: fixed;
                    left: 0;
                    top: 0;
                    bottom: 0;
                    z-index: 100;
                    transform: translateX(-100%);
                    transition: transform 0.3s ease;
                    width: 220px;
                    box-shadow: 2px 0 10px rgba(0,0,0,0.3);
                }
                
                .palette.open {
                    transform: translateX(0);
                }
                
                .properties-panel {
                    position: fixed;
                    right: 0;
                    top: 0;
                    bottom: 0;
                    z-index: 100;
                    transform: translateX(100%);
                    transition: transform 0.3s ease;
                    width: 280px;
                    box-shadow: -2px 0 10px rgba(0,0,0,0.3);
                }
                
                .properties-panel.open {
                    transform: translateX(0);
                }
                
                .canvas-area {
                    width: 100%;
                }
                
                .mobile-toggle-btns {
                    display: flex !important;
                }
                
                .mobile-overlay {
                    display: block;
                }
                
                .mobile-overlay.active {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0,0,0,0.5);
                    z-index: 99;
                }
            }

            @media (max-width: 600px) {
                .header {
                    flex-direction: column;
                    gap: 10px;
                    padding: 10px;
                }
                
                .header h1 {
                    font-size: 16px;
                }
                
                .subtitle {
                    display: none;
                }
                
                .header-right {
                    width: 100%;
                    justify-content: center;
                    flex-wrap: wrap;
                    gap: 6px;
                }
                
                .btn {
                    padding: 6px 12px;
                    font-size: 12px;
                }
                
                .canvas-header {
                    flex-direction: column;
                    gap: 10px;
                    padding: 10px;
                }
                
                .canvas-header .class-input,
                .canvas-header .timeout-input {
                    width: 100%;
                }
                
                .canvas-header input {
                    width: 100%;
                }
                
                .component-header {
                    flex-wrap: wrap;
                    padding: 8px;
                }
                
                .component-actions {
                    flex-wrap: wrap;
                    gap: 4px;
                }
                
                .palette {
                    width: 85vw;
                    max-width: 280px;
                }
                
                .properties-panel {
                    width: 85vw;
                    max-width: 300px;
                }
            }

            /* Mobile toggle buttons (hidden by default) */
            .mobile-toggle-btns {
                display: none;
                gap: 8px;
            }
            
            .mobile-toggle-btn {
                padding: 8px 12px;
                background: var(--bg-accent);
                border: 1px solid var(--border-color);
                border-radius: 4px;
                color: var(--text-primary);
                cursor: pointer;
                font-size: 14px;
            }
            
            .mobile-toggle-btn:hover {
                background: var(--bg-tertiary);
            }
            
            .mobile-overlay {
                display: none;
            }

            /* Scrollable improvements */
            .palette::-webkit-scrollbar,
            .canvas::-webkit-scrollbar,
            .properties-panel::-webkit-scrollbar {
                width: 6px;
            }
            
            .palette::-webkit-scrollbar-thumb,
            .canvas::-webkit-scrollbar-thumb,
            .properties-panel::-webkit-scrollbar-thumb {
                background: var(--bg-accent);
                border-radius: 3px;
            }

            /* Touch-friendly improvements */
            @media (pointer: coarse) {
                .palette-item {
                    padding: 12px 16px;
                    font-size: 14px;
                }
                
                .btn {
                    min-height: 40px;
                }
                
                .component-header {
                    min-height: 44px;
                }
                
                .property-group input,
                .property-group select,
                .property-group textarea {
                    min-height: 38px;
                    font-size: 14px;
                }
                
                .move-btn {
                    min-width: 32px;
                    min-height: 32px;
                    font-size: 14px;
                }
            }
        `;
    }

    /**
     * Get JavaScript code for webview
     */
    private getScript(): string {
        return `
            const vscode = acquireVsCodeApi();
            let config = ${JSON.stringify(this.currentConfig)};
            let selectedComponentId = null;
            let draggedElement = null;
            let draggedType = null;

            // Component limits (mirror of backend limits)
            const COMPONENT_LIMITS = {
                TOP_LEVEL: 10,
                ACTION_ROW: 5,
                CONTAINER: 10,
                SECTION_TEXT: 3
            };

            // Listen for messages from extension
            window.addEventListener('message', event => {
                const message = event.data;
                switch (message.command) {
                    case 'updateProperties':
                        // Update options UI without full page refresh
                        if (selectedComponentId === message.component.id) {
                            updateOptionsPanel(message.component);
                        }
                        break;
                    case 'showCodePreviewInline':
                        // Show code in the inline preview panel with syntax highlighting
                        const section = document.getElementById('codePreviewSection');
                        const content = document.getElementById('codePreviewContent');
                        if (section && content) {
                            content.innerHTML = highlightPython(message.code);
                            section.style.display = 'flex';
                            section.scrollIntoView({ behavior: 'smooth' });
                        }
                        break;
                    case 'updateUndoRedoState':
                        // Update undo/redo button states
                        const undoBtn = document.getElementById('undoBtn');
                        const redoBtn = document.getElementById('redoBtn');
                        if (undoBtn) undoBtn.disabled = !message.canUndo;
                        if (redoBtn) redoBtn.disabled = !message.canRedo;
                        break;
                    case 'showError':
                        // Show error toast notification
                        showToast(message.message, 'error');
                        break;
                }
            });

            // Toast notification function
            function showToast(message, type = 'info') {
                let toast = document.getElementById('toast-container');
                if (!toast) {
                    toast = document.createElement('div');
                    toast.id = 'toast-container';
                    toast.style.cssText = 'position: fixed; bottom: 20px; right: 20px; z-index: 9999;';
                    document.body.appendChild(toast);
                }
                
                const toastItem = document.createElement('div');
                toastItem.className = 'toast-item toast-' + type;
                toastItem.textContent = message;
                toastItem.style.cssText = 'background: ' + (type === 'error' ? '#ed4245' : '#5865f2') + '; color: white; padding: 12px 20px; border-radius: 4px; margin-top: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); animation: slideIn 0.3s ease;';
                
                toast.appendChild(toastItem);
                
                setTimeout(() => {
                    toastItem.style.animation = 'slideOut 0.3s ease';
                    setTimeout(() => toastItem.remove(), 300);
                }, 4000);
            }

            function updateOptionsPanel(component) {
                const optionsContainer = document.getElementById('options-container');
                if (!optionsContainer) return;
                
                const options = component.properties.options || [];
                let html = '';
                options.forEach((opt, i) => {
                    const escapedLabel = String(opt.label || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
                    const escapedValue = String(opt.value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
                    html += '<div class="select-option-item">';
                    html += '<input type="text" value="' + escapedLabel + '" placeholder="Label" onchange="updateSelectOption(\\'' + component.id + '\\', ' + i + ', \\'label\\', this.value)">';
                    html += '<input type="text" value="' + escapedValue + '" placeholder="Value" onchange="updateSelectOption(\\'' + component.id + '\\', ' + i + ', \\'value\\', this.value)">';
                    html += '<button class="option-delete-btn" onclick="removeSelectOption(\\'' + component.id + '\\', ' + i + ')">✕</button>';
                    html += '</div>';
                });
                optionsContainer.innerHTML = html;
            }

            // Initialize after DOM load
            initDragAndDrop();

            function initDragAndDrop() {
                // Palette items
                document.querySelectorAll('.palette-item').forEach(item => {
                    item.addEventListener('dragstart', handlePaletteDragStart);
                    item.addEventListener('dragend', handleDragEnd);
                });

                // Component items (for reordering)
                document.querySelectorAll('.component-item').forEach(item => {
                    item.addEventListener('dragstart', handleComponentDragStart);
                    item.addEventListener('dragend', handleDragEnd);
                });

                // Drop zones
                document.querySelectorAll('.drop-zone').forEach(zone => {
                    zone.addEventListener('dragover', handleDragOver);
                    zone.addEventListener('dragleave', handleDragLeave);
                    zone.addEventListener('drop', handleDrop);
                });
            }

            function handlePaletteDragStart(e) {
                draggedType = e.target.dataset.type;
                e.dataTransfer.setData('componentType', draggedType);
                e.dataTransfer.setData('source', 'palette');
                e.dataTransfer.effectAllowed = 'copy';
            }

            function handleComponentDragStart(e) {
                e.stopPropagation();
                draggedElement = e.target.closest('.component-item');
                draggedType = draggedElement.dataset.type;
                e.dataTransfer.setData('componentId', draggedElement.dataset.id);
                e.dataTransfer.setData('componentType', draggedType);
                e.dataTransfer.setData('source', 'canvas');
                e.dataTransfer.effectAllowed = 'move';
                draggedElement.classList.add('dragging');
            }

            function handleDragEnd(e) {
                if (draggedElement) {
                    draggedElement.classList.remove('dragging');
                }
                draggedElement = null;
                draggedType = null;
                document.querySelectorAll('.drop-zone').forEach(zone => {
                    zone.classList.remove('drag-over', 'drag-invalid');
                });
            }

            function handleDragOver(e) {
                e.preventDefault();
                e.stopPropagation();
                
                const zone = e.currentTarget;
                const allowedTypes = (zone.dataset.allowedTypes || '').split(',').filter(t => t);
                
                // Check if this type is allowed in this zone
                if (allowedTypes.length > 0 && draggedType && !allowedTypes.includes(draggedType)) {
                    zone.classList.add('drag-invalid');
                    zone.classList.remove('drag-over');
                    e.dataTransfer.dropEffect = 'none';
                    return;
                }
                
                zone.classList.add('drag-over');
                zone.classList.remove('drag-invalid');
                e.dataTransfer.dropEffect = 'copy';
            }

            function handleDragLeave(e) {
                e.currentTarget.classList.remove('drag-over', 'drag-invalid');
            }

            function handleDrop(e) {
                e.preventDefault();
                e.stopPropagation();
                
                const zone = e.currentTarget;
                zone.classList.remove('drag-over', 'drag-invalid');
                
                const source = e.dataTransfer.getData('source');
                const componentType = e.dataTransfer.getData('componentType');
                const parentId = zone.dataset.parentId || null;
                const allowedTypes = (zone.dataset.allowedTypes || '').split(',').filter(t => t);
                
                // Validate drop
                if (allowedTypes.length > 0 && !allowedTypes.includes(componentType)) {
                    showError('This component type cannot be placed here');
                    return;
                }

                if (source === 'palette') {
                    vscode.postMessage({
                        command: 'addComponent',
                        componentType: componentType,
                        parentId: parentId
                    });
                } else if (source === 'canvas') {
                    const componentId = e.dataTransfer.getData('componentId');
                    // Don't allow dropping on itself
                    if (componentId === parentId) return;
                    
                    vscode.postMessage({
                        command: 'moveComponent',
                        componentId: componentId,
                        newParentId: parentId,
                        newIndex: 0
                    });
                }

                if (draggedElement) {
                    draggedElement.classList.remove('dragging');
                    draggedElement = null;
                }
            }

            function showError(msg) {
                // Simple notification - could be enhanced
                console.warn(msg);
            }

            function selectComponent(id) {
                selectedComponentId = id;
                
                // Update selection visuals
                document.querySelectorAll('.component-item').forEach(item => {
                    item.classList.toggle('selected', item.dataset.id === id);
                });

                // Update hierarchy selection
                document.querySelectorAll('.hierarchy-node').forEach(node => {
                    node.classList.toggle('selected', node.dataset.id === id);
                });

                // Find component in config
                const component = findComponent(config.components, id);
                if (component) {
                    showProperties(component);
                }
            }

            // Select from hierarchy tree
            function selectFromHierarchy(id) {
                selectComponent(id);
                
                // Expand parents in hierarchy
                expandParentsInHierarchy(id);
                
                // Scroll to component in canvas
                const element = document.querySelector('.component-item[data-id="' + id + '"]');
                if (element) {
                    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
                
                // Also scroll to item in hierarchy
                const hierarchyNode = document.querySelector('.hierarchy-node[data-id="' + id + '"]');
                if (hierarchyNode) {
                    hierarchyNode.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
            }

            // Toggle hierarchy node expand/collapse
            function toggleHierarchyNode(id) {
                const toggle = document.querySelector('.hierarchy-node[data-id="' + id + '"] .hierarchy-toggle');
                const children = document.getElementById('hierarchy-children-' + id);
                
                if (toggle && children) {
                    toggle.classList.toggle('expanded');
                    children.classList.toggle('expanded');
                }
            }

            // Find parent component
            function findParentComponent(components, targetId, parent = null) {
                for (const comp of components) {
                    if (comp.id === targetId) return parent;
                    if (comp.children) {
                        const found = findParentComponent(comp.children, targetId, comp);
                        if (found !== undefined) return found;
                    }
                }
                return undefined;
            }

            // Go to parent component
            function goToParent() {
                if (!selectedComponentId) return;
                const parent = findParentComponent(config.components, selectedComponentId);
                if (parent) {
                    selectFromHierarchy(parent.id);
                }
            }

            // Get full path to a component (for breadcrumb)
            function getComponentPath(targetId) {
                const path = [];
                
                function findPath(components, id, currentPath) {
                    for (const comp of components) {
                        const newPath = [...currentPath, { 
                            id: comp.id, 
                            type: comp.type, 
                            label: comp.properties.label || comp.properties.custom_id || null 
                        }];
                        if (comp.id === id) {
                            return newPath;
                        }
                        if (comp.children) {
                            const found = findPath(comp.children, id, newPath);
                            if (found) return found;
                        }
                    }
                    return null;
                }
                
                return findPath(config.components, targetId, []) || [];
            }

            // Expand all parents of a component in hierarchy
            function expandParentsInHierarchy(id) {
                let current = id;
                while (true) {
                    const parent = findParentComponent(config.components, current);
                    if (!parent) break;
                    const children = document.getElementById('hierarchy-children-' + parent.id);
                    const toggle = document.querySelector('.hierarchy-node[data-id="' + parent.id + '"] .hierarchy-toggle');
                    if (children && !children.classList.contains('expanded')) {
                        children.classList.add('expanded');
                    }
                    if (toggle && !toggle.classList.contains('expanded')) {
                        toggle.classList.add('expanded');
                    }
                    current = parent.id;
                }
            }

            function findComponent(components, id) {
                for (const comp of components) {
                    if (comp.id === id) return comp;
                    if (comp.children) {
                        const found = findComponent(comp.children, id);
                        if (found) return found;
                    }
                }
                return null;
            }

            function showProperties(component) {
                const panel = document.getElementById('propertiesPanel');
                
                // Build breadcrumb path
                const path = getComponentPath(component.id);
                let breadcrumb = '<div class="property-breadcrumb">';
                path.forEach((item, index) => {
                    if (index > 0) breadcrumb += ' <span class="breadcrumb-separator">›</span> ';
                    const isLast = index === path.length - 1;
                    if (isLast) {
                        breadcrumb += '<span class="breadcrumb-current">' + (item.label || item.type) + '</span>';
                    } else {
                        breadcrumb += '<span class="breadcrumb-link" onclick="selectFromHierarchy(\\'\\'' + item.id + '\\'\\');">' + (item.label || item.type) + '</span>';
                    }
                });
                breadcrumb += '</div>';
                
                let html = '<h3>Properties</h3>';
                html += breadcrumb;
                
                // Parent navigation button
                const parent = findParentComponent(config.components, component.id);
                if (parent) {
                    html += '<div class="property-navigation"><button class="btn btn-small btn-secondary" onclick="goToParent()">⬆️ Go to Parent (' + parent.type + ')</button></div>';
                }
                
                html += '<div class="property-group"><label>Type</label><input type="text" value="' + component.type + '" disabled></div>';

                const props = component.properties;
                
                switch (component.type) {
                    case 'button':
                        html += createTextProperty('label', 'Label', props.label, 'Click me');
                        html += createSelectProperty('style', 'Style', props.style || 'primary', 
                            ['primary', 'secondary', 'success', 'danger', 'link']);
                        html += createTextProperty('custom_id', 'Custom ID', props.custom_id, 'button_1');
                        html += createTextProperty('emoji', 'Emoji', props.emoji, '👍');
                        html += createCheckboxProperty('disabled', 'Disabled', props.disabled || false);
                        break;

                    case 'text_display':
                        html += createTextareaProperty('content', 'Content', props.content, 'Enter your text here...');
                        break;

                    case 'select':
                        html += createTextProperty('placeholder', 'Placeholder', props.placeholder, 'Select an option');
                        html += createNumberProperty('min_values', 'Min Values', props.min_values, 1);
                        html += createNumberProperty('max_values', 'Max Values', props.max_values, 1);
                        html += createSelectOptionsEditor(component.id, props.options || []);
                        break;

                    case 'user_select':
                    case 'role_select':
                    case 'channel_select':
                    case 'mentionable_select':
                        html += createTextProperty('placeholder', 'Placeholder', props.placeholder, 'Select...');
                        html += createNumberProperty('min_values', 'Min Values', props.min_values, 1);
                        html += createNumberProperty('max_values', 'Max Values', props.max_values, 1);
                        break;

                    case 'container':
                        html += createColorProperty('accent_colour', 'Accent Color', props.accent_colour || '#5865f2');
                        html += createCheckboxProperty('spoiler', 'Spoiler', props.spoiler || false);
                        break;

                    case 'section':
                        html += createSelectProperty('accessory_type', 'Accessory Type', props.accessory_type || 'thumbnail',
                            ['thumbnail', 'button']);
                        html += createTextProperty('accessory_media', 'Accessory Media', props.accessory_media, 'https://example.com/image.png');
                        break;

                    case 'separator':
                        html += createCheckboxProperty('visible', 'Visible', props.visible !== false);
                        html += createSelectProperty('spacing', 'Spacing', props.spacing || 'small', ['small', 'large']);
                        break;

                    case 'thumbnail':
                        html += createTextProperty('media', 'Media URL', props.media, 'https://example.com/image.png');
                        html += createTextProperty('description', 'Description', props.description, 'Image description');
                        html += createCheckboxProperty('spoiler', 'Spoiler', props.spoiler || false);
                        break;

                    case 'file':
                        html += createTextProperty('media', 'Media', props.media, 'attachment://file.png');
                        html += createCheckboxProperty('spoiler', 'Spoiler', props.spoiler || false);
                        break;

                    case 'action_row':
                        html += '<div class="property-info">ActionRow can contain up to 5 buttons or 1 select menu.</div>';
                        break;
                }

                panel.innerHTML = html;
            }

            function createTextProperty(name, label, value, placeholder) {
                const ph = placeholder ? ' placeholder="' + escapeHtml(placeholder) + '"' : '';
                return '<div class="property-group"><label>' + label + '</label><input type="text" value="' + escapeHtml(value || '') + '"' + ph + ' onchange="updateProperty(\\'' + name + '\\', this.value)"></div>';
            }

            function createTextareaProperty(name, label, value, placeholder) {
                const ph = placeholder ? ' placeholder="' + escapeHtml(placeholder) + '"' : '';
                return '<div class="property-group"><label>' + label + '</label><textarea rows="4"' + ph + ' onchange="updateProperty(\\'' + name + '\\', this.value)">' + escapeHtml(value || '') + '</textarea></div>';
            }

            function createNumberProperty(name, label, value, placeholder) {
                const ph = placeholder !== undefined ? ' placeholder="' + placeholder + '"' : '';
                return '<div class="property-group"><label>' + label + '</label><input type="number" value="' + (value !== undefined ? value : '') + '"' + ph + ' onchange="updateProperty(\\'' + name + '\\', parseInt(this.value) || null)"></div>';
            }

            function createColorProperty(name, label, value) {
                return '<div class="property-group"><label>' + label + '</label><div style="display:flex;gap:8px;"><input type="color" value="' + (value || '#5865f2') + '" style="width:50px;height:32px;padding:2px;" onchange="updateProperty(\\'' + name + '\\', this.value)"><input type="text" value="' + escapeHtml(value || '') + '" placeholder="#5865f2" style="flex:1" onchange="updateProperty(\\'' + name + '\\', this.value)"></div></div>';
            }

            function createSelectProperty(name, label, value, options) {
                let optionsHtml = options.map(opt => '<option value="' + opt + '"' + (opt === value ? ' selected' : '') + '>' + opt + '</option>').join('');
                return '<div class="property-group"><label>' + label + '</label><select onchange="updateProperty(\\'' + name + '\\', this.value)">' + optionsHtml + '</select></div>';
            }

            function createCheckboxProperty(name, label, value) {
                return '<div class="property-group property-checkbox"><input type="checkbox" ' + (value ? 'checked' : '') + ' onchange="updateProperty(\\'' + name + '\\', this.checked)"><label>' + label + '</label></div>';
            }

            function createSelectOptionsEditor(componentId, options) {
                let html = '<div class="property-group"><label>Options</label>';
                html += '<div id="options-container" class="select-options-list">';
                options.forEach((opt, index) => {
                    html += '<div class="select-option-item">';
                    html += '<input type="text" value="' + escapeHtml(opt.label || '') + '" placeholder="Label" onchange="updateSelectOption(\\'' + componentId + '\\', ' + index + ', \\'label\\', this.value)">';
                    html += '<input type="text" value="' + escapeHtml(opt.value || '') + '" placeholder="Value" onchange="updateSelectOption(\\'' + componentId + '\\', ' + index + ', \\'value\\', this.value)">';
                    html += '<button class="option-delete-btn" onclick="removeSelectOption(\\'' + componentId + '\\', ' + index + ')">✕</button>';
                    html += '</div>';
                });
                html += '</div>';
                html += '<button class="btn btn-small btn-secondary" style="width:100%;margin-top:8px;" onclick="addSelectOption(\\'' + componentId + '\\')">+ Add Option</button>';
                html += '</div>';
                return html;
            }

            function escapeHtml(text) {
                return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
            }

            // Component search/filter function
            function filterComponents(searchText) {
                const query = searchText.toLowerCase().trim();
                const sections = document.querySelectorAll('.palette-section');
                
                sections.forEach(section => {
                    const items = section.querySelectorAll('.palette-item');
                    let visibleCount = 0;
                    
                    items.forEach(item => {
                        const searchData = (item.getAttribute('data-search') || '').toLowerCase();
                        const textContent = item.textContent.toLowerCase();
                        const matches = query === '' || 
                            searchData.includes(query) || 
                            textContent.includes(query);
                        
                        if (matches) {
                            item.classList.remove('hidden');
                            visibleCount++;
                        } else {
                            item.classList.add('hidden');
                        }
                    });
                    
                    // Hide section if no items visible
                    if (visibleCount === 0 && query !== '') {
                        section.classList.add('hidden');
                    } else {
                        section.classList.remove('hidden');
                    }
                });
            }

            // Simple Python syntax highlighter
            function highlightPython(code) {
                let html = escapeHtml(code);
                
                // Order matters - strings first to avoid highlighting keywords inside strings
                // Strings (triple quotes, single/double)
                html = html.replace(/("""[\s\S]*?"""|'''[\s\S]*?''')/g, '<span class="string">$1</span>');
                html = html.replace(/("(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*')/g, '<span class="string">$1</span>');
                
                // Comments
                html = html.replace(/(#.*$)/gm, '<span class="comment">$1</span>');
                
                // Decorators
                html = html.replace(/(@\\w+(?:\\.\\w+)*)/g, '<span class="decorator">$1</span>');
                
                // Keywords
                const keywords = ['class', 'def', 'async', 'await', 'return', 'if', 'else', 'elif', 'for', 'while', 'import', 'from', 'as', 'try', 'except', 'finally', 'with', 'pass', 'break', 'continue', 'None', 'True', 'False', 'and', 'or', 'not', 'in', 'is', 'lambda', 'yield', 'raise', 'self', 'super'];
                keywords.forEach(kw => {
                    html = html.replace(new RegExp('\\\\b(' + kw + ')\\\\b', 'g'), '<span class="keyword">$1</span>');
                });
                
                // Built-in functions
                const builtins = ['print', 'len', 'range', 'str', 'int', 'float', 'list', 'dict', 'tuple', 'set', 'bool', 'type', 'isinstance', 'getattr', 'setattr', 'hasattr'];
                builtins.forEach(b => {
                    html = html.replace(new RegExp('\\\\b(' + b + ')\\\\s*\\\\(', 'g'), '<span class="builtin">$1</span>(');
                });
                
                // Class names (after 'class' keyword)
                html = html.replace(/(<span class="keyword">class<\\/span>\\s+)(\\w+)/g, '$1<span class="class-name">$2</span>');
                
                // Function definitions
                html = html.replace(/(<span class="keyword">def<\\/span>\\s+)(\\w+)/g, '$1<span class="function">$2</span>');
                html = html.replace(/(<span class="keyword">async<\\/span>\\s+<span class="keyword">def<\\/span>\\s+)(\\w+)/g, '$1<span class="function">$2</span>');
                
                // Numbers
                html = html.replace(/\\b(\\d+(?:\\.\\d+)?)\\b/g, '<span class="number">$1</span>');
                
                return html;
            }

            function updateProperty(name, value) {
                if (!selectedComponentId) return;
                vscode.postMessage({
                    command: 'updateComponent',
                    componentId: selectedComponentId,
                    properties: { [name]: value }
                });
            }

            function deleteComponent(id) {
                vscode.postMessage({
                    command: 'removeComponent',
                    componentId: id
                });
            }

            function setClassName(name) {
                vscode.postMessage({
                    command: 'setClassName',
                    className: name
                });
            }

            function setTimeout(value) {
                vscode.postMessage({
                    command: 'setTimeout',
                    timeout: parseInt(value) || null
                });
            }

            function generateCode() {
                vscode.postMessage({ command: 'generateCode' });
            }

            function exportCode() {
                vscode.postMessage({ command: 'exportCode' });
            }

            function showCodePreview() {
                vscode.postMessage({ command: 'showCodePreview' });
            }

            function hideCodePreview() {
                document.getElementById('codePreviewSection').style.display = 'none';
            }

            function clearAll() {
                if (confirm('Are you sure you want to clear all components?')) {
                    vscode.postMessage({ command: 'clearAll' });
                }
            }

            function duplicateComponent(id) {
                vscode.postMessage({
                    command: 'duplicateComponent',
                    componentId: id
                });
            }

            function addSelectOption(componentId) {
                vscode.postMessage({
                    command: 'addSelectOption',
                    componentId: componentId
                });
            }

            function removeSelectOption(componentId, optionIndex) {
                vscode.postMessage({
                    command: 'removeSelectOption',
                    componentId: componentId,
                    optionIndex: optionIndex
                });
            }

            function updateSelectOption(componentId, optionIndex, field, value) {
                vscode.postMessage({
                    command: 'updateSelectOption',
                    componentId: componentId,
                    optionIndex: optionIndex,
                    option: { [field]: value }
                });
            }

            function moveComponentUp(id) {
                vscode.postMessage({
                    command: 'moveComponentUp',
                    componentId: id
                });
            }

            function moveComponentDown(id) {
                vscode.postMessage({
                    command: 'moveComponentDown',
                    componentId: id
                });
            }

            function copyComponent(id) {
                vscode.postMessage({
                    command: 'copyComponent',
                    componentId: id
                });
            }

            function cutComponent(id) {
                vscode.postMessage({
                    command: 'cutComponent',
                    componentId: id
                });
            }

            function pasteComponent(parentId) {
                vscode.postMessage({
                    command: 'pasteComponent',
                    parentId: parentId || null
                });
            }

            function exportComponentsJson() {
                vscode.postMessage({ command: 'exportComponents' });
            }

            function importComponentsJson() {
                const json = prompt('Paste JSON to import:');
                if (json) {
                    vscode.postMessage({
                        command: 'importComponents',
                        json: json
                    });
                }
            }

            // Mobile responsive functions
            function togglePalette() {
                const palette = document.getElementById('palettePanel');
                const properties = document.getElementById('propertiesPanel');
                const overlay = document.getElementById('mobileOverlay');
                
                if (palette.classList.contains('open')) {
                    palette.classList.remove('open');
                    overlay.classList.remove('active');
                } else {
                    properties.classList.remove('open');
                    palette.classList.add('open');
                    overlay.classList.add('active');
                }
            }

            function toggleProperties() {
                const palette = document.getElementById('palettePanel');
                const properties = document.getElementById('propertiesPanel');
                const overlay = document.getElementById('mobileOverlay');
                
                if (properties.classList.contains('open')) {
                    properties.classList.remove('open');
                    overlay.classList.remove('active');
                } else {
                    palette.classList.remove('open');
                    properties.classList.add('open');
                    overlay.classList.add('active');
                }
            }

            function closeAllPanels() {
                const palette = document.getElementById('palettePanel');
                const properties = document.getElementById('propertiesPanel');
                const overlay = document.getElementById('mobileOverlay');
                
                palette.classList.remove('open');
                properties.classList.remove('open');
                overlay.classList.remove('active');
            }

            // Zoom functionality
            let currentZoom = 100;
            const minZoom = 50;
            const maxZoom = 200;
            const zoomStep = 10;

            function zoomIn() {
                if (currentZoom < maxZoom) {
                    currentZoom += zoomStep;
                    updateZoom();
                }
            }

            function zoomOut() {
                if (currentZoom > minZoom) {
                    currentZoom -= zoomStep;
                    updateZoom();
                }
            }

            function resetZoom() {
                currentZoom = 100;
                updateZoom();
            }

            function updateZoom() {
                const preview = document.getElementById('discordPreview');
                const zoomLevel = document.getElementById('zoomLevel');
                if (preview) {
                    preview.style.transform = 'scale(' + (currentZoom / 100) + ')';
                }
                if (zoomLevel) {
                    zoomLevel.textContent = currentZoom + '%';
                }
            }

            // Theme management
            let currentTheme = {
                bgColor: '#313338',
                accentColor: '#5865f2',
                textColor: '#ffffff',
                borderColor: '#1e1f22'
            };

            const themePresets = {
                dark: { bgColor: '#313338', accentColor: '#5865f2', textColor: '#ffffff', borderColor: '#1e1f22' },
                light: { bgColor: '#ffffff', accentColor: '#5865f2', textColor: '#313338', borderColor: '#e3e5e8' },
                amoled: { bgColor: '#000000', accentColor: '#5865f2', textColor: '#ffffff', borderColor: '#1a1a1a' },
                discord: { bgColor: '#36393f', accentColor: '#7289da', textColor: '#dcddde', borderColor: '#202225' }
            };

            function openThemeSettings() {
                document.getElementById('themeModal').style.display = 'flex';
                // Load current values
                document.getElementById('themeBgColor').value = currentTheme.bgColor;
                document.getElementById('themeAccentColor').value = currentTheme.accentColor;
                document.getElementById('themeTextColor').value = currentTheme.textColor;
                document.getElementById('themeBorderColor').value = currentTheme.borderColor;
            }

            function closeThemeModal() {
                document.getElementById('themeModal').style.display = 'none';
            }

            function updateTheme() {
                currentTheme.bgColor = document.getElementById('themeBgColor').value;
                currentTheme.accentColor = document.getElementById('themeAccentColor').value;
                currentTheme.textColor = document.getElementById('themeTextColor').value;
                currentTheme.borderColor = document.getElementById('themeBorderColor').value;
                applyThemeToPreview();
            }

            function applyPreset(presetName) {
                const preset = themePresets[presetName];
                if (preset) {
                    currentTheme = { ...preset };
                    document.getElementById('themeBgColor').value = preset.bgColor;
                    document.getElementById('themeAccentColor').value = preset.accentColor;
                    document.getElementById('themeTextColor').value = preset.textColor;
                    document.getElementById('themeBorderColor').value = preset.borderColor;
                    applyThemeToPreview();
                }
            }

            function resetTheme() {
                applyPreset('dark');
            }

            function applyThemeToPreview() {
                const preview = document.getElementById('discordPreview');
                if (preview) {
                    preview.style.setProperty('--preview-bg', currentTheme.bgColor);
                    preview.style.setProperty('--preview-accent', currentTheme.accentColor);
                    preview.style.setProperty('--preview-text', currentTheme.textColor);
                    preview.style.setProperty('--preview-border', currentTheme.borderColor);
                    preview.style.background = currentTheme.bgColor;
                    preview.style.color = currentTheme.textColor;
                    
                    // Apply to container components
                    preview.querySelectorAll('.preview-container').forEach(el => {
                        el.style.borderColor = currentTheme.borderColor;
                    });
                    
                    // Apply accent to buttons
                    preview.querySelectorAll('.preview-button.primary').forEach(el => {
                        el.style.background = currentTheme.accentColor;
                    });
                }
            }

            // Interactive animations for preview components
            function initPreviewInteractions() {
                const preview = document.getElementById('discordPreview');
                if (!preview) return;

                // Button click animation with ripple effect
                preview.addEventListener('click', function(e) {
                    const button = e.target.closest('.preview-button');
                    if (button) {
                        // Add ripple effect
                        const ripple = document.createElement('span');
                        ripple.classList.add('ripple');
                        const rect = button.getBoundingClientRect();
                        const size = Math.max(rect.width, rect.height);
                        ripple.style.width = ripple.style.height = size + 'px';
                        ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
                        ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';
                        button.appendChild(ripple);
                        
                        // Remove ripple after animation
                        setTimeout(() => ripple.remove(), 600);
                        
                        // Add click class
                        button.classList.add('clicked');
                        setTimeout(() => button.classList.remove('clicked'), 300);
                    }

                    // Select menu expand/collapse
                    const select = e.target.closest('.preview-select');
                    if (select) {
                        select.classList.toggle('expanded');
                    }
                });

                // Select option click
                preview.addEventListener('click', function(e) {
                    const option = e.target.closest('.select-option');
                    if (option) {
                        const select = option.closest('.preview-select');
                        if (select) {
                            const placeholder = select.querySelector('.select-placeholder');
                            if (placeholder) {
                                placeholder.textContent = option.textContent;
                            }
                            select.classList.remove('expanded');
                        }
                    }
                });
            }

            // Initialize preview interactions when the page loads
            document.addEventListener('DOMContentLoaded', initPreviewInteractions);
            // Also call immediately in case DOM is already loaded
            initPreviewInteractions();

            // Close modal on click outside
            document.getElementById('themeModal')?.addEventListener('click', function(e) {
                if (e.target === this) {
                    closeThemeModal();
                }
            });

            // Mouse wheel zoom (Ctrl+scroll)
            document.querySelector('.preview-section')?.addEventListener('wheel', function(e) {
                if (e.ctrlKey) {
                    e.preventDefault();
                    if (e.deltaY < 0) {
                        zoomIn();
                    } else {
                        zoomOut();
                    }
                }
            }, { passive: false });

            // Undo/Redo functions
            function undo() {
                vscode.postMessage({ command: 'undo' });
            }

            function redo() {
                vscode.postMessage({ command: 'redo' });
            }

            // Keyboard shortcuts
            document.addEventListener('keydown', function(e) {
                // Ctrl+Z - Undo
                if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
                    e.preventDefault();
                    undo();
                }
                // Ctrl+Y or Ctrl+Shift+Z - Redo
                if ((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'z')) {
                    e.preventDefault();
                    redo();
                }
                // Delete - Remove selected component
                if (e.key === 'Delete' && selectedComponentId && !e.target.matches('input, textarea, select')) {
                    e.preventDefault();
                    deleteComponent(selectedComponentId);
                }
                // Ctrl+D - Duplicate selected component
                if (e.ctrlKey && e.key === 'd' && selectedComponentId) {
                    e.preventDefault();
                    duplicateComponent(selectedComponentId);
                }
                // Ctrl+C - Copy selected component
                if (e.ctrlKey && e.key === 'c' && selectedComponentId && !e.target.matches('input, textarea, select')) {
                    e.preventDefault();
                    copyComponent(selectedComponentId);
                }
                // Ctrl+X - Cut selected component
                if (e.ctrlKey && e.key === 'x' && selectedComponentId && !e.target.matches('input, textarea, select')) {
                    e.preventDefault();
                    cutComponent(selectedComponentId);
                }
                // Ctrl+V - Paste component
                if (e.ctrlKey && e.key === 'v' && !e.target.matches('input, textarea, select')) {
                    e.preventDefault();
                    pasteComponent(selectedComponentId);
                }
                // Ctrl+Up - Move component up
                if (e.ctrlKey && e.key === 'ArrowUp' && selectedComponentId) {
                    e.preventDefault();
                    moveComponentUp(selectedComponentId);
                }
                // Ctrl+Down - Move component down
                if (e.ctrlKey && e.key === 'ArrowDown' && selectedComponentId) {
                    e.preventDefault();
                    moveComponentDown(selectedComponentId);
                }
                // Escape - Deselect
                if (e.key === 'Escape') {
                    selectedComponentId = null;
                    document.querySelectorAll('.component-item.selected').forEach(el => el.classList.remove('selected'));
                    document.getElementById('propertiesPanel').innerHTML = '<h3>Properties</h3><div class="no-selection"><p>Select a component to edit its properties</p></div>';
                    closeAllPanels();
                }
            });
        `;
    }

    /**
     * Check if the builder panel is visible
     */
    public isVisible(): boolean {
        return this.panel !== null && this.panel.visible;
    }

    /**
     * Close the builder panel
     */
    public close(): void {
        if (this.panel) {
            this.panel.dispose();
            this.panel = null;
        }
    }
}
