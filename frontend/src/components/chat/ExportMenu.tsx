import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, FileText } from 'lucide-react';
import type { MarkdownExportCategory } from '../../types';

const MARKDOWN_EXPORT_OPTIONS: { value: MarkdownExportCategory; label: string }[] = [
  { value: 'group_discussion', label: '组内讨论' },
  { value: 'judge_messages', label: '裁判消息' },
  { value: 'jury_messages', label: '陪审团消息' },
  { value: 'consensus_summary', label: '共识收敛消息' },
];

type ExportMenuProps = {
  exportingFormat: 'markdown' | 'json' | null;
  markdownExportCategories: MarkdownExportCategory[];
  onToggleCategory: (category: MarkdownExportCategory) => void;
  onExport: (format: 'markdown' | 'json') => void;
};

export default function ExportMenu({
  exportingFormat,
  markdownExportCategories,
  onToggleCategory,
  onExport,
}: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        dropdownRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };
    // 延迟绑定，避免当前点击事件立即触发关闭
    const timerId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);
    return () => {
      clearTimeout(timerId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open]);

  // ESC 关闭
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  const handleTriggerClick = useCallback(() => {
    setOpen((prev) => !prev);
  }, []);

  const handleExportClick = useCallback(
    (format: 'markdown' | 'json') => {
      onExport(format);
      setOpen(false);
    },
    [onExport],
  );

  // 计算下拉菜单位置
  const getDropdownStyle = (): React.CSSProperties => {
    if (!triggerRef.current) {
      return {
        position: 'fixed',
        top: 0,
        left: 0,
        opacity: 0,
        pointerEvents: 'none',
      };
    }
    const rect = triggerRef.current.getBoundingClientRect();
    return {
      position: 'fixed',
      top: rect.bottom + 8,
      left: rect.left,
      minWidth: 240,
      zIndex: 9999,
    };
  };

  return (
    <>
      <button
        ref={triggerRef}
        onClick={handleTriggerClick}
        disabled={Boolean(exportingFormat)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '7px 12px',
          background: '#FFFFFF',
          color: '#1D1D1F',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-full)',
          cursor: exportingFormat ? 'not-allowed' : 'pointer',
          fontSize: '12px',
          fontWeight: 600,
          opacity: exportingFormat ? 0.7 : 1,
          transition: 'transform 0.15s ease, box-shadow 0.15s ease',
        }}
        onMouseEnter={(e) => {
          if (!exportingFormat) {
            e.currentTarget.style.transform = 'translateY(-1px)';
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = '';
          e.currentTarget.style.boxShadow = '';
        }}
        title="导出辩论记录"
      >
        <FileText size={14} />
        导出
        <ChevronDown
          size={12}
          style={{
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform var(--transition-fast)',
          }}
        />
      </button>

      {open &&
        createPortal(
          <div
            ref={dropdownRef}
            style={{
              ...getDropdownStyle(),
              padding: '14px',
              borderRadius: 'var(--radius-xl)',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              boxShadow: '0 10px 28px rgba(15, 23, 42, 0.14)',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            {/* 标题 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                导出辩论记录
              </span>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                选择导出格式与内容范围。
              </span>
            </div>

            {/* Markdown 部分 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Markdown
                </span>
                <button
                  onClick={() => handleExportClick('markdown')}
                  disabled={Boolean(exportingFormat)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '5px 10px',
                    background: 'var(--text-primary)',
                    color: 'var(--bg-primary)',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    cursor: exportingFormat ? 'not-allowed' : 'pointer',
                    fontSize: '11px',
                    fontWeight: 700,
                    opacity: exportingFormat ? 0.65 : 1,
                    transition: 'opacity 0.15s ease, transform 0.1s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!exportingFormat) {
                      e.currentTarget.style.opacity = '0.85';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.opacity = exportingFormat ? '0.65' : '1';
                  }}
                  onMouseDown={(e) => {
                    if (!exportingFormat) {
                      e.currentTarget.style.transform = 'scale(0.97)';
                    }
                  }}
                  onMouseUp={(e) => {
                    e.currentTarget.style.transform = '';
                  }}
                >
                  {exportingFormat === 'markdown' ? '导出中...' : '导出'}
                </button>
              </div>

              {/* Markdown 选项 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', paddingLeft: '2px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '11px',
                    color: 'var(--text-muted)',
                  }}
                >
                  <input type="checkbox" checked readOnly style={{ pointerEvents: 'none' }} />
                  <span>辩手发言（默认）</span>
                </div>
                {MARKDOWN_EXPORT_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '11px',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={markdownExportCategories.includes(option.value)}
                      onChange={() => onToggleCategory(option.value)}
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* 分隔线 */}
            <div style={{ height: '1px', background: 'var(--border-subtle)' }} />

            {/* JSON 部分 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  JSON
                </span>
                <button
                  onClick={() => handleExportClick('json')}
                  disabled={Boolean(exportingFormat)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '5px 10px',
                    background: 'var(--text-primary)',
                    color: 'var(--bg-primary)',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    cursor: exportingFormat ? 'not-allowed' : 'pointer',
                    fontSize: '11px',
                    fontWeight: 700,
                    opacity: exportingFormat ? 0.65 : 1,
                    transition: 'opacity 0.15s ease, transform 0.1s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!exportingFormat) {
                      e.currentTarget.style.opacity = '0.85';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.opacity = exportingFormat ? '0.65' : '1';
                  }}
                  onMouseDown={(e) => {
                    if (!exportingFormat) {
                      e.currentTarget.style.transform = 'scale(0.97)';
                    }
                  }}
                  onMouseUp={(e) => {
                    e.currentTarget.style.transform = '';
                  }}
                >
                  {exportingFormat === 'json' ? '导出中...' : '导出'}
                </button>
              </div>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', paddingLeft: '4px' }}>
                包含完整原始数据结构，适合程序处理。
              </span>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
