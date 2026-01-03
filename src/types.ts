/**
 * Type definitions for discord.py ComponentV2 parser
 */

/**
 * Severity level for parse errors
 */
export type ErrorSeverity = 'error' | 'warning';

/**
 * Parse error information
 */
export interface ParseError {
  severity: ErrorSeverity;
  message: string;
  line?: number;
}

/**
 * Supported component types
 */
export type ComponentType = 'button' | 'select_menu' | 'text_input' | 'modal';

/**
 * Button style types (normalized to strings)
 */
export type ButtonStyle = 'primary' | 'secondary' | 'success' | 'danger' | 'link';

/**
 * Text input style types
 */
export type TextInputStyle = 'short' | 'paragraph';

/**
 * Button component properties
 */
export interface ButtonProperties {
  label?: string;
  style?: ButtonStyle;
  custom_id?: string;
  disabled?: boolean;
  emoji?: string;
  url?: string;
  row?: number;
  callback?: string; // Name of callback function
}

/**
 * Select option data
 */
export interface SelectOption {
  label: string;
  value: string;
  description?: string;
  emoji?: string;
  default?: boolean;
}

/**
 * Select menu component properties
 */
export interface SelectMenuProperties {
  custom_id?: string;
  placeholder?: string;
  min_values?: number;
  max_values?: number;
  disabled?: boolean;
  options?: SelectOption[];
  row?: number;
  callback?: string;
}

/**
 * Text input component properties
 */
export interface TextInputProperties {
  label?: string;
  style?: TextInputStyle;
  custom_id?: string;
  placeholder?: string;
  default?: string;
  required?: boolean;
  min_length?: number;
  max_length?: number;
  row?: number;
}

/**
 * Modal component properties
 */
export interface ModalProperties {
  title?: string;
  custom_id?: string;
  callback?: string;
}

/**
 * Union type for all component properties
 */
export type ComponentProperties = 
  | ButtonProperties 
  | SelectMenuProperties 
  | TextInputProperties 
  | ModalProperties;

/**
 * Generic component data structure
 */
export interface ComponentData {
  type: ComponentType;
  properties: ComponentProperties;
  line?: number; // Line number in source file
}

/**
 * Validation warning information
 */
export interface ValidationWarning {
  severity: 'warning' | 'error';
  message: string;
  componentIndex?: number;
  line?: number;
  code?: string; // Error code for categorization
}

/**
 * Result of parsing operation
 */
export interface ParseResult {
  components: ComponentData[];
  errors: ParseError[];
  warnings?: ValidationWarning[];
  views?: ViewStructure[];
}

/**
 * View/Modal structure information
 */
export interface ViewStructure {
  name: string;
  type: 'View' | 'Modal';
  line: number;
  components: ComponentData[];
  callback?: string; // on_submit for modals
}

/**
 * Action Row grouping
 */
export interface ActionRow {
  row: number;
  components: ComponentData[];
}

/**
 * Component parser interface for extensibility
 */
export interface ComponentParser {
  parse(filePath: string): Promise<ParseResult>;
}

/**
 * Code snippet information for interactive preview
 */
export interface CodeSnippet {
  functionName: string;
  startLine: number;
  endLine: number;
  code: string;
}
