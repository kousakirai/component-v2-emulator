/**
 * Code generation for discord.py components
 */

import { ComponentData } from './types';

export interface CodeGenerationOptions {
    useDecorators: boolean;  // Use @discord.ui.button vs manual add_item
    indentation: string;     // Indentation string (e.g., '    ')
    className?: string;      // View class name
}

/**
 * Generate Python code for a Button component
 */
export function generateButtonCode(
    label: string,
    style: string,
    options: Partial<{
        custom_id: string;
        emoji: string;
        url: string;
        disabled: boolean;
        row: number;
    }> = {}
): string {
    const parts: string[] = [];
    
    parts.push(`discord.ui.Button(`);
    parts.push(`    label='${escapeString(label)}'`);
    parts.push(`    style=discord.ButtonStyle.${style}`);
    
    if (options.custom_id) {
        parts.push(`    custom_id='${escapeString(options.custom_id)}'`);
    }
    if (options.emoji) {
        parts.push(`    emoji='${escapeString(options.emoji)}'`);
    }
    if (options.url) {
        parts.push(`    url='${escapeString(options.url)}'`);
    }
    if (options.disabled !== undefined) {
        parts.push(`    disabled=${options.disabled}`);
    }
    if (options.row !== undefined) {
        parts.push(`    row=${options.row}`);
    }
    
    parts.push(`)`);
    
    return parts.join(',\n');
}

/**
 * Generate Python code for a SelectMenu component
 */
export function generateSelectMenuCode(
    placeholder: string,
    options: Array<{ label: string; value: string; description?: string; emoji?: string }>,
    config: Partial<{
        custom_id: string;
        min_values: number;
        max_values: number;
        disabled: boolean;
        row: number;
    }> = {}
): string {
    const parts: string[] = [];
    
    parts.push(`discord.ui.Select(`);
    parts.push(`    placeholder='${escapeString(placeholder)}'`);
    
    if (config.custom_id) {
        parts.push(`    custom_id='${escapeString(config.custom_id)}'`);
    }
    if (config.min_values !== undefined) {
        parts.push(`    min_values=${config.min_values}`);
    }
    if (config.max_values !== undefined) {
        parts.push(`    max_values=${config.max_values}`);
    }
    if (config.disabled !== undefined) {
        parts.push(`    disabled=${config.disabled}`);
    }
    if (config.row !== undefined) {
        parts.push(`    row=${config.row}`);
    }
    
    // Generate options
    parts.push(`    options=[`);
    options.forEach((opt, idx) => {
        const optParts: string[] = [];
        optParts.push(`        discord.SelectOption(`);
        optParts.push(`            label='${escapeString(opt.label)}'`);
        optParts.push(`            value='${escapeString(opt.value)}'`);
        if (opt.description) {
            optParts.push(`            description='${escapeString(opt.description)}'`);
        }
        if (opt.emoji) {
            optParts.push(`            emoji='${escapeString(opt.emoji)}'`);
        }
        optParts.push(`        )`);
        
        const suffix = idx < options.length - 1 ? ',' : '';
        parts.push(optParts.join(',\n') + suffix);
    });
    parts.push(`    ]`);
    parts.push(`)`);
    
    return parts.join(',\n');
}

/**
 * Generate Python code for a TextInput component
 */
export function generateTextInputCode(
    label: string,
    style: 'short' | 'paragraph',
    options: Partial<{
        custom_id: string;
        placeholder: string;
        default_value: string;
        required: boolean;
        min_length: number;
        max_length: number;
    }> = {}
): string {
    const parts: string[] = [];
    
    parts.push(`discord.ui.TextInput(`);
    parts.push(`    label='${escapeString(label)}'`);
    parts.push(`    style=discord.TextStyle.${style}`);
    
    if (options.custom_id) {
        parts.push(`    custom_id='${escapeString(options.custom_id)}'`);
    }
    if (options.placeholder) {
        parts.push(`    placeholder='${escapeString(options.placeholder)}'`);
    }
    if (options.default_value) {
        parts.push(`    default='${escapeString(options.default_value)}'`);
    }
    if (options.required !== undefined) {
        parts.push(`    required=${options.required}`);
    }
    if (options.min_length !== undefined) {
        parts.push(`    min_length=${options.min_length}`);
    }
    if (options.max_length !== undefined) {
        parts.push(`    max_length=${options.max_length}`);
    }
    
    parts.push(`)`);
    
    return parts.join(',\n');
}

/**
 * Generate a decorator-based button method
 */
