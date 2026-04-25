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

function App() {
  const { theme, setTheme } = useThemeStore();
  const { currentSession } = useSessionViewState();
  const { toasts, removeToast } = useToastState();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const { demoMode, isAdmin, initialized, fetchModeStatus, setIsAdmin } = useDemoModeStore();
  const [showAdminLogin, setShowAdminLogin] = useState(false);

  useEffect(() => {
    setTheme(theme);
  }, [theme, setTheme]);

  useEffect(() => {
    fetchModeStatus();
  }, [fetchModeStatus]);

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
                background: bannerColor,
                color: 'white',
                padding: '6px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '13px',
                fontWeight: 500,
              }}
            >
              <span>{bannerText}</span>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                {!isAdmin && (
                  <button
                    onClick={() => setShowAdminLogin(true)}
                    style={{
                      background: 'rgba(255,255,255,0.15)',
                      border: 'none',
                      color: 'white',
                      padding: '2px 10px',
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
                      background: 'rgba(255,255,255,0.15)',
                      border: 'none',
                      color: 'white',
                      padding: '2px 10px',
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
              <SessionList onCollapse={() => setIsSidebarCollapsed(true)} />
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
