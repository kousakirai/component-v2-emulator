import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Component preset definition
 */
export interface ComponentPreset {
    name: string;
    description: string;
    category: string;
    code: string;
    tags: string[];
    author?: string;
    created?: string;
    thumbnail?: string;
}

/**
 * Manages user-defined and built-in component presets
 */
export class PresetManager {
    private static readonly PRESET_FILE = '.vscode/discord-component-presets.json';
    private presets: Map<string, ComponentPreset> = new Map();
    private workspaceRoot: string | undefined;

    constructor(workspaceRoot?: string) {
        this.workspaceRoot = workspaceRoot;
        this.loadPresets();
    }

    /**
     * Load presets from workspace configuration file
     */
    private loadPresets(): void {
        if (!this.workspaceRoot) {
            return;
        }

        const presetPath = path.join(this.workspaceRoot, PresetManager.PRESET_FILE);

        if (fs.existsSync(presetPath)) {
            try {
                const content = fs.readFileSync(presetPath, 'utf-8');
                const data = JSON.parse(content);

                if (data.presets && Array.isArray(data.presets)) {
                    data.presets.forEach((preset: ComponentPreset) => {
                        this.presets.set(preset.name, preset);
                    });
                }
            } catch (error) {
                console.error('Failed to load presets:', error);
            }
        }

        // Load built-in presets
        this.loadBuiltInPresets();
    }

