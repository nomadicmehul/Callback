import { useEffect, useRef, useState } from 'react';
import { useCallbackApp } from './lib/store';
import { Dashboard, PipelineBoard } from './components/Pipeline';
import { ApplicationDrawer, type InterviewTarget } from './components/Drawer';
import { NewApplicationModal, ApprovalModal } from './components/Modals';
import { MemoryView } from './components/Memory';
import { SettingsView } from './components/Settings';
import { ActivityFeed } from './components/Activity';
import { InterviewView } from './components/Interview';
import { ClaudeCodeCard } from './components/ClaudeCodeCard';

const CC_HIDDEN_KEY = 'callback.claudeCodeBanner.hidden';
const readHidden = () => {
  try {
    return localStorage.getItem(CC_HIDDEN_KEY) === '1';
  } catch {
    return false;
  }
};

type View = 'pipeline' | 'interview' | 'activity' | 'memory' | 'settings';

const VIEW_META: Record<View, { title: string; sub: string }> = {
  pipeline: { title: 'Pipeline', sub: 'Every role you’re tracking, from captured to offer.' },
  interview: {
    title: 'Interview prep',
    sub: 'Mock interviews that score your answers, remember your weak spots, and drill them on a schedule.',
  },
  activity: { title: 'Activity', sub: 'Live stream of everything your agents are doing.' },
  memory: { title: 'Memory', sub: 'What Callback has learned about you — you decide what sticks.' },
  settings: { title: 'Settings', sub: 'Your key, your profile, your data — all local.' },
};

