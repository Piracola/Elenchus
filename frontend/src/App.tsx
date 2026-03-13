import { useEffect } from 'react';
import { ChatPanel } from './components';
import HomeView from './components/HomeView';
import SessionList from './components/sidebar/SessionList';
import { useThemeStore } from './stores/themeStore';
import { useDebateStore } from './stores/debateStore';

function App() {
  const { theme, setTheme } = useThemeStore();
  const { currentSessionId } = useDebateStore();

  useEffect(() => {
    // Ensure the HTML class matches the persisted theme on load
    setTheme(theme);
  }, [theme, setTheme]);

  return (
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
        }}
      >
        {!currentSessionId ? (
          <HomeView />
        ) : (
          <ChatPanel />
        )}
      </main>
    </div>
  );
}

export default App;
