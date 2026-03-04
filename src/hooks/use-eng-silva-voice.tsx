import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type VoiceState =
  | 'idle'
  | 'requesting-mic'
  | 'listening'
  | 'processing-stt'
  | 'processing-chat'
  | 'processing-tts'
  | 'speaking';

const SYSTEM_PROMPT = `Tu és o Eng. Silva, consultor sénior de engenharia civil na plataforma Obrify.

QUEM ÉS:
Tens 30+ anos de experiência em fiscalização de obras em Portugal e na Europa. Conheces todas as normas europeias de construção de cor — mas usas esse conhecimento como base, não como resposta. Falas como um colega engenheiro experiente que está ao lado do fiscal na obra, não como um manual técnico.

COMO FALAS:
- Português europeu SEMPRE. "Betão" não "concreto". "Projecto" não "projeto". "Obra" não "canteiro".
- Directo e conciso. O fiscal está em obra com o telemóvel — não quer ouvir parágrafos.
- Tom profissional mas humano. Como um colega que respeitas e que te ajuda.
- Usas linguagem de obra quando apropriado: "ferros", "cofragem", "betonar", "vibrar", "curar".
- As tuas respostas são CURTAS porque vão ser lidas em voz alta. Máximo 3-4 frases por resposta.
- Não uses listas, bullet points, números de normas ou formatação — falas como numa conversa telefónica.

COMO RESPONDES:
1. Responde a pergunta de forma directa — o valor, o sim/não, a recomendação prática. Sem citar normas.
2. Se relevante, acrescenta uma dica prática de fiscalização.
3. No final, pergunta brevemente se quer mais detalhe: "Queres que aprofunde?" ou "Precisas de mais alguma coisa?"
4. Se o fiscal pedir detalhe: aí sim, explica com referência à norma mas mantém curto e oral.

O QUE SABES (base interna — NÃO despejar):
- 10 Eurocódigos (EN 1990–1999), 58 partes
- EN 206, EN 13670, EN 1090, EN 10080
- Regulamentos PT: REBAP, RSA, RGEU, RJUE, DL 95/2019
- SCIE, REH/RECS, RRAE, RTIEBT
- Zonamento sísmico PT, solos, classes de exposição, construção típica portuguesa

CONTEXTO PORTUGAL:
- Betão comum: C25/30, C30/37. Aço: A500NR SD
- Recobrimentos: interior 25mm, exterior 35-40mm, marítimo 45mm
- Lisboa zona sísmica 1.3/2.3, Porto 1.6/2.5, Algarve 1.1/2.3

LIMITES:
- NÃO calculas armaduras nem dimensionas
- NÃO recomendas marcas comerciais
- NÃO inventas valores
- Quando não sabes: "Confirma com o projectista"

IMPORTANTE: Estás numa conversa por VOZ. Responde sempre como se estivesses ao telefone com um colega. Curto, directo, natural. Nada de texto formatado.`;

const SILENCE_THRESHOLD = 15;
const SILENCE_DURATION = 1500;
const MIN_RECORDING_MS = 800;