export function App() {
  const state = useCallbackApp();
  const [view, setView] = useState<View>('pipeline');
  const [selected, setSelected] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [toasts, setToasts] = useState<{ id: number; text: string }[]>([]);
  // Which pipeline job (and optionally which session) the Interview view should open on.
  const [interviewTarget, setInterviewTarget] = useState<InterviewTarget | null>(null);
  const [ccHidden, setCcHidden] = useState(readHidden);
  function hideCc() {
    setCcHidden(true);
    try {
      localStorage.setItem(CC_HIDDEN_KEY, '1');
    } catch {
      /* private window — hidden for this visit only */
    }
  }

  // Toasts for completed runs.
  const seen = useRef(0);
  useEffect(() => {
    for (let i = seen.current; i < state.activity.length; i++) {
      const e = state.activity[i];
      if (e.type === 'done') pushToast(`✓ ${e.summary}`);
      else if (e.type === 'error') pushToast(`⚠ ${e.message}`);
    }
    seen.current = state.activity.length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.activity.length]);

  function pushToast(text: string) {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4800);
  }

  const mode = state.health?.demoMode ?? true;
  const pending = state.approvals[0];

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="mark">⟳</span>
          <span className="name">Callback</span>
        </div>
        <NavItem label="Pipeline" icon="▦" active={view === 'pipeline'} count={state.stats?.total} onClick={() => setView('pipeline')} />
        <NavItem label="Interview" icon="🎤" active={view === 'interview'} count={state.dueDrills || undefined} onClick={() => setView('interview')} />
        <NavItem label="Activity" icon="⟲" active={view === 'activity'} onClick={() => setView('activity')} />
        <NavItem label="Memory" icon="🧠" active={view === 'memory'} count={state.memory.proposed.length || undefined} onClick={() => setView('memory')} />
        <NavItem label="Settings" icon="⚙" active={view === 'settings'} onClick={() => setView('settings')} />
        <div className="spacer" />
        <div className="foot">
          <div style={{ marginBottom: 6 }}>
            <span
              className={`badge ${mode ? 'mode-demo' : 'mode-live'}`}
              onClick={mode ? () => setView('settings') : undefined}
              title={mode ? 'No API key — see how to run the agents for real' : undefined}
              style={mode ? { cursor: 'pointer' } : undefined}
            >
              <span className="dot" /> {mode ? 'demo mode' : 'live · Claude'}
            </span>
          </div>
          Local-first & private. Your data never leaves this machine.
        </div>
      </aside>

      <main className="main">
        <div className="topbar">
          <div>
            <h1>{VIEW_META[view].title}</h1>
            <div className="sub">{VIEW_META[view].sub}</div>
          </div>
          <div className="grow" />
          <span className="badge" title={state.connected ? 'Live connection active' : 'Reconnecting…'}>
            <span className="dot" style={{ background: state.connected ? 'var(--brand)' : 'var(--text-faint)' }} />
            {state.connected ? 'live' : 'offline'}
          </span>
          {view === 'pipeline' && (
            <button className="btn primary" onClick={() => setNewOpen(true)}>
              + Capture a job
            </button>
          )}
        </div>

        <div className="content">
          {view === 'pipeline' && (
            <>
              {!state.hasProfile && (
                <div className="banner">
                  <div>
                    <b>Start with your profile.</b> Callback drafts only from your real experience — add your resume first so
                    every draft is grounded, not a scaffold.
                  </div>
                  <button className="btn primary sm" onClick={() => setView('settings')}>
                    Add my resume →
                  </button>
                </div>
              )}
              {state.health && !state.health.hasApiKey && !ccHidden && (
                <ClaudeCodeCard pluginDir={state.health.pluginDir} compact onDismiss={hideCc} />
              )}
              <Dashboard stats={state.stats} />
              {state.applications.length === 0 ? (
                <EmptyHero onNew={() => setNewOpen(true)} />
              ) : (
                <PipelineBoard applications={state.applications} onOpen={setSelected} />
              )}
            </>
          )}
          {view === 'interview' && (
            <InterviewView
              applications={state.applications}
              activity={state.activity}
              target={interviewTarget}
              onChanged={state.refresh}
            />
          )}
          {view === 'activity' && (
            <div style={{ maxWidth: 820 }} className="panel" >
              <div style={{ padding: 16 }}>
                <ActivityFeed events={[...state.activity].reverse()} empty="Quiet for now. Capture a job to see agents work." />
              </div>
            </div>
          )}
          {view === 'memory' && <MemoryView memory={state.memory} onChanged={state.refresh} />}
          {view === 'settings' && <SettingsView health={state.health} onSaved={state.refresh} />}
        </div>
      </main>

      {selected && (
        <ApplicationDrawer
          id={selected}
          activity={state.activity}
          onClose={() => setSelected(null)}
          onChanged={state.refresh}
          onInterview={(target) => {
            setSelected(null);
            setInterviewTarget({ ...target });
            setView('interview');
          }}
        />
      )}
      {newOpen && (
        <NewApplicationModal
          onClose={() => setNewOpen(false)}
          onCreated={state.refresh}
          hasProfile={state.hasProfile}
          onGoSettings={() => {
            setNewOpen(false);
            setView('settings');
          }}
        />
      )}
      {pending && <ApprovalModal approval={pending} />}

      {toasts.length > 0 && (
        <div className="toast-wrap">
          {toasts.map((t) => (
            <div key={t.id} className="toast">
              {t.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NavItem({
  label,
  icon,
  active,
  count,
  onClick,
}: {
  label: string;
  icon: string;
  active: boolean;
  count?: number;
  onClick: () => void;
}) {
  return (
    <div className={`navitem ${active ? 'active' : ''}`} onClick={onClick}>
      <span style={{ width: 18, textAlign: 'center' }}>{icon}</span>
      {label}
      {count != null && count > 0 && <span className="count">{count}</span>}
    </div>
  );
}

function EmptyHero({ onNew }: { onNew: () => void }) {
  return (
    <div className="empty-hero">
      <div className="big">⟳</div>
      <h2>Capture your first job</h2>
      <p>
        Paste a job description. Callback analyzes fit honestly, drafts tailored materials you approve,
        <br />
        and learns what gets you callbacks — all on your machine.
      </p>
      <div style={{ marginTop: 16 }}>
        <button className="btn primary" onClick={onNew}>
          + Capture a job
        </button>
      </div>
    </div>
  );
}
