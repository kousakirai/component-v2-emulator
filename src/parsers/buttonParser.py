#!/usr/bin/env python3
"""
Discord.py ComponentV2 Parser
Analyzes Python AST to extract Button, SelectMenu, TextInput, and Modal components
"""

import ast
import json
import sys
import os
from typing import Any, Dict, List, Optional

# Add current directory to path for parseCache import
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:
    from parseCache import get_cache
    CACHE_AVAILABLE = True
except ImportError:
    CACHE_AVAILABLE = False


class ComponentVisitor(ast.NodeVisitor):
    """AST visitor to extract discord.py ComponentV2 elements"""
    
    def __init__(self):
        self.components: List[Dict[str, Any]] = []
        self.errors: List[Dict[str, Any]] = []
        self.callbacks: Dict[str, str] = {}  # Map custom_id or function name to callback
        self.views: List[Dict[str, Any]] = []  # View/Modal structures
        self.current_class: Optional[str] = None
        self.current_class_type: Optional[str] = None
        self.current_class_line: Optional[int] = None
        self.class_components: List[Dict[str, Any]] = []
        self.in_init_method: bool = False  # Track if we're inside __init__
        self.processed_nodes: set = set()  # Track processed AST nodes to avoid duplicates
        self.variables: Dict[str, ast.AST] = {}  # Track variable assignments for option arrays
        self.hierarchy_tracking: Dict[str, Dict[str, Any]] = {}  # Track container/section/row variables
        self.hierarchy_relationships: List[Dict[str, Any]] = []  # Track parent-child relationships
    
    def visit_Assign(self, node: ast.Assign) -> None:
        """Visit assignments to detect class variables and module-level components"""
        # Check each target in the assignment
        for target in node.targets:
            if isinstance(target, ast.Name):
                variable_name = target.id
                
                # Store variable assignment for later reference (e.g., options arrays)
                self.variables[variable_name] = node.value
                
                # Check if the value is a component instantiation
                if isinstance(node.value, ast.Call):
                    node_id = id(node.value)
                    if node_id not in self.processed_nodes:
                        self.processed_nodes.add(node_id)
                        if self._is_button_call(node.value):
                            self._extract_button_properties(node.value, node.lineno, callback=None, variable_name=variable_name)
                        elif self._is_select_menu_call(node.value):
                            self._extract_select_menu_properties(node.value, node.lineno, callback=None, variable_name=variable_name)
                        elif self._is_text_input_call(node.value):
                            self._extract_text_input_properties(node.value, node.lineno, callback=None, variable_name=variable_name)
                        elif self._is_container_call(node.value):
                            self._track_container(variable_name, node.value, node.lineno)
                        elif self._is_section_call(node.value):
                            self._track_section(variable_name, node.value, node.lineno)
                        elif self._is_action_row_call(node.value):
                            self._track_action_row(variable_name, node.value, node.lineno)
                        elif self._is_text_display_call(node.value):
                            self._extract_text_display_properties(node.value, node.lineno, variable_name=variable_name)
                        elif self._is_label_call(node.value):
                            self._extract_label_properties(node.value, node.lineno, variable_name=variable_name)
                        elif self._is_separator_call(node.value):
                            self._extract_separator_properties(node.value, node.lineno, variable_name=variable_name)
                        elif self._is_thumbnail_call(node.value):
                            self._extract_thumbnail_properties(node.value, node.lineno, variable_name=variable_name)
                        elif self._is_file_call(node.value):
                            self._extract_file_properties(node.value, node.lineno, variable_name=variable_name)
                        elif self._is_media_gallery_call(node.value):
                            self._extract_media_gallery_properties(node.value, node.lineno, variable_name=variable_name)
                        elif self._is_file_upload_call(node.value):
                            self._extract_file_upload_properties(node.value, node.lineno, variable_name=variable_name)
        
        self.generic_visit(node)
    
    def visit_AnnAssign(self, node: ast.AnnAssign) -> None:
        """Visit annotated assignments (e.g., name: Type = value)"""
        if isinstance(node.target, ast.Name):
            variable_name = node.target.id
            
            # Check if the value is a component instantiation
            if node.value and isinstance(node.value, ast.Call):
                node_id = id(node.value)
                if node_id not in self.processed_nodes:
                    self.processed_nodes.add(node_id)
                    if self._is_button_call(node.value):
                        self._extract_button_properties(node.value, node.lineno, variable_name)
                    elif self._is_select_menu_call(node.value):
                        self._extract_select_menu_properties(node.value, node.lineno, variable_name)
                    elif self._is_text_input_call(node.value):
                        self._extract_text_input_properties(node.value, node.lineno, variable_name)
        
        self.generic_visit(node)
    
    def visit_ClassDef(self, node: ast.ClassDef) -> None:
        """Visit class definitions to detect View/Modal/LayoutView classes"""
        # Check if class inherits from View, Modal, or LayoutView
        class_type = None
        is_layout_view = False
        for base in node.bases:
            base_name = self._get_base_name(base)
            if 'LayoutView' in base_name:
                class_type = 'LayoutView'
                is_layout_view = True
                break
            elif 'View' in base_name:
                class_type = 'View'
                break
            elif 'Modal' in base_name:
                class_type = 'Modal'
                break
        
        if class_type:
            # Save current context
            prev_class = self.current_class
            prev_class_type = self.current_class_type
            prev_class_line = self.current_class_line
            prev_class_components = self.class_components
            
            # Set new context
            self.current_class = node.name
            self.current_class_type = class_type
            self.current_class_line = node.lineno
            self.class_components = []
            
            # Visit class body
            self.generic_visit(node)
            
            # Build hierarchy for this view
            hierarchy = self._build_hierarchy()
            
            # Save view structure
            self.views.append({
                'name': self.current_class,
                'type': self.current_class_type,
                'line': self.current_class_line,
                'components': self.class_components.copy(),
                'children': hierarchy,
                'isLayoutView': is_layout_view,
                'requiresManualLayout': is_layout_view
            })
            
            # Clear hierarchy tracking for this class
            self.hierarchy_tracking.clear()
            self.hierarchy_relationships.clear()
            
            # Restore previous context
            self.current_class = prev_class
            self.current_class_type = prev_class_type
            self.current_class_line = prev_class_line
            self.class_components = prev_class_components
        else:
            self.generic_visit(node)
    
    def _get_base_name(self, node: ast.AST) -> str:
        """Get the name of a base class"""
        if isinstance(node, ast.Name):
            return node.id
        elif isinstance(node, ast.Attribute):
            return node.attr
        return ''
    
    def visit_Call(self, node: ast.Call) -> None:
        """Visit function calls to detect component instantiation and hierarchy methods"""
        # Check for add_item() calls in __init__
        if self.in_init_method and self._is_add_item_call(node):
            self._extract_add_item_component(node)
            self._track_hierarchy_call(node, 'add_item')
        # Check for add_section() calls
        elif self.in_init_method and self._is_hierarchy_method(node, 'add_section'):
            self._track_hierarchy_call(node, 'add_section')
        # Check for add_row() calls
        elif self.in_init_method and self._is_hierarchy_method(node, 'add_row'):
            self._track_hierarchy_call(node, 'add_row')
        # Check for append_item() calls
        elif self.in_init_method and self._is_hierarchy_method(node, 'append_item'):
            self._track_hierarchy_call(node, 'append_item')
        
        self.generic_visit(node)
    
    def _is_add_item_call(self, node: ast.Call) -> bool:
        """Check if the call is *.add_item() (self or any variable)"""
        if isinstance(node.func, ast.Attribute):
            if node.func.attr == 'add_item':
                return True
        return False
    
    def _extract_add_item_component(self, node: ast.Call) -> Optional[Dict[str, Any]]:
        """Extract component from add_item() or append_item() call and return the component data"""
        # The first argument should be the component
        component_data = None
        if len(node.args) > 0:
            arg = node.args[0]
            variable_name = None
            
            # Check if it's a variable reference
            if isinstance(arg, ast.Name):
                variable_name = arg.id
            
            if isinstance(arg, ast.Call):
                node_id = id(arg)
                if node_id not in self.processed_nodes:
                    self.processed_nodes.add(node_id)
                    if self._is_button_call(arg):
                        component_data = self._extract_button_properties(arg, node.lineno, variable_name=variable_name)
                    elif self._is_select_menu_call(arg):
                        component_data = self._extract_select_menu_properties(arg, node.lineno, variable_name=variable_name)
                    elif self._is_text_input_call(arg):
                        component_data = self._extract_text_input_properties(arg, node.lineno, variable_name=variable_name)
                    elif self._is_text_display_call(arg):
                        component_data = self._extract_text_display_properties(arg, node.lineno, variable_name=variable_name)
                    elif self._is_label_call(arg):
                        component_data = self._extract_label_properties(arg, node.lineno, variable_name=variable_name)
                    elif self._is_separator_call(arg):
                        component_data = self._extract_separator_properties(arg, node.lineno, variable_name=variable_name)
                    elif self._is_thumbnail_call(arg):
                        component_data = self._extract_thumbnail_properties(arg, node.lineno, variable_name=variable_name)
                    elif self._is_file_call(arg):
                        component_data = self._extract_file_properties(arg, node.lineno, variable_name=variable_name)
                    elif self._is_media_gallery_call(arg):
                        component_data = self._extract_media_gallery_properties(arg, node.lineno, variable_name=variable_name)
                    elif self._is_file_upload_call(arg):
                        component_data = self._extract_file_upload_properties(arg, node.lineno, variable_name=variable_name)
            elif isinstance(arg, ast.Name):
                # It's a variable reference - the component was created earlier
                # The tracking will happen in _track_hierarchy_call
                pass
        
        return component_data
    
    def visit_FunctionDef(self, node: ast.FunctionDef) -> None:
        """Visit function definitions to detect decorators"""
        callback_name = node.name
        
        # Check decorators
        for decorator in node.decorator_list:
            if isinstance(decorator, ast.Call):
                if self._is_button_decorator(decorator):
                    self._extract_button_properties(decorator, decorator.lineno, callback_name)
                elif self._is_select_decorator(decorator):
                    self._extract_select_menu_properties(decorator, decorator.lineno, callback_name)
        
        # Track if we're entering __init__ method
        prev_in_init = self.in_init_method
        if node.name == '__init__' and self.current_class:
            self.in_init_method = True
        
        self.generic_visit(node)
        
        # Restore previous state
        self.in_init_method = prev_in_init
    
    def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef) -> None:
        """Visit async function definitions to detect decorators"""
        callback_name = node.name
        
        # Check decorators
        for decorator in node.decorator_list:
            if isinstance(decorator, ast.Call):
                if self._is_button_decorator(decorator):
                    self._extract_button_properties(decorator, decorator.lineno, callback_name)
                elif self._is_select_decorator(decorator):
                    self._extract_select_menu_properties(decorator, decorator.lineno, callback_name)
        
        # Track if we're entering __init__ method
        prev_in_init = self.in_init_method
        if node.name == '__init__' and self.current_class:
            self.in_init_method = True
        
        self.generic_visit(node)
        
        # Restore previous state
        self.in_init_method = prev_in_init
    
    def _is_button_call(self, node: ast.Call) -> bool:
        """Check if the call is discord.ui.Button(), ui.Button(), or Button()"""
        if isinstance(node.func, ast.Attribute):
            if node.func.attr == 'Button':
                # Check for discord.ui.Button or ui.Button
                if isinstance(node.func.value, ast.Attribute):
                    # discord.ui.Button
                    if node.func.value.attr == 'ui':
                        return True
                elif isinstance(node.func.value, ast.Name):
                    # ui.Button
                    if node.func.value.id == 'ui':
                        return True
        elif isinstance(node.func, ast.Name):
            # Direct import: Button()
            if node.func.id == 'Button':
                return True
        return False
    
    def _is_button_decorator(self, node: ast.Call) -> bool:
        """Check if the decorator is @discord.ui.button, @ui.button, or @variable.button"""
        if isinstance(node.func, ast.Attribute):
            if node.func.attr == 'button':
                if isinstance(node.func.value, ast.Attribute):
                    # discord.ui.button
                    if node.func.value.attr == 'ui':
                        return True
                elif isinstance(node.func.value, ast.Name):
                    # ui.button or variable.button (e.g., @row1.button)
                    # Accept both ui.button and any variable.button pattern
                    return True
        return False
    
    def _is_select_menu_call(self, node: ast.Call) -> bool:
        """Check if the call is discord.ui.Select() or similar"""
        select_names = ['Select', 'StringSelect', 'UserSelect', 'RoleSelect', 'ChannelSelect']
        
        if isinstance(node.func, ast.Attribute):
            if node.func.attr in select_names:
                if isinstance(node.func.value, ast.Attribute):
                    if node.func.value.attr == 'ui':
                        return True
                elif isinstance(node.func.value, ast.Name):
                    if node.func.value.id == 'ui':
                        return True
        elif isinstance(node.func, ast.Name):
            # Direct import: Select()
            if node.func.id in select_names:
                return True
        return False
    
    def _is_select_decorator(self, node: ast.Call) -> bool:
        """Check if the decorator is @discord.ui.select, @ui.select, or @variable.select"""
        if isinstance(node.func, ast.Attribute):
            if node.func.attr in ['select', 'string_select', 'user_select', 'role_select', 'channel_select']:
                if isinstance(node.func.value, ast.Attribute):
                    if node.func.value.attr == 'ui':
                        return True
                elif isinstance(node.func.value, ast.Name):
                    # ui.select or variable.select (e.g., @row1.select, @row2.select)
                    # Accept both ui.select and any variable.select pattern
                    return True
        return False
    
    def _is_select_option_call(self, node: ast.Call) -> bool:
        """Check if the call is SelectOption()"""
        if isinstance(node.func, ast.Name):
            if node.func.id == 'SelectOption':
                return True
        elif isinstance(node.func, ast.Attribute):
            if node.func.attr == 'SelectOption':
                return True
        return False
    
    def _is_text_input_call(self, node: ast.Call) -> bool:
        """Check if the call is discord.ui.TextInput() or TextInput()"""
        if isinstance(node.func, ast.Attribute):
            if node.func.attr == 'TextInput':
                if isinstance(node.func.value, ast.Attribute):
                    if node.func.value.attr == 'ui':
                        return True
                elif isinstance(node.func.value, ast.Name):
                    if node.func.value.id == 'ui':
                        return True
        elif isinstance(node.func, ast.Name):
            # Direct import: TextInput()
            if node.func.id == 'TextInput':
                return True
        return False
    
    def _is_container_call(self, node: ast.Call) -> bool:
        """Check if the call is discord.ui.Container()"""
        if isinstance(node.func, ast.Attribute):
            if node.func.attr == 'Container':
                if isinstance(node.func.value, ast.Attribute):
                    if node.func.value.attr == 'ui':
                        return True
                elif isinstance(node.func.value, ast.Name):
                    if node.func.value.id == 'ui':
                        return True
        elif isinstance(node.func, ast.Name):
            if node.func.id == 'Container':
                return True
        return False
    
    def _is_section_call(self, node: ast.Call) -> bool:
        """Check if the call is discord.ui.Section()"""
        if isinstance(node.func, ast.Attribute):
            if node.func.attr == 'Section':
                if isinstance(node.func.value, ast.Attribute):
                    if node.func.value.attr == 'ui':
                        return True
                elif isinstance(node.func.value, ast.Name):
                    if node.func.value.id == 'ui':
                        return True
        elif isinstance(node.func, ast.Name):
            if node.func.id == 'Section':
                return True
        return False
    
    def _is_action_row_call(self, node: ast.Call) -> bool:
        """Check if the call is discord.ui.ActionRow()"""
        if isinstance(node.func, ast.Attribute):
            if node.func.attr == 'ActionRow':
                if isinstance(node.func.value, ast.Attribute):
                    if node.func.value.attr == 'ui':
                        return True
                elif isinstance(node.func.value, ast.Name):
                    if node.func.value.id == 'ui':
                        return True
        elif isinstance(node.func, ast.Name):
            if node.func.id == 'ActionRow':
                return True
        return False
    
    def _is_hierarchy_method(self, node: ast.Call, method_name: str) -> bool:
        """Check if the call is a hierarchy method (add_section, add_row, append_item)"""
        if isinstance(node.func, ast.Attribute):
            if node.func.attr == method_name:
                return True
        return False
    
    def _is_text_display_call(self, node: ast.Call) -> bool:
        """Check if the call is discord.ui.TextDisplay()"""
        if isinstance(node.func, ast.Attribute):
            if node.func.attr == 'TextDisplay':
                if isinstance(node.func.value, ast.Attribute):
                    if node.func.value.attr == 'ui':
                        return True
                elif isinstance(node.func.value, ast.Name):
                    if node.func.value.id == 'ui':
                        return True
        elif isinstance(node.func, ast.Name):
            if node.func.id == 'TextDisplay':
                return True
        return False
    
    def _is_label_call(self, node: ast.Call) -> bool:
        """Check if the call is discord.ui.Label()"""
        if isinstance(node.func, ast.Attribute):
            if node.func.attr == 'Label':
                if isinstance(node.func.value, ast.Attribute):
                    if node.func.value.attr == 'ui':
                        return True
                elif isinstance(node.func.value, ast.Name):
                    if node.func.value.id == 'ui':
                        return True
        elif isinstance(node.func, ast.Name):
            if node.func.id == 'Label':
                return True
        return False
    
    def _is_separator_call(self, node: ast.Call) -> bool:
        """Check if the call is discord.ui.Separator()"""
        if isinstance(node.func, ast.Attribute):
            if node.func.attr == 'Separator':
                if isinstance(node.func.value, ast.Attribute):
                    if node.func.value.attr == 'ui':
                        return True
                elif isinstance(node.func.value, ast.Name):
                    if node.func.value.id == 'ui':
                        return True
        elif isinstance(node.func, ast.Name):
            if node.func.id == 'Separator':
                return True
        return False
    
    def _is_thumbnail_call(self, node: ast.Call) -> bool:
        """Check if the call is discord.ui.Thumbnail()"""
        if isinstance(node.func, ast.Attribute):
            if node.func.attr == 'Thumbnail':
                if isinstance(node.func.value, ast.Attribute):
                    if node.func.value.attr == 'ui':
                        return True
                elif isinstance(node.func.value, ast.Name):
                    if node.func.value.id == 'ui':
                        return True
        elif isinstance(node.func, ast.Name):
            if node.func.id == 'Thumbnail':
                return True
        return False
    
    def _is_file_call(self, node: ast.Call) -> bool:
        """Check if the call is discord.ui.File()"""
        if isinstance(node.func, ast.Attribute):
            if node.func.attr == 'File':
                if isinstance(node.func.value, ast.Attribute):
                    if node.func.value.attr == 'ui':
                        return True
                elif isinstance(node.func.value, ast.Name):
                    if node.func.value.id == 'ui':
                        return True
        elif isinstance(node.func, ast.Name):
            if node.func.id == 'File':
                return True
        return False
    
    def _is_media_gallery_call(self, node: ast.Call) -> bool:
        """Check if the call is discord.ui.MediaGallery()"""
        if isinstance(node.func, ast.Attribute):
            if node.func.attr == 'MediaGallery':
                if isinstance(node.func.value, ast.Attribute):
                    if node.func.value.attr == 'ui':
                        return True
                elif isinstance(node.func.value, ast.Name):
                    if node.func.value.id == 'ui':
                        return True
        elif isinstance(node.func, ast.Name):
            if node.func.id == 'MediaGallery':
                return True
        return False
    
    def _is_file_upload_call(self, node: ast.Call) -> bool:
        """Check if the call is discord.ui.FileUpload()"""
        if isinstance(node.func, ast.Attribute):
            if node.func.attr == 'FileUpload':
                if isinstance(node.func.value, ast.Attribute):
                    if node.func.value.attr == 'ui':
                        return True
                elif isinstance(node.func.value, ast.Name):
                    if node.func.value.id == 'ui':
                        return True
        elif isinstance(node.func, ast.Name):
            if node.func.id == 'FileUpload':
                return True
        return False
    
    def _is_modal_call(self, node: ast.Call) -> bool:
        """Check if the call is discord.ui.Modal()"""
        if isinstance(node.func, ast.Attribute):
            if node.func.attr == 'Modal':
                if isinstance(node.func.value, ast.Attribute):
                    if node.func.value.attr == 'ui':
                        return True
                elif isinstance(node.func.value, ast.Name):
                    if node.func.value.id == 'ui':
                        return True
        return False
    
    def _extract_button_properties(self, call_node: ast.Call, line: Optional[int] = None, callback: Optional[str] = None, variable_name: Optional[str] = None) -> None:
        """Extract properties from Button instantiation or decorator"""
        properties: Dict[str, Any] = {}
        
        if line is None:
            line = call_node.lineno
        
        # Extract keyword arguments
        for keyword in call_node.keywords:
            arg_name = keyword.arg
            if arg_name in ['label', 'style', 'custom_id', 'disabled', 'emoji', 'url', 'row']:
                value = self._evaluate_value(keyword.value)
                if value is not None:
                    # Normalize ButtonStyle to string
                    if arg_name == 'style' and isinstance(value, str):
                        value = self._normalize_button_style(value)
                    properties[arg_name] = value
        
        if callback:
            properties['callback'] = callback
        
        button_data = {
            'type': 'button',
            'properties': properties,
            'line': line
        }
        
        self.components.append(button_data)
        
        # Add to current class if we're in one
        if self.current_class:
            self.class_components.append(button_data)
        
        # Track in hierarchy if variable name provided
        if variable_name:
            self.hierarchy_tracking[variable_name] = {
                'nodeType': 'item',
                'data': button_data,
                'line': line
            }
    
    def _evaluate_value(self, node: ast.AST) -> Optional[Any]:
        """Safely evaluate AST node to extract value"""
        try:
            # Handle constants (strings, numbers, booleans)
            if isinstance(node, ast.Constant):
                return node.value
            
            # Handle attribute access (e.g., discord.ButtonStyle.primary)
            elif isinstance(node, ast.Attribute):
                return self._evaluate_attribute(node)
            
            # Handle names (variables)
            elif isinstance(node, ast.Name):
                return f"<variable:{node.id}>"
            
        except Exception as e:
            self.errors.append({
                'severity': 'warning',
                'message': f'Could not evaluate value: {str(e)}',
                'line': getattr(node, 'lineno', None)
            })
        
        return None
    
    def _evaluate_attribute(self, node: ast.Attribute) -> str:
        """Evaluate attribute access (e.g., ButtonStyle.primary)"""
        parts = []
        current = node
        
        while isinstance(current, ast.Attribute):
            parts.insert(0, current.attr)
            current = current.value
        
        if isinstance(current, ast.Name):
            parts.insert(0, current.id)
        
        return '.'.join(parts)
    
    def _normalize_button_style(self, style: str) -> str:
        """Normalize ButtonStyle to simple string"""
        # Map: discord.ButtonStyle.primary -> primary
        # Also handle: ButtonStyle.primary, discord.ButtonStyle.blurple, etc.
        
        style_map = {
            'ButtonStyle.primary': 'primary',
            'ButtonStyle.secondary': 'secondary',
            'ButtonStyle.success': 'success',
            'ButtonStyle.green': 'success',  # Alias
            'ButtonStyle.danger': 'danger',
            'ButtonStyle.red': 'danger',  # Alias
            'ButtonStyle.link': 'link',
            'ButtonStyle.blurple': 'primary',  # Alias
            'ButtonStyle.grey': 'secondary',  # Alias
            'ButtonStyle.gray': 'secondary',  # Alias
        }
        
        # Try to find in map
        for pattern, normalized in style_map.items():
            if pattern in style:
                return normalized
        
        # Try direct mapping (in case it's just the value)
        simple_style = style.split('.')[-1].lower()
        if simple_style in ['primary', 'secondary', 'success', 'danger', 'link']:
            return simple_style
        elif simple_style == 'green':
            return 'success'
        elif simple_style == 'red':
            return 'danger'
        elif simple_style in ['grey', 'gray']:
            return 'secondary'
        elif simple_style == 'blurple':
            return 'primary'
        
        # Default to secondary if unknown
        return 'secondary'
    
    def _extract_select_menu_properties(self, call_node: ast.Call, line: Optional[int] = None, callback: Optional[str] = None, variable_name: Optional[str] = None) -> None:
        """Extract properties from SelectMenu instantiation or decorator"""
        properties: Dict[str, Any] = {}
        
        if line is None:
            line = call_node.lineno
        
        # Extract keyword arguments
        for keyword in call_node.keywords:
            arg_name = keyword.arg
            if arg_name in ['custom_id', 'placeholder', 'min_values', 'max_values', 'disabled', 'row']:
                value = self._evaluate_value(keyword.value)
                if value is not None:
                    properties[arg_name] = value
            elif arg_name == 'options':
                # Extract select options (handle both direct lists and variable references)
                options = self._extract_select_options(keyword.value)
                if options:
                    properties['options'] = options
        
        if callback:
            properties['callback'] = callback
        
        select_data = {
            'type': 'select_menu',
            'properties': properties,
            'line': line
        }
        
        self.components.append(select_data)
        
        # Add to current class if we're in one
        if self.current_class:
            self.class_components.append(select_data)
        
        # Track in hierarchy if variable name provided
        if variable_name:
            self.hierarchy_tracking[variable_name] = {
                'nodeType': 'item',
                'data': select_data,
                'line': line
            }
    
    def _extract_select_options(self, node: ast.AST) -> Optional[List[Dict[str, Any]]]:
        """Extract SelectOption objects from a list or variable reference"""
        # Handle variable reference (e.g., options=hours_options)
        if isinstance(node, ast.Name):
            variable_name = node.id
            if variable_name in self.variables:
                # Resolve the variable to its actual value
                node = self.variables[variable_name]
        
        # Handle ternary operator (e.g., options_a if condition else options_b)
        if isinstance(node, ast.IfExp):
            # Try to extract from both branches
            true_options = self._extract_select_options(node.body)
            false_options = self._extract_select_options(node.orelse)
            
            # Return whichever branch has options (prefer true branch)
            if true_options:
                return true_options
            elif false_options:
                return false_options
            return None
        
        # Handle list comprehension (e.g., [SelectOption(...) for i in range()])
        if isinstance(node, ast.ListComp):
            # For list comprehensions, extract the pattern from the element
            if isinstance(node.elt, ast.Call):
                # Try to detect SelectOption calls
                if self._is_select_option_call(node.elt):
                    # Extract what we can from the template
                    option_template = self._extract_single_select_option(node.elt)
                    if option_template:
                        # Return indicator that options are dynamically generated
                        # Include the template to show structure
                        return [option_template]
            return None
        
        if not isinstance(node, ast.List):
            return None
        
        options = []
        for element in node.elts:
            if isinstance(element, ast.Call):
                option = self._extract_single_select_option(element)
                if option:
                    options.append(option)
        
        return options if options else None
    
    def _extract_single_select_option(self, call_node: ast.Call) -> Optional[Dict[str, Any]]:
        """Extract a single SelectOption"""
        option_props = {}
        
        for keyword in call_node.keywords:
            arg_name = keyword.arg
            if arg_name in ['label', 'value', 'description', 'emoji', 'default']:
                value = self._evaluate_value(keyword.value)
                if value is not None:
                    option_props[arg_name] = value
                else:
                    # If we can't evaluate (e.g., f-string, function call), use placeholder
                    option_props[arg_name] = '<dynamic>'
        
        # If we found any properties, return the option
        # Even if values are dynamic, we know the structure exists
        return option_props if option_props else None
    
    def _extract_text_input_properties(self, call_node: ast.Call, line: Optional[int] = None, callback: Optional[str] = None, variable_name: Optional[str] = None) -> None:
        """Extract properties from TextInput instantiation"""
        properties: Dict[str, Any] = {}
        
        if line is None:
            line = call_node.lineno
        
        # Extract keyword arguments
        for keyword in call_node.keywords:
            arg_name = keyword.arg
            if arg_name in ['label', 'style', 'custom_id', 'placeholder', 'default', 'required', 'min_length', 'max_length', 'row']:
                value = self._evaluate_value(keyword.value)
                if value is not None:
                    # Normalize TextInputStyle
                    if arg_name == 'style' and isinstance(value, str):
                        value = self._normalize_text_input_style(value)
                    properties[arg_name] = value
        
        if callback:
            properties['callback'] = callback
        text_input_data = {
            'type': 'text_input',
            'properties': properties,
            'line': line
        }
        
        self.components.append(text_input_data)
        
        # Add to current class if we're in one
        if self.current_class:
            self.class_components.append(text_input_data)
        
        # Track in hierarchy if variable name provided
        if variable_name:
            self.hierarchy_tracking[variable_name] = {
                'nodeType': 'item',
                'data': text_input_data,
                'line': line
            }
    
    def _normalize_text_input_style(self, style: str) -> str:
        """Normalize TextInputStyle to simple string"""
        if 'short' in style.lower():
            return 'short'
        elif 'paragraph' in style.lower() or 'long' in style.lower():
            return 'paragraph'
        return 'short'
    
    def _extract_text_display_properties(self, call_node: ast.Call, line: Optional[int] = None, variable_name: Optional[str] = None) -> None:
        """Extract properties from TextDisplay instantiation"""
        properties: Dict[str, Any] = {}
        
        if line is None:
            line = call_node.lineno
        
        # Extract keyword arguments
        for keyword in call_node.keywords:
            arg_name = keyword.arg
            if arg_name in ['content', 'style']:
                value = self._evaluate_value(keyword.value)
                if value is not None:
                    properties[arg_name] = value
        
        text_display_data = {
            'type': 'text_display',
            'properties': properties,
            'line': line
        }
        
        self.components.append(text_display_data)
        
        # Add to current class if we're in one
        if self.current_class:
            self.class_components.append(text_display_data)
        
        # Track in hierarchy if variable name provided
        if variable_name:
            self.hierarchy_tracking[variable_name] = {
                'nodeType': 'item',
                'data': text_display_data,
                'line': line
            }
    
    def _extract_label_properties(self, call_node: ast.Call, line: Optional[int] = None, variable_name: Optional[str] = None) -> None:
        """Extract properties from Label instantiation"""
        properties: Dict[str, Any] = {}
        
        if line is None:
            line = call_node.lineno
        
        # Extract keyword arguments
        for keyword in call_node.keywords:
            arg_name = keyword.arg
            if arg_name in ['text', 'for']:
                value = self._evaluate_value(keyword.value)
                if value is not None:
                    properties[arg_name] = value
        
        label_data = {
            'type': 'label',
            'properties': properties,
            'line': line
        }
        
        self.components.append(label_data)
        
        # Add to current class if we're in one
        if self.current_class:
            self.class_components.append(label_data)
        
        # Track in hierarchy if variable name provided
        if variable_name:
            self.hierarchy_tracking[variable_name] = {
                'nodeType': 'item',
                'data': label_data,
                'line': line
            }
    
    def _extract_separator_properties(self, call_node: ast.Call, line: Optional[int] = None, variable_name: Optional[str] = None) -> None:
        """Extract properties from Separator instantiation"""
        properties: Dict[str, Any] = {}
        
        if line is None:
            line = call_node.lineno
        
        # Extract keyword arguments
        for keyword in call_node.keywords:
            arg_name = keyword.arg
            if arg_name == 'spacing':
                value = self._evaluate_value(keyword.value)
                if value is not None:
                    # Normalize spacing to lowercase
                    if isinstance(value, str):
                        spacing_lower = value.lower()
                        if 'small' in spacing_lower:
                            properties['spacing'] = 'small'
                        elif 'medium' in spacing_lower:
                            properties['spacing'] = 'medium'
                        elif 'large' in spacing_lower:
                            properties['spacing'] = 'large'
                        else:
                            properties['spacing'] = 'medium'
        
        separator_data = {
            'type': 'separator',
            'properties': properties,
            'line': line
        }
        
        self.components.append(separator_data)
        
        # Add to current class if we're in one
        if self.current_class:
            self.class_components.append(separator_data)
        
        # Track in hierarchy if variable name provided
        if variable_name:
            self.hierarchy_tracking[variable_name] = {
                'nodeType': 'item',
                'data': separator_data,
                'line': line
            }
    
    def _extract_thumbnail_properties(self, call_node: ast.Call, line: Optional[int] = None, variable_name: Optional[str] = None) -> None:
        """Extract properties from Thumbnail instantiation"""
        properties: Dict[str, Any] = {}
        
        if line is None:
            line = call_node.lineno
        
        # Extract keyword arguments
        for keyword in call_node.keywords:
            arg_name = keyword.arg
            if arg_name in ['url', 'alt', 'width', 'height']:
                value = self._evaluate_value(keyword.value)
                if value is not None:
                    properties[arg_name] = value
        
        thumbnail_data = {
            'type': 'thumbnail',
            'properties': properties,
            'line': line
        }
        
        self.components.append(thumbnail_data)
        
        # Add to current class if we're in one
        if self.current_class:
            self.class_components.append(thumbnail_data)
        
        # Track in hierarchy if variable name provided
        if variable_name:
            self.hierarchy_tracking[variable_name] = {
                'nodeType': 'item',
                'data': thumbnail_data,
                'line': line
            }
    
    def _extract_file_properties(self, call_node: ast.Call, line: Optional[int] = None, variable_name: Optional[str] = None) -> None:
        """Extract properties from File instantiation"""
        properties: Dict[str, Any] = {}
        
        if line is None:
            line = call_node.lineno
        
        # Extract keyword arguments
        for keyword in call_node.keywords:
            arg_name = keyword.arg
            if arg_name in ['filename', 'url', 'size']:
                value = self._evaluate_value(keyword.value)
                if value is not None:
                    properties[arg_name] = value
        
        # Check for positional arguments (filename is first)
        if len(call_node.args) > 0 and 'filename' not in properties:
            filename_val = self._evaluate_value(call_node.args[0])
            if filename_val is not None:
                properties['filename'] = filename_val
        
        file_data = {
            'type': 'file',
            'properties': properties,
            'line': line
        }
        
        self.components.append(file_data)
        
        # Add to current class if we're in one
        if self.current_class:
            self.class_components.append(file_data)
        
        # Track in hierarchy if variable name provided
        if variable_name:
            self.hierarchy_tracking[variable_name] = {
                'nodeType': 'item',
                'data': file_data,
                'line': line
            }
    
    def _extract_media_gallery_properties(self, call_node: ast.Call, line: Optional[int] = None, variable_name: Optional[str] = None) -> None:
        """Extract properties from MediaGallery instantiation"""
        properties: Dict[str, Any] = {}
        
        if line is None:
            line = call_node.lineno
        
        # Extract keyword arguments
        for keyword in call_node.keywords:
            arg_name = keyword.arg
            if arg_name == 'items':
                # Items is a list of media items
                # For simplicity, we'll store the count or structure info
                value = self._evaluate_value(keyword.value)
                if value is not None:
                    if isinstance(value, list):
                        properties['item_count'] = len(value)
                        properties['items'] = value
                    else:
                        properties['items'] = '<dynamic>'
        
        # Check for positional arguments (items is first)
        if len(call_node.args) > 0 and 'items' not in properties:
            items_val = self._evaluate_value(call_node.args[0])
            if items_val is not None:
                if isinstance(items_val, list):
                    properties['item_count'] = len(items_val)
                    properties['items'] = items_val
                else:
                    properties['items'] = '<dynamic>'
        
        media_gallery_data = {
            'type': 'media_gallery',
            'properties': properties,
            'line': line
        }
        
        self.components.append(media_gallery_data)
        
        # Add to current class if we're in one
        if self.current_class:
            self.class_components.append(media_gallery_data)
        
        # Track in hierarchy if variable name provided
        if variable_name:
            self.hierarchy_tracking[variable_name] = {
                'nodeType': 'item',
                'data': media_gallery_data,
                'line': line
            }
    
    def _extract_file_upload_properties(self, call_node: ast.Call, line: Optional[int] = None, variable_name: Optional[str] = None) -> None:
        """Extract properties from FileUpload instantiation"""
        properties: Dict[str, Any] = {}
        
        if line is None:
            line = call_node.lineno
        
        # Extract keyword arguments
        for keyword in call_node.keywords:
            arg_name = keyword.arg
            if arg_name in ['accept', 'multiple']:
                value = self._evaluate_value(keyword.value)
                if value is not None:
                    properties[arg_name] = value
        
        file_upload_data = {
            'type': 'file_upload',
            'properties': properties,
            'line': line
        }
        
        self.components.append(file_upload_data)
        
        # Add to current class if we're in one
        if self.current_class:
            self.class_components.append(file_upload_data)
        
        # Track in hierarchy if variable name provided
        if variable_name:
            self.hierarchy_tracking[variable_name] = {
                'nodeType': 'item',
                'data': file_upload_data,
                'line': line
            }
    
    def _track_container(self, variable_name: str, node: ast.Call, line: int) -> None:
        """Track Container instantiation"""
        properties = {'label': None}
        for keyword in node.keywords:
            if keyword.arg == 'label':
                properties['label'] = self._evaluate_value(keyword.value)
        
        self.hierarchy_tracking[variable_name] = {
            'nodeType': 'container',
            'type': 'container',
            'line': line,
            'properties': properties,
            'children': []
        }
    
    def _track_section(self, variable_name: str, node: ast.Call, line: int) -> None:
        """Track Section instantiation"""
        properties = {'label': None}
        for keyword in node.keywords:
            if keyword.arg == 'label':
                properties['label'] = self._evaluate_value(keyword.value)
        
        self.hierarchy_tracking[variable_name] = {
            'nodeType': 'section',
            'type': 'section',
            'line': line,
            'properties': properties,
            'children': []
        }
    
    def _track_action_row(self, variable_name: str, node: ast.Call, line: int) -> None:
        """Track ActionRow instantiation"""
        row_number = 0
        for keyword in node.keywords:
            if keyword.arg == 'row':
                row_val = self._evaluate_value(keyword.value)
                if isinstance(row_val, int):
                    row_number = row_val
        
        self.hierarchy_tracking[variable_name] = {
            'nodeType': 'actionrow',
            'row': row_number,
            'line': line,
            'children': []
        }
    
    def _track_hierarchy_call(self, node: ast.Call, method_name: str) -> None:
        """Track hierarchy relationship calls (add_item, add_section, add_row, append_item)"""
        # Get the parent variable name
        parent_var = None
        if isinstance(node.func, ast.Attribute):
            if isinstance(node.func.value, ast.Name):
                parent_var = node.func.value.id
        
        # Get the child argument
        child_var = None
        if len(node.args) > 0:
            arg = node.args[0]
            if isinstance(arg, ast.Name):
                child_var = arg.id
            elif isinstance(arg, ast.Call):
                # Inline component call - create a unique key and add to hierarchy_tracking
                child_var = f"_inline_{id(arg)}"
                # Get the most recently added component (should be the one we just extracted)
                if self.class_components:
                    last_component = self.class_components[-1]
                    self.hierarchy_tracking[child_var] = {
                        'nodeType': 'item',
                        'data': last_component,
                        'line': arg.lineno
                    }
        
        if parent_var and child_var:
            self.hierarchy_relationships.append({
                'parent': parent_var,
                'child': child_var,
                'method': method_name,
                'line': node.lineno
            })
    
    def _build_hierarchy(self) -> List[Dict[str, Any]]:
        """Build hierarchical structure from tracked relationships"""
        if not self.hierarchy_relationships:
            # No hierarchy detected, return empty list
            return []
        
        # Build a map of parent -> children
        parent_map: Dict[str, List[str]] = {}
        for rel in self.hierarchy_relationships:
            parent = rel['parent']
            child = rel['child']
            if parent not in parent_map:
                parent_map[parent] = []
            parent_map[parent].append(child)
        
        # Find root nodes (nodes that are added to 'self')
        roots = []
        for rel in self.hierarchy_relationships:
            if rel['parent'] == 'self':
                child = rel['child']
                if child in self.hierarchy_tracking:
                    roots.append(self._build_node_tree(child, parent_map))
        
        return roots
    
    def _build_node_tree(self, var_name: str, parent_map: Dict[str, List[str]]) -> Dict[str, Any]:
        """Recursively build a node tree"""
        # Get the node data
        node_data = self.hierarchy_tracking.get(var_name, {})
        
        # Build children
        children = []
        if var_name in parent_map:
            for child_var in parent_map[var_name]:
                if child_var in self.hierarchy_tracking:
                    child_node = self._build_node_tree(child_var, parent_map)
                    children.append(child_node)
        
        result = dict(node_data)
        if children:
            result['children'] = children
        elif not children and result.get('nodeType') in ['container', 'section', 'actionrow']:
            # These should have children but don't - add empty array
            result['children'] = []
        
        return result
    
    def _extract_modal_properties(self, call_node: ast.Call, line: Optional[int] = None) -> None:
        """Extract properties from Modal instantiation"""
        properties: Dict[str, Any] = {}
        
        if line is None:
            line = call_node.lineno
        
        # Extract keyword arguments
        for keyword in call_node.keywords:
            arg_name = keyword.arg
            if arg_name in ['title', 'custom_id']:
                value = self._evaluate_value(keyword.value)
                if value is not None:
                    properties[arg_name] = value
        
        modal_data = {
            'type': 'modal',
            'properties': properties,
            'line': line
        }
        
        self.components.append(modal_data)


