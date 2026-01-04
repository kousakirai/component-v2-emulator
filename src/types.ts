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
export type ComponentType =
  | 'button'
  | 'select_menu'
  | 'text_input'
  | 'modal'
  | 'text_display'
  | 'label'
  | 'separator'
  | 'thumbnail'
  | 'file'
  | 'media_gallery'
  | 'file_upload';

/**
 * View base type - supports View, Modal, and LayoutView
 */
export type ViewBaseType = 'View' | 'Modal' | 'LayoutView';

/**
 * Container types in discord.py UI hierarchy
 */
export type ContainerType = 'container' | 'section';

/**
 * Node types in the UI hierarchy
 */
export type NodeType = 'view' | 'modal' | 'container' | 'section' | 'actionrow' | 'item';

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
 * Container component properties
 */
export interface ContainerProperties {
  type: ContainerType;
  label?: string; // Section label
  line?: number;
}

/**
 * ActionRow properties with metadata
 */
export interface ActionRowProperties {
  row: number;
  maxItems: number; // Always 5 for Discord
  currentItems: number;
  line?: number;
}

/**
 * TextDisplay component properties
 */
export interface TextDisplayProperties {
  content: string;
  style?: 'plain' | 'bold' | 'italic';
}

/**
 * Label component properties
 */
export interface LabelProperties {
  text: string;
  for?: string; // Associated component ID
}

/**
 * Separator spacing types
 */
export type SeparatorSpacing = 'small' | 'medium' | 'large';

/**
 * Separator component properties
 */
export interface SeparatorProperties {
  spacing?: SeparatorSpacing;
}

/**
 * Thumbnail component properties
 */
export interface ThumbnailProperties {
  url: string;
  alt?: string;
  width?: number;
  height?: number;
}

/**
 * File component properties
 */
export interface FileProperties {
  filename: string;
  url?: string;
  size?: number;
}

/**
 * MediaGallery component properties
 */
export interface MediaGalleryProperties {
  items: any[]; // MediaGalleryItem array
}

/**
 * FileUpload component properties
 */
export interface FileUploadProperties {
  accept?: string[]; // Accepted file types
  multiple?: boolean;
}

/**
 * Union type for all component properties
 */
export type ComponentProperties =
  | ButtonProperties
  | SelectMenuProperties
  | TextInputProperties
  | ModalProperties
  | ContainerProperties
  | ActionRowProperties
  | TextDisplayProperties
  | LabelProperties
  | SeparatorProperties
  | ThumbnailProperties
  | FileProperties
  | MediaGalleryProperties
  | FileUploadProperties;

/**
 * Base component data structure
 */
export interface ComponentData {
  type: ComponentType;
  properties: ComponentProperties;
  line?: number;
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
 * Hierarchical node representing any level of UI structure
 */
export interface HierarchyNode {
  nodeType: NodeType;
  data: ComponentData | ContainerProperties | ActionRowProperties;
  children?: HierarchyNode[];
  line?: number;
}

/**
 * View/Modal/LayoutView structure information (Enhanced with hierarchy support)
 */
export interface ViewStructure {
  name: string;
  type: ViewBaseType; // View, Modal, or LayoutView
  line: number;
  components: ComponentData[]; // Legacy flat structure (for backward compatibility)
  children?: HierarchyNode[]; // New hierarchical structure
  callback?: string; // on_submit for modals
  isLayoutView?: boolean; // Flag for LayoutView
  requiresManualLayout?: boolean; // LayoutView requires manual layout
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
