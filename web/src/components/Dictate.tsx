import { useCallback, useEffect, useRef, useState } from 'react';

// Web Speech API — Chrome/Edge/Safari ship it (prefixed in some); Firefox doesn't. No DOM typings, hence `any`.
const Recognition: any =
  typeof window !== 'undefined' ? (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition : undefined;

const MAC_DICTATION = 'macOS Dictation also works in any text box and runs on-device: press Fn (🌐) twice.';

const ERRORS: Record<string, string> = {
  'not-allowed': 'Microphone blocked — allow it for this page in the browser, and in System Settings → Privacy & Security → Microphone.',
  'service-not-allowed': 'This browser won’t allow speech recognition here. ' + MAC_DICTATION,
  'audio-capture': 'No microphone found.',
  network: 'The browser’s speech service is unreachable. ' + MAC_DICTATION,
  'language-not-supported': `Speech recognition doesn’t support your language here. ${MAC_DICTATION}`,
};

/** Append a dictated chunk to existing text with a single space between. */
export const appendSpoken = (prev: string, chunk: string) =>
  !chunk ? prev : !prev.trim() ? chunk : prev + (/\s$/.test(prev) ? '' : ' ') + chunk;

/**
 * Mic button that dictates into an answer box: finished phrases go to `onText`, the phrase in progress
 * shows live beside the button. Prefers on-device recognition where the browser offers it, and says so
 * when audio goes to the browser's speech service instead. Stops (dropping any pending phrase) when
 * `disabled` flips on, e.g. while an answer is being sent.
 */
export function Dictate({ onText, disabled }: { onText: (chunk: string) => void; disabled?: boolean }) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState('');
  const [onDevice, setOnDevice] = useState(false);
  const rec = useRef<any>(null);
  const wanted = useRef(false);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  const abort = useCallback(() => {
    wanted.current = false;
    rec.current?.abort();
    rec.current = null;
    setInterim('');
    setListening(false);
  }, []);

  const start = useCallback(async () => {
    setError('');
    const lang = navigator.language || 'en-US';
    const r = new Recognition();
    r.lang = lang;
    r.continuous = true;
    r.interimResults = true;
    // Newer Chrome can recognize on-device; otherwise audio goes to the browser vendor's service.
    let local = false;
    if ('processLocally' in r && typeof Recognition.available === 'function') {
      try {
        local = (await Recognition.available({ langs: [lang], processLocally: true })) === 'available';
      } catch {
        local = false;
      }
      if (local) r.processLocally = true;
    }
    setOnDevice(local);
    r.onresult = (e: any) => {
      let live = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const text = e.results[i][0].transcript.trim();
        if (e.results[i].isFinal) onTextRef.current(text);
        else live += ' ' + text;
      }
      setInterim(live.trim());
    };
    r.onerror = (e: any) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      wanted.current = false;
      setError(ERRORS[e.error] ?? `Voice input stopped (${e.error}). ${MAC_DICTATION}`);
    };
    // Browsers end a session after a pause; keep going until the user clicks stop.
    r.onend = () => {
      setInterim('');
      if (wanted.current && rec.current === r) {
        try {
          r.start();
          return;
        } catch {
          /* fall through to stopped */
        }
      }
      if (rec.current === r) setListening(false);
    };
    rec.current = r;
    wanted.current = true;
    try {
      r.start();
      setListening(true);
    } catch (err: any) {
      wanted.current = false;
      setError(String(err?.message ?? err));
    }
  }, []);

  const stop = useCallback(() => {
    wanted.current = false;
    rec.current?.stop(); // stop (not abort) so the last phrase still lands
  }, []);

  useEffect(() => {
    if (disabled && wanted.current) abort();
  }, [disabled, abort]);
  useEffect(() => abort, [abort]);

  if (!Recognition) {
    return (
      <span className="scrim-note" title={MAC_DICTATION}>
        🎙 Fn Fn to dictate
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        className={`btn sm ${listening ? 'rec' : ''}`}
        onClick={listening ? stop : start}
        disabled={disabled && !listening}
        title={listening ? 'Stop dictating' : `Speak your answer — it’s written into the box as you talk. ${MAC_DICTATION}`}
      >
        {listening ? '■ Stop' : '🎙 Speak'}
      </button>
      {listening && (
        <span className="scrim-note dictate-live" title={onDevice ? 'Recognized on this device' : 'Audio is sent to your browser’s speech service to be transcribed'}>
          {interim ? <i>{interim}…</i> : onDevice ? 'listening · on-device' : 'listening · via browser speech service'}
        </span>
      )}
      {error && <span style={{ color: 'var(--danger)', fontSize: 12 }}>{error}</span>}
    </>
  );
}
