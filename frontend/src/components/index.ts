/**
 * Components barrel export file.
 * Re-exports all public components for cleaner imports.
 */

// Main views
export { default as ChatPanel } from './ChatPanel';
export { default as HomeView } from './HomeView';
export { default as ScorePanel } from './ScorePanel';

// Chat components
export { default as DebateControls } from './chat/DebateControls';
export { default as MessageRow } from './chat/MessageRow';
export { default as StatusBanner } from './chat/StatusBanner';

// Shared components
export { default as AgentConfigPanel } from './shared/AgentConfigPanel';
export { default as CustomSelect } from './shared/CustomSelect';
export { default as ErrorBoundary } from './shared/ErrorBoundary';

// Sidebar components
export { default as ModelConfigManager } from './sidebar/ModelConfigManager';
export { ProviderForm } from './sidebar/ProviderForm';
export { ProviderSidebar } from './sidebar/ProviderSidebar';
export { default as SessionList } from './sidebar/SessionList';
export { default as SettingsPanel } from './sidebar/SettingsPanel';
