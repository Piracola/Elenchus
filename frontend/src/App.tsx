import { useEffect } from 'react';
import ChatPanel from './components/ChatPanel';
import HomeView from './components/HomeView';
import SessionList from './components/sidebar/SessionList';
import { BackendHealthCheck } from './components/shared/BackendHealthCheck';
import ErrorBoundary from './components/shared/ErrorBoundary';
import { ToastContainer } from './components/shared/ToastContainer';
import { useToastState } from './hooks/useToastState';
import { useDebateStore } from './stores/debateStore';
import { useThemeStore } from './stores/themeStore';

function App() {
  const { theme, setTheme } = useThemeStore();
  const { currentSession } = useDebateStore();
  const { toasts, removeToast } = useToastState();

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
          <SessionList />

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
              <HomeView />
            ) : (
              <ChatPanel />
            )}
          </main>
        </div>
        <ToastContainer toasts={toasts} removeToast={removeToast} />
      </BackendHealthCheck>
    </ErrorBoundary>
  );
}

export default App;