    /**
     * Load built-in component presets
     */
    private loadBuiltInPresets(): void {
        const builtInPresets: ComponentPreset[] = [
            {
                name: 'Admin Confirmation Dialog',
                description: '管理者用の確認ダイアログ（承認/拒否ボタン付き）',
                category: 'Dialogs',
                tags: ['admin', 'confirm', 'security'],
                code: `class AdminConfirmDialog(discord.ui.View):
    def __init__(self, action_name: str = "this action"):
        super().__init__(timeout=60)
        self.value = None
        self.action_name = action_name
    
    @discord.ui.button(label="✅ Approve", style=discord.ButtonStyle.success)
    async def approve(self, interaction: discord.Interaction, button: discord.ui.Button):
        self.value = True
        await interaction.response.send_message(f"Approved {self.action_name}", ephemeral=True)
        self.stop()
    
    @discord.ui.button(label="❌ Deny", style=discord.ButtonStyle.danger)
    async def deny(self, interaction: discord.Interaction, button: discord.ui.Button):
        self.value = False
        await interaction.response.send_message(f"Denied {self.action_name}", ephemeral=True)
        self.stop()`
            },
            {
                name: 'Ticket Creation System',
                description: 'サポートチケット作成用のモーダルフォーム',
                category: 'Forms',
                tags: ['support', 'ticket', 'modal', 'form'],
                code: `class TicketModal(discord.ui.Modal, title="Create Support Ticket"):
    subject = discord.ui.TextInput(
        label="Subject",
        placeholder="Brief description of your issue...",
        style=discord.TextStyle.short,
        required=True,
        max_length=100
    )
    
    description = discord.ui.TextInput(
        label="Description",
        placeholder="Detailed explanation of your problem...",
        style=discord.TextStyle.paragraph,
        required=True,
        min_length=20,
        max_length=1000
    )
    
    priority = discord.ui.TextInput(
        label="Priority (Low/Medium/High)",
        placeholder="Medium",
        style=discord.TextStyle.short,
        required=False,
        max_length=10
    )
    
    async def on_submit(self, interaction: discord.Interaction):
        # Create ticket channel or send to support team
        await interaction.response.send_message(
            f"Ticket created!\\n**Subject:** {self.subject.value}\\n**Priority:** {self.priority.value or 'Medium'}",
            ephemeral=True
        )`
            },
            {
                name: 'Role Selection Menu',
                description: '複数選択可能なロール選択メニュー',
                category: 'Selection',
                tags: ['roles', 'select', 'multiple'],
                code: `class RoleSelectView(discord.ui.View):
    def __init__(self):
        super().__init__(timeout=None)
    
    @discord.ui.select(
        placeholder="Choose your roles...",
        min_values=1,
        max_values=5,
        options=[
            discord.SelectOption(label="Announcements", emoji="📢", description="Get notified of server announcements"),
            discord.SelectOption(label="Events", emoji="🎉", description="Get notified of upcoming events"),
            discord.SelectOption(label="Giveaways", emoji="🎁", description="Participate in giveaways"),
            discord.SelectOption(label="Gaming", emoji="🎮", description="Join gaming sessions"),
            discord.SelectOption(label="Art", emoji="🎨", description="Share and view artwork")
        ]
    )
    async def role_select(self, interaction: discord.Interaction, select: discord.ui.Select):
        roles_text = ", ".join(select.values)
        await interaction.response.send_message(f"You selected: {roles_text}", ephemeral=True)`
            },
            {
                name: 'Pagination Controls',
                description: 'ページネーション用のナビゲーションボタン',
                category: 'Navigation',
                tags: ['pagination', 'navigation', 'embed'],
                code: `class PaginationView(discord.ui.View):
    def __init__(self, embeds: list):
        super().__init__(timeout=60)
        self.embeds = embeds
        self.current_page = 0
        self.update_buttons()
    
    def update_buttons(self):
        self.first.disabled = self.current_page == 0
        self.previous.disabled = self.current_page == 0
        self.next.disabled = self.current_page == len(self.embeds) - 1
        self.last.disabled = self.current_page == len(self.embeds) - 1
    
    @discord.ui.button(label="⏮️", style=discord.ButtonStyle.secondary)
    async def first(self, interaction: discord.Interaction, button: discord.ui.Button):
        self.current_page = 0
        self.update_buttons()
        await interaction.response.edit_message(embed=self.embeds[0], view=self)
    
    @discord.ui.button(label="◀️", style=discord.ButtonStyle.primary)
    async def previous(self, interaction: discord.Interaction, button: discord.ui.Button):
        self.current_page -= 1
        self.update_buttons()
        await interaction.response.edit_message(embed=self.embeds[self.current_page], view=self)
    
    @discord.ui.button(label="▶️", style=discord.ButtonStyle.primary)
    async def next(self, interaction: discord.Interaction, button: discord.ui.Button):
        self.current_page += 1
        self.update_buttons()
        await interaction.response.edit_message(embed=self.embeds[self.current_page], view=self)
    
    @discord.ui.button(label="⏭️", style=discord.ButtonStyle.secondary)
    async def last(self, interaction: discord.Interaction, button: discord.ui.Button):
        self.current_page = len(self.embeds) - 1
        self.update_buttons()
        await interaction.response.edit_message(embed=self.embeds[-1], view=self)`
            },
            {
                name: 'Components v2 Full Example',
                description: 'Components v2の全機能を使用した例（LayoutView + 新コンポーネント）',
                category: 'Components v2',
                tags: ['layoutview', 'components-v2', 'advanced', 'complete'],
                code: `class ModernLayoutView(discord.ui.LayoutView):
    """Components v2 features showcase"""
    
    def __init__(self):
        super().__init__()
        
        # Header section with title and description
        header = discord.ui.Section()
        header.add_item(discord.ui.TextDisplay(
            content="Welcome to Components v2!",
            style="bold"
        ))
        header.add_item(discord.ui.Label(
            text="Please fill out the form below:"
        ))
        header.add_item(discord.ui.Separator(spacing="medium"))
        self.add_item(header)
        
        # Form section with input fields
        form_section = discord.ui.Section()
        form_section.add_item(discord.ui.Label(
            text="Profile Picture:",
            for_="profile_pic"
        ))
        form_section.add_item(discord.ui.Thumbnail(
            url="https://cdn.discordapp.com/embed/avatars/0.png",
            width=100,
            height=100
        ))
        form_section.add_item(discord.ui.FileUpload(
            accept=[".jpg", ".png", ".gif"],
            multiple=False
        ))
        self.add_item(form_section)
        
        # Attachments section
        attachments = discord.ui.Section()
        attachments.add_item(discord.ui.Label(text="Attached Files:"))
        attachments.add_item(discord.ui.File(
            filename="document.pdf",
            size=2048000  # 2MB
        ))
        attachments.add_item(discord.ui.MediaGallery(items=[
            {"url": "https://example.com/image1.png"},
            {"url": "https://example.com/image2.png"}
        ]))
        self.add_item(attachments)
        
        # Action buttons
        actions = discord.ui.Section()
        actions.add_item(discord.ui.Button(
            label="Submit",
            style=discord.ButtonStyle.primary
        ))
        actions.add_item(discord.ui.Button(
            label="Cancel",
            style=discord.ButtonStyle.secondary
        ))
        self.add_item(actions)
    
    async def on_submit(self, interaction: discord.Interaction):
        await interaction.response.send_message("Form submitted!", ephemeral=True)`
            }
        ];

        builtInPresets.forEach(preset => {
            if (!this.presets.has(preset.name)) {
                this.presets.set(preset.name, preset);
            }
        });
    }