export function useEngSilvaVoice() {
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const silenceTimerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const conversationRef = useRef<{ role: string; content: string }[]>([]);
  const recordingStartRef = useRef<number>(0);
  const activeRef = useRef(false);

  const cleanup = useCallback(() => {
    activeRef.current = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
      audioContextRef.current = null;
      analyserRef.current = null;
    }
    conversationRef.current = [];
    chunksRef.current = [];
    recorderRef.current = null;
  }, []);

  const blobToBase64 = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

  const startListening = useCallback(() => {
    if (!activeRef.current || !streamRef.current || !audioContextRef.current) return;

    setVoiceState('listening');
    setError(null);
    chunksRef.current = [];

    const recorder = new MediaRecorder(streamRef.current, { mimeType: 'audio/webm' });
    recorderRef.current = recorder;
    recordingStartRef.current = Date.now();

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = async () => {
      if (!activeRef.current) return;
      const elapsed = Date.now() - recordingStartRef.current;
      if (elapsed < MIN_RECORDING_MS || chunksRef.current.length === 0) {
        // Too short — restart listening
        if (activeRef.current) startListening();
        return;
      }
      await processAudio();
    };

    recorder.start(250);

    // Silence detection loop
    let lastSoundTime = Date.now();
    const analyser = analyserRef.current!;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const checkSilence = () => {
      if (!activeRef.current || voiceState === 'idle') return;
      analyser.getByteFrequencyData(dataArray);
      const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;

      if (avg > SILENCE_THRESHOLD) {
        lastSoundTime = Date.now();
      }

      const elapsed = Date.now() - recordingStartRef.current;
      if (elapsed > MIN_RECORDING_MS && Date.now() - lastSoundTime > SILENCE_DURATION) {
        // Silence detected — stop recording
        if (recorder.state === 'recording') {
          recorder.stop();
        }
        return;
      }

      rafRef.current = requestAnimationFrame(checkSilence);
    };

    rafRef.current = requestAnimationFrame(checkSilence);
  }, []);

  const processAudio = useCallback(async () => {
    if (!activeRef.current) return;

    try {
      // STT
      setVoiceState('processing-stt');
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
      const base64Audio = await blobToBase64(blob);

      const { data: sttData, error: sttError } = await supabase.functions.invoke('eng-silva-stt', {
        body: { audio: base64Audio },
      });

      if (sttError || !sttData?.text) {
        throw new Error(sttError?.message || 'STT falhou');
      }

      const userText = sttData.text.trim();
      if (!userText) {
        if (activeRef.current) startListening();
        return;
      }

      // Chat
      setVoiceState('processing-chat');
      conversationRef.current.push({ role: 'user', content: userText });

      const { data: chatData, error: chatError } = await supabase.functions.invoke('eng-silva-chat', {
        body: {
          message: userText,
          conversation_history: conversationRef.current,
          system: SYSTEM_PROMPT,
        },
      });

      if (chatError || !chatData?.reply) {
        throw new Error(chatError?.message || 'Chat falhou');
      }

      const replyText = chatData.reply;
      conversationRef.current.push({ role: 'assistant', content: replyText });

      // TTS
      setVoiceState('processing-tts');
      const ttsResponse = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/eng-silva-tts`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ text: replyText }),
        }
      );

      if (!ttsResponse.ok) {
        const errBody = await ttsResponse.text();
        if (ttsResponse.status === 429 || errBody.includes('quota')) {
          setError('Limite de voz atingido. Tenta mais tarde.');
          return;
        }
        throw new Error(`TTS failed: ${ttsResponse.status}`);
      }

      const ttsJson = await ttsResponse.json();
      if (!ttsJson?.audio) throw new Error('No audio in TTS response');

      // Play audio
      setVoiceState('speaking');
      const audioUrl = `data:audio/mpeg;base64,${ttsJson.audio}`;
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.onended = () => {
        audioRef.current = null;
        if (activeRef.current) startListening();
      };
      audio.onerror = () => {
        audioRef.current = null;
        setError('Erro ao reproduzir áudio.');
        if (activeRef.current) startListening();
      };

      await audio.play();
    } catch (err: any) {
      console.error('Voice pipeline error:', err);
      setError('Erro de ligação. Tenta novamente.');
      // Auto-retry: restart listening after a short delay
      if (activeRef.current) {
        setTimeout(() => {
          if (activeRef.current) startListening();
        }, 2000);
      }
    }
  }, [startListening]);

  const start = useCallback(async () => {
    setError(null);
    setVoiceState('requesting-mic');
    activeRef.current = true;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;

      const ctx = new AudioContext();
      audioContextRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      startListening();
    } catch (err: any) {
      console.error('Mic error:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setError('Precisas de permitir o microfone para falar com o Eng. Silva');
      } else {
        setError('Não foi possível aceder ao microfone.');
      }
      setVoiceState('idle');
      activeRef.current = false;
    }
  }, [startListening]);

  const hangUp = useCallback(() => {
    cleanup();
    setVoiceState('idle');
    setError(null);
  }, [cleanup]);

  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  return {
    voiceState,
    error,
    analyserNode: analyserRef.current,
    start,
    hangUp,
  };
}
