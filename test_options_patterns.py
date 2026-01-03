"""Test various SelectOption definition patterns"""
import discord
from discord import ui, SelectOption, Interaction

# Pattern 1: Direct array in decorator
class DirectArrayView(ui.View):
    @ui.select(
        placeholder='直接配列',
        options=[
            SelectOption(label='Option 1', value='1'),
            SelectOption(label='Option 2', value='2'),
            SelectOption(label='Option 3', value='3')
        ]
    )
    async def direct_select(self, inter: Interaction, select: ui.Select):
        pass


# Pattern 2: Variable reference with static array
class VariableReferenceView(ui.View):
    my_options = [
        SelectOption(label='Static A', value='a'),
        SelectOption(label='Static B', value='b'),
        SelectOption(label='Static C', value='c')
    ]
    
    @ui.select(placeholder='変数参照（静的）', options=my_options)
    async def var_select(self, inter: Interaction, select: ui.Select):
        pass


# Pattern 3: Variable reference with list comprehension
class ListCompView(ui.View):
    comp_options = [SelectOption(label=f'Item {i}', value=str(i)) for i in range(1, 6)]
    
    @ui.select(placeholder='変数参照（リスト内包）', options=comp_options)
    async def comp_select(self, inter: Interaction, select: ui.Select):
        pass


# Pattern 4: Complex list comprehension
class ComplexCompView(ui.View):
    colors = ['red', 'blue', 'green', 'yellow']
    color_options = [
        SelectOption(label=color.capitalize(), value=color, emoji='🎨')
        for color in colors
    ]
    
    @ui.select(placeholder='複雑なリスト内包', options=color_options)
    async def color_select(self, inter: Interaction, select: ui.Select):
        pass


# Pattern 5: Variable decorator with options
class VariableDecoratorView(ui.LayoutView):
    row1 = ui.ActionRow()
    
    number_options = [SelectOption(label=f'{n}個', value=str(n)) for n in [1, 2, 5, 10]]
    
    @row1.select(
        cls=ui.Select,
        placeholder='変数デコレータ',
        options=number_options
    )
    async def number_select(self, inter: Interaction, select: ui.Select):
        pass


# Pattern 6: Mixed - some with options, some without
class MixedView(ui.View):
    opt1 = [SelectOption(label='Yes', value='y'), SelectOption(label='No', value='n')]
    
    @ui.select(placeholder='With options', options=opt1)
    async def select_with(self, inter: Interaction, select: ui.Select):
        pass
    
    @ui.button(label='Button')
    async def button_no_options(self, inter: Interaction, button: ui.Button):
        pass
