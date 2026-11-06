import { useState, useRef, useEffect } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { C } from '../../lib/bmsUi';

// Microphone button that types what you say into a text box, using the
// browser's built-in speech recognition (Chrome, Edge, Safari incl. iPhone).
// Firefox has no speech recognition: the button explains to use the
// keyboard's own dictation instead.
//
//   <DictationButton lang="en" onText={(chunk) => setValue((v) => joinText(v, chunk))} />
//   (joinText is in lib/bmsUi)

function getRecognition() {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export function DictationButton({ lang = 'en', onText, disabled, size = 40 }) {
  const Recognition = getRecognition();
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState(null);
  const recRef = useRef(null);
  const onTextRef = useRef(onText);
  useEffect(() => { onTextRef.current = onText; }, [onText]);

  useEffect(() => () => recRef.current?.abort(), []);

  function start() {
    if (!Recognition) return;
    setError(null);
    const rec = new Recognition();
    rec.lang = lang === 'zh' ? 'zh-CN' : 'en-US';
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (event) => {
      let finalText = '';
      let interimText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interimText += r[0].transcript;
      }
      if (finalText) onTextRef.current?.(finalText);
      setInterim(interimText);
    };
    rec.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') setError('Microphone access is blocked for this site.');
      else if (event.error !== 'aborted' && event.error !== 'no-speech') setError(`Dictation stopped (${event.error}).`);
    };
    rec.onend = () => { setListening(false); setInterim(''); recRef.current = null; };
    recRef.current = rec;
    rec.start();
    setListening(true);
  }

  function stop() {
    recRef.current?.stop();
  }

  const title = !Recognition
    ? 'Dictation is not available in this browser — use the microphone on your keyboard instead (Chrome, Edge and Safari support it here).'
    : listening ? 'Stop dictation' : `Dictate (${lang === 'zh' ? '中文' : 'English'})`;

  return (
    <span style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
      <button
        type="button"
        onClick={listening ? stop : start}
        disabled={disabled || !Recognition}
        title={title}
        aria-label={title}
        style={{
          width: size, height: size, borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: listening ? `${C.red}22` : C.inner, border: `1px solid ${listening ? C.red : C.border}`,
          color: listening ? C.red : Recognition ? C.text : C.muted, cursor: Recognition && !disabled ? 'pointer' : 'not-allowed',
          animation: listening ? 'bms-pulse 1.4s ease-in-out infinite' : 'none',
        }}
      >
        {Recognition ? <Mic size={16} /> : <MicOff size={16} />}
      </button>
      {(listening || error) && (
        <span style={{
          position: 'absolute', bottom: '100%', right: 0, marginBottom: 6, whiteSpace: 'nowrap', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis',
          background: C.card, border: `1px solid ${error ? C.red : C.border}`, borderRadius: 6, padding: '4px 8px', fontSize: 11,
          color: error ? C.red : C.muted, zIndex: 5,
        }}>
          {error || interim || (lang === 'zh' ? '正在听…' : 'Listening…')}
        </span>
      )}
      <style>{'@keyframes bms-pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.35); } 50% { box-shadow: 0 0 0 5px rgba(239,68,68,0); } }'}</style>
    </span>
  );
}
