'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Transcription live via l'API Web Speech du navigateur (Chrome/Safari).
 *
 * Choix assumé pour la V1 : aucune clé, aucune latence réseau supplémentaire,
 * aucun flux audio envoyé à un tiers. Chaque phrase finalisée déclenche le
 * moteur ; l'interim sert seulement de retour visuel.
 */

type SpeechRecognitionAlternativeLike = { transcript: string };
type SpeechRecognitionResultLike = {
  0: SpeechRecognitionAlternativeLike;
  isFinal: boolean;
  length: number;
};
type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: { length: number; [i: number]: SpeechRecognitionResultLike };
};
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

type Ctor = new () => SpeechRecognitionLike;

function getCtor(): Ctor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: Ctor; webkitSpeechRecognition?: Ctor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useSpeech({ onFinal }: { onFinal: (text: string) => void }) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const onFinalRef = useRef(onFinal);
  const wantedRef = useRef(false);

  onFinalRef.current = onFinal;

  useEffect(() => {
    setSupported(getCtor() !== null);
  }, []);

  const start = useCallback(() => {
    const Ctor = getCtor();
    if (!Ctor) return;

    const recognition = new Ctor();
    recognition.lang = 'fr-FR';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let draft = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = result[0]?.transcript ?? '';
        if (result.isFinal) {
          const finalText = text.trim();
          if (finalText) onFinalRef.current(finalText);
        } else {
          draft += text;
        }
      }
      setInterim(draft);
    };

    recognition.onerror = () => setInterim('');

    // La reconnaissance s'arrête d'elle-même après un silence : on relance
    // tant que l'utilisateur n'a pas explicitement coupé la dictée.
    recognition.onend = () => {
      setInterim('');
      if (wantedRef.current) {
        try {
          recognition.start();
        } catch {
          setListening(false);
          wantedRef.current = false;
        }
      } else {
        setListening(false);
      }
    };

    recognitionRef.current = recognition;
    wantedRef.current = true;
    try {
      recognition.start();
      setListening(true);
    } catch {
      wantedRef.current = false;
      setListening(false);
    }
  }, []);

  const stop = useCallback(() => {
    wantedRef.current = false;
    recognitionRef.current?.stop();
    setListening(false);
    setInterim('');
  }, []);

  useEffect(() => {
    return () => {
      wantedRef.current = false;
      recognitionRef.current?.stop();
    };
  }, []);

  return { supported, listening, interim, start, stop };
}
