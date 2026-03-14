import { useEffect } from 'react';
import { ChatPanel } from './components';
import HomeView from './components/HomeView';
import SessionList from './components/sidebar/SessionList';
import { useThemeStore } from './stores/themeStore';
import { useDebateStore } from './stores/debateStore';
import ErrorBoundary from './components/shared/ErrorBoundary';

function App() {
  const { theme, setTheme } = useThemeStore();
  const { currentSessionId } = useDebateStore();

  useEffect(() => {
    setTheme(theme);
  }, [theme, setTheme]);

  return (
    <ErrorBoundary>
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
          {!currentSessionId ? (
            <HomeView />
          ) : (
            <ChatPanel />
          )}
        </main>
      </div>
    </ErrorBoundary>
  );
}

export default App;
