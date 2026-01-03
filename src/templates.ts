/**
 * Component templates for common UI patterns
 */

export interface ComponentTemplate {
    name: string;
    description: string;
    category: string;
    code: string;
}

export const COMPONENT_TEMPLATES: ComponentTemplate[] = [
    {
        name: 'Confirmation Dialog',
        description: 'Yes/No confirmation buttons',
        category: 'Dialogs',
        code: `class ConfirmView(discord.ui.View):
    @discord.ui.button(label='✅ Yes', style=discord.ButtonStyle.success)
    async def confirm(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.send_message('Confirmed!', ephemeral=True)
        self.stop()
    
    @discord.ui.button(label='❌ No', style=discord.ButtonStyle.danger)
    async def cancel(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.send_message('Cancelled!', ephemeral=True)
        self.stop()`
    },
    {
        name: 'Pagination Buttons',
        description: 'Previous/Next navigation buttons',
        category: 'Navigation',
        code: `class PaginationView(discord.ui.View):
    def __init__(self):
        super().__init__()
        self.current_page = 0
    
    @discord.ui.button(label='◀️ Previous', style=discord.ButtonStyle.primary, row=0)
    async def previous(self, interaction: discord.Interaction, button: discord.ui.Button):
        self.current_page -= 1
        await interaction.response.edit_message(content=f'Page {self.current_page + 1}', view=self)
    
    @discord.ui.button(label='Next ▶️', style=discord.ButtonStyle.primary, row=0)
    async def next(self, interaction: discord.Interaction, button: discord.ui.Button):
        self.current_page += 1
        await interaction.response.edit_message(content=f'Page {self.current_page + 1}', view=self)`
    },
    {
        name: 'Role Selection Menu',
        description: 'Select menu for role selection',
        category: 'Selection',
        code: `class RoleSelectView(discord.ui.View):
    @discord.ui.select(
        placeholder='Select your roles',
        min_values=1,
        max_values=3,
        options=[
            discord.SelectOption(label='Member', value='member', emoji='👤'),
            discord.SelectOption(label='Contributor', value='contributor', emoji='✨'),
            discord.SelectOption(label='Developer', value='developer', emoji='💻'),
        ]
    )
    async def role_select(self, interaction: discord.Interaction, select: discord.ui.Select):
        await interaction.response.send_message(f'Selected roles: {", ".join(select.values)}', ephemeral=True)`
    },
    {
        name: 'Feedback Modal',
        description: 'Modal form for collecting user feedback',
        category: 'Forms',
        code: `class FeedbackModal(discord.ui.Modal, title='Feedback Form'):
    name = discord.ui.TextInput(
        label='Your Name',
        style=discord.TextStyle.short,
        placeholder='Enter your name...',
        required=True,
        max_length=50
    )
    
    feedback = discord.ui.TextInput(
        label='Feedback',
        style=discord.TextStyle.paragraph,
        placeholder='Tell us what you think...',
        required=True,
        min_length=10,
        max_length=500
    )
    
    async def on_submit(self, interaction: discord.Interaction):
        await interaction.response.send_message(f'Thanks for your feedback, {self.name.value}!', ephemeral=True)`
    },
    {
        name: 'Simple Link Button',
        description: 'Single button that opens a URL',
        category: 'Links',
        code: `discord.ui.Button(
    label='Visit Website',
    style=discord.ButtonStyle.link,
    url='https://discord.com',
    emoji='🔗'
)`
    },
    {
        name: 'Numbered Page Selector',
        description: 'Buttons numbered 1-5 for page selection',
        category: 'Navigation',
        code: `class PageSelectorView(discord.ui.View):
    @discord.ui.button(label='1', style=discord.ButtonStyle.secondary, row=0)
    async def page_1(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.edit_message(content='Page 1', view=self)
    
    @discord.ui.button(label='2', style=discord.ButtonStyle.secondary, row=0)
    async def page_2(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.edit_message(content='Page 2', view=self)
    
    @discord.ui.button(label='3', style=discord.ButtonStyle.secondary, row=0)
    async def page_3(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.edit_message(content='Page 3', view=self)
    
    @discord.ui.button(label='4', style=discord.ButtonStyle.secondary, row=0)
    async def page_4(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.edit_message(content='Page 4', view=self)
    
    @discord.ui.button(label='5', style=discord.ButtonStyle.secondary, row=0)
    async def page_5(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.edit_message(content='Page 5', view=self)`
    },
    {
        name: 'Color Picker',
        description: 'Select menu with color options',
        category: 'Selection',
        code: `class ColorPickerView(discord.ui.View):
    @discord.ui.select(
        placeholder='Choose a color',
        options=[
            discord.SelectOption(label='Red', value='red', emoji='🔴'),
            discord.SelectOption(label='Orange', value='orange', emoji='🟠'),
            discord.SelectOption(label='Yellow', value='yellow', emoji='🟡'),
            discord.SelectOption(label='Green', value='green', emoji='🟢'),
            discord.SelectOption(label='Blue', value='blue', emoji='🔵'),
            discord.SelectOption(label='Purple', value='purple', emoji='🟣'),
        ]
    )
    async def color_select(self, interaction: discord.Interaction, select: discord.ui.Select):
        await interaction.response.send_message(f'You selected {select.values[0]}!', ephemeral=True)`
    },
    {
        name: 'Delete Confirmation',
        description: 'Dangerous action confirmation with countdown',
        category: 'Dialogs',
        code: `class DeleteConfirmView(discord.ui.View):
    @discord.ui.button(label='⚠️ Confirm Delete', style=discord.ButtonStyle.danger)
    async def confirm_delete(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.send_message('Item deleted!', ephemeral=True)
        self.stop()
    
    @discord.ui.button(label='Cancel', style=discord.ButtonStyle.secondary)
    async def cancel(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.send_message('Cancelled', ephemeral=True)
        self.stop()`
    }
];

export function getTemplatesByCategory(category: string): ComponentTemplate[] {
    return COMPONENT_TEMPLATES.filter(t => t.category === category);
}

export function getAllCategories(): string[] {
    return [...new Set(COMPONENT_TEMPLATES.map(t => t.category))];
}
