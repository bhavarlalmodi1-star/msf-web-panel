"use client";
import { useState, useEffect } from 'react';
import { Card, Button, Typography, App, Segmented, Steps, Alert } from 'antd';
import {
  LockOutlined, UnlockOutlined, DeleteOutlined,
  CheckCircleOutlined, SafetyCertificateOutlined,
  EditOutlined, KeyOutlined, WarningOutlined,
} from '@ant-design/icons';
import { usePinLock } from '@/components/Base/PinLockContext';

const { Title, Text } = Typography;

// ─── Small PIN dot display ────────────────────────────────────────────────────
function PinDots({ value, length, shaking }) {
  return (
    <div style={{
      display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 8,
      animation: shaking ? 'pinShake 0.45s ease' : undefined,
    }}>
      {Array.from({ length }).map((_, i) => (
        <div key={i} style={{
          width: 16, height: 16, borderRadius: '50%',
          border: '2px solid #6366f1',
          background: i < value.length ? '#6366f1' : 'transparent',
          boxShadow: i < value.length ? '0 0 8px rgba(99,102,241,0.5)' : 'none',
          transition: 'background 0.15s ease, box-shadow 0.15s ease',
        }} />
      ))}
    </div>
  );
}

// ─── Inline mini numpad ───────────────────────────────────────────────────────
const NUMPAD = [['1','2','3'],['4','5','6'],['7','8','9'],['','0','⌫']];

