import { useEffect, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import ChatPanel from './components/ChatPanel';
import HomeView from './components/HomeView';
import SessionList from './components/sidebar/SessionList';
import { BackendHealthCheck } from './components/shared/BackendHealthCheck';
import ErrorBoundary from './components/shared/ErrorBoundary';
import { ToastContainer } from './components/shared/ToastContainer';
import { useSessionViewState } from './hooks/useDebateViewState';
import { useToastState } from './hooks/useToastState';
import { useThemeStore } from './stores/themeStore';
import { BACKDROP_MOTION, TRANSITION } from './config/motion';

const MOBILE_SIDEBAR_BREAKPOINT = 760;
/** Kept in one place: the drawer's resting width and its off-screen offset must agree. */
const DESKTOP_SIDEBAR_WIDTH = 320;
const previewSafeMotion = import.meta.env.VITE_ELENCHUS_PREVIEW_SAFE_MOTION === '1';

function isMobileSidebarViewport() {
  return typeof window !== 'undefined' && window.innerWidth < MOBILE_SIDEBAR_BREAKPOINT;
}

function App() {
  const { theme, setTheme } = useThemeStore();
  const { currentSession } = useSessionViewState();
  const { toasts, removeToast } = useToastState();
  const [isNarrowViewport, setIsNarrowViewport] = useState(isMobileSidebarViewport);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(isMobileSidebarViewport);

  useEffect(() => {
    setTheme(theme);
  }, [theme, setTheme]);

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

  return (
    <MotionConfig reducedMotion={previewSafeMotion ? 'always' : 'user'}>
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
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              flex: 1,
              overflow: 'hidden',
            }}
          >
            <AnimatePresence initial={false}>
              {!isSidebarCollapsed && (
                isNarrowViewport ? (
                  <>
                    <motion.div
                      key="mobile-sidebar-backdrop"
                      {...BACKDROP_MOTION}
                      onClick={() => setIsSidebarCollapsed(true)}
                      style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(0, 0, 0, 0.28)',
                        zIndex: 40,
                      }}
                    />
                    {/* A drawer has to arrive from the edge it is anchored to; fading
                        it in place gave no sense of where it came from. */}
                    <motion.div
                      key="mobile-sidebar-sheet"
                      initial={{ x: '-100%', opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      exit={{ x: '-100%', opacity: 0 }}
                      transition={TRANSITION.slow}
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
                      <SessionList onCollapse={() => setIsSidebarCollapsed(true)} fluidWidth />
                    </motion.div>
                  </>
                ) : (
                  // Slides on `x` rather than `width`: animating width relaid out the
                  // whole chat transcript on every frame. The resting width is now a
                  // plain style, so the layout is identical once at rest.
                  <motion.div
                    key="desktop-sidebar"
                    initial={{ x: -DESKTOP_SIDEBAR_WIDTH, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: -DESKTOP_SIDEBAR_WIDTH, opacity: 0 }}
                    transition={TRANSITION.slow}
                    style={{
                      width: DESKTOP_SIDEBAR_WIDTH,
                      flexShrink: 0,
                      minWidth: 0,
                      height: '100%',
                      overflow: 'hidden',
                    }}
                  >
                    <SessionList onCollapse={() => setIsSidebarCollapsed(true)} fluidWidth />
                  </motion.div>
                )
              )}
            </AnimatePresence>

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
      </BackendHealthCheck>
    </ErrorBoundary>
    </MotionConfig>
  );
}

export default App;
