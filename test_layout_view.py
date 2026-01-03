import discord
from discord import ui
from discord import Interaction, SelectOption

class InfomationView(ui.LayoutView):
    def __init__(self):
        self.set_hours: int = 1
        self.set_loop: bool = False
        self.is_checked: bool = False

    hours_options = [SelectOption(label=f'{i}時間後', value=str(i)) for i in range(1,9)]
    loop_options = [SelectOption(label='はい', value='1'), SelectOption(label='いいえ', value='0')]


    container = ui.Container()
    container.add_item(ui.TextDisplay('# 公開求人タイマー'))
    sec1 = ui.Section()
    row1 = ui.ActionRow()
    @row1.select(
        cls=ui.Select,
        placeholder='1時間から9時間まで設定可能',
        options=hours_options,
        max_values=1,
        min_values=1
    )
    async def hours_callback(self, inter: Interaction, select: ui.Select):
        set_hours = int(select.values[0])
        await inter.response.send_message(f'{select.values[0]}時間に設定しました。', ephemeral=True)
    sec1.add_item([
        ui.TextDisplay('何時間後に通知しますか？'), row1()
        ]
    )

    sec2 = ui.Section()
    row2 = ui.ActionRow()
    @row2.select(
        cls=ui.Select,
        placeholder='有効化する場合は「はい」そうでない場合は「いいえ」を選んでください',
        options=loop_options,
        max_values=1,
        min_values=1
    )
    async def loop_callback(self, inter: Interaction, select: ui.Select):
        await inter.response.send_message('ループ設定をオフにしました。' if select.values[0] == '0' else 'ループ設定をオンにしました。', ephemeral=True)
    sec2.add_item([
            ui.TextDisplay('通知のループを有効化しますか？'),
            row2()
        ]
    )
    container.add_item([
        ui.Separator(),
        sec1(),
        ui.Separator(),
        sec2()
    ]
    )
    @ui.button(
        label='設定内容を確認'
    )
    async def setting_callback(self, inter: Interaction, button: ui.Button):
        await inter.response.send_message(f'設定時間：{self.set_hours}時間')
