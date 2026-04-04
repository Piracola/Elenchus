/**
 * Settings UI font size configuration.
 * Centralized control for all settings panel typography.
 * 
 * Usage: Pass the user's settingsFontSize value to createFonts() to get
 * font sizes derived from that base value. If no value is provided,
 * falls back to DEFAULT_SETTINGS_FONT_SIZE (13px).
 */

import { DEFAULT_SETTINGS_FONT_SIZE } from './display';

export interface SettingsFontSizes {
    // Base
    base: number;
    
    // Titles
    panelTitle: number;     // base + 7
    sectionTitle: number;   // base + 7
    subsectionTitle: number; // base + 3
    
    // Navigation
    navItem: number;        // base + 2
    
    // Labels & descriptions
    label: number;          // base
    description: number;    // base
    hint: number;           // base
    
    // Inputs
    input: number;          // base + 1
    textarea: number;       // base
    
    // Buttons
    button: number;         // base
    buttonSmall: number;    // base
    
    // Lists
    listItem: number;       // base
    listItemSmall: number;  // base - 1
    
    // Sidebar (ProviderSidebar)
    sidebarTitle: number;   // base + 3
    sidebarItem: number;    // base
    
    // Badges & tags
    badge: number;          // base
    
    // Spacing (derived from font size)
    spacingXs: string;      // ~6px
    spacingSm: string;      // ~10px
    spacingMd: string;      // ~18px
    spacingLg: string;      // ~20px
    spacingXl: string;      // ~24px
}

/**
 * Create font size configuration based on a base value.
 * All other sizes are derived from this base value.
 */
export function createSettingsFonts(baseFontSize?: number): SettingsFontSizes {
    const base = baseFontSize ?? DEFAULT_SETTINGS_FONT_SIZE;
    
    return {
        base,
        panelTitle: base + 7,
        sectionTitle: base + 7,
        subsectionTitle: base + 3,
        navItem: base + 2,
        label: base,
        description: base,
        hint: base,
        input: base + 1,
        textarea: base,
        button: base,
        buttonSmall: base,
        listItem: base,
        listItemSmall: Math.max(10, base - 1),
        sidebarTitle: base + 3,
        sidebarItem: base,
        badge: base,
        spacingXs: `${Math.round(base * 0.46)}px`,
        spacingSm: `${Math.round(base * 0.77)}px`,
        spacingMd: `${Math.round(base * 1.38)}px`,
        spacingLg: `${Math.round(base * 1.54)}px`,
        spacingXl: `${Math.round(base * 1.85)}px`,
    };
}

/**
 * Default settings fonts using DEFAULT_SETTINGS_FONT_SIZE (13px).
 * For user-configurable size, use createSettingsFonts(userSize) instead.
 */
export const SETTINGS_FONTS = createSettingsFonts();
