/**
 * Vitest test setup file
 * Configures testing utilities and global test environment
 */
import '@testing-library/jest-dom/vitest'

if (typeof window !== 'undefined' && window.location?.href === 'about:blank') {
    window.history.replaceState({}, 'Elenchus Test', 'http://localhost/');
}
