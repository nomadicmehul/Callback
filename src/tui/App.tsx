import { useEffect, useRef, useState } from 'react';
import { Box, Text, useApp, useInput, useStdin } from 'ink';
import Spinner from 'ink-spinner';
import Gradient from 'ink-gradient';
import type { Application, Approval, DashboardStats, HealthInfo, RunEvent } from '@shared/types';
import { eventIcon, eventText, fmtTime } from '@shared/events';
import { net, streamEvents } from './net';

const STATUS_COLOR: Record<string, string> = {
  saved: '#8b98a8',
  drafting: '#e3b341',
  ready: '#3ddc97',
  applied: '#6ea8fe',
  screen: '#58b2dc',
  interview: '#b692f6',
  offer: '#3ddc97',
  rejected: '#f06d6d',
  ghosted: '#6b7988',
  withdrawn: '#6b7988',
};
const BOARD = ['saved', 'drafting', 'ready', 'applied', 'screen', 'interview', 'offer', 'rejected'];

export function App() {
  const { exit } = useApp();
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [apps, setApps] = useState<Application[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [activity, setActivity] = useState<RunEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [flash, setFlash] = useState<string>('');
  const abortRef = useRef<AbortController | null>(null);

  async function refresh() {
    try {
      const [st, ap, aps] = await Promise.all([net.stats(), net.applications(), net.approvals()]);
      setStats(st);
      setApps(ap);
      setApprovals(aps);
    } catch {
      /* server momentarily unreachable */
    }
  }

  // Debounced refresh on the event burst a run produces.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function scheduleRefresh() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(refresh, 250);
  }

  useEffect(() => {
    net.health().then(setHealth).catch(() => {});
    refresh();
    const ac = new AbortController();
    abortRef.current = ac;
    streamEvents(
      (e) => {
        setActivity((prev) => [...prev, e].slice(-14));
        if (e.type === 'approval_request') setApprovals((p) => (p.some((a) => a.id === e.approval.id) ? p : [...p, e.approval]));
        else if (e.type === 'approval_resolved') setApprovals((p) => p.filter((a) => a.id !== e.approvalId));
        scheduleRefresh();
      },
      { onOpen: () => setConnected(true), onError: () => setConnected(false) },
      ac.signal,
    );
    const poll = setInterval(refresh, 3000);
    return () => {
      ac.abort();
      clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pending = approvals[0];

  async function decide(decision: 'allow' | 'deny') {
    if (!pending) return;
    try {
      await net.resolveApproval(pending.id, decision);
      setFlash(decision === 'allow' ? '✓ Approved — draft saved' : '✗ Discarded');
      setTimeout(() => setFlash(''), 2500);
    } catch {
      setFlash('⚠ Could not reach server');
    }
  }

  const { isRawModeSupported } = useStdin();
  useInput(
    (input, key) => {
      if (input === 'q' || (key.ctrl && input === 'c')) {
        abortRef.current?.abort();
        exit();
      } else if (input === 'a') decide('allow');
      else if (input === 'd') decide('deny');
      else if (input === 'r') refresh();
    },
    { isActive: isRawModeSupported },
  );

  const demo = health?.demoMode ?? true;
  const byStatus = stats?.byStatus;
  const active = Boolean(pending) || apps.some((a) => a.status === 'drafting');
  // Emoji variation selectors (e.g. "⚠️") render at different widths across
  // terminals and break the box border — strip them for the preview.
  const previewLines = typeof pending?.input?.content === 'string'
    ? (pending!.input.content as string).replace(/️/g, '').split('\n').filter((l) => l.trim()).slice(0, 5)
    : [];

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box>
        <Gradient colors={['#3ddc97', '#6ea8fe']}>
          <Text bold>⟳ Callback</Text>
        </Gradient>
        <Text>   </Text>
        <Text color={demo ? '#e3b341' : '#3ddc97'}>{demo ? 'demo mode' : 'live · Claude'}</Text>
        <Text>   </Text>
        <Text color={connected ? '#3ddc97' : '#6b7988'}>{connected ? '● live' : '○ offline'}</Text>
      </Box>

      {/* Stats */}
      {stats && byStatus && (
        <Box marginTop={1}>
          <Text dimColor>tracked </Text>
          <Text bold>{stats.total}</Text>
          <Text dimColor>    ready </Text>
          <Text bold color="#3ddc97">{byStatus.ready}</Text>
          <Text dimColor>    awaiting you </Text>
          <Text bold color="#e3b341">{stats.pendingApprovals}</Text>
          <Text dimColor>    lessons </Text>
          <Text bold color="#b692f6">{stats.lessons}</Text>
        </Box>
      )}

      {/* Board summary */}
      {byStatus && (
        <Box marginTop={1} flexWrap="wrap">
          {BOARD.filter((s) => (byStatus as any)[s] > 0).map((s) => (
            <Text key={s} color={STATUS_COLOR[s]}>
              {s} {(byStatus as any)[s]}
              {'   '}
            </Text>
          ))}
          {stats?.total === 0 && <Text dimColor>no applications yet — capture one in the dashboard or via the API</Text>}
        </Box>
      )}

      {/* Jobs — what each one has (its own resume / letter / prep / interviews) */}
      {apps.length > 0 && (
        <Box marginTop={1} flexDirection="column">
          <Text dimColor>── jobs ──  📄 resume  ✉ letter  📋 prep  🎤 mock interviews  ⏰ drills due</Text>
          {apps.slice(0, 6).map((a) => {
            const m = a.materials;
            return (
              <Text key={a.id}>
                <Text color={STATUS_COLOR[a.status] ?? '#8b98a8'}>{a.status.padEnd(9)}</Text>
                <Text>{`${a.role} @ ${a.company}`.slice(0, 40).padEnd(41)}</Text>
                {/* Missing items render as dots so the row reads right even without color. */}
                <Text color="#3ddc97">{m?.resume ? '📄 ' : '·  '}</Text>
                <Text color="#3ddc97">{m?.coverLetter ? '✉  ' : '·  '}</Text>
                <Text color="#3ddc97">{m?.prep ? '📋 ' : '·  '}</Text>
                <Text color="#b692f6">
                  {m?.interviews ? `🎤${m.interviews}${m.avgInterviewScore != null ? ` ${m.avgInterviewScore}/5` : ''}` : '·'}
                </Text>
                {m?.drillsDue > 0 && <Text color="#e3b341">  ⏰{m.drillsDue}</Text>}
              </Text>
            );
          })}
          {apps.length > 6 && <Text dimColor>  … and {apps.length - 6} more in the dashboard</Text>}
        </Box>
      )}

      {/* Approval prompt — the live, interactive moment */}
      {pending && (
        <Box marginTop={1} borderStyle="round" borderColor="#e3b341" flexDirection="column" paddingX={1}>
          <Text bold color="#e3b341">
            ⏸ Needs your sign-off
          </Text>
          <Text>{pending.title}</Text>
          {previewLines.map((l, i) => (
            <Text key={i} dimColor>
              {l.slice(0, 72)}
            </Text>
          ))}
          <Box marginTop={1}>
            <Text>
              Press <Text bold color="#3ddc97">[a]</Text> approve &amp; save    <Text bold color="#f06d6d">[d]</Text> discard
            </Text>
          </Box>
        </Box>
      )}

      {/* Activity */}
      <Box marginTop={1} flexDirection="column">
        <Box>
          <Text dimColor>── activity ──</Text>
          {active && (
            <Text color="#e3b341">
              {'  '}
              <Spinner type="dots" /> agent working
            </Text>
          )}
        </Box>
        {activity.length === 0 ? (
          <Text dimColor>waiting for agents…</Text>
        ) : (
          activity.map((e, i) => (
            <Text key={i}>
              <Text dimColor>{fmtTime(e.ts)} </Text>
              {eventIcon(e)} {eventText(e).slice(0, 76)}
            </Text>
          ))
        )}
      </Box>

      {/* Footer */}
      <Box marginTop={1}>
        {flash ? <Text color="#3ddc97">{flash}</Text> : <Text dimColor>[a] approve  [d] discard  [r] refresh  [q] quit</Text>}
      </Box>
    </Box>
  );
}
