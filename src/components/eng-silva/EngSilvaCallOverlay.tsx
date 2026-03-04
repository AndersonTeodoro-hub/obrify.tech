import { useEffect, useRef, useCallback } from 'react';
import { PhoneOff } from 'lucide-react';
import { useEngSilvaVoice, type VoiceState } from '@/hooks/use-eng-silva-voice';

interface EngSilvaCallOverlayProps {
  open: boolean;
  onClose: () => void;
}

function statusLabel(state: VoiceState): string {
  switch (state) {
    case 'requesting-mic': return 'A ligar...';
    case 'listening': return 'A ouvir...';
    case 'processing-stt': return 'A pensar...';
    case 'processing-chat': return 'A pensar...';
    case 'processing-tts': return 'A preparar resposta...';
    case 'speaking': return 'A responder...';
    default: return '';
  }
}

function visualizerColor(state: VoiceState): string {
  if (state === 'listening') return '#22d3ee'; // cyan
  if (state === 'speaking') return '#D4A849'; // gold
  return '#D4A849'; // gold for thinking/default
}

function AudioVisualizer({ analyserNode, voiceState }: { analyserNode: AnalyserNode | null; voiceState: VoiceState }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const color = visualizerColor(voiceState);
    const isThinking = voiceState === 'processing-stt' || voiceState === 'processing-chat' || voiceState === 'processing-tts';

    if (isThinking) {
      // Pulsing dots
      const time = Date.now() / 400;
      for (let i = 0; i < 3; i++) {
        const scale = 0.5 + 0.5 * Math.sin(time + i * 1.2);
        const r = 6 + scale * 6;
        const x = w / 2 + (i - 1) * 30;
        ctx.beginPath();
        ctx.arc(x, h / 2, r, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.4 + scale * 0.6;
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      rafRef.current = requestAnimationFrame(draw);
      return;
    }

    if (analyserNode && (voiceState === 'listening' || voiceState === 'speaking')) {
      const bufferLength = analyserNode.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      analyserNode.getByteFrequencyData(dataArray);

      const barCount = 32;
      const barWidth = w / barCount * 0.6;
      const gap = w / barCount * 0.4;

      for (let i = 0; i < barCount; i++) {
        const dataIndex = Math.floor(i * bufferLength / barCount);
        const value = dataArray[dataIndex] / 255;
        const barHeight = Math.max(4, value * h * 0.7);

        const x = i * (barWidth + gap) + gap / 2;
        const y = (h - barHeight) / 2;

        ctx.fillStyle = color;
        ctx.globalAlpha = 0.5 + value * 0.5;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    } else {
      // Idle — flat line
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.3;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(w * 0.2, h / 2);
      ctx.lineTo(w * 0.8, h / 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    rafRef.current = requestAnimationFrame(draw);
  }, [analyserNode, voiceState]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      width={280}
      height={80}
      className="mx-auto"
    />
  );
}

export function EngSilvaCallOverlay({ open, onClose }: EngSilvaCallOverlayProps) {
  const { voiceState, error, analyserNode, start, hangUp } = useEngSilvaVoice();

  useEffect(() => {
    if (open) {
      start();
    }
    return () => {
      if (!open) hangUp();
    };
  }, [open]);

  const handleHangUp = useCallback(() => {
    hangUp();
    onClose();
  }, [hangUp, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center"
      style={{
        background: 'linear-gradient(180deg, #0f172a 0%, #020617 100%)',
        height: '100dvh',
      }}
    >
      {/* Avatar */}
      <div
        className="w-20 h-20 rounded-full flex items-center justify-center text-4xl mb-4"
        style={{ border: '3px solid #D4A849', background: 'rgba(212,168,73,0.1)' }}
      >
        🔬
      </div>

      {/* Name */}
      <h2 className="text-2xl font-bold text-white mb-1" style={{ fontFamily: "'Instrument Serif', serif" }}>
        Eng. Silva
      </h2>
      <p className="text-sm mb-8" style={{ color: 'rgba(255,255,255,0.5)' }}>
        Consultor de Engenharia
      </p>

      {/* Visualizer */}
      <div className="mb-4">
        <AudioVisualizer analyserNode={analyserNode} voiceState={voiceState} />
      </div>

      {/* Status */}
      <p className="text-sm mb-2" style={{ color: visualizerColor(voiceState) }}>
        {statusLabel(voiceState)}
      </p>

      {/* Error */}
      {error && (
        <p className="text-sm text-red-400 text-center px-8 mb-4 max-w-xs">
          {error}
        </p>
      )}

      {/* Spacer */}
      <div className="flex-1 min-h-8" />

      {/* Hang up */}
      <button
        onClick={handleHangUp}
        className="w-16 h-16 rounded-full flex items-center justify-center mb-12 active:scale-95 transition-transform"
        style={{ background: '#ef4444' }}
        aria-label="Desligar"
      >
        <PhoneOff className="w-7 h-7 text-white" />
      </button>
    </div>
  );
}
