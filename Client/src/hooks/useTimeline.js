import { useCallback, useEffect, useRef, useState } from "react";

// Year timeline with playback. The exact (fractional) position lives in a ref
// and is pushed to subscribers every animation frame — only the globe layer
// needs that — while React state holds just the whole selected year, so the
// UI re-renders about once per year instead of 60 times a second.
export function useTimeline({ min, max }) {
  const [year, setYear] = useState(min);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1); // years per second

  const position = useRef(min);
  const listeners = useRef(new Set());
  const emit = useCallback(() => {
    for (const fn of listeners.current) fn(position.current);
  }, []);

  // Reset when the available range changes (e.g. data finished loading).
  useEffect(() => {
    position.current = min;
    setYear(min);
    setPlaying(false);
    emit();
  }, [min, max, emit]);

  useEffect(() => {
    if (!playing) return;
    let raf;
    let last = performance.now();
    const tick = (now) => {
      const dt = Math.min((now - last) / 1000, 0.1); // ignore long tab-switch gaps
      last = now;
      const next = position.current + dt * speed;
      if (next >= max) {
        position.current = max;
        setYear(max);
        setPlaying(false);
        emit();
        return;
      }
      position.current = next;
      setYear(Math.round(next));
      emit();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, max, emit]);

  const seek = useCallback((y) => {
    const clamped = Math.min(Math.max(Math.round(y), min), max);
    position.current = clamped;
    setYear(clamped);
    emit();
  }, [min, max, emit]);

  const play = useCallback(() => {
    if (position.current >= max) seek(min); // replay from the start
    setPlaying(true);
  }, [max, min, seek]);

  const pause = useCallback(() => setPlaying(false), []);
  const reset = useCallback(() => { setPlaying(false); seek(min); }, [min, seek]);

  const subscribe = useCallback((fn) => {
    listeners.current.add(fn);
    return () => listeners.current.delete(fn);
  }, []);
  const getPosition = useCallback(() => position.current, []);

  return { year, min, max, playing, speed, setSpeed, seek, play, pause, reset, subscribe, getPosition };
}
