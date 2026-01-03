import discord
from discord.ui import Button, View, Select, SelectOption, TextInput, Modal
from discord import TextStyle

class MyView(View):
    @discord.ui.button(label='Primary Button', style=discord.ButtonStyle.primary, row=0)
    async def primary_button(self, interaction: discord.Interaction, button: Button):
        await interaction.response.send_message('Primary clicked!')

    @discord.ui.button(label='Success Button', style=discord.ButtonStyle.success, emoji='✅', row=0)
    async def success_button(self, interaction: discord.Interaction, button: Button):
        await interaction.response.send_message('Success!')

    @discord.ui.button(label='Danger Button', style=discord.ButtonStyle.danger, disabled=False, row=1)
    async def danger_button(self, interaction: discord.Interaction, button: Button):
        await interaction.response.send_message('Danger zone!')
    
    @discord.ui.select(
        placeholder='Choose your favorite color',
        options=[
            SelectOption(label='Red', value='red', emoji='🔴'),
            SelectOption(label='Green', value='green', emoji='🟢'),
            SelectOption(label='Blue', value='blue', emoji='🔵'),
        ],
        row=2
    )
    async def color_select(self, interaction: discord.Interaction, select: Select):
        await interaction.response.send_message(f'You chose {select.values[0]}!')

# Direct instantiation
submit_button = discord.ui.Button(
    label='Submit',
    style=discord.ButtonStyle.success,
    custom_id='submit_btn',
    emoji='📝',
    row=3
)

cancel_button = discord.ui.Button(
    label='Cancel',
    style=discord.ButtonStyle.secondary,
    custom_id='cancel_btn',
    row=3
)

link_button = discord.ui.Button(
    label='Visit Website',
    style=discord.ButtonStyle.link,
    url='https://discord.com',
    row=4
)

disabled_button = Button(
    label='Disabled',
    style=discord.ButtonStyle.secondary,
    disabled=True
)

# Test with ui import
import discord.ui as ui

button_from_ui = ui.Button(label='UI Button', style=ui.ButtonStyle.primary)

# Select menu
role_select = ui.Select(
    placeholder='Select a role',
    custom_id='role_select',
    min_values=1,
    max_values=3,
    options=[
        SelectOption(label='Admin', value='admin', description='Administrator role'),
        SelectOption(label='Moderator', value='mod', description='Moderator role'),
        SelectOption(label='Member', value='member', description='Regular member'),
    ]
)

# Text input in a modal
class FeedbackModal(Modal):
    name_input = TextInput(
        label='Your Name',
        style=TextStyle.short,
        placeholder='Enter your name...',
        required=True,
        max_length=50
    )
    
    feedback_input = TextInput(
        label='Feedback',
        style=TextStyle.paragraph,
        placeholder='Tell us what you think...',
        required=True,
        min_length=10,
        max_length=500
    )
    
    async def on_submit(self, interaction: discord.Interaction):
        await interaction.response.send_message(f'Thanks {self.name_input.value}!')