def parse_file(file_path: str) -> Dict[str, Any]:
    """Parse a Python file and extract ComponentV2 elements"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            source_code = f.read()
        
        # Check cache if available
        if CACHE_AVAILABLE:
            cache = get_cache()
            cached_result = cache.get(file_path, source_code)
            if cached_result is not None:
                return cached_result
        
        tree = ast.parse(source_code, filename=file_path)
        visitor = ComponentVisitor()
        visitor.visit(tree)
        
        result = {
            'components': visitor.components,
            'errors': visitor.errors,
            'views': visitor.views
        }
        
        # Store in cache if available
        if CACHE_AVAILABLE:
            cache.set(file_path, source_code, result)
        
        return result
    
    except SyntaxError as e:
        error_msg = f'Syntax error: {str(e)}'
        if e.lineno:
            error_msg += f'\n  at line {e.lineno}'
        if e.offset:
            error_msg += f', column {e.offset}'
        if e.text:
            error_msg += f'\n  {e.text.strip()}'
            if e.offset:
                error_msg += f'\n  {" " * (e.offset - 1)}^'
        
        return {
            'components': [],
            'errors': [{
                'severity': 'error',
                'message': error_msg,
                'line': e.lineno
            }],
            'views': []
        }
    
    except ImportError as e:
        return {
            'components': [],
            'errors': [{
                'severity': 'error',
                'message': f'Import error: {str(e)}\n\nSuggestion: Make sure discord.py is installed in your Python environment.\nRun: pip install discord.py'
            }],
            'views': []
        }
    
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        
        # Extract useful information from traceback
        error_msg = f'Parse error: {str(e)}\n\n'
        
        # Add context from traceback
        if 'KeyError' in str(type(e)):
            error_msg += 'Suggestion: A required parameter may be missing.\n'
            error_msg += 'Ensure all components have required parameters (e.g., label for buttons).\n\n'
        elif 'AttributeError' in str(type(e)):
            error_msg += 'Suggestion: An attribute or method was not found.\n'
            error_msg += 'Check your discord.py syntax and component definitions.\n\n'
        elif 'TypeError' in str(type(e)):
            error_msg += 'Suggestion: An incorrect type was used.\n'
            error_msg += 'Verify parameter types in your component definitions.\n\n'
        
        error_msg += f'Traceback:\n{tb}'
        
        return {
            'components': [],
            'errors': [{
                'severity': 'error',
                'message': error_msg
            }],
            'views': []
        }


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({
            'components': [],
            'errors': [{
                'severity': 'error',
                'message': 'No file path provided'
            }]
        }))
        sys.exit(1)
    
    file_path = sys.argv[1]
    result = parse_file(file_path)
    print(json.dumps(result, indent=2))
