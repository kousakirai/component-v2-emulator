"""Test ternary operator patterns for options"""
import discord
from discord import ui, SelectOption, Interaction

# Pattern 1: Simple ternary with static arrays
class TernarySimpleView(ui.View):
    is_admin = True
    
    options = [
        SelectOption(label='Admin A', value='a'),
        SelectOption(label='Admin B', value='b')
    ] if is_admin else [
        SelectOption(label='User A', value='a'),
        SelectOption(label='User B', value='b')
    ]
    
    @ui.select(placeholder='三項演算（静的）', options=options)
    async def ternary_select(self, inter: Interaction, select: ui.Select):
        pass


# Pattern 2: Ternary with variable references
class TernaryVariableView(ui.View):
    admin_options = [SelectOption(label='Admin', value='admin')]
    user_options = [SelectOption(label='User', value='user')]
    is_privileged = False
    
    selected_options = admin_options if is_privileged else user_options
    
    @ui.select(placeholder='三項演算（変数参照）', options=selected_options)
    async def var_ternary_select(self, inter: Interaction, select: ui.Select):
        pass


# Pattern 3: Ternary with list comprehension
class TernaryCompView(ui.View):
    use_range_a = True
    
    options = [
        SelectOption(label=f'A-{i}', value=str(i)) for i in range(1, 4)
    ] if use_range_a else [
        SelectOption(label=f'B-{i}', value=str(i)) for i in range(10, 13)
    ]
    
    @ui.select(placeholder='三項演算（リスト内包）', options=options)
    async def comp_ternary_select(self, inter: Interaction, select: ui.Select):
        pass


# Pattern 4: Nested ternary
class NestedTernaryView(ui.View):
    level = 2
    
    options = [
        SelectOption(label='Level 1', value='1')
    ] if level == 1 else [
        SelectOption(label='Level 2', value='2')
    ] if level == 2 else [
        SelectOption(label='Other', value='0')
    ]
    
    @ui.select(placeholder='ネストした三項演算', options=options)
    async def nested_select(self, inter: Interaction, select: ui.Select):
        pass


# Pattern 5: Ternary in decorator directly
class InlineView(ui.View):
    show_all = True
    
    all_opts = [SelectOption(label=f'Item {i}', value=str(i)) for i in range(1, 6)]
    limited_opts = [SelectOption(label='Item 1', value='1')]
    
    @ui.select(
        placeholder='インライン三項演算',
        options=all_opts if show_all else limited_opts
    )
    async def inline_select(self, inter: Interaction, select: ui.Select):
        pass
