import { useEffect, useState } from 'react';
import ChatPanel from './components/ChatPanel';
import HomeView from './components/HomeView';
import SessionList from './components/sidebar/SessionList';
import { BackendHealthCheck } from './components/shared/BackendHealthCheck';
import ErrorBoundary from './components/shared/ErrorBoundary';
import { ToastContainer } from './components/shared/ToastContainer';
import { useSessionViewState } from './hooks/useDebateViewState';
import { useToastState } from './hooks/useToastState';
import { useThemeStore } from './stores/themeStore';

function App() {
  const { theme, setTheme } = useThemeStore();
  const { currentSession } = useSessionViewState();
  const { toasts, removeToast } = useToastState();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  useEffect(() => {
    setTheme(theme);
  }, [theme, setTheme]);

  return (
    <ErrorBoundary>
      <BackendHealthCheck>
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            height: '100vh',
            width: '100vw',
            overflow: 'hidden',
            background: 'var(--bg-primary)',
            color: 'var(--text-primary)',
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
        <ToastContainer toasts={toasts} removeToast={removeToast} />
      </BackendHealthCheck>
    </ErrorBoundary>
  );
}

export default App;
