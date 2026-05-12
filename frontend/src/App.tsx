import { useEffect, useState } from 'react';
import ChatPanel from './components/ChatPanel';
import HomeView from './components/HomeView';
import SessionList from './components/sidebar/SessionList';
import { BackendHealthCheck } from './components/shared/BackendHealthCheck';
import ErrorBoundary from './components/shared/ErrorBoundary';
import { ToastContainer } from './components/shared/ToastContainer';
import AdminLoginModal from './components/AdminLoginModal';
import { useSessionViewState } from './hooks/useDebateViewState';
import { useToastState } from './hooks/useToastState';
import { useThemeStore } from './stores/themeStore';
import { useDemoModeStore } from './stores/demoModeStore';

const MOBILE_SIDEBAR_BREAKPOINT = 760;

function isMobileSidebarViewport() {
  return typeof window !== 'undefined' && window.innerWidth < MOBILE_SIDEBAR_BREAKPOINT;
}

function App() {
  const { theme, setTheme } = useThemeStore();
  const { currentSession } = useSessionViewState();
  const { toasts, removeToast } = useToastState();
  const [isNarrowViewport, setIsNarrowViewport] = useState(isMobileSidebarViewport);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(isMobileSidebarViewport);
  const { demoMode, isAdmin, initialized, fetchModeStatus, setIsAdmin } = useDemoModeStore();
  const [showAdminLogin, setShowAdminLogin] = useState(false);

  useEffect(() => {
    setTheme(theme);
  }, [theme, setTheme]);

  useEffect(() => {
    fetchModeStatus();
  }, [fetchModeStatus]);

  useEffect(() => {
    const handleResize = () => {
      const nextIsNarrow = isMobileSidebarViewport();
      setIsNarrowViewport(nextIsNarrow);
      if (nextIsNarrow) {
        setIsSidebarCollapsed(true);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const bannerText = isAdmin
    ? '管理员模式 — 完整权限'
    : demoMode
    ? '演示模式 — 所有辩论公开共享，部分功能受限'
    : null;

  const bannerColor = isAdmin ? 'var(--color-green-600)' : 'var(--color-amber-600)';

  const handleAdminLogout = async () => {
    try {
      await fetch('/api/admin/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch { /* ignore */ }
    setIsAdmin(false);
    window.location.reload();
  };

  return (
    <ErrorBoundary>
      <BackendHealthCheck>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100vh',
            width: '100vw',
            overflow: 'hidden',
            background: 'var(--bg-primary)',
            color: 'var(--text-primary)',
          }}
        >
          {/* Demo/Admin Banner */}
          {initialized && bannerText && (
            <div
              style={{
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                padding: '8px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                fontSize: '13px',
                fontWeight: 500,
                borderBottom: '1px solid var(--border-subtle)',
                minWidth: 0,
              }}
            >
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  minWidth: 0,
                }}
              >
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: 'var(--radius-full)',
                    background: bannerColor,
                    flexShrink: 0,
                  }}
                />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {bannerText}
                </span>
              </span>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
                {!isAdmin && (
                  <button
                    onClick={() => setShowAdminLogin(true)}
                    style={{
                      background: 'var(--bg-tertiary)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-primary)',
                      padding: '4px 10px',
                      borderRadius: 'var(--radius-md)',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: 600,
                    }}
                  >
                    管理员登录
                  </button>
                )}
                {isAdmin && (
                  <button
                    onClick={handleAdminLogout}
                    style={{
                      background: 'var(--bg-tertiary)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-primary)',
                      padding: '4px 10px',
                      borderRadius: 'var(--radius-md)',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: 600,
                    }}
                  >
                    退出管理员模式
                  </button>
                )}
              </div>
            </div>
          )}

          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              flex: 1,
              overflow: 'hidden',
            }}
          >
            {!isSidebarCollapsed && (
              isNarrowViewport ? (
                <>
                  <div
                    onClick={() => setIsSidebarCollapsed(true)}
                    style={{
                      position: 'fixed',
                      inset: 0,
                      background: 'rgba(0, 0, 0, 0.28)',
                      zIndex: 40,
                    }}
                  />
                  <div
                    style={{
                      position: 'fixed',
                      top: 0,
                      bottom: 0,
                      left: 0,
                      zIndex: 50,
                      width: 'min(320px, 86vw)',
                      maxWidth: '100vw',
                    }}
                  >
                    <SessionList onCollapse={() => setIsSidebarCollapsed(true)} />
                  </div>
                </>
              ) : (
                <SessionList onCollapse={() => setIsSidebarCollapsed(true)} />
              )
            )}

            <main
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                minWidth: 0,
                overflow: 'hidden',
                background: 'var(--bg-primary)',
              }}
            >
              {!currentSession ? (
                <HomeView
                  isSidebarCollapsed={isSidebarCollapsed}
                  onExpandSidebar={() => setIsSidebarCollapsed(false)}
                />
              ) : (
                <ChatPanel
                  isSidebarCollapsed={isSidebarCollapsed}
                  onExpandSidebar={() => setIsSidebarCollapsed(false)}
                />
              )}
            </main>
          </div>
        </div>
        <ToastContainer toasts={toasts} removeToast={removeToast} />
        <AdminLoginModal
          isOpen={showAdminLogin}
          onClose={() => setShowAdminLogin(false)}
        />
      </BackendHealthCheck>
    </ErrorBoundary>
  );
}

export default App;