export function generateButtonDecorator(
    methodName: string,
    label: string,
    style: string,
    options: Partial<{
        custom_id: string;
        emoji: string;
        row: number;
    }> = {}
): string {
    const parts: string[] = [];
    
    parts.push(`@discord.ui.button(label='${escapeString(label)}', style=discord.ButtonStyle.${style}`);
    
    if (options.custom_id) {
        parts.push(`, custom_id='${escapeString(options.custom_id)}'`);
    }
    if (options.emoji) {
        parts.push(`, emoji='${escapeString(options.emoji)}'`);
    }
    if (options.row !== undefined) {
        parts.push(`, row=${options.row}`);
    }
    
    parts.push(`)\n`);
    parts.push(`async def ${methodName}(self, interaction: discord.Interaction, button: discord.ui.Button):\n`);
    parts.push(`    await interaction.response.send_message('Button clicked!', ephemeral=True)`);
    
    return parts.join('');
}

/**
 * Generate a decorator-based select method
 */
export function generateSelectDecorator(
    methodName: string,
    placeholder: string,
    options: Array<{ label: string; value: string; emoji?: string }>,
    config: Partial<{
        min_values: number;
        max_values: number;
        row: number;
    }> = {}
): string {
    const parts: string[] = [];
    
    parts.push(`@discord.ui.select(placeholder='${escapeString(placeholder)}'`);
    
    if (config.min_values !== undefined) {
        parts.push(`, min_values=${config.min_values}`);
    }
    if (config.max_values !== undefined) {
        parts.push(`, max_values=${config.max_values}`);
    }
    if (config.row !== undefined) {
        parts.push(`, row=${config.row}`);
    }
    
    parts.push(`, options=[\n`);
    options.forEach((opt, idx) => {
        const suffix = idx < options.length - 1 ? ',' : '';
        const emojiPart = opt.emoji ? `, emoji='${escapeString(opt.emoji)}'` : '';
        parts.push(`        discord.SelectOption(label='${escapeString(opt.label)}', value='${escapeString(opt.value)}'${emojiPart})${suffix}\n`);
    });
    parts.push(`    ])\n`);
    parts.push(`async def ${methodName}(self, interaction: discord.Interaction, select: discord.ui.Select):\n`);
    parts.push(`    await interaction.response.send_message(f'Selected: {select.values}', ephemeral=True)`);
    
    return parts.join('');
}

/**
 * Generate a complete View class with components
 */
export function generateViewClass(
    className: string,
    components: ComponentData[],
    useDecorators: boolean = true
): string {
    const parts: string[] = [];
    
    parts.push(`class ${className}(discord.ui.View):`);
    
    if (!useDecorators && components.length === 0) {
        parts.push(`    pass`);
        return parts.join('\n');
    }
    
    if (useDecorators) {
        // Generate decorator-based methods
        components.forEach((comp, idx) => {
            parts.push('');
            const props = comp.properties as any;
            if (comp.type === 'button') {
                const methodName = props.custom_id ? sanitizeMethodName(props.custom_id) : `button_${idx + 1}`;
                parts.push(`    ${generateButtonDecorator(
                    methodName,
                    props.label || 'Button',
                    props.style || 'primary',
                    {
                        custom_id: props.custom_id,
                        emoji: props.emoji,
                        row: props.row
                    }
                ).replace(/\n/g, '\n    ')}`);
            } else if (comp.type === 'select_menu') {
                const methodName = props.custom_id ? sanitizeMethodName(props.custom_id) : `select_${idx + 1}`;
                const opts = props.options || [
                    { label: 'Option 1', value: 'opt1' },
                    { label: 'Option 2', value: 'opt2' }
                ];
                parts.push(`    ${generateSelectDecorator(
                    methodName,
                    props.placeholder || 'Select an option',
                    opts,
                    {
                        min_values: props.min_values,
                        max_values: props.max_values,
                        row: props.row
                    }
                ).replace(/\n/g, '\n    ')}`);
            }
        });
    } else {
        // Generate __init__ method with add_item
        parts.push(`    def __init__(self):`);
        parts.push(`        super().__init__()`);
        components.forEach(comp => {
            const props = comp.properties as any;
            if (comp.type === 'button') {
                parts.push(`        self.add_item(${generateButtonCode(
                    props.label || 'Button',
                    props.style || 'primary',
                    {
                        custom_id: props.custom_id,
                        emoji: props.emoji,
                        url: props.url,
                        disabled: props.disabled,
                        row: props.row
                    }
                ).replace(/\n/g, '\n        ')})`);
            }
        });
    }
    
    return parts.join('\n');
}

/**
 * Escape string for Python code
 */
function escapeString(str: string): string {
    return str
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t');
}

/**
 * Sanitize method name (remove invalid characters)
 */
function sanitizeMethodName(name: string): string {
    return name
        .replace(/[^a-zA-Z0-9_]/g, '_')
        .replace(/^[0-9]/, '_$&')
        .toLowerCase();
}
