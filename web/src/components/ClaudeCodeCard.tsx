import { useState } from 'react';

/** `claude --plugin-dir …` for wherever Callback is installed — the server formats the path for a shell. */
const pluginCommand = (dir: string | null) => `claude --plugin-dir ${dir ?? '.'}`;

function CopyLine({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the command stays selectable */
    }
  }
  return (
    <div className="cc-cmd">
      <code>{text}</code>
      <button className="btn ghost sm" onClick={copy}>
        {copied ? 'Copied ✓' : 'Copy'}
      </button>
    </div>
  );
}

/** No API key? Claude Code on the user's own subscription is the supported way to run
 *  Callback's agents for real — without this, the dashboard only says "demo mode". */
export function ClaudeCodeCard({ pluginDir, compact, onDismiss }: { pluginDir: string | null; compact?: boolean; onDismiss?: () => void }) {
  if (compact) {
    return (
      <div className="banner cc-banner">
        <div>
          <b>Have Claude Code?</b> Run Callback’s agents for real on your Pro/Max subscription — no API key. Drafts land on this
          board.
        </div>
        <CopyLine text={pluginCommand(pluginDir)} />
        {onDismiss && (
          <button className="btn ghost sm" onClick={onDismiss} title="Hide this">
            ✕
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="cc-card">
      <h4>Have Claude Code? Use your subscription instead</h4>
      <p>
        Claude Code runs Callback’s agents for real — not the demo — on your Pro/Max plan, with the same skills and the same local
        data as this dashboard.
      </p>
      <ol>
        <li>
          In a terminal:
          <CopyLine text={pluginCommand(pluginDir)} />
        </li>
        <li>
          In Claude Code: <span className="kbd">/callback:setup</span> (adds your resume, or keeps the one you have), then
          <CopyLine text="/callback:apply <job URL or pasted posting>" />
        </li>
        <li>Approve each draft when Claude Code asks. It appears here within seconds, ready for the ATS check and PDF/DOCX export.</li>
      </ol>
      <p className="scrim-note" style={{ margin: 0 }}>
        No Claude Code yet?{' '}
        <a href="https://claude.com/claude-code" target="_blank" rel="noreferrer">
          Get it here
        </a>
        . Or add an API key above to run the agents from this dashboard instead.
      </p>
    </div>
  );
}
