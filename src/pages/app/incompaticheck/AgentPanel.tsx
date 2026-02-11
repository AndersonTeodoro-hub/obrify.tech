import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, MicOff, Volume2, VolumeX, RotateCcw, Loader2, HardHat } from 'lucide-react';
import type { Finding } from './types';

type VoiceState = 'idle' | 'recording' | 'processing' | 'speaking';

interface AgentPanelProps {
  onSendMessage: (content: string) => Promise<string | undefined>;
  agentThinking: boolean;
  findings: Finding[];
}

const QUICK_COMMANDS = [
  { label: '📏 Cotas', text: 'Verifica as cotas dos projetos e identifica divergências' },
  { label: '💥 Colisões', text: 'Quais são as colisões entre redes enterradas e elementos estruturais?' },
  { label: '📋 Relatório', text: 'Prepara o relatório técnico com as incompatibilidades encontradas' },
  { label: '📐 Normas PT', text: 'Quais normas portuguesas e europeias se aplicam a esta obra?' },
  { label: '🧱 Materiais', text: 'Analisa os materiais especificados nos projetos' },
  { label: '📊 Resumo', text: 'Faz um resumo da análise de incompatibilidades desta obra' },
];

function cleanMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/#{1,6}\s/g, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`(.*?)`/g, '$1')
    .replace(/\n{2,}/g, '. ')
    .replace(/\n/g, '. ')
    .replace(/- /g, ', ')
    .trim();
}

