import { ComponentData, ValidationWarning, ActionRow } from './types';

/**
 * Discord API limits and validation
 */
const LIMITS = {
    MAX_BUTTONS_PER_MESSAGE: 25,
    MAX_COMPONENTS_PER_ROW: 5,
    MAX_ROWS: 5,
    MAX_BUTTON_LABEL_LENGTH: 80,
    MAX_CUSTOM_ID_LENGTH: 100,
    MAX_SELECT_OPTIONS: 25,
    MAX_SELECT_PLACEHOLDER_LENGTH: 150,
    MAX_TEXT_INPUT_LABEL_LENGTH: 45,
    MAX_TEXT_INPUT_PLACEHOLDER_LENGTH: 100,
    MAX_MODAL_TITLE_LENGTH: 45,
};

/**
 * Validate components against Discord API limits
 */
export function validateComponents(components: ComponentData[]): ValidationWarning[] {
    const warnings: ValidationWarning[] = [];

    // Group components by row
    const rows = groupByRow(components);

    // Validate total button count
    const buttonCount = components.filter(c => c.type === 'button').length;
    if (buttonCount > LIMITS.MAX_BUTTONS_PER_MESSAGE) {
        warnings.push({
            severity: 'error',
            message: `Too many buttons: ${buttonCount}/${LIMITS.MAX_BUTTONS_PER_MESSAGE}. Discord allows maximum 25 buttons per message.`,
            code: 'MAX_BUTTONS'
        });
    }

    // Validate row count
    if (rows.length > LIMITS.MAX_ROWS) {
        warnings.push({
            severity: 'error',
            message: `Too many rows: ${rows.length}/${LIMITS.MAX_ROWS}. Discord allows maximum 5 ActionRows.`,
            code: 'MAX_ROWS'
        });
    }

    // Validate components per row
    rows.forEach((row, index) => {
        if (row.components.length > LIMITS.MAX_COMPONENTS_PER_ROW) {
            const rowDesc = row.row === 0 
                ? `Row 0 (including components without explicit row parameter)` 
                : `Row ${row.row}`;
            warnings.push({
                severity: 'error',
                message: `${rowDesc}: Too many components (${row.components.length}/${LIMITS.MAX_COMPONENTS_PER_ROW}). Maximum 5 components per row.`,
                code: 'MAX_COMPONENTS_PER_ROW',
                line: row.components[0]?.line
            });
        }
    });

    // Validate individual components
    components.forEach((component, index) => {
        const props = component.properties as any;

        if (component.type === 'button') {
            // Validate button label length
            if (props.label && props.label.length > LIMITS.MAX_BUTTON_LABEL_LENGTH) {
                warnings.push({
                    severity: 'error',
                    message: `Button label too long: ${props.label.length}/${LIMITS.MAX_BUTTON_LABEL_LENGTH} characters.`,
                    code: 'BUTTON_LABEL_LENGTH',
                    componentIndex: index,
                    line: component.line
                });
            }

            // Validate custom_id length
            if (props.custom_id && props.custom_id.length > LIMITS.MAX_CUSTOM_ID_LENGTH) {
                warnings.push({
                    severity: 'error',
                    message: `Custom ID too long: ${props.custom_id.length}/${LIMITS.MAX_CUSTOM_ID_LENGTH} characters.`,
                    code: 'CUSTOM_ID_LENGTH',
                    componentIndex: index,
                    line: component.line
                });
            }

            // Validate link button has URL
            if (props.style === 'link' && !props.url) {
                warnings.push({
                    severity: 'error',
                    message: `Link button must have a URL.`,
                    code: 'LINK_NO_URL',
                    componentIndex: index,
                    line: component.line
                });
            }

            // Validate non-link button has custom_id or callback
            if (props.style !== 'link' && !props.custom_id && !props.callback) {
                warnings.push({
                    severity: 'warning',
                    message: `Button should have a custom_id or callback function.`,
                    code: 'NO_CUSTOM_ID',
                    componentIndex: index,
                    line: component.line
                });
            }

            // Validate button has label or emoji
            if (!props.label && !props.emoji) {
                warnings.push({
                    severity: 'error',
                    message: `Button must have a label or emoji.`,
                    code: 'NO_LABEL_OR_EMOJI',
                    componentIndex: index,
                    line: component.line
                });
            }
        }

        if (component.type === 'select_menu') {
            // Validate placeholder length
            if (props.placeholder && props.placeholder.length > LIMITS.MAX_SELECT_PLACEHOLDER_LENGTH) {
                warnings.push({
                    severity: 'error',
                    message: `Select menu placeholder too long: ${props.placeholder.length}/${LIMITS.MAX_SELECT_PLACEHOLDER_LENGTH} characters.`,
                    code: 'SELECT_PLACEHOLDER_LENGTH',
                    componentIndex: index,
                    line: component.line
                });
            }

            // Validate options count
            if (props.options && props.options.length > LIMITS.MAX_SELECT_OPTIONS) {
                warnings.push({
                    severity: 'error',
                    message: `Too many select options: ${props.options.length}/${LIMITS.MAX_SELECT_OPTIONS}.`,
                    code: 'MAX_SELECT_OPTIONS',
                    componentIndex: index,
                    line: component.line
                });
            }

            // Validate options exist
            if (!props.options || props.options.length === 0) {
                warnings.push({
                    severity: 'error',
                    message: `Select menu must have at least one option.`,
                    code: 'NO_OPTIONS',
                    componentIndex: index,
                    line: component.line
                });
            }

            // Validate min/max values
            if (props.min_values && props.max_values && props.min_values > props.max_values) {
                warnings.push({
                    severity: 'error',
                    message: `min_values (${props.min_values}) cannot be greater than max_values (${props.max_values}).`,
                    code: 'INVALID_MIN_MAX',
                    componentIndex: index,
                    line: component.line
                });
            }
        }

        if (component.type === 'text_input') {
            // Validate label length
            if (props.label && props.label.length > LIMITS.MAX_TEXT_INPUT_LABEL_LENGTH) {
                warnings.push({
                    severity: 'error',
                    message: `Text input label too long: ${props.label.length}/${LIMITS.MAX_TEXT_INPUT_LABEL_LENGTH} characters.`,
                    code: 'TEXT_INPUT_LABEL_LENGTH',
                    componentIndex: index,
                    line: component.line
                });
            }

            // Validate placeholder length
            if (props.placeholder && props.placeholder.length > LIMITS.MAX_TEXT_INPUT_PLACEHOLDER_LENGTH) {
                warnings.push({
                    severity: 'error',
                    message: `Text input placeholder too long: ${props.placeholder.length}/${LIMITS.MAX_TEXT_INPUT_PLACEHOLDER_LENGTH} characters.`,
                    code: 'TEXT_INPUT_PLACEHOLDER_LENGTH',
                    componentIndex: index,
                    line: component.line
                });
            }

            // Validate min/max length
            if (props.min_length && props.max_length && props.min_length > props.max_length) {
                warnings.push({
                    severity: 'error',
                    message: `min_length (${props.min_length}) cannot be greater than max_length (${props.max_length}).`,
                    code: 'INVALID_MIN_MAX_LENGTH',
                    componentIndex: index,
                    line: component.line
                });
            }
        }

        if (component.type === 'modal') {
            // Validate title length
            if (props.title && props.title.length > LIMITS.MAX_MODAL_TITLE_LENGTH) {
                warnings.push({
                    severity: 'error',
                    message: `Modal title too long: ${props.title.length}/${LIMITS.MAX_MODAL_TITLE_LENGTH} characters.`,
                    code: 'MODAL_TITLE_LENGTH',
                    componentIndex: index,
                    line: component.line
                });
            }
        }
    });

    return warnings;
}