    /**
     * Save current presets to file
     */
    async savePresets(): Promise<void> {
        if (!this.workspaceRoot) {
            throw new Error('No workspace folder found');
        }

        const presetPath = path.join(this.workspaceRoot, PresetManager.PRESET_FILE);
        const vscodeDir = path.dirname(presetPath);

        // Create .vscode directory if it doesn't exist
        if (!fs.existsSync(vscodeDir)) {
            fs.mkdirSync(vscodeDir, { recursive: true });
        }

        // Filter out built-in presets (only save user presets)
        const userPresets = Array.from(this.presets.values()).filter(p => p.author);

        const data = {
            version: '1.0',
            presets: userPresets
        };

        fs.writeFileSync(presetPath, JSON.stringify(data, null, 2), 'utf-8');
    }

    /**
     * Add a new preset
     */
    async addPreset(preset: ComponentPreset): Promise<void> {
        preset.created = new Date().toISOString();
        preset.author = 'user';
        this.presets.set(preset.name, preset);
        await this.savePresets();
    }

    /**
     * Delete a preset
     */
    async deletePreset(name: string): Promise<void> {
        const preset = this.presets.get(name);
        if (preset && preset.author) { // Only delete user presets
            this.presets.delete(name);
            await this.savePresets();
        }
    }

    /**
     * Get all presets
     */
    getAllPresets(): ComponentPreset[] {
        return Array.from(this.presets.values());
    }

    /**
     * Get presets by category
     */
    getPresetsByCategory(category: string): ComponentPreset[] {
        return this.getAllPresets().filter(p => p.category === category);
    }

    /**
     * Search presets by tag or text
     */
    searchPresets(query: string): ComponentPreset[] {
        const lowerQuery = query.toLowerCase();
        return this.getAllPresets().filter(preset =>
            preset.name.toLowerCase().includes(lowerQuery) ||
            preset.description.toLowerCase().includes(lowerQuery) ||
            preset.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
        );
    }

    /**
     * Get all unique categories
     */
    getCategories(): string[] {
        const categories = new Set<string>();
        this.getAllPresets().forEach(p => categories.add(p.category));
        return Array.from(categories).sort();
    }

    /**
     * Get all unique tags
     */
    getTags(): string[] {
        const tags = new Set<string>();
        this.getAllPresets().forEach(p => p.tags.forEach(tag => tags.add(tag)));
        return Array.from(tags).sort();
    }
}

/**
 * Show preset picker and insert selected preset
 */
export async function showPresetPicker(presetManager: PresetManager): Promise<void> {
    const presets = presetManager.getAllPresets();

    if (presets.length === 0) {
        vscode.window.showInformationMessage('No presets available');
        return;
    }

    // Create quick pick items
    const items = presets.map(preset => ({
        label: preset.name,
        description: preset.category,
        detail: preset.description,
        preset: preset
    }));

    // Show picker
    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a component preset to insert',
        matchOnDescription: true,
        matchOnDetail: true
    });

    if (!selected) {
        return;
    }

    // Insert at cursor position
    const editor = vscode.window.activeTextEditor;
    if (editor) {
        const position = editor.selection.active;
        await editor.edit(editBuilder => {
            editBuilder.insert(position, '\n' + selected.preset.code + '\n');
        });

        vscode.window.showInformationMessage(`Inserted preset: ${selected.preset.name}`);
    }
}

/**
 * Save current selection as a new preset
 */
export async function saveAsPreset(presetManager: PresetManager): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active editor');
        return;
    }

    const selection = editor.document.getText(editor.selection);
    if (!selection) {
        vscode.window.showErrorMessage('No code selected');
        return;
    }

    // Get preset details from user
    const name = await vscode.window.showInputBox({
        prompt: 'Preset name',
        placeHolder: 'My Custom Component'
    });

    if (!name) {
        return;
    }

    const description = await vscode.window.showInputBox({
        prompt: 'Description',
        placeHolder: 'Describe what this preset does...'
    });

    const category = await vscode.window.showQuickPick(
        [...presetManager.getCategories(), '+ New Category'],
        { placeHolder: 'Select category' }
    );

    if (!category) {
        return;
    }

    let finalCategory = category;
    if (category === '+ New Category') {
        const newCategory = await vscode.window.showInputBox({
            prompt: 'New category name',
            placeHolder: 'Custom'
        });
        if (!newCategory) {
            return;
        }
        finalCategory = newCategory;
    }

    const tagsInput = await vscode.window.showInputBox({
        prompt: 'Tags (comma-separated)',
        placeHolder: 'button, modal, custom'
    });

    const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()) : [];

    // Create and save preset
    const preset: ComponentPreset = {
        name,
        description: description || '',
        category: finalCategory,
        code: selection,
        tags
    };

    await presetManager.addPreset(preset);
    vscode.window.showInformationMessage(`Preset "${name}" saved!`);
}