export default function AgentPanel({ onSendMessage, agentThinking, findings }: AgentPanelProps) {
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [subtitle, setSubtitle] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [lastResponse, setLastResponse] = useState('');

  const recognitionRef = useRef<any>(null);
  const accumulatedTextRef = useRef('');
  const subtitleTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const isSendingRef = useRef(false);

  // Sync agentThinking → voiceState
  useEffect(() => {
    if (agentThinking && voiceState !== 'processing') {
      setVoiceState('processing');
    }
  }, [agentThinking]);

  // Pre-load TTS voices
  useEffect(() => {
    const loadVoices = () => { window.speechSynthesis.getVoices(); };
    loadVoices();
    window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', loadVoices);
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      window.speechSynthesis.cancel();
      if (subtitleTimerRef.current) clearTimeout(subtitleTimerRef.current);
    };
  }, []);

  const showSubtitle = useCallback((text: string, duration = 5000) => {
    setSubtitle(text);
    if (subtitleTimerRef.current) clearTimeout(subtitleTimerRef.current);
    if (duration > 0) {
      subtitleTimerRef.current = setTimeout(() => setSubtitle(''), duration);
    }
  }, []);

  const speakText = useCallback((text: string) => {
    if (isMuted) {
      setVoiceState('idle');
      showSubtitle(text.length > 200 ? text.substring(0, 200) + '...' : text, 5000);
      return;
    }
    window.speechSynthesis.cancel();
    const clean = cleanMarkdown(text);
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.lang = 'pt-PT';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    const voices = window.speechSynthesis.getVoices();
    const ptVoice = voices.find(v => v.lang.startsWith('pt'));
    if (ptVoice) utterance.voice = ptVoice;

    utterance.onstart = () => {
      setVoiceState('speaking');
      showSubtitle(text.length > 200 ? text.substring(0, 200) + '...' : text, 0);
    };
    utterance.onend = () => {
      setVoiceState('idle');
      setTimeout(() => setSubtitle(''), 3000);
    };
    utterance.onerror = () => setVoiceState('idle');

    window.speechSynthesis.speak(utterance);
  }, [isMuted, showSubtitle]);

  const sendAndSpeak = useCallback(async (text: string) => {
    if (!text.trim() || isSendingRef.current) return;
    isSendingRef.current = true;
    setVoiceState('processing');
    showSubtitle(text, 3000);

    try {
      const response = await onSendMessage(text.trim());
      if (response) {
        setLastResponse(response);
        speakText(response);
      } else {
        const fallback = 'Não consegui obter resposta. Tente novamente.';
        setLastResponse(fallback);
        speakText(fallback);
      }
    } catch {
      setVoiceState('idle');
      showSubtitle('Erro de comunicação. Tente novamente.', 4000);
    } finally {
      isSendingRef.current = false;
    }
  }, [onSendMessage, speakText, showSubtitle]);

  const startRecording = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showSubtitle('Reconhecimento de voz não suportado neste navegador.', 4000);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'pt-PT';
    recognition.continuous = true;
    recognition.interimResults = true;
    accumulatedTextRef.current = '';

    recognition.onresult = (event: any) => {
      let interim = '';
      let finalText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalText += transcript + ' ';
        } else {
          interim += transcript;
        }
      }
      if (finalText) accumulatedTextRef.current += finalText;
      showSubtitle(accumulatedTextRef.current + interim, 0);
    };

    recognition.onend = () => {
      const text = accumulatedTextRef.current.trim();
      if (text) {
        sendAndSpeak(text);
      } else {
        setVoiceState('idle');
        setSubtitle('');
      }
    };

    recognition.onerror = (e: any) => {
      console.error('STT error:', e.error);
      if (e.error !== 'aborted') {
        setVoiceState('idle');
        showSubtitle('Erro no reconhecimento de voz.', 3000);
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
    setVoiceState('recording');
    setSubtitle('');
  }, [sendAndSpeak, showSubtitle]);

  const stopRecording = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const toggleRecording = useCallback(() => {
    if (voiceState === 'recording') {
      stopRecording();
    } else if (voiceState === 'idle') {
      startRecording();
    }
  }, [voiceState, startRecording, stopRecording]);

  const toggleMute = useCallback(() => {
    setIsMuted(prev => {
      if (!prev) window.speechSynthesis.cancel();
      return !prev;
    });
  }, []);

  const repeatLast = useCallback(() => {
    if (lastResponse) speakText(lastResponse);
  }, [lastResponse, speakText]);

  const handleQuickCommand = useCallback((text: string) => {
    if (voiceState === 'processing' || voiceState === 'recording') return;
    window.speechSynthesis.cancel();
    sendAndSpeak(text);
  }, [voiceState, sendAndSpeak]);

  const stateConfig = {
    idle: { label: 'Clique para falar com o Eng. Marcos', color: '#ff6b35' },
    recording: { label: 'A ouvir...', color: '#ef4444' },
    processing: { label: 'Eng. Marcos está a pensar...', color: '#f59e0b' },
    speaking: { label: 'Eng. Marcos está a falar...', color: '#22c55e' },
  };
  const current = stateConfig[voiceState];

  return (
    <div style={{
      width: '340px', minWidth: '340px', background: '#0d1117',
      borderLeft: '1px solid rgba(255,255,255,0.04)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '32px 20px', overflowY: 'auto', gap: '20px',
    }}>
      {/* Avatar */}
      <div style={{
        width: '80px', height: '80px', borderRadius: '50%',
        background: 'linear-gradient(135deg, #ff6b35, #ff8c5a)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: voiceState === 'speaking' ? '0 0 30px rgba(34,197,94,0.4)' :
          voiceState === 'recording' ? '0 0 30px rgba(239,68,68,0.4)' :
          '0 0 20px rgba(255,107,53,0.2)',
        transition: 'box-shadow 0.3s',
      }}>
        <HardHat size={36} color="#fff" />
      </div>

      {/* Name */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '16px', fontWeight: 700, color: '#fff' }}>Eng. Marcos IA</div>
        <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>Engenheiro Sénior · Fiscalização</div>
      </div>

      {/* Norm badges */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', justifyContent: 'center', maxWidth: '280px' }}>
        {['EC2', 'EC7', 'NP EN 206', 'REBAP', 'RSA', 'RTIEBT'].map(n => (
          <span key={n} style={{
            fontSize: '9px', padding: '2px 6px', borderRadius: '4px', fontWeight: 600,
            color: '#ff6b35', background: 'rgba(255,107,53,0.08)', border: '1px solid rgba(255,107,53,0.15)',
          }}>{n}</span>
        ))}
      </div>

      {/* Audio waves */}
      <div style={{ display: 'flex', gap: '3px', alignItems: 'center', height: '40px' }}>
        {[...Array(7)].map((_, i) => (
          <div key={i} style={{
            width: '4px', borderRadius: '2px', background: current.color,
            opacity: (voiceState === 'recording' || voiceState === 'speaking') ? 0.8 : 0.2,
            height: (voiceState === 'recording' || voiceState === 'speaking') ? '20px' : '6px',
            transition: 'all 0.15s',
            animation: (voiceState === 'recording' || voiceState === 'speaking')
              ? `wave ${0.5 + i * 0.05}s ease-in-out ${i * 0.08}s infinite alternate` : 'none',
          }} />
        ))}
      </div>
      <style>{`@keyframes wave { 0% { height: 8px; } 100% { height: 28px; } }`}</style>

      {/* State label */}
      <div style={{ fontSize: '13px', color: current.color, fontWeight: 600, textAlign: 'center', display: 'flex', alignItems: 'center', gap: '6px' }}>
        {voiceState === 'processing' && <Loader2 size={14} className="animate-spin" />}
        {voiceState === 'speaking' && <Volume2 size={14} />}
        {current.label}
      </div>

      {/* Subtitle */}
      {subtitle && (
        <div style={{
          fontSize: '12px', color: '#ccc', textAlign: 'center',
          padding: '8px 16px', borderRadius: '10px', maxWidth: '280px',
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)',
          lineHeight: 1.5, maxHeight: '120px', overflowY: 'auto',
          transition: 'opacity 0.3s',
        }}>
          "{subtitle}"
        </div>
      )}

      {/* Mic button */}
      <button
        onClick={toggleRecording}
        disabled={voiceState === 'processing' || voiceState === 'speaking'}
        style={{
          width: '72px', height: '72px', borderRadius: '50%', border: 'none', cursor: 'pointer',
          background: voiceState === 'recording'
            ? 'linear-gradient(135deg, #ef4444, #dc2626)'
            : 'linear-gradient(135deg, #ff6b35, #ff8c5a)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: voiceState === 'recording'
            ? '0 0 40px rgba(239,68,68,0.5)' : '0 4px 20px rgba(255,107,53,0.3)',
          opacity: (voiceState === 'processing' || voiceState === 'speaking') ? 0.5 : 1,
          animation: voiceState === 'recording' ? 'pulse-mic 1.5s ease-in-out infinite' : 'none',
          transition: 'all 0.2s',
        }}
      >
        {voiceState === 'recording' ? <MicOff size={28} color="#fff" /> : <Mic size={28} color="#fff" />}
      </button>
      <style>{`@keyframes pulse-mic { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.08); } }`}</style>

      {/* Mute + Repeat */}
      <div style={{ display: 'flex', gap: '12px' }}>
        <button onClick={toggleMute} style={{
          padding: '8px 16px', borderRadius: '10px', fontSize: '11px', fontWeight: 600,
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
          border: '1px solid rgba(255,255,255,0.08)', background: isMuted ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.03)',
          color: isMuted ? '#ef4444' : '#999',
        }}>
          {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
          {isMuted ? 'Mudo' : 'Som'}
        </button>
        <button onClick={repeatLast} disabled={!lastResponse || voiceState === 'speaking'}
          style={{
            padding: '8px 16px', borderRadius: '10px', fontSize: '11px', fontWeight: 600,
            cursor: lastResponse ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: '4px',
            border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)',
            color: lastResponse ? '#999' : '#444', opacity: lastResponse ? 1 : 0.5,
          }}>
          <RotateCcw size={14} /> Repetir
        </button>
      </div>

      {/* Quick commands */}
      <div style={{ width: '100%', marginTop: '8px' }}>
        <div style={{ fontSize: '10px', color: '#555', fontWeight: 600, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Comandos rápidos
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
          {QUICK_COMMANDS.map(cmd => (
            <button key={cmd.label} onClick={() => handleQuickCommand(cmd.text)}
              disabled={voiceState === 'processing' || voiceState === 'recording'}
              style={{
                padding: '8px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: 600,
                cursor: (voiceState === 'processing' || voiceState === 'recording') ? 'default' : 'pointer',
                textAlign: 'left',
                border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)',
                color: '#aaa', opacity: (voiceState === 'processing' || voiceState === 'recording') ? 0.5 : 1,
                transition: 'all 0.15s',
              }}>
              {cmd.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
