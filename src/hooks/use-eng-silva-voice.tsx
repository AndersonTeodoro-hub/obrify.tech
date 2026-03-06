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

const BASE_SYSTEM_PROMPT = `Tu és o Eng. Silva, consultor sénior de engenharia civil na plataforma Obrify.

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

function buildSystemPrompt(memory: { profile: any; summaries: any[] }, projectKnowledge: any[]): string {
  console.log("ENG-SILVA: Building prompt with", projectKnowledge.length, "knowledge docs");
  let prompt = BASE_SYSTEM_PROMPT;

  const { profile, summaries } = memory;

  if (profile && Object.keys(profile).length > 0) {
    prompt += `\n\nCONTEXTO DO FISCAL:`;
    if (profile.name) prompt += `\n- Nome: ${profile.name}. Trata-o pelo nome.`;
    if (profile.company) prompt += `\n- Empresa: ${profile.company}`;
    if (profile.current_project) prompt += `\n- Obra actual: ${profile.current_project}`;
    if (profile.role) prompt += `\n- Função: ${profile.role}`;
  }

  if (summaries && summaries.length > 0) {
    prompt += `\n\nCONVERSAS ANTERIORES (resumos):`;
    const recent = summaries.slice(-5);
    recent.forEach((s: any) => {
      const date = new Date(s.date).toLocaleDateString('pt-PT');
      prompt += `\n- ${date}: ${s.summary}`;
    });
    prompt += `\n\nUsa este contexto naturalmente. Não repitas informação que o fiscal já sabe. Se ele já se apresentou antes, não perguntes o nome de novo.`;

    const hasAnalysis = summaries.some((s: any) => s.summary?.includes('incompatibilidades detectadas'));
    if (hasAnalysis) {
      prompt += `\n\nANÁLISE DE INCOMPATIBILIDADES:
Tens acesso aos resultados da análise de incompatibilidades feita pelo IncompatiCheck. Quando o fiscal perguntar sobre incompatibilidades, conflitos entre projectos, ou problemas detectados:
- Responde com base nos dados que tens na memória
- Sê específico sobre os IDs (INC-001, INC-002, etc), localizações e recomendações
- Sugere soluções práticas baseadas na tua experiência
- Se o fiscal perguntar sobre uma incompatibilidade específica, dá detalhes e opções de resolução
- Podes sugerir a ordem de prioridade para resolver os problemas (alta primeiro)
- Fala naturalmente como se tivesses analisado os projectos tu próprio`;
    }
  }

  // Project knowledge injection
  if (projectKnowledge && projectKnowledge.length > 0) {
    const limited = projectKnowledge.slice(0, 15);
    prompt += `\n\nCONHECIMENTO COMPLETO DO PROJECTO (${limited.length} documentos analisados):`;

    const bySpecialty: Record<string, any[]> = {};
    limited.forEach(doc => {
      if (!bySpecialty[doc.specialty]) bySpecialty[doc.specialty] = [];
      bySpecialty[doc.specialty].push(doc);
    });

    Object.entries(bySpecialty).forEach(([specialty, docs]) => {
      prompt += `\n\n--- ${specialty.toUpperCase()} ---`;
      docs.forEach(doc => {
        const shortSummary = doc.summary.split(' ').slice(0, 150).join(' ');
        prompt += `\n📄 ${doc.document_name}: ${shortSummary}`;
        if (doc.key_elements && doc.key_elements.length > 0) {
          const elements = doc.key_elements.slice(0, 8);
          prompt += `\n   Elementos: ${elements.map((e: any) => `${e.type} ${e.id}`).join(', ')}`;
        }
      });
    });

    prompt += `\n\nTens conhecimento completo do projecto. Quando o fiscal perguntar sobre qualquer elemento (pilares, sapatas, tubagens, cotas, eixos), responde com precisão usando esta informação. Refere os documentos de origem quando relevante. Não digas que não tens informação se ela está aqui.`;
  }

  prompt += `\n\nEXTRAÇÃO DE PERFIL:
