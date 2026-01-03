import discord
from discord.ui import Button, View

class MyView(View):
    @discord.ui.button(label='Primary Button', style=discord.ButtonStyle.primary)
    async def primary_button(self, interaction: discord.Interaction, button: Button):
        await interaction.response.send_message('Primary clicked!')

    @discord.ui.button(label='Success Button', style=discord.ButtonStyle.success, emoji='✅')
    async def success_button(self, interaction: discord.Interaction, button: Button):
        await interaction.response.send_message('Success!')

    @discord.ui.button(label='Danger Button', style=discord.ButtonStyle.danger, disabled=False)
    async def danger_button(self, interaction: discord.Interaction, button: Button):
        await interaction.response.send_message('Danger zone!')

# Direct instantiation
submit_button = discord.ui.Button(
    label='Submit',
    style=discord.ButtonStyle.success,
    custom_id='submit_btn',
    emoji='📝'
)

cancel_button = discord.ui.Button(
    label='Cancel',
    style=discord.ButtonStyle.secondary,
    custom_id='cancel_btn'
)

link_button = discord.ui.Button(
    label='Visit Website',
    style=discord.ButtonStyle.link,
    url='https://discord.com'
)

disabled_button = Button(
    label='Disabled',
    style=discord.ButtonStyle.secondary,
    disabled=True
)

# Test with ui import
import discord.ui as ui

button_from_ui = ui.Button(label='UI Button', style=ui.ButtonStyle.primary)
