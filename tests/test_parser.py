#!/usr/bin/env python3
"""
Unit tests for buttonParser.py

Run: python3 -m pytest tests/test_parser.py -v
"""

import sys
import os
import unittest
from pathlib import Path

# Add src/parsers to path
sys.path.insert(0, str(Path(__file__).parent.parent / 'src' / 'parsers'))

from buttonParser import parse_file


class TestButtonParser(unittest.TestCase):
    """Test suite for component detection patterns"""

    def setUp(self):
        """Set up test fixtures"""
        self.test_dir = Path(__file__).parent / 'fixtures'
        self.test_dir.mkdir(exist_ok=True)

    def tearDown(self):
        """Clean up test files"""
        if self.test_dir.exists():
            for file in self.test_dir.glob('*.py'):
                file.unlink()

    def create_test_file(self, content: str, filename: str = 'test.py') -> Path:
        """Create a temporary test file"""
        file_path = self.test_dir / filename
        file_path.write_text(content)
        return file_path

    def test_decorator_pattern(self):
        """Test @ui.button decorator detection"""
        content = """
import discord
from discord import ui

class MyView(ui.View):
    @ui.button(label='Test Button')
    async def test_btn(self, interaction, button):
        pass
"""
        file_path = self.create_test_file(content)
        result = parse_file(str(file_path))
        
        self.assertEqual(len(result['components']), 1)
        self.assertEqual(result['components'][0]['type'], 'button')
        self.assertEqual(result['components'][0]['properties']['label'], 'Test Button')

    def test_class_variable_pattern(self):
        """Test class variable Button(...) detection"""
        content = """
import discord
from discord.ui import View, Button

class MyView(View):
    my_button = Button(label='Class Button', style=discord.ButtonStyle.primary)
"""
        file_path = self.create_test_file(content)
        result = parse_file(str(file_path))
        
        self.assertEqual(len(result['components']), 1)
        self.assertEqual(result['components'][0]['type'], 'button')
        self.assertEqual(result['components'][0]['properties']['label'], 'Class Button')

    def test_add_item_pattern(self):
        """Test add_item(Button(...)) detection"""
        content = """
import discord
from discord.ui import View, Button

class MyView(View):
    def __init__(self):
        super().__init__()
        self.add_item(Button(label='Added Button'))
"""
        file_path = self.create_test_file(content)
        result = parse_file(str(file_path))
        
        self.assertEqual(len(result['components']), 1)
        self.assertEqual(result['components'][0]['type'], 'button')
        self.assertEqual(result['components'][0]['properties']['label'], 'Added Button')

    def test_variable_decorator_pattern(self):
        """Test @row1.button variable decorator detection"""
        content = """
import discord
from discord import ui

class LayoutView(ui.View):
    row1 = ui.ActionRow()
    row2 = ui.ActionRow()
    
    @row1.button(label='Row 1 Button')
    async def btn1(self, interaction, button):
        pass
    
    @row2.select(placeholder='Row 2 Select')
    async def sel1(self, interaction, select):
        pass
"""
        file_path = self.create_test_file(content)
        result = parse_file(str(file_path))
        
        self.assertEqual(len(result['components']), 2)
        self.assertEqual(result['components'][0]['type'], 'button')
        self.assertEqual(result['components'][0]['type'], 'select_menu')

    def test_select_options_variable(self):
        """Test SelectMenu options from variable reference"""
        content = """
import discord
from discord.ui import View, Select, SelectOption

class MyView(View):
    options = [
        SelectOption(label='Option 1', value='1'),
        SelectOption(label='Option 2', value='2')
    ]
    
    my_select = Select(placeholder='Choose', options=options)
"""
        file_path = self.create_test_file(content)
        result = parse_file(str(file_path))
        
        self.assertEqual(len(result['components']), 1)
        self.assertEqual(result['components'][0]['type'], 'select_menu')
        self.assertEqual(len(result['components'][0]['properties'].get('options', [])), 2)

    def test_select_options_list_comprehension(self):
        """Test SelectMenu options from list comprehension"""
        content = """
import discord
from discord.ui import View, Select, SelectOption

class MyView(View):
    my_select = Select(
        placeholder='Numbers',
        options=[SelectOption(label=f'Number {i}', value=str(i)) for i in range(5)]
    )
"""
        file_path = self.create_test_file(content)
        result = parse_file(str(file_path))
        
        self.assertEqual(len(result['components']), 1)
        self.assertEqual(result['components'][0]['type'], 'select_menu')
        # List comprehension should generate placeholder options
        options = result['components'][0]['properties'].get('options', [])
        self.assertGreater(len(options), 0)

    def test_select_options_ternary(self):
        """Test SelectMenu options from ternary operator"""
        content = """
import discord
from discord.ui import View, Select, SelectOption

class MyView(View):
    opt1 = [SelectOption(label='A', value='a')]
    opt2 = [SelectOption(label='B', value='b')]
    condition = True
    
    my_select = Select(
        placeholder='Choose',
        options=opt1 if condition else opt2
    )
"""
        file_path = self.create_test_file(content)
        result = parse_file(str(file_path))
        
        self.assertEqual(len(result['components']), 1)
        self.assertEqual(result['components'][0]['type'], 'select_menu')
        # Should resolve at least one branch
        self.assertGreater(len(result['components'][0]['properties'].get('options', [])), 0)

    def test_row_parameter(self):
        """Test row parameter extraction"""
        content = """
import discord
from discord import ui

class MyView(ui.View):
    @ui.button(label='Row 0', row=0)
    async def btn0(self, interaction, button): pass
    
    @ui.button(label='Row 1', row=1)
    async def btn1(self, interaction, button): pass
"""
        file_path = self.create_test_file(content)
        result = parse_file(str(file_path))
        
        self.assertEqual(len(result['components']), 2)
