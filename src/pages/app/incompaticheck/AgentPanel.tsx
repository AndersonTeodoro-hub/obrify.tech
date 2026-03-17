import React, { useState, useRef, useCallback } from 'react';
import { useConversation } from '@elevenlabs/react';
import { Mic, MicOff, Volume2, VolumeX, Phone, PhoneOff, Loader2, HardHat, AlertCircle } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { supabase } from '@/integrations/supabase/client';
import type { Finding } from './types';

interface AgentPanelProps {
  findings: Finding[];
  obraName?: string;
}

type ConnectionState = 'disconnected' | 'connecting' | 'connected';
type AgentMode = 'listening' | 'speaking';

interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  text: string;
  timestamp: Date;
}

const QUICK_COMMANDS = [
  { label: '📏 Cotas', text: 'Verifica as cotas dos projetos e identifica divergências' },
  { label: '💥 Colisões', text: 'Quais são as colisões entre redes enterradas e elementos estruturais?' },
  { label: '📋 Relatório', text: 'Prepara o relatório técnico com as incompatibilidades encontradas' },
  { label: '📐 Normas PT', text: 'Quais normas portuguesas e europeias se aplicam a esta obra?' },
  { label: '🧱 Materiais', text: 'Analisa os materiais especificados nos projetos' },
  { label: '📊 Resumo', text: 'Faz um resumo da análise de incompatibilidades desta obra' },
];

const MAX_MESSAGES = 50;

