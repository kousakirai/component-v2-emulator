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
                            self._extract_button_properties(node.value, node.lineno, variable_name)
                        elif self._is_select_menu_call(node.value):
                            self._extract_select_menu_properties(node.value, node.lineno, variable_name)
                        elif self._is_text_input_call(node.value):
                            self._extract_text_input_properties(node.value, node.lineno, variable_name)
        
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
        """Visit class definitions to detect View/Modal classes"""
        # Check if class inherits from View or Modal
        class_type = None
        for base in node.bases:
            base_name = self._get_base_name(base)
            if 'View' in base_name or 'LayoutView' in base_name:
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
            
            # Save view structure
            self.views.append({
                'name': self.current_class,
                'type': self.current_class_type,
                'line': self.current_class_line,
                'components': self.class_components.copy()
            })
            
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
        """Visit function calls to detect component instantiation"""
        # Check for add_item() calls in __init__
        if self.in_init_method and self._is_add_item_call(node):
            self._extract_add_item_component(node)
        # All other Call nodes are handled by Assign/AnnAssign or decorators
        # No need to process them here to avoid duplicates
        
        self.generic_visit(node)
    
    def _is_add_item_call(self, node: ast.Call) -> bool:
        """Check if the call is self.add_item()"""
        if isinstance(node.func, ast.Attribute):
            if node.func.attr == 'add_item':
                if isinstance(node.func.value, ast.Name):
                    if node.func.value.id == 'self':
                        return True
        return False
    
    def _extract_add_item_component(self, node: ast.Call) -> None:
        """Extract component from add_item() call"""
        # The first argument should be the component
        if len(node.args) > 0:
            arg = node.args[0]
            if isinstance(arg, ast.Call):
                node_id = id(arg)
                if node_id not in self.processed_nodes:
                    self.processed_nodes.add(node_id)
                    if self._is_button_call(arg):
                        self._extract_button_properties(arg, node.lineno)
                    elif self._is_select_menu_call(arg):
                        self._extract_select_menu_properties(arg, node.lineno)
                    elif self._is_text_input_call(arg):
                        self._extract_text_input_properties(arg, node.lineno)
    
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
    
    def _extract_button_properties(self, call_node: ast.Call, line: Optional[int] = None, callback: Optional[str] = None) -> None:
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
    
    def _extract_select_menu_properties(self, call_node: ast.Call, line: Optional[int] = None, callback: Optional[str] = None) -> None:
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
    
    def _extract_text_input_properties(self, call_node: ast.Call, line: Optional[int] = None, callback: Optional[str] = None) -> None:
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
    
    def _normalize_text_input_style(self, style: str) -> str:
        """Normalize TextInputStyle to simple string"""
        if 'short' in style.lower():
            return 'short'
        elif 'paragraph' in style.lower() or 'long' in style.lower():
            return 'paragraph'
        return 'short'
    
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
