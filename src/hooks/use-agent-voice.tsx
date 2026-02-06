import { useState, useRef, useCallback, useEffect } from 'react';
import { useScribe, CommitStrategy } from '@elevenlabs/react';
import { supabase } from '@/integrations/supabase/client';

type VoiceState = 'idle' | 'recording' | 'processing' | 'speaking';

interface UseAgentVoiceOptions {
  onTranscript: (text: string) => void;
  voiceEnabled: boolean;
}

export function useAgentVoice({ onTranscript, voiceEnabled }: UseAgentVoiceOptions) {
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const scribe = useScribe({
    modelId: 'scribe_v2_realtime',
    commitStrategy: CommitStrategy.VAD,
    onPartialTranscript: (data) => {
      // partial transcript available via scribe.partialTranscript
    },
    onCommittedTranscript: (data) => {
      if (data.text?.trim()) {
        onTranscript(data.text.trim());
        stopRecording();
      }
    },
  });

  const startRecording = useCallback(async () => {
    if (voiceState === 'recording') {
      stopRecording();
      return;
    }

    setVoiceState('processing');
    try {
      const { data, error } = await supabase.functions.invoke('elevenlabs-stt-token');
      if (error || !data?.token) {
        throw new Error('Failed to get STT token');
      }

      await scribe.connect({
        token: data.token,
        microphone: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      setVoiceState('recording');
    } catch (e) {
      console.error('STT start error:', e);
      setVoiceState('idle');
    }
  }, [voiceState, scribe]);

  const stopRecording = useCallback(() => {
    scribe.disconnect();
    setVoiceState('idle');
  }, [scribe]);

  const playTTS = useCallback(async (text: string) => {
    if (!voiceEnabled || !text) return;

    setVoiceState('speaking');
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-tts`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ text }),
        }
      );

      if (!response.ok) throw new Error(`TTS failed: ${response.status}`);

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      
      if (audioRef.current) {
        audioRef.current.pause();
        URL.revokeObjectURL(audioRef.current.src);
      }

      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      audio.onended = () => {
        setVoiceState('idle');
        URL.revokeObjectURL(audioUrl);
      };
      audio.onerror = () => {
        setVoiceState('idle');
        URL.revokeObjectURL(audioUrl);
      };
      await audio.play();
    } catch (e) {
      console.error('TTS error:', e);
      setVoiceState('idle');
    }
  }, [voiceEnabled]);

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      URL.revokeObjectURL(audioRef.current.src);
      audioRef.current = null;
    }
    setVoiceState('idle');
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        URL.revokeObjectURL(audioRef.current.src);
      }
      scribe.disconnect();
    };
  }, []);

  return {
    voiceState,
    partialTranscript: scribe.partialTranscript,
    isConnected: scribe.isConnected,
    startRecording,
    stopRecording,
    playTTS,
    stopAudio,
  };
}
