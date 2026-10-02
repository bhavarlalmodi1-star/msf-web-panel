"use client";
import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from './AuthProvider';

const PinLockContext = createContext(null);

const IDLE_TIMEOUT   = 2 * 60 * 1000; // 2 minutes
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
const SALT = '_ssgms_pin_v1';

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function hashPin(pin) {
  const encoder = new TextEncoder();
  const data    = encoder.encode(pin + SALT);
  const buf     = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

const pinKey    = (uid) => `ssgms_pin_${uid}`;
const pinLenKey = (uid) => `ssgms_pin_len_${uid}`;

// ─── Provider ─────────────────────────────────────────────────────────────────
export function PinLockProvider({ children }) {
  const { user }    = useAuth();
  const uid         = user?.uid;

  const [isLocked,  setIsLocked]  = useState(false);
  const [hasPin,    setHasPin]    = useState(false);
  const [pinLength, setPinLength] = useState(4);

  const lockedRef  = useRef(false);
  const timerRef   = useRef(null);

  // ── Read saved PIN on user change ─────────────────────────────────────────
  useEffect(() => {
    if (!uid) { setHasPin(false); setIsLocked(false); lockedRef.current = false; return; }
    const stored    = localStorage.getItem(pinKey(uid));
    const storedLen = localStorage.getItem(pinLenKey(uid));
    setHasPin(!!stored);
    setPinLength(storedLen ? parseInt(storedLen, 10) : 4);
  }, [uid]);

  // ── Lock ──────────────────────────────────────────────────────────────────
  const lock = useCallback(() => {
    if (!lockedRef.current) {
      setIsLocked(true);
      lockedRef.current = true;
    }
  }, []);

  // ── Reset idle timer ──────────────────────────────────────────────────────
  const resetIdle = useCallback(() => {
    if (lockedRef.current) return;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(lock, IDLE_TIMEOUT);
  }, [lock]);

  // ── Start / stop activity listeners ──────────────────────────────────────
  useEffect(() => {
    if (!uid || !hasPin) {
      clearTimeout(timerRef.current);
      return;
    }
    ACTIVITY_EVENTS.forEach(e => window.addEventListener(e, resetIdle, { passive: true }));
    resetIdle(); // kick off timer immediately
    return () => {
      ACTIVITY_EVENTS.forEach(e => window.removeEventListener(e, resetIdle));
      clearTimeout(timerRef.current);
    };
  }, [uid, hasPin, resetIdle]);

  // ── Unlock (returns true/false) ───────────────────────────────────────────
  const unlock = useCallback(async (pin) => {
    if (!uid) return false;
    const stored = localStorage.getItem(pinKey(uid));
    if (!stored) return false;
    const hashed = await hashPin(pin);
    if (hashed === stored) {
      setIsLocked(false);
      lockedRef.current = false;
      resetIdle(); // restart idle timer
      return true;
    }
    return false;
  }, [uid, resetIdle]);

  // ── Set / change PIN ──────────────────────────────────────────────────────
  const setupPin = useCallback(async (pin, length) => {
    if (!uid) return;
    const hashed = await hashPin(pin);
    localStorage.setItem(pinKey(uid),    hashed);
    localStorage.setItem(pinLenKey(uid), String(length));
    setHasPin(true);
    setPinLength(length);
  }, [uid]);

  // ── Remove PIN (requires current PIN) ────────────────────────────────────
  const removePin = useCallback(async (currentPin) => {
    if (!uid) return false;
    const stored = localStorage.getItem(pinKey(uid));
    if (!stored) return false;
    const hashed = await hashPin(currentPin);
    if (hashed !== stored) return false;
    localStorage.removeItem(pinKey(uid));
    localStorage.removeItem(pinLenKey(uid));
    setHasPin(false);
    setIsLocked(false);
    lockedRef.current = false;
    return true;
  }, [uid]);

  // ── Verify PIN (without unlocking) ───────────────────────────────────────
  const verifyPin = useCallback(async (pin) => {
    if (!uid) return false;
    const stored = localStorage.getItem(pinKey(uid));
    if (!stored) return true;
    const hashed = await hashPin(pin);
    return hashed === stored;
  }, [uid]);

  return (
    <PinLockContext.Provider value={{
      isLocked, hasPin, pinLength,
      lock, unlock, setupPin, removePin, verifyPin,
    }}>
      {children}
    </PinLockContext.Provider>
  );
}

export function usePinLock() {
  return useContext(PinLockContext);
}