/**
 * Group components by row number
 */
export function groupByRow(components: ComponentData[]): ActionRow[] {
    const rowMap = new Map<number, ComponentData[]>();

    components.forEach(component => {
        const props = component.properties as any;
        const row = props.row ?? 0; // Default to row 0

        if (!rowMap.has(row)) {
            rowMap.set(row, []);
        }
        rowMap.get(row)!.push(component);
    });

    // Convert to ActionRow array and sort by row number
    return Array.from(rowMap.entries())
        .map(([row, components]) => ({ row, components }))
        .sort((a, b) => a.row - b.row);
}

/**
 * Check accessibility issues
 */
export function checkAccessibility(components: ComponentData[]): ValidationWarning[] {
    const warnings: ValidationWarning[] = [];

    components.forEach((component, index) => {
        const props = component.properties as any;

        if (component.type === 'button') {
            // Warn if button has emoji but no label
            if (props.emoji && !props.label) {
                warnings.push({
                    severity: 'warning',
                    message: `Button has emoji but no label. Consider adding a label for accessibility.`,
                    code: 'EMOJI_ONLY_BUTTON',
                    componentIndex: index,
                    line: component.line
                });
            }

            // Warn if label is very short (might be unclear)
            if (props.label && props.label.length < 2) {
                warnings.push({
                    severity: 'warning',
                    message: `Button label is very short: "${props.label}". Consider using a more descriptive label.`,
                    code: 'SHORT_LABEL',
                    componentIndex: index,
                    line: component.line
                });
            }
        }
    });

    return warnings;
}