Se o fiscal mencionar o seu nome, empresa, obra, ou função, inclui no INÍCIO da tua resposta (antes do texto normal) uma linha especial no formato:
[PERFIL: nome=..., empresa=..., obra=..., funcao=...]
Inclui apenas os campos que foram mencionados. Esta linha será processada automaticamente e não será lida em voz alta.
Exemplo: se ele diz "Sou o João da Engexpor", responde:
[PERFIL: nome=João, empresa=Engexpor]
Olá João! Bem-vindo...`;

  return prompt;
}

const SILENCE_THRESHOLD = 25;
const SILENCE_DURATION = 1500;
const MIN_RECORDING_MS = 800;

export function useEngSilvaVoice() {
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [memory, setMemory] = useState<{ profile: any; summaries: any[] }>({ profile: {}, summaries: [] });
  const [projectKnowledge, setProjectKnowledge] = useState<any[]>([]);

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
  const startListeningRef = useRef<(() => void) | null>(null);
  const memoryRef = useRef(memory);
  const pendingImageRef = useRef<string | null>(null);
  const projectKnowledgeRef = useRef<any[]>([]);

  const setPendingImage = useCallback((base64: string) => {
    pendingImageRef.current = base64;
    console.log("ENG-SILVA: Image captured, pending for next message");
  }, []);

  // Keep ref in sync with state
  useEffect(() => {
    memoryRef.current = memory;
  }, [memory]);

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

  const loadMemory = useCallback(async () => {
    try {
      console.log("ENG-SILVA: Loading memory");
      const { data, error: memError } = await supabase.functions.invoke('eng-silva-memory', {
        body: { action: 'load' },
      });
      if (!memError && data) {
        const loaded = { profile: data.profile || {}, summaries: data.summaries || [] };
        setMemory(loaded);
        memoryRef.current = loaded;
        console.log("ENG-SILVA: Memory loaded:", loaded);
      }
    } catch (err) {
      console.error("ENG-SILVA: Memory load error:", err);
    }
  }, []);

  const startListening = useCallback(() => {
    if (!activeRef.current || !streamRef.current || !audioContextRef.current) return;

    console.log("ENG-SILVA: Listening");
    setVoiceState('listening');
    setError(null);
    chunksRef.current = [];

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : '';

    const recorder = new MediaRecorder(streamRef.current, mimeType ? { mimeType } : undefined);
    recorderRef.current = recorder;
    recordingStartRef.current = Date.now();

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = async () => {
      if (!activeRef.current) return;
      const elapsed = Date.now() - recordingStartRef.current;
      if (elapsed < MIN_RECORDING_MS || chunksRef.current.length === 0) {
        if (activeRef.current) startListeningRef.current?.();
        return;
      }
      await processAudio();
    };

    recorder.start(250);

    // Silence detection loop
    let lastSoundTime = Date.now();
    let speechDetected = false;
    const analyser = analyserRef.current!;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const checkSilence = () => {
      if (!activeRef.current) return;
      analyser.getByteFrequencyData(dataArray);
      const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;

      if (avg > SILENCE_THRESHOLD) {
        lastSoundTime = Date.now();
        speechDetected = true;
      }

      // Max recording timeout of 30 seconds
      if (Date.now() - recordingStartRef.current > 30000) {
        if (recorder.state === 'recording') recorder.stop();
        return;
      }

      const elapsed = Date.now() - recordingStartRef.current;
      if (speechDetected && elapsed > MIN_RECORDING_MS && Date.now() - lastSoundTime > SILENCE_DURATION) {
        console.log("ENG-SILVA: Silence detected");
        if (recorder.state === 'recording') {
          recorder.stop();
        }
        return;
      }

      rafRef.current = requestAnimationFrame(checkSilence);
    };

    rafRef.current = requestAnimationFrame(checkSilence);
  }, []);

  startListeningRef.current = startListening;

  const processAudio = useCallback(async () => {
    if (!activeRef.current) return;

    try {
      // STT
      setVoiceState('processing-stt');
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
      console.log("ENG-SILVA: STT sending, size:", blob.size);
      const base64Audio = await blobToBase64(blob);

      const { data: sttData, error: sttError } = await supabase.functions.invoke('eng-silva-stt', {
        body: { audio: base64Audio },
      });

      if (sttError || !sttData?.text) {
        throw new Error(sttError?.message || 'STT falhou');
      }

      let userText = sttData.text.trim();
      console.log("ENG-SILVA: STT result:", userText);

      // If no speech but image is pending, auto-generate prompt
      if (!userText && pendingImageRef.current) {
        userText = "Analisa esta imagem que acabei de tirar na obra.";
      }

      if (!userText) {
        if (activeRef.current) startListeningRef.current?.();
        return;
      }

      // Chat
      setVoiceState('processing-chat');
      conversationRef.current.push({ role: 'user', content: userText });

      const chatBody: any = {
        message: userText,
        conversation_history: conversationRef.current,
        system: buildSystemPrompt(memoryRef.current, projectKnowledgeRef.current),
      };

      if (pendingImageRef.current) {
        chatBody.image = pendingImageRef.current;
        console.log("ENG-SILVA: Sending image with message");
        pendingImageRef.current = null;
      }

      const { data: chatData, error: chatError } = await supabase.functions.invoke('eng-silva-chat', {
        body: chatBody,
      });

      if (chatError || !chatData?.reply) {
        throw new Error(chatError?.message || 'Chat falhou');
      }

      let replyText = chatData.reply;
      console.log("ENG-SILVA: Chat result:", replyText);

      // Extract profile data if present
      const profileMatch = replyText.match(/\[PERFIL:([^\]]+)\]/);
      if (profileMatch) {
        const profileStr = profileMatch[1];
        const newProfile: any = {};
        const nameMatch = profileStr.match(/nome=([^,\]]+)/);
        const companyMatch = profileStr.match(/empresa=([^,\]]+)/);
        const projectMatch = profileStr.match(/obra=([^,\]]+)/);
        const roleMatch = profileStr.match(/funcao=([^,\]]+)/);
        if (nameMatch) newProfile.name = nameMatch[1].trim();
        if (companyMatch) newProfile.company = companyMatch[1].trim();
        if (projectMatch) newProfile.current_project = projectMatch[1].trim();
        if (roleMatch) newProfile.role = roleMatch[1].trim();

        if (Object.keys(newProfile).length > 0) {
          console.log("ENG-SILVA: Profile extracted:", newProfile);
          supabase.functions.invoke('eng-silva-memory', {
            body: { action: 'update_profile', profile: newProfile }
          });
          setMemory(prev => {
            const updated = { ...prev, profile: { ...prev.profile, ...newProfile } };
            memoryRef.current = updated;
            return updated;
          });
        }

        // Remove the profile tag from the text before TTS
        replyText = replyText.replace(/\[PERFIL:[^\]]+\]\s*/g, '').trim();
      }

      conversationRef.current.push({ role: 'assistant', content: replyText });

      // TTS
      setVoiceState('processing-tts');
      console.log("ENG-SILVA: TTS sending");

      const { data: ttsData, error: ttsError } = await supabase.functions.invoke('eng-silva-tts', {
        body: { text: replyText },
      });

      if (ttsError || !ttsData?.audio) {
        throw new Error('TTS failed');
      }

      // Play audio
      setVoiceState('speaking');
      console.log("ENG-SILVA: Playing audio");
      const audioUrl = `data:audio/mpeg;base64,${ttsData.audio}`;
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.onended = () => {
        console.log("ENG-SILVA: Audio ended, restarting");
        audioRef.current = null;
        if (activeRef.current) startListeningRef.current?.();
      };
      audio.onerror = () => {
        audioRef.current = null;
        setError('Erro ao reproduzir áudio.');
        if (activeRef.current) startListeningRef.current?.();
      };

      await audio.play();
    } catch (err: any) {
      console.error('ENG-SILVA ERROR:', err);
      setError('Erro de ligação. Tenta novamente.');
      if (activeRef.current) {
        setTimeout(() => {
          if (activeRef.current) startListeningRef.current?.();
        }, 2000);
      }
    }
  }, []);

  const start = useCallback(async () => {
    console.log("ENG-SILVA: Requesting mic");
    setError(null);
    setVoiceState('requesting-mic');
    activeRef.current = true;

    // Load memory before starting
    const loadedMemory = await loadMemory();

    // Load project knowledge if obra_id is available
    try {
      const obraId = memoryRef.current?.profile?.current_obra_id;
      if (obraId) {
        const { data: knowledgeData } = await supabase.functions.invoke('eng-silva-knowledge', {
          body: { action: 'load', obra_id: obraId },
        });
        if (knowledgeData?.knowledge) {
          setProjectKnowledge(knowledgeData.knowledge);
          projectKnowledgeRef.current = knowledgeData.knowledge;
          console.log(`ENG-SILVA: Loaded knowledge for ${knowledgeData.knowledge.length} documents`);
        }
      }
    } catch (err) {
      console.error('ENG-SILVA: Failed to load project knowledge:', err);
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      console.log("ENG-SILVA: Mic acquired");
      streamRef.current = stream;

      const ctx = new AudioContext();
      audioContextRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      startListeningRef.current?.();
    } catch (err: any) {
      console.error('ENG-SILVA ERROR:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setError('Precisas de permitir o microfone para falar com o Eng. Silva');
      } else {
        setError('Não foi possível aceder ao microfone.');
      }
      setVoiceState('idle');
      activeRef.current = false;
    }
  }, [loadMemory]);

  const hangUp = useCallback(() => {
    // Generate conversation summary before clearing
    if (conversationRef.current.length >= 2) {
      const lastMessages = conversationRef.current.slice(-6);
      const summaryText = lastMessages.map(m => `${m.role === 'user' ? 'Fiscal' : 'Eng.Silva'}: ${m.content}`).join(' | ');
      supabase.functions.invoke('eng-silva-chat', {
        body: {
          message: `Resume esta conversa em 1-2 frases curtas em português, focando nos temas técnicos discutidos e decisões tomadas. Não incluas saudações. Conversa: ${summaryText}`,
          conversation_history: [],
          system: 'És um assistente que faz resumos curtos de conversas técnicas. Responde apenas com o resumo, nada mais.'
        }
      }).then(({ data }) => {
        if (data?.reply) {
          console.log("ENG-SILVA: Conversation summary:", data.reply);
          supabase.functions.invoke('eng-silva-memory', {
            body: { action: 'add_summary', summary: data.reply }
          });
        }
      }).catch(err => console.error("ENG-SILVA: Summary error:", err));
    }

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
    setPendingImage,
  };
}
