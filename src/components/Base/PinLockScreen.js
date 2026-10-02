"use client";
import { useState, useEffect, useCallback, useRef } from 'react';
import { usePinLock } from './PinLockContext';
import { useAuth } from './AuthProvider';
import { LockOutlined } from '@ant-design/icons';

const NUMPAD = [
  ['1','2','3'],
  ['4','5','6'],
  ['7','8','9'],
  ['','0','⌫'],
];

export default function PinLockScreen() {
  const { isLocked, unlock, pinLength } = usePinLock();
  const { user } = useAuth();

  const [entered,  setEntered]  = useState('');
  const [error,    setError]    = useState('');
  const [shaking,  setShaking]  = useState(false);
  const [checking, setChecking] = useState(false);
  const submitRef = useRef(false);

  // Reset every time the screen locks
  useEffect(() => {
    if (isLocked) {
      setEntered('');
      setError('');
      setShaking(false);
      setChecking(false);
      submitRef.current = false;
    }
  }, [isLocked]);

  useEffect(() => {
    if (entered.length === pinLength && !submitRef.current) {
      submitRef.current = true;
      handleSubmit(entered);
    }
  }, [entered, pinLength]);

  const handleSubmit = useCallback(async (pin) => {
    setChecking(true);
    const ok = await unlock(pin);
    setChecking(false);
    submitRef.current = false;
    if (!ok) {
      setShaking(true);
      setError('Incorrect PIN. Try again.');
      setEntered('');
      setTimeout(() => { setShaking(false); setError(''); }, 1500);
    }
  }, [unlock]);

  const handleKey = useCallback((key) => {
    if (checking) return;
    if (key === '⌫') { setEntered(v => v.slice(0, -1)); setError(''); }
    else if (key !== '') setEntered(v => v.length < pinLength ? v + key : v);
  }, [checking, pinLength]);

  useEffect(() => {
    if (!isLocked) return;
    const handler = (e) => {
      if (e.key >= '0' && e.key <= '9') handleKey(e.key);
      else if (e.key === 'Backspace')    handleKey('⌫');
      else if (e.key === 'Enter' && entered.length === pinLength) handleSubmit(entered);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isLocked, entered, pinLength, handleKey, handleSubmit]);

  if (!isLocked) return null;

  const userName = user?.name || user?.email || 'User';
  const initials = userName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99999,
      background: 'linear-gradient(160deg, #f0f4ff 0%, #fafbff 50%, #f5f0ff 100%)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      userSelect: 'none', fontFamily: 'inherit',
    }}>

      {/* Soft background blobs */}
      <div style={{
        position: 'absolute', top: -100, left: -100, width: 400, height: 400,
        borderRadius: '50%', pointerEvents: 'none',
        background: 'radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 65%)',
      }} />
      <div style={{
        position: 'absolute', bottom: -80, right: -80, width: 360, height: 360,
        borderRadius: '50%', pointerEvents: 'none',
        background: 'radial-gradient(circle, rgba(139,92,246,0.07) 0%, transparent 65%)',
      }} />
      <div style={{
        position: 'absolute', top: '40%', left: '15%', width: 200, height: 200,
        borderRadius: '50%', pointerEvents: 'none',
        background: 'radial-gradient(circle, rgba(16,185,129,0.05) 0%, transparent 65%)',
      }} />

      {/* Main card */}
      <div style={{
        background: '#ffffff',
        border: '1px solid rgba(99,102,241,0.12)',
        borderRadius: 28,
        padding: '44px 40px 36px',
        width: 340,
        boxShadow: '0 4px 6px rgba(0,0,0,0.04), 0 20px 60px rgba(99,102,241,0.10), 0 1px 0 rgba(255,255,255,0.8) inset',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        animation: shaking ? 'pinShake 0.45s ease' : 'pinFadeIn 0.4s cubic-bezier(0.34,1.56,0.64,1)',
        position: 'relative',
      }}>

        {/* Lock badge */}
        <div style={{
          width: 64, height: 64, borderRadius: 20,
          background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 18,
          boxShadow: '0 8px 24px rgba(99,102,241,0.30), 0 2px 4px rgba(99,102,241,0.15)',
        }}>
          <LockOutlined style={{ color: '#fff', fontSize: 26 }} />
        </div>

        {/* Title */}
        <div style={{ fontSize: 18, fontWeight: 700, color: '#1e1b4b', marginBottom: 4, letterSpacing: '-0.3px' }}>
          Screen Locked
        </div>

        {/* User pill */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 32,
          background: '#f5f3ff', border: '1px solid #ede9fe',
          borderRadius: 20, padding: '5px 12px 5px 6px',
        }}>
          <div style={{
            width: 26, height: 26, borderRadius: '50%',
            background: 'linear-gradient(135deg, #10b981, #059669)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0,
          }}>
            {initials}
          </div>
          <span style={{ color: '#5b21b6', fontSize: 13, fontWeight: 500 }}>{userName}</span>
        </div>

        {/* PIN dots */}
        <div style={{ display: 'flex', gap: 14, marginBottom: 6 }}>
          {Array.from({ length: pinLength }).map((_, i) => (
            <div key={i} style={{
              width: 13, height: 13, borderRadius: '50%',
              border: `2px solid ${i < entered.length ? '#6366f1' : '#d1d5db'}`,
              background: i < entered.length ? '#6366f1' : 'transparent',
              boxShadow: i < entered.length ? '0 0 0 4px rgba(99,102,241,0.12)' : 'none',
              transition: 'all 0.18s cubic-bezier(0.34,1.56,0.64,1)',
              transform: i < entered.length ? 'scale(1.15)' : 'scale(1)',
            }} />
          ))}
        </div>

        {/* Error */}
        <div style={{
          height: 22, marginBottom: 20, textAlign: 'center',
          color: '#ef4444', fontSize: 12, fontWeight: 500,
          opacity: error ? 1 : 0, transition: 'opacity 0.2s ease',
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          {error && '⚠'} {error}
        </div>

        {/* Numpad */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
          {NUMPAD.map((row, ri) => (
            <div key={ri} style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              {row.map((key, ki) => {
                const isEmpty    = key === '';
                const isBackspace = key === '⌫';
                return (
                  <button
                    key={ki}
                    onClick={() => handleKey(key)}
                    disabled={isEmpty || checking}
                    style={{
                      width: 76, height: 56,
                      borderRadius: 14,
                      border: isEmpty ? 'none'
                        : isBackspace ? '1.5px solid #fecaca'
                        : '1.5px solid #e5e7eb',
                      background: isEmpty ? 'transparent'
                        : isBackspace ? '#fff5f5'
                        : '#f9fafb',
                      color: isBackspace ? '#ef4444' : '#1f2937',
                      fontSize: isBackspace ? 18 : 22,
                      fontWeight: isBackspace ? 400 : 600,
                      cursor: isEmpty ? 'default' : 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexDirection: 'column',
                      transition: 'all 0.12s ease',
                      outline: 'none',
                      lineHeight: 1,
                      boxShadow: isEmpty ? 'none' : '0 1px 3px rgba(0,0,0,0.06)',
                      opacity: checking ? 0.5 : 1,
                    }}
                    onMouseEnter={e => {
                      if (!isEmpty) {
                        e.currentTarget.style.background = isBackspace ? '#fee2e2' : '#ede9fe';
                        e.currentTarget.style.borderColor = isBackspace ? '#fca5a5' : '#c4b5fd';
                        e.currentTarget.style.transform = 'translateY(-1px)';
                        e.currentTarget.style.boxShadow = '0 4px 10px rgba(99,102,241,0.12)';
                      }
                    }}
                    onMouseLeave={e => {
                      if (!isEmpty) {
                        e.currentTarget.style.background = isBackspace ? '#fff5f5' : '#f9fafb';
                        e.currentTarget.style.borderColor = isBackspace ? '#fecaca' : '#e5e7eb';
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)';
                      }
                    }}
                    onMouseDown={e => { if (!isEmpty) e.currentTarget.style.transform = 'scale(0.93) translateY(0)'; }}
                    onMouseUp={e => { if (!isEmpty) e.currentTarget.style.transform = 'translateY(-1px)'; }}
                  >
                    {key}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Hint */}
        <div style={{ marginTop: 22, color: '#9ca3af', fontSize: 12, textAlign: 'center', fontWeight: 400 }}>
          Enter your {pinLength}-digit PIN to continue
        </div>
      </div>

      {/* Bottom label */}
      <div style={{
        marginTop: 20, display: 'flex', alignItems: 'center', gap: 6,
        color: '#9ca3af', fontSize: 12,
      }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#d1d5db', display: 'inline-block' }} />
        Auto-locked after 2 minutes of inactivity
      </div>

      <style>{`
        @keyframes pinShake {
          0%,100% { transform: translateX(0); }
          15%      { transform: translateX(-9px); }
          30%      { transform: translateX(9px); }
          45%      { transform: translateX(-6px); }
          60%      { transform: translateX(6px); }
          75%      { transform: translateX(-3px); }
          90%      { transform: translateX(3px); }
        }
        @keyframes pinFadeIn {
          from { opacity: 0; transform: translateY(24px) scale(0.95); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
