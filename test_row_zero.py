"""Test row=0 validation issue"""
import discord
from discord import ui, Interaction

class RowZeroView(ui.View):
    # Row 0に明示的に配置（2個）
    @ui.button(label='Button 1', row=0)
    async def btn1(self, inter: Interaction, button: ui.Button):
        pass
    
    @ui.button(label='Button 2', row=0)
    async def btn2(self, inter: Interaction, button: ui.Button):
        pass
    
    # rowを指定しない（デフォルトで0になる - 3個）
    @ui.button(label='Button 3')
    async def btn3(self, inter: Interaction, button: ui.Button):
        pass
    
    @ui.button(label='Button 4')
    async def btn4(self, inter: Interaction, button: ui.Button):
        pass
    
    @ui.button(label='Button 5')
    async def btn5(self, inter: Interaction, button: ui.Button):
        pass
    
    # 合計5個がrow=0に配置される（これは有効）


class RowZeroOverflowView(ui.View):
    # Row 0に6個配置（オーバーフロー）
    @ui.button(label='Button 1', row=0)
    async def btn1(self, inter: Interaction, button: ui.Button):
        pass
    
    @ui.button(label='Button 2', row=0)
    async def btn2(self, inter: Interaction, button: ui.Button):
        pass
    
    @ui.button(label='Button 3', row=0)
    async def btn3(self, inter: Interaction, button: ui.Button):
        pass
    
    @ui.button(label='Button 4')  # デフォルト = row 0
    async def btn4(self, inter: Interaction, button: ui.Button):
        pass
    
    @ui.button(label='Button 5')  # デフォルト = row 0
    async def btn5(self, inter: Interaction, button: ui.Button):
        pass
    
    @ui.button(label='Button 6')  # デフォルト = row 0 → 6個目でエラー
    async def btn6(self, inter: Interaction, button: ui.Button):
        pass
