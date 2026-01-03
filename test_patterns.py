"""
Test all component definition patterns for discord.py ComponentV2
"""
import discord
from discord import ui
from discord.ui import Button, Select, SelectOption, TextInput, View, Modal
from discord.ui import TextStyle, ButtonStyle

# パターン1: モジュールレベルのグローバル変数
global_button = discord.ui.Button(label='Global Button', style=discord.ButtonStyle.primary)
module_select = ui.Select(
    placeholder='Module Select',
    options=[
        SelectOption(label='Option 1', value='1'),
        SelectOption(label='Option 2', value='2'),
    ]
)

# パターン2: デコレータベース
class DecoratorView(discord.ui.View):
    @discord.ui.button(label='Decorator Button', style=discord.ButtonStyle.success)
    async def decorator_button(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.send_message('Decorator clicked!')
    
    @ui.select(
        placeholder='Decorator Select',
        options=[
            SelectOption(label='A', value='a'),
            SelectOption(label='B', value='b'),
        ]
    )
    async def decorator_select(self, interaction: discord.Interaction, select: ui.Select):
        await interaction.response.send_message(f'Selected: {select.values}')

# パターン3: クラス変数として定義
class ClassVariableView(View):
    # クラス変数としてコンポーネントを定義
    my_button = Button(label='Class Variable Button', style=ButtonStyle.danger)
    my_select = Select(
        placeholder='Class Variable Select',
        min_values=1,
        max_values=2,
        options=[
            SelectOption(label='Red', value='red', emoji='🔴'),
            SelectOption(label='Blue', value='blue', emoji='🔵'),
        ]
    )

# パターン4: __init__でadd_item()を使用
class AddItemView(discord.ui.View):
    def __init__(self):
        super().__init__()
        # add_item()で動的に追加
        self.add_item(discord.ui.Button(
            label='Add Item Button',
            style=discord.ButtonStyle.secondary,
            custom_id='add_item_btn'
        ))
        self.add_item(ui.Select(
            placeholder='Add Item Select',
            custom_id='add_item_select',
            options=[
                SelectOption(label='One', value='1'),
                SelectOption(label='Two', value='2'),
                SelectOption(label='Three', value='3'),
            ]
        ))

# パターン5: 型アノテーション付きクラス変数
class AnnotatedView(View):
    button: Button = Button(label='Annotated Button', style=ButtonStyle.primary, row=0)
    select: Select = Select(
        placeholder='Annotated Select',
        row=1,
        options=[
            SelectOption(label='First', value='first'),
            SelectOption(label='Second', value='second'),
        ]
    )

# パターン6: Modalのクラス変数（TextInput）
class FeedbackModal(Modal, title='Feedback'):
    # Modalではクラス変数としてTextInputを定義
    name = TextInput(
        label='Name',
        style=TextStyle.short,
        placeholder='Your name...',
        required=True
    )
    
    feedback = TextInput(
        label='Feedback',
        style=TextStyle.paragraph,
        placeholder='What do you think?',
        required=True,
        max_length=300
    )
    
    async def on_submit(self, interaction: discord.Interaction):
        await interaction.response.send_message(f'Thanks {self.name.value}!')

# パターン7: 混合パターン（デコレータ + add_item）
class MixedView(discord.ui.View):
    def __init__(self):
        super().__init__()
        # add_item()で追加
        self.add_item(Button(label='Init Button', style=ButtonStyle.primary, row=0))
    
    # デコレータでも追加
    @ui.button(label='Decorator Button', style=ButtonStyle.success, row=1)
    async def decorator_btn(self, interaction: discord.Interaction, button: Button):
        await interaction.response.send_message('Clicked!')

# パターン8: リンクボタン
link_button = discord.ui.Button(
    label='Visit Discord',
    style=discord.ButtonStyle.link,
    url='https://discord.com',
    emoji='🔗'
)

class LinkButtonView(View):
    link = Button(label='GitHub', style=ButtonStyle.link, url='https://github.com')

# パターン9: 無効化されたコンポーネント
disabled_button = ui.Button(label='Disabled', style=ButtonStyle.secondary, disabled=True)

class DisabledView(View):
    disabled_btn = Button(label='Cannot Click', style=ButtonStyle.danger, disabled=True)
    
    @ui.button(label='Also Disabled', style=ButtonStyle.primary, disabled=True)
    async def disabled_decorator(self, interaction, button):
        pass

# パターン10: custom_idとrowを指定
class AdvancedView(discord.ui.View):
    @ui.button(label='Row 0 Left', style=ButtonStyle.primary, custom_id='r0_left', row=0)
    async def btn1(self, interaction, button):
        pass
    
    @ui.button(label='Row 0 Right', style=ButtonStyle.primary, custom_id='r0_right', row=0)
    async def btn2(self, interaction, button):
        pass
    
    @ui.button(label='Row 1', style=ButtonStyle.secondary, custom_id='r1', row=1)
    async def btn3(self, interaction, button):
        pass
    
    @ui.select(
        placeholder='Row 2 Select',
        custom_id='r2_select',
        row=2,
        min_values=1,
        max_values=3,
        options=[
            SelectOption(label='A', value='a'),
            SelectOption(label='B', value='b'),
            SelectOption(label='C', value='c'),
        ]
    )
    async def select_menu(self, interaction, select):
        pass