function MiniNumpad({ onKey, disabled }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', marginTop: 4 }}>
      {NUMPAD.map((row, ri) => (
        <div key={ri} style={{ display: 'flex', gap: 8 }}>
          {row.map((k, ki) => (
            <button
              key={ki}
              onClick={() => k && onKey(k)}
              disabled={!k || disabled}
              style={{
                width: 60, height: 44, borderRadius: 10,
                border: !k ? 'none' : k === '⌫' ? '1px solid #fecaca' : '1px solid #e5e7eb',
                background: !k ? 'transparent' : k === '⌫' ? '#fef2f2' : '#f9fafb',
                color: k === '⌫' ? '#ef4444' : '#374151',
                fontSize: k === '⌫' ? 16 : 18,
                fontWeight: 600, cursor: !k ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.1s', outline: 'none',
                userSelect: 'none', opacity: disabled ? 0.5 : 1,
              }}
              onMouseEnter={e => { if (k) e.currentTarget.style.background = k === '⌫' ? '#fee2e2' : '#f3f4f6'; }}
              onMouseLeave={e => { if (k) e.currentTarget.style.background = k === '⌫' ? '#fef2f2' : '#f9fafb'; }}
            >
              {k}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── Single step: enter a PIN ─────────────────────────────────────────────────
function PinEntryStep({ label, hint, length, onComplete, shaking }) {
  const [value, setValue] = useState('');

  useEffect(() => {
    if (value.length === length) onComplete(value);
  }, [value, length]);

  const handleKey = (k) => {
    if (k === '⌫') setValue(p => p.slice(0, -1));
    else if (value.length < length) setValue(p => p + k);
  };

  // Reset when shaking (wrong PIN)
  useEffect(() => { if (shaking) setValue(''); }, [shaking]);

  return (
    <div style={{ textAlign: 'center' }}>
      <Text strong style={{ display: 'block', marginBottom: 4, color: '#374151' }}>{label}</Text>
      {hint && <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 16 }}>{hint}</Text>}

      <PinDots value={value} length={length} shaking={shaking} />
      <MiniNumpad onKey={handleKey} />
    </div>
  );
}

// ─── Mode: Set new PIN (two-step confirm) ─────────────────────────────────────
function SetPinFlow({ pinLength, onSuccess, onCancel }) {
  const { setupPin } = usePinLock();
  const { message }  = App.useApp();
  const [step,    setStep]    = useState(0); // 0=enter 1=confirm
  const [first,   setFirst]   = useState('');
  const [shaking, setShaking] = useState(false);
  const [saving,  setSaving]  = useState(false);

  const handleFirst  = (pin) => { setFirst(pin); setStep(1); };
  const handleConfirm = async (pin) => {
    if (pin !== first) {
      setShaking(true);
      setTimeout(() => { setShaking(false); }, 700);
      message.error('PINs do not match. Start again.');
      setTimeout(() => { setFirst(''); setStep(0); }, 700);
      return;
    }
    setSaving(true);
    await setupPin(pin, pinLength);
    setSaving(false);
    onSuccess();
  };

  return (
    <div>
      <Steps size="small" current={step} style={{ marginBottom: 24 }}
        items={[{ title: 'Enter PIN' }, { title: 'Confirm PIN' }]} />
      {step === 0 && <PinEntryStep key="set-0" label="Enter your new PIN"  hint={`Choose a ${pinLength}-digit PIN`} length={pinLength} onComplete={handleFirst} />}
      {step === 1 && <PinEntryStep key="set-1" label="Confirm your PIN"    hint="Re-enter the same PIN"           length={pinLength} onComplete={handleConfirm} shaking={shaking} />}
      <div style={{ textAlign: 'center', marginTop: 16 }}>
        <Button size="small" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

// ─── Mode: Verify current PIN then set new one ───────────────────────────────
function ChangePinFlow({ pinLength, onSuccess, onCancel }) {
  const { verifyPin, setupPin } = usePinLock();
  const { message } = App.useApp();
  const [step,    setStep]    = useState(0); // 0=current 1=new 2=confirm
  const [first,   setFirst]   = useState('');
  const [shaking, setShaking] = useState(false);

  const shake = (afterMs, fn) => {
    setShaking(true);
    setTimeout(() => { setShaking(false); fn && fn(); }, afterMs);
  };

  const handleCurrent = async (pin) => {
    const ok = await verifyPin(pin);
    if (!ok) { message.error('Current PIN is wrong.'); shake(700); return; }
    setStep(1);
  };

  const handleFirst = (pin) => { setFirst(pin); setStep(2); };

  const handleConfirm = async (pin) => {
    if (pin !== first) {
      message.error('New PINs do not match.');
      shake(700, () => { setFirst(''); setStep(1); });
      return;
    }
    await setupPin(pin, pinLength);
    onSuccess();
  };

  return (
    <div>
      <Steps size="small" current={step} style={{ marginBottom: 24 }}
        items={[{ title: 'Current PIN' }, { title: 'New PIN' }, { title: 'Confirm' }]} />
      {step === 0 && <PinEntryStep key="chg-0" label="Enter your current PIN" length={pinLength} onComplete={handleCurrent} shaking={shaking} />}
      {step === 1 && <PinEntryStep key="chg-1" label="Enter your new PIN"     hint="Choose a new PIN" length={pinLength} onComplete={handleFirst} />}
      {step === 2 && <PinEntryStep key="chg-2" label="Confirm your new PIN"   length={pinLength} onComplete={handleConfirm} shaking={shaking} />}
      <div style={{ textAlign: 'center', marginTop: 16 }}>
        <Button size="small" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

// ─── Mode: Remove PIN ─────────────────────────────────────────────────────────
function RemovePinFlow({ pinLength, onSuccess, onCancel }) {
  const { removePin } = usePinLock();
  const { message }   = App.useApp();
  const [shaking, setShaking] = useState(false);
  const [done,    setDone]    = useState(false);

  const handlePin = async (pin) => {
    const ok = await removePin(pin);
    if (!ok) {
      setShaking(true);
      message.error('Incorrect PIN.');
      setTimeout(() => setShaking(false), 600);
    } else {
      setDone(true);
      setTimeout(onSuccess, 800);
    }
  };

  return (
    <div style={{ textAlign: 'center' }}>
      {done
        ? <div style={{ color: '#10b981', fontSize: 32 }}><CheckCircleOutlined /></div>
        : <PinEntryStep label="Enter your current PIN to remove it" hint="This will disable the PIN lock" length={pinLength} onComplete={handlePin} shaking={shaking} />
      }
      {!done && (
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Button size="small" onClick={onCancel}>Cancel</Button>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function PinSecurityPage() {
  const { hasPin, pinLength } = usePinLock() || {};
  const { message } = App.useApp();

  const [mode,      setMode]      = useState(null);  // null | 'set' | 'change' | 'remove'
  const [chosenLen, setChosenLen] = useState(4);
  const [success,   setSuccess]   = useState('');

  useEffect(() => { if (pinLength) setChosenLen(pinLength); }, [pinLength]);

  const handleSuccess = (msg) => {
    setMode(null);
    setSuccess(msg);
    message.success(msg);
    setTimeout(() => setSuccess(''), 4000);
  };

  // ── Render active flow ────────────────────────────────────────────────────
  if (mode === 'set')    return <FlowCard title="Set PIN Lock"><SetPinFlow    pinLength={chosenLen} onSuccess={() => handleSuccess('PIN set successfully!')}     onCancel={() => setMode(null)} /></FlowCard>;
  if (mode === 'change') return <FlowCard title="Change PIN"><ChangePinFlow   pinLength={pinLength} onSuccess={() => handleSuccess('PIN changed successfully!')} onCancel={() => setMode(null)} /></FlowCard>;
  if (mode === 'remove') return <FlowCard title="Remove PIN"><RemovePinFlow   pinLength={pinLength} onSuccess={() => handleSuccess('PIN removed.')}              onCancel={() => setMode(null)} /></FlowCard>;

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '24px 16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
        <div style={{
          width: 48, height: 48, borderRadius: 14,
          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 6px 18px rgba(99,102,241,0.3)',
        }}>
          <SafetyCertificateOutlined style={{ color: '#fff', fontSize: 22 }} />
        </div>
        <div>
          <Title level={4} style={{ margin: 0 }}>PIN Security</Title>
          <Text type="secondary" style={{ fontSize: 13 }}>Auto-lock screen after 2 minutes of inactivity</Text>
        </div>
      </div>

      {/* Status card */}
      <Card bordered={false} style={{
        borderRadius: 16, marginBottom: 20,
        border: hasPin ? '1.5px solid #a5f3c4' : '1.5px solid #e5e7eb',
        background: hasPin ? 'linear-gradient(135deg, #f0fdf4, #ecfdf5)' : '#fafafa',
        boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            background: hasPin ? 'linear-gradient(135deg, #10b981, #059669)' : '#e5e7eb',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {hasPin ? <LockOutlined style={{ color: '#fff', fontSize: 18 }} /> : <UnlockOutlined style={{ color: '#9ca3af', fontSize: 18 }} />}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, color: hasPin ? '#065f46' : '#374151' }}>
              {hasPin ? `PIN Lock Active (${pinLength} digits)` : 'PIN Lock Disabled'}
            </div>
            <div style={{ fontSize: 12, color: hasPin ? '#059669' : '#9ca3af' }}>
              {hasPin ? 'Your screen locks after 2 minutes of inactivity' : 'Set a PIN to protect your session'}
            </div>
          </div>
          {hasPin && (
            <div style={{
              background: '#dcfce7', color: '#15803d', fontSize: 11,
              fontWeight: 600, padding: '3px 10px', borderRadius: 20,
            }}>Active</div>
          )}
        </div>
      </Card>

      {/* Success notice */}
      {success && (
        <Alert message={success} type="success" showIcon icon={<CheckCircleOutlined />}
          style={{ marginBottom: 20, borderRadius: 12 }} closable onClose={() => setSuccess('')} />
      )}

      {/* PIN Length selector (only when no PIN set) */}
      {!hasPin && (
        <Card bordered={false} style={{ borderRadius: 16, marginBottom: 20, border: '1.5px solid #e5e7eb', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <div style={{ marginBottom: 12, fontWeight: 600, color: '#374151' }}>Choose PIN Length</div>
          <Segmented
            value={chosenLen}
            onChange={setChosenLen}
            options={[
              { label: '4-Digit PIN', value: 4 },
              { label: '6-Digit PIN', value: 6 },
            ]}
            block
          />
          <Text type="secondary" style={{ fontSize: 12, marginTop: 8, display: 'block' }}>
            {chosenLen === 4 ? 'Simple & fast to enter' : 'More secure option'}
          </Text>
        </Card>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {!hasPin ? (
          <ActionCard
            icon={<LockOutlined style={{ color: '#6366f1', fontSize: 20 }} />}
            bg="#ede9fe" border="#c4b5fd"
            title="Set PIN Lock"
            desc="Enable auto-lock with a 4 or 6 digit PIN"
            action={<Button type="primary" style={{ background: '#6366f1', border: 'none', borderRadius: 8 }} onClick={() => setMode('set')}>Set PIN</Button>}
          />
        ) : (
          <>
            <ActionCard
              icon={<EditOutlined style={{ color: '#3b82f6', fontSize: 20 }} />}
              bg="#eff6ff" border="#bfdbfe"
              title="Change PIN"
              desc="Update your existing PIN to a new one"
              action={<Button style={{ borderRadius: 8 }} icon={<EditOutlined />} onClick={() => setMode('change')}>Change</Button>}
            />
            <ActionCard
              icon={<DeleteOutlined style={{ color: '#ef4444', fontSize: 20 }} />}
              bg="var(--primary-50)" border="var(--primary-200)"
              title="Remove PIN Lock"
              desc="Disable PIN lock — you'll need to enter your current PIN"
              action={<Button danger style={{ borderRadius: 8 }} icon={<DeleteOutlined />} onClick={() => setMode('remove')}>Remove</Button>}
            />
          </>
        )}
      </div>

      {/* Info box */}
      <div style={{
        marginTop: 24, padding: '14px 16px', borderRadius: 12,
        background: '#f8fafc', border: '1px solid #e2e8f0',
        display: 'flex', gap: 10, alignItems: 'flex-start',
      }}>
        <WarningOutlined style={{ color: '#94a3b8', marginTop: 2 }} />
        <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.6 }}>
          The PIN is stored securely on this device only. It is separate from your login password.
          If you forget your PIN, sign out and sign back in — this will reset the lock.
        </div>
      </div>

      <style>{`
        @keyframes pinShake {
          0%,100% { transform: translateX(0); }
          15%      { transform: translateX(-6px); }
          30%      { transform: translateX(6px); }
          45%      { transform: translateX(-4px); }
          60%      { transform: translateX(4px); }
          75%      { transform: translateX(-2px); }
          90%      { transform: translateX(2px); }
        }
      `}</style>
    </div>
  );
}

// ─── Wrapper card for active flows ────────────────────────────────────────────
function FlowCard({ title, children }) {
  return (
    <div style={{ maxWidth: 420, margin: '40px auto', padding: '0 16px' }}>
      <Card bordered={false} style={{ borderRadius: 20, boxShadow: '0 8px 32px rgba(0,0,0,0.08)', border: '1.5px solid #e5e7eb' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{
            display: 'inline-flex', width: 48, height: 48, borderRadius: 14,
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            alignItems: 'center', justifyContent: 'center', marginBottom: 12,
          }}>
            <KeyOutlined style={{ color: '#fff', fontSize: 22 }} />
          </div>
          <Title level={4} style={{ margin: 0 }}>{title}</Title>
        </div>
        {children}
      </Card>
    </div>
  );
}

// ─── Action card row ──────────────────────────────────────────────────────────
function ActionCard({ icon, bg, border, title, desc, action }) {
  return (
    <Card bordered={false} style={{ borderRadius: 14, border: `1.5px solid ${border}`, background: bg, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, color: '#1f2937', fontSize: 14 }}>{title}</div>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{desc}</div>
        </div>
        {action}
      </div>
    </Card>
  );
}
