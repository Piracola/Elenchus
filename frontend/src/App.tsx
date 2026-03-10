import { Header, ChatPanel, ScorePanel } from './components';
import SessionList from './components/sidebar/SessionList';

function App() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden',
        background: 'var(--bg-primary)',
        color: 'var(--text-primary)',
      }}
    >
      <Header />
      <main
        style={{
          flex: 1,
          display: 'flex',
          minHeight: 0,
        }}
      >
        <SessionList />
        <ChatPanel />
        <ScorePanel />
      </main>
    </div>
  );
}

export default App;
