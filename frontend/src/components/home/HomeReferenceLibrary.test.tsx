import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import HomeReferenceLibrary, { type PendingReferenceDocument } from './HomeReferenceLibrary';

describe('HomeReferenceLibrary', () => {
    const mockProps = {
        isSophistryMode: false,
        pendingDocuments: [],
        onDocumentsChange: vi.fn(),
    };

    const createMockFile = (name: string): File => {
        return new File(['test content'], name, { type: 'text/plain' });
    };

    beforeEach(() => {
        cleanup();
    });

    afterEach(() => {
        cleanup();
    });

    it('应该显示参考资料按钮', () => {
        render(<HomeReferenceLibrary {...mockProps} />);
        const button = screen.getByRole('button', { name: /参考资料/ });
        expect(button).toBeInTheDocument();
    });

    it('应该在有文档时显示数量', () => {
        const documents: PendingReferenceDocument[] = [
            {
                file: createMockFile('test.txt'),
                id: '1',
                name: 'test.txt',
                size: 100,
            },
        ];
        render(<HomeReferenceLibrary {...mockProps} pendingDocuments={documents} />);
        const button = screen.getByRole('button', { name: /参考资料/ });
        expect(button).toHaveTextContent(/参考资料 1/);
    });

    it('点击按钮应该打开弹出窗口', () => {
        render(<HomeReferenceLibrary {...mockProps} />);
        const button = screen.getByRole('button', { name: /参考资料/ });
        fireEvent.click(button);
        const popover = screen.getByRole('heading', { name: '参考资料' });
        expect(popover).toBeInTheDocument();
    });

    it('在诡辩模式下应该使用诡辩模式样式', () => {
        render(<HomeReferenceLibrary {...mockProps} isSophistryMode={true} />);
        const button = screen.getByRole('button', { name: /参考资料/ });
        expect(button).toHaveStyle({ color: 'var(--mode-sophistry-accent)' });
    });
});
