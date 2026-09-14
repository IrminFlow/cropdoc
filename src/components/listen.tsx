"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { SpeakerHigh, Stop } from "@phosphor-icons/react/ssr";

const subscribe = () => () => {};
const useSpeechSupported = () =>
  useSyncExternalStore(
    subscribe,
    () => "speechSynthesis" in window,
    () => false,
  );

/** Reads text aloud with the phone's own voice, for people who prefer to listen. */
export function ListenButton({
  text,
  label = "Listen",
}: {
  text: string;
  label?: string;
}) {
  const supported = useSpeechSupported();
  const [speaking, setSpeaking] = useState(false);
  const current = useRef<SpeechSynthesisUtterance | null>(null);
  useEffect(
    () => () => {
      if (current.current) speechSynthesis.cancel();
    },
    [],
  );
  if (!supported) return null;

  function toggle() {
    speechSynthesis.cancel();
    if (speaking) {
      current.current = null;
      setSpeaking(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-IN";
    utterance.rate = 0.9;
    const voice = speechSynthesis.getVoices().find((v) => v.lang === "en-IN");
    if (voice) utterance.voice = voice;
    // cancel() reports an error for the previous utterance; ignore stale events.
    const finish = () => {
      if (current.current !== utterance) return;
      current.current = null;
      setSpeaking(false);
    };
    utterance.onend = finish;
    utterance.onerror = finish;
    current.current = utterance;
    setSpeaking(true);
    speechSynthesis.speak(utterance);
  }

  return (
    <button type="button" className="btn btn-ghost btn-small" onClick={toggle}>
      {speaking ? (
        <Stop size={20} weight="fill" aria-hidden />
      ) : (
        <SpeakerHigh size={22} weight="bold" aria-hidden />
      )}
      {speaking ? "Stop" : label}
    </button>
  );
}
