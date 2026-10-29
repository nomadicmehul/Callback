import { useCallback, useEffect, useRef, useState } from 'react';
import type { Application, Approval, DashboardStats, Experience, HealthInfo, MemoryNote, RunEvent } from '@shared/types';
import { api } from './api';
import { useEventStream } from './useSSE';

export interface Memory {
  proposed: MemoryNote[];
  active: MemoryNote[];
  retired: MemoryNote[];
}

export interface AppState {
  health: HealthInfo | null;
  stats: DashboardStats | null;
  applications: Application[];
  approvals: Approval[];
  memory: Memory;
  experiences: Experience[];
  activity: RunEvent[];
  connected: boolean;
  hasProfile: boolean;
  dueDrills: number;
  refresh: () => Promise<void>;
}

export function useCallbackApp(): AppState {
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [memory, setMemory] = useState<Memory>({ proposed: [], active: [], retired: [] });
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [activity, setActivity] = useState<RunEvent[]>([]);
  const [hasProfile, setHasProfile] = useState(true); // optimistic until first load
  const [dueDrills, setDueDrills] = useState(0);

  const refresh = useCallback(async () => {
    const [apps, st, aps, mem, cfg, drills, exps] = await Promise.all([
      api.listApplications(),
      api.stats(),
      api.approvals(),
      api.memory(),
      api.getConfig(),
      api.drills(),
      api.experiences().catch(() => []), // an older server has no experience bank — don't block the rest
    ]);
    setExperiences(exps);
    setApplications(apps);
    setStats(st);
    setApprovals(aps);
    setMemory(mem);
    setHasProfile(cfg.candidateProfile.trim().length > 0);
    setDueDrills(drills.due.length);
  }, []);

  useEffect(() => {
    api.health().then(setHealth).catch(() => {});
    refresh().catch(() => {});
    // Fallback poll: keeps the dashboard current when something else writes to
    // the same database (e.g. the Claude Code plugin), which has no SSE link.
    const poll = window.setInterval(() => refresh().catch(() => {}), 5000);
    return () => window.clearInterval(poll);
  }, [refresh]);

  // Coalesce the burst of events a run produces into one refresh.
  const timer = useRef<number | null>(null);
  const scheduleRefresh = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => refresh().catch(() => {}), 250);
  }, [refresh]);

  const { connected } = useEventStream((ev) => {
    setActivity((prev) => [...prev, ev].slice(-200));
    if (ev.type === 'approval_request') {
      setApprovals((prev) => (prev.some((a) => a.id === ev.approval.id) ? prev : [...prev, ev.approval]));
    } else if (ev.type === 'approval_resolved') {
      setApprovals((prev) => prev.filter((a) => a.id !== ev.approvalId));
    }
    scheduleRefresh();
  });

  return { health, stats, applications, approvals, memory, experiences, activity, connected, hasProfile, dueDrills, refresh };
}
