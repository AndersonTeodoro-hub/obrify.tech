import { useState, useRef, useEffect, useCallback } from 'react';
import { renderMarkdown } from './helpers';
import type { ChatMessage } from './types';

interface AgentPanelProps {
  chatMessages: ChatMessage[];
  onSendMessage: (content: string) => void;
}

export default function AgentPanel({ chatMessages, onSendMessage }: AgentPanelProps) {
  const [chatInput, setChatInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState('Clique no microfone para falar com o Eng. Marcos');
  const [interimText, setInterimText] = useState('');
  const chatRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [chatMessages]);

  const handleSend = useCallback(() => {
    const text = interimText.trim() || chatInput.trim();
    if (!text) return;
    setChatInput('');
    setInterimText('');
    onSendMessage(text);
  }, [chatInput, interimText, onSendMessage]);

  const handleQuickCmd = useCallback((cmd: string) => {
    onSendMessage(cmd);
  }, [onSendMessage]);

  const toggleVoice = useCallback(() => {
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      setVoiceStatus('Clique no microfone para falar com o Eng. Marcos');
      return;
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setVoiceStatus('Voz não suportada neste navegador'); return; }

    const rec = new SR();
    rec.lang = 'pt-PT';
    rec.continuous = true;
    rec.interimResults = true;
    recognitionRef.current = rec;

    rec.onstart = () => {
      setIsRecording(true);
      setVoiceStatus('A ouvir... Fale o seu comando');
      setInterimText('');
    };

    rec.onresult = (e: any) => {
      let interim = '';
      let final = '';
      for (let i = 0; i < e.results.length; i++) {
        const transcript = e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          final += transcript;
        } else {
          interim += transcript;
        }
      }
      if (final) {
        setInterimText(prev => (prev + ' ' + final).trim());
        setVoiceStatus('Transcrição pronta — edite ou envie');
      } else {
        setVoiceStatus(interim || 'A ouvir...');
      }
    };

    rec.onerror = () => {
      setIsRecording(false);
      setVoiceStatus('Erro. Tente novamente.');
    };

    rec.onend = () => {
      setIsRecording(false);
    };

    rec.start();
  }, [isRecording]);

  const quickCommands = ['Verificar cotas', 'Colisões de redes', 'Gerar relatório', 'Normas PT', 'Materiais'];

  return (
    <div style={{ width: '340px', minWidth: '340px', background: '#0d1117', borderLeft: '1px solid rgba(255,255,255,0.04)', display: 'flex', flexDirection: 'column' }}>
      {/* Agent info */}
      <div style={{ padding: '24px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'linear-gradient(135deg, #f59e0b, #ea580c)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px' }}>🏗️</div>
        </div>
        <div style={{ color: '#fff', fontSize: '15px', fontWeight: 700 }}>Eng. Marcos IA</div>
        <div style={{ color: '#666', fontSize: '11px', marginTop: '4px' }}>
          Engenheiro Sénior · +10 anos<br />Fundações · Redes · Betão Armado
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', justifyContent: 'center', marginTop: '10px' }}>
          {['Eurocódigos', 'NP EN 206', 'LNEC', 'Reg. PT'].map(b => (
            <span key={b} style={{ fontSize: '9px', padding: '2px 8px', borderRadius: '8px', background: 'rgba(255,165,0,0.08)', color: '#f59e0b', border: '1px solid rgba(255,165,0,0.15)' }}>{b}</span>
          ))}
        </div>
      </div>

      {/* Chat messages */}
      <div ref={chatRef} style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {chatMessages.length === 0 && (
          <div style={{ textAlign: 'center', padding: '20px', color: '#555', fontSize: '12px' }}>
            Envie uma mensagem ou use os comandos rápidos.
          </div>
        )}
        {chatMessages.map((msg) => (
          <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{ fontSize: '9px', color: '#555', marginBottom: '4px', fontWeight: 600 }}>
              {msg.role === 'agent' ? 'Eng. Marcos IA' : 'Você'}
            </div>
            <div
              style={{
                padding: '12px 14px', borderRadius: '14px', fontSize: '12px', lineHeight: 1.5, maxWidth: '95%',
                background: msg.role === 'agent' ? 'rgba(255,255,255,0.03)' : 'rgba(255,165,0,0.08)',
                color: msg.role === 'agent' ? '#ccc' : '#f59e0b',
                border: `1px solid ${msg.role === 'agent' ? 'rgba(255,255,255,0.05)' : 'rgba(255,165,0,0.15)'}`,
              }}
              dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
            />
          </div>
        ))}
      </div>

      {/* Voice + Input */}
      <div style={{ padding: '16px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
          <button onClick={toggleVoice} style={{
            width: '40px', height: '40px', borderRadius: '50%', border: 'none', cursor: 'pointer', fontSize: '16px',
            background: isRecording ? 'linear-gradient(135deg, #f59e0b, #ea580c)' : 'rgba(255,255,255,0.05)',
            color: isRecording ? '#fff' : '#888',
            animation: isRecording ? 'pulse-ring 1.5s infinite' : 'none',
          }}>
            🎤
          </button>
          {isRecording && (
            <div style={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
              {[8, 16, 12, 20, 10].map((h, i) => (
                <div key={i} style={{ width: '3px', height: `${h}px`, borderRadius: '2px', background: '#f59e0b', animation: `wave 0.8s ease-in-out ${i * 0.1}s infinite` }} />
              ))}
            </div>
          )}
        </div>
        <div style={{ fontSize: '10px', color: '#555', marginBottom: '10px' }}>{voiceStatus}</div>

        {/* Editable transcript box */}
        {interimText && (
          <div style={{ marginBottom: '8px' }}>
            <textarea
              value={interimText}
              onChange={e => setInterimText(e.target.value)}
              rows={2}
              style={{ width: '100%', padding: '8px 12px', borderRadius: '10px', border: '1px solid rgba(255,165,0,0.2)', background: 'rgba(255,165,0,0.05)', color: '#f59e0b', fontSize: '12px', outline: 'none', resize: 'none' }}
              placeholder="Edite a transcrição antes de enviar..."
            />
          </div>
        )}

        <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
          <input
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder="Digite a sua pergunta..."
            style={{ flex: 1, padding: '10px 14px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', background: '#181c26', color: '#fff', fontSize: '12px', outline: 'none' }}
          />
          <button onClick={handleSend} style={{ padding: '10px 14px', borderRadius: '12px', border: 'none', background: 'linear-gradient(135deg, #f59e0b, #ea580c)', color: '#fff', cursor: 'pointer', fontSize: '14px' }}>➤</button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {quickCommands.map(cmd => (
            <button key={cmd} onClick={() => handleQuickCmd(cmd)} style={{ fontSize: '9px', padding: '5px 10px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', background: 'transparent', color: '#666', cursor: 'pointer' }}>
              {cmd}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