export default function AgentPanel({ findings, obraName }: AgentPanelProps) {
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [agentMode, setAgentMode] = useState<AgentMode>('listening');
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [micDenied, setMicDenied] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageIdCounter = useRef(0);

  const addMessage = useCallback((role: 'user' | 'agent', text: string) => {
    if (!text.trim()) return;
    const id = `msg-${++messageIdCounter.current}`;
    setMessages(prev => {
      const next = [...prev, { id, role, text: text.trim(), timestamp: new Date() }];
      return next.length > MAX_MESSAGES ? next.slice(-MAX_MESSAGES) : next;
    });
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  }, []);

  const conversation = useConversation({
    onConnect: () => {
      setConnectionState('connected');
      setAgentMode('listening');
      setError(null);
    },
    onDisconnect: () => {
      setConnectionState('disconnected');
      setAgentMode('listening');
    },
    onMessage: (message: any) => {
      try {
        if (message.type === 'user_transcript') {
          const text = message.user_transcription_event?.user_transcript;
          if (text) addMessage('user', text);
        } else if (message.type === 'agent_response') {
          const text = message.agent_response_event?.agent_response;
          if (text) addMessage('agent', text);
        } else if (message.type === 'agent_response_correction') {
          const corrected = message.agent_response_correction_event?.corrected_agent_response;
          if (corrected) {
            setMessages(prev => {
              const lastAgent = [...prev].reverse().findIndex(m => m.role === 'agent');
              if (lastAgent === -1) return prev;
              const idx = prev.length - 1 - lastAgent;
              return prev.map((m, i) => i === idx ? { ...m, text: corrected } : m);
            });
          }
        }
      } catch (e) {
        console.error('onMessage parse error:', e);
      }
    },
    onError: (err: any) => {
      console.error('ElevenLabs conversation error:', err);
      setError('Erro na ligação com o Engenheiro Marcos. Tente reconectar.');
      setConnectionState('disconnected');
    },
    onModeChange: (mode: any) => {
      if (mode?.mode === 'speaking') {
        setAgentMode('speaking');
      } else {
        setAgentMode('listening');
      }
    },
  });

  const startConversation = useCallback(async () => {
    setError(null);
    setMicDenied(false);
    setConnectionState('connecting');

    // 1. Request microphone permission
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      console.error('Microphone permission denied:', e);
      setMicDenied(true);
      setConnectionState('disconnected');
      return;
    }

    // 2. Get conversation token from edge function
    try {
      const { data, error: fnError } = await supabase.functions.invoke('elevenlabs-conversation-token');

      if (fnError || !data?.token) {
        throw new Error(fnError?.message || 'No token received');
      }

      // 3. Start WebRTC session
      await conversation.startSession({
        conversationToken: data.token,
        connectionType: 'webrtc' as any,
      });

      // Set initial volume
      await conversation.setVolume({ volume });
    } catch (e) {
      console.error('Failed to start conversation:', e);
      setError('Não foi possível ligar ao Engenheiro Marcos. Tente novamente.');
      setConnectionState('disconnected');
    }
  }, [conversation, volume]);

  const endConversation = useCallback(async () => {
    try {
      await conversation.endSession();
    } catch (e) {
      console.error('Error ending conversation:', e);
    }
    setConnectionState('disconnected');
  }, [conversation]);

  const handleVolumeChange = useCallback(async (value: number[]) => {
    const v = value[0];
    setVolume(v);
    if (connectionState === 'connected') {
      try {
        await conversation.setVolume({ volume: v });
      } catch (e) {
        // ignore
      }
    }
  }, [conversation, connectionState]);

  const handleQuickCommand = useCallback((text: string) => {
    if (connectionState !== 'connected') return;
    try {
      conversation.sendUserMessage(text);
      addMessage('user', text);
    } catch (e) {
      console.error('Quick command error:', e);
    }
  }, [conversation, connectionState, addMessage]);

  // Visual state config
  const isActive = connectionState === 'connected';
  const isSpeaking = isActive && agentMode === 'speaking';
  const isListening = isActive && agentMode === 'listening';

  const glowColor = isSpeaking
    ? 'rgba(255,107,53,0.5)'
    : isListening
    ? 'rgba(34,197,94,0.4)'
    : connectionState === 'connecting'
    ? 'rgba(245,158,11,0.3)'
    : 'rgba(255,107,53,0.15)';

  const stateLabel = connectionState === 'connecting'
    ? 'A ligar...'
    : isSpeaking
    ? 'Engenheiro Marcos está a falar...'
    : isListening
    ? 'A ouvir...'
    : 'Desligado';

  const stateColor = connectionState === 'connecting'
    ? '#f59e0b'
    : isSpeaking
    ? '#ff6b35'
    : isListening
    ? '#22c55e'
    : '#666';

  return (
    <div style={{
      width: '100%', background: 'var(--background, #0d1117)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '24px 20px', overflowY: 'auto', gap: '16px',
    }}>
      {/* Avatar */}
      <div style={{
        width: '80px', height: '80px', borderRadius: '50%',
        background: 'linear-gradient(135deg, #ff6b35, #ff8c5a)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: `0 0 30px ${glowColor}`,
        transition: 'box-shadow 0.4s ease',
      }}>
        <HardHat size={36} color="#fff" />
      </div>

      {/* Name */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '16px', fontWeight: 700, color: '#fff' }}>Engº Marcos</div>
        <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>Engenheiro Sénior · Fiscalização</div>
        {obraName && (
          <div style={{ fontSize: '11px', color: '#ff6b35', marginTop: '4px' }}>
            🏗️ {obraName}
          </div>
        )}
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
            width: '4px', borderRadius: '2px', background: stateColor,
            opacity: isActive ? 0.8 : 0.2,
            height: isActive ? '20px' : '6px',
            transition: 'all 0.15s',
            animation: isActive
              ? `wave ${0.5 + i * 0.05}s ease-in-out ${i * 0.08}s infinite alternate` : 'none',
          }} />
        ))}
      </div>
      <style>{`@keyframes wave { 0% { height: 8px; } 100% { height: 28px; } }`}</style>

      {/* State label */}
      <div style={{ fontSize: '13px', color: stateColor, fontWeight: 600, textAlign: 'center', display: 'flex', alignItems: 'center', gap: '6px' }}>
        {connectionState === 'connecting' && <Loader2 size={14} className="animate-spin" />}
        {isSpeaking && <Volume2 size={14} />}
        {isListening && <Mic size={14} />}
        {stateLabel}
      </div>

      {/* Error message */}
      {error && (
        <div style={{
          fontSize: '12px', color: '#ef4444', textAlign: 'center', padding: '8px 12px',
          borderRadius: '8px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)',
          display: 'flex', alignItems: 'center', gap: '6px', maxWidth: '280px',
        }}>
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {/* Mic denied */}
      {micDenied && (
        <div style={{
          fontSize: '11px', color: '#f59e0b', textAlign: 'center', padding: '10px 12px',
          borderRadius: '8px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.15)',
          maxWidth: '280px', lineHeight: 1.5,
        }}>
          <p style={{ fontWeight: 600, marginBottom: '4px' }}>🎤 Microfone necessário</p>
          <p>Aceda às definições do browser e permita o acesso ao microfone para esta página.</p>
          <button onClick={() => { setMicDenied(false); startConversation(); }} style={{
            marginTop: '8px', padding: '6px 16px', borderRadius: '8px', border: 'none',
            background: '#ff6b35', color: '#fff', fontSize: '11px', fontWeight: 600, cursor: 'pointer',
          }}>
            Tentar novamente
          </button>
        </div>
      )}

      {/* Main action button */}
      {connectionState === 'disconnected' && !micDenied && (
        <button onClick={startConversation} style={{
          width: '100%', maxWidth: '260px', padding: '14px', borderRadius: '14px',
          border: 'none', cursor: 'pointer',
          background: 'linear-gradient(135deg, #ff6b35, #ff8c5a)',
          color: '#fff', fontSize: '14px', fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          boxShadow: '0 4px 20px rgba(255,107,53,0.3)',
          transition: 'all 0.2s',
        }}>
          <Phone size={18} /> Iniciar Conversa
        </button>
      )}

      {connectionState === 'connecting' && (
        <button disabled style={{
          width: '100%', maxWidth: '260px', padding: '14px', borderRadius: '14px',
          border: 'none', background: 'rgba(255,255,255,0.05)',
          color: '#888', fontSize: '14px', fontWeight: 600,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
        }}>
          <Loader2 size={18} className="animate-spin" /> A ligar...
        </button>
      )}

      {connectionState === 'connected' && (
        <button onClick={endConversation} style={{
          width: '100%', maxWidth: '260px', padding: '14px', borderRadius: '14px',
          border: '1px solid rgba(239,68,68,0.3)', cursor: 'pointer',
          background: 'rgba(239,68,68,0.08)',
          color: '#ef4444', fontSize: '14px', fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          transition: 'all 0.2s',
        }}>
          <PhoneOff size={18} /> Terminar Conversa
        </button>
      )}

      {/* Controls: Mute + Volume */}
      {isActive && (
        <div style={{ width: '100%', maxWidth: '260px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button onClick={() => setIsMuted(prev => !prev)} style={{
              padding: '6px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)',
              background: isMuted ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.03)',
              color: isMuted ? '#ef4444' : '#999', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {isMuted ? <MicOff size={16} /> : <Mic size={16} />}
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }}>
              {volume === 0 ? <VolumeX size={14} color="#666" /> : <Volume2 size={14} color="#666" />}
              <Slider
                value={[volume]}
                min={0} max={1} step={0.05}
                onValueChange={handleVolumeChange}
                className="flex-1"
              />
            </div>
          </div>
        </div>
      )}

      {/* Chat history */}
      {messages.length > 0 && (
        <div style={{
          width: '100%', maxHeight: '200px', overflowY: 'auto',
          display: 'flex', flexDirection: 'column', gap: '6px',
          padding: '8px', borderRadius: '10px',
          background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)',
        }}>
          {messages.map(msg => (
            <div key={msg.id} style={{
              fontSize: '11px', lineHeight: 1.5, padding: '6px 10px', borderRadius: '8px',
              background: msg.role === 'user' ? 'rgba(34,197,94,0.06)' : 'rgba(255,107,53,0.06)',
              border: `1px solid ${msg.role === 'user' ? 'rgba(34,197,94,0.1)' : 'rgba(255,107,53,0.1)'}`,
              alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '90%',
            }}>
              <span style={{ fontWeight: 600, color: msg.role === 'user' ? '#22c55e' : '#ff6b35', marginRight: '4px' }}>
                {msg.role === 'user' ? 'Você:' : 'Marcos:'}
              </span>
              <span style={{ color: '#ccc' }}>{msg.text}</span>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      )}

      {/* Quick commands */}
      <div style={{ width: '100%', marginTop: '4px' }}>
        <div style={{ fontSize: '10px', color: '#555', fontWeight: 600, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Comandos rápidos
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
          {QUICK_COMMANDS.map(cmd => (
            <button key={cmd.label} onClick={() => handleQuickCommand(cmd.text)}
              disabled={connectionState !== 'connected'}
              style={{
                padding: '8px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: 600,
                cursor: connectionState === 'connected' ? 'pointer' : 'default',
                textAlign: 'left',
                border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)',
                color: '#aaa', opacity: connectionState === 'connected' ? 1 : 0.4,
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
