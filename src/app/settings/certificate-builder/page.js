"use client";
// Certificate Builder — change what the membership certificate prints, and see
// the real PDF while doing it.
//
// Everything here is saved as one value (`certificateConfig`, JSON text) on
// settings/trustInfo. The certificate PDF reads it wherever it is made: the
// Members page, bulk downloads, and the server routes that send the
// certificate on WhatsApp. Nothing else needs editing.
//
// Trust name, address, phone numbers, logos and colours are NOT here — they
// belong to Settings → Trust Details and are shared with every other PDF.
// The frame picture can be changed here as well; it is the same trust image
// (framePath / frameUrl) that Trust Details shows.

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import {
  Card, Button, Input, message, Row, Col, Typography, Space, Upload, Spin, Alert,
  Popconfirm, Tag, Tooltip, Switch, Select, Slider, Segmented, Collapse, Popover,
} from 'antd';
import {
  SaveOutlined, ReloadOutlined, UploadOutlined, LoadingOutlined, UndoOutlined,
  EyeOutlined, PlusOutlined, DeleteOutlined, ArrowUpOutlined, ArrowDownOutlined,
  SwapOutlined, SearchOutlined, QuestionCircleOutlined, SafetyCertificateOutlined,
  DownloadOutlined,
} from '@ant-design/icons';
import { pdf } from '@react-pdf/renderer';
import {
  doc, getDoc, setDoc, serverTimestamp, collection, query, where, getDocs, limit,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, auth } from '../../../../lib/firbase-client';
import { useAuth } from '@/components/Base/AuthProvider';
import { useTrust } from '@/utils/trust/useTrust';
import {
  TRUST_DOC_PATH, TRUST_STORAGE_FOLDER, setTrust, getTrustRaw, isTrustStoragePath,
} from '@/utils/trust/trustStore';
import {
  DEFAULT_CERT_FIELDS, CERT_FIELD_SOURCES, CERT_PLACEHOLDERS, CERT_MAX_FIELDS,
  CERT_SAMPLE_MEMBER, CERT_SAMPLE_PROGRAM, normalizeCertificate, serializeCertificate,
} from '@/utils/trust/certificateConfig';
import CertificateCom from '@/app/members/components/MemberPdf/CertificateCom';
import BuiltInFrame from '@/app/api/helper/Images/FraameImg';

const { Title, Text } = Typography;

const SOURCE_OPTIONS = CERT_FIELD_SOURCES.map((s) => ({ value: s.key, label: s.label }));
const COLOR_OPTIONS = [
  { value: 'primary', label: 'Main colour' },
  { value: 'accent', label: 'Second colour' },
  { value: 'black', label: 'Black' },
];
const imageAddress = (path) =>
  (path && typeof window !== 'undefined' ? `${window.location.origin}/api/trust-image?p=${encodeURIComponent(path)}` : '');

// PDFs can only embed PNG and JPEG — whatever is chosen (WebP, a huge phone
// photo…) is re-drawn on a canvas: resized, saved as PNG, or JPEG when the
// original was a JPEG or the PNG would be too big for Storage (5 MB limit).
const prepareImage = (file, maxSide) => new Promise((resolve, reject) => {
  const objectUrl = URL.createObjectURL(file);
  const img = new window.Image();
  img.onload = () => {
    try {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext('2d');
      const encode = (asJpeg) => new Promise((res) => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (asJpeg) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => res(blob && { blob, ext: asJpeg ? 'jpg' : 'png', type: asJpeg ? 'image/jpeg' : 'image/png', width: img.width, height: img.height }),
          asJpeg ? 'image/jpeg' : 'image/png', 0.92,
        );
      });
      (async () => {
        let out = await encode(file.type === 'image/jpeg');
        if (out && out.ext === 'png' && out.blob.size > 4.5 * 1024 * 1024) out = await encode(true);
        URL.revokeObjectURL(objectUrl);
        if (!out) reject(new Error('Could not process this image'));
        else if (out.blob.size > 4.9 * 1024 * 1024) reject(new Error('Image is too large even after resizing'));
        else resolve(out);
      })();
    } catch (err) { URL.revokeObjectURL(objectUrl); reject(err); }
  };
  img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('This file is not a readable image')); };
  img.src = objectUrl;
});

const NO_FRAME = { framePath: '', frameUrl: '' };
const PAGE_RATIO = 210 / 148;   // the certificate is A5 landscape

// ── Small building blocks (defined outside the page so typing never loses focus) ──
const OnOff = ({ label, hint, checked, onChange, disabled }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '6px 0' }}>
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 13, fontWeight: 500 }}>{label}</div>
      {hint && <div style={{ fontSize: 11, color: '#6b7280' }}>{hint}</div>}
    </div>
    <Switch checked={checked} onChange={onChange} disabled={disabled} />
  </div>
);

const TextBox = ({ label, hint, value, onChange, maxLength, disabled, placeholder, rows }) => (
  <div style={{ padding: '6px 0' }}>
    <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 3, color: '#374151' }}>{label}</div>
    {rows ? (
      <Input.TextArea value={value} onChange={(e) => onChange(e.target.value)} maxLength={maxLength}
        disabled={disabled} placeholder={placeholder} autoSize={{ minRows: rows, maxRows: rows + 2 }} />
    ) : (
      <Input value={value} onChange={(e) => onChange(e.target.value)} maxLength={maxLength}
        disabled={disabled} placeholder={placeholder} />
    )}
    {hint && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{hint}</div>}
  </div>
);

// A line that can be switched off and whose wording can be changed
const LineWithText = ({ label, on, onToggle, text, onText, maxLength, disabled, hint }) => (
  <div style={{ padding: '6px 0' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <Switch size="small" checked={on} onChange={onToggle} disabled={disabled} />
      <div style={{ fontSize: 13, fontWeight: 500, flexShrink: 0, minWidth: 120 }}>{label}</div>
      <Input value={text} onChange={(e) => onText(e.target.value)} maxLength={maxLength}
        disabled={disabled || !on} style={{ flex: 1, minWidth: 0 }} />
    </div>
    {hint && <div style={{ fontSize: 11, color: '#6b7280', margin: '2px 0 0 46px' }}>{hint}</div>}
  </div>
);

const Divider = () => <div style={{ borderTop: '1px solid #f0f0f0', margin: '8px 0' }} />;

const WordsHelp = () => (
  <Popover
    trigger="click" placement="bottomLeft" title="Words that fill in by themselves"
    content={(
      <div style={{ maxWidth: 330 }}>
        <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>
          Type a word in curly brackets inside any text box and the certificate prints that
          member&apos;s value in its place. Click one to copy it.
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
          {CERT_PLACEHOLDERS.map((p) => (
            <Tooltip key={p.key} title={p.label}>
              <Tag style={{ cursor: 'pointer', margin: 0 }} onClick={() => {
                navigator.clipboard?.writeText(`{${p.key}}`).then(
                  () => message.success(`{${p.key}} copied — paste it into a text box`),
                  () => message.info(`Type {${p.key}} into a text box`),
                );
              }}>{`{${p.key}}`}</Tag>
            </Tooltip>
          ))}
        </div>
      </div>
    )}
  >
    <Button size="small" icon={<QuestionCircleOutlined />}>Auto-fill words</Button>
  </Popover>
);

// One detail row in the editor
const FieldRow = ({ f, first, last, disabled, onChange, onMove, onSwap, onRemove }) => (
  <div style={{
    border: '1px solid #eef0f3', borderRadius: 8, padding: 8, marginBottom: 6,
    background: f.show ? '#fff' : '#fafafa', opacity: f.show ? 1 : 0.7,
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <Tooltip title={f.show ? 'Printed — switch off to hide' : 'Hidden — switch on to print'}>
        <Switch size="small" checked={f.show} onChange={(v) => onChange({ show: v })} disabled={disabled} />
      </Tooltip>
      <Input value={f.label} onChange={(e) => onChange({ label: e.target.value })} maxLength={40}
        placeholder="Label" disabled={disabled} style={{ flex: '1 1 110px', minWidth: 90 }} />
      <Select value={f.source} onChange={(v) => onChange({ source: v })} options={SOURCE_OPTIONS}
        disabled={disabled} showSearch optionFilterProp="label" style={{ flex: '1 1 150px', minWidth: 130 }} />
      <Space.Compact>
        <Tooltip title="Move up"><Button size="small" icon={<ArrowUpOutlined />} disabled={disabled || first} onClick={() => onMove(-1)} /></Tooltip>
        <Tooltip title="Move down"><Button size="small" icon={<ArrowDownOutlined />} disabled={disabled || last} onClick={() => onMove(1)} /></Tooltip>
        <Tooltip title="Move to the other column"><Button size="small" icon={<SwapOutlined />} disabled={disabled} onClick={onSwap} /></Tooltip>
        <Popconfirm title="Remove this row?" okText="Remove" onConfirm={onRemove} disabled={disabled}>
          <Button size="small" danger icon={<DeleteOutlined />} disabled={disabled} />
        </Popconfirm>
      </Space.Compact>
    </div>
    {f.source === 'custom' && (
      <Input value={f.text} onChange={(e) => onChange({ text: e.target.value })} maxLength={120} disabled={disabled}
        placeholder="Text to print (auto-fill words like {phone} work here)" style={{ marginTop: 6 }} />
    )}
  </div>
);

export default function CertificateBuilderPage() {
  const { user } = useAuth();
  const trust = useTrust();
  const canEdit = user?.role === 'superadmin' || user?.role === 'admin';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cfg, setCfg] = useState(() => normalizeCertificate());
  const [savedJson, setSavedJson] = useState(() => serializeCertificate());
  const [lastSaved, setLastSaved] = useState(null);
  const [uploadingKey, setUploadingKey] = useState(null);
  // Frame picture — a trust image (same one Trust Details shows)
  const [frame, setFrame] = useState(NO_FRAME);
  const [savedFrame, setSavedFrame] = useState(NO_FRAME);
  const [frameNote, setFrameNote] = useState('');

  // Preview
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [sampleMode, setSampleMode] = useState('sample');          // 'sample' | 'member'
  const [realMember, setRealMember] = useState(null);              // { member, program }
  const [searchText, setSearchText] = useState('');
  const [searching, setSearching] = useState(false);
  const previewRun = useRef(0);
  const previewUrlRef = useRef('');

  const disabled = !canEdit || saving;
  const dirty = useMemo(
    () => serializeCertificate(cfg) !== savedJson || frame.framePath !== savedFrame.framePath,
    [cfg, savedJson, frame, savedFrame],
  );
  const set = (key) => (value) => setCfg((prev) => ({ ...prev, [key]: value }));

  // ── Load ────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, ...TRUST_DOC_PATH));
      const data = snap.exists() ? snap.data() : {};
      const loaded = normalizeCertificate(typeof data.certificateConfig === 'string' ? data.certificateConfig : '');
      setCfg(loaded);
      setSavedJson(serializeCertificate(loaded));
      const loadedFrame = isTrustStoragePath(data.framePath)
        ? { framePath: data.framePath, frameUrl: typeof data.frameUrl === 'string' ? data.frameUrl : '' }
        : NO_FRAME;
      setFrame(loadedFrame);
      setSavedFrame(loadedFrame);
      setFrameNote('');
      setLastSaved(data.certificateUpdatedAt?.toDate ? data.certificateUpdatedAt.toDate() : null);
    } catch (e) {
      console.error('Failed to load certificate layout:', e);
      message.error('Could not load the certificate layout');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Leaving with unsaved changes → the browser asks first
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // ── Save ────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    try {
      const json = serializeCertificate(cfg);
      await setDoc(doc(db, ...TRUST_DOC_PATH), {
        certificateConfig: json,
        framePath: frame.framePath,
        frameUrl: frame.frameUrl,
        certificateUpdatedAt: serverTimestamp(),
        certificateUpdatedBy: auth.currentUser?.uid || null,
      }, { merge: true });

      // Apply at once in this tab (other tabs / users get it through the live listener)
      setTrust({ ...getTrustRaw(), certificateConfig: json, framePath: frame.framePath, frameUrl: frame.frameUrl });
      // Drop the server's short cache so WhatsApp certificates use it immediately
      fetch('/api/trust-info?refresh=1').catch(() => {});

      setCfg(normalizeCertificate(json));
      setSavedJson(json);
      setSavedFrame(frame);
      setLastSaved(new Date());
      message.success('Certificate saved — every new certificate now uses this layout');
    } catch (e) {
      console.error(e);
      message.error(e?.code === 'permission-denied'
        ? 'Save failed: only an admin or superadmin can change the certificate'
        : 'Save failed: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const resetAll = () => {
    setCfg(normalizeCertificate());
    setFrame(NO_FRAME);
    setFrameNote('');
    message.info('Back to the original certificate — press Save to keep it');
  };

  // ── Detail rows ─────────────────────────────────────────────────────────
  const patchField = (id, patch) => setCfg((prev) => ({
    ...prev, fields: prev.fields.map((f) => (f.id === id ? { ...f, ...patch } : f)),
  }));
  const removeField = (id) => setCfg((prev) => ({ ...prev, fields: prev.fields.filter((f) => f.id !== id) }));
  // To the other column — it lands at the bottom of that column
  const swapColumn = (id) => setCfg((prev) => {
    const f = prev.fields.find((x) => x.id === id);
    if (!f) return prev;
    return {
      ...prev,
      fields: [...prev.fields.filter((x) => x.id !== id), { ...f, col: f.col === 'right' ? 'left' : 'right' }],
    };
  });
  // Up / down inside its own column: swap places with the neighbour of the same column
  const moveField = (id, dir) => setCfg((prev) => {
    const list = [...prev.fields];
    const from = list.findIndex((f) => f.id === id);
    if (from < 0) return prev;
    let to = from + dir;
    while (to >= 0 && to < list.length && list[to].col !== list[from].col) to += dir;
    if (to < 0 || to >= list.length) return prev;
    [list[from], list[to]] = [list[to], list[from]];
    return { ...prev, fields: list };
  });
  const addField = (col) => setCfg((prev) => {
    if (prev.fields.length >= CERT_MAX_FIELDS) return prev;
    const used = new Set(prev.fields.map((f) => f.source));
    const next = CERT_FIELD_SOURCES.find((s) => s.key !== 'custom' && !used.has(s.key)) || CERT_FIELD_SOURCES[0];
    return {
      ...prev,
      fields: [...prev.fields, { id: `f${Date.now().toString(36)}`, label: next.label, source: next.key, col, show: true, text: '' }],
    };
  });

  // ── Frame picture ───────────────────────────────────────────────────────
  const uploadFrame = async (file) => {
    if (!file.type?.startsWith('image/')) { message.error('Please choose an image file'); return Upload.LIST_IGNORE; }
    setUploadingKey('frame');
    try {
      const { blob, ext, type, width, height } = await prepareImage(file, 2400);
      const path = `${TRUST_STORAGE_FOLDER}/frame_${Date.now()}.${ext}`;
      const r = ref(storage, path);
      await uploadBytes(r, blob, { contentType: type, cacheControl: 'public, max-age=31536000' });
      let url = '';
      try { url = await getDownloadURL(r); } catch { /* the PDF only needs the path */ }
      setFrame({ framePath: path, frameUrl: url });
      // A picture that is not the page's shape gets stretched — say so, and how to avoid it
      const ratio = width / height;
      setFrameNote(Math.abs(ratio - PAGE_RATIO) / PAGE_RATIO > 0.06
        ? (ratio < 1
          ? 'This picture is upright, but the certificate is a wide page. It will look stretched — use a wide (landscape) picture.'
          : 'This picture is not the same shape as the page (210 × 148 mm), so it is stretched a little. Choose “Keep its shape” below if it looks wrong.')
        : '');
      message.success('Frame picture added — check the preview, then press Save');
    } catch (e) {
      console.error(e);
      message.error('Upload failed: ' + e.message);
    } finally {
      setUploadingKey(null);
    }
    return Upload.LIST_IGNORE;
  };

  // ── Signature pictures ──────────────────────────────────────────────────
  const uploadSign = (side) => async (file) => {
    if (!file.type?.startsWith('image/')) { message.error('Please choose an image file'); return Upload.LIST_IGNORE; }
    setUploadingKey(side);
    try {
      const { blob, ext, type } = await prepareImage(file, 700);
      const path = `${TRUST_STORAGE_FOLDER}/certsign_${side}_${Date.now()}.${ext}`;
      await uploadBytes(ref(storage, path), blob, { contentType: type, cacheControl: 'public, max-age=31536000' });
      set(`${side}SignPath`)(path);
      message.success('Signature added — press Save to keep it');
    } catch (e) {
      console.error(e);
      message.error('Upload failed: ' + e.message);
    } finally {
      setUploadingKey(null);
    }
    return Upload.LIST_IGNORE;
  };

  // ── Preview with a real member ──────────────────────────────────────────
  const findMember = async () => {
    const typed = searchText.trim();
    if (!typed) { message.info('Type a member number first'); return; }
    setSearching(true);
    try {
      let found = null;
      for (const candidate of [...new Set([typed, typed.toUpperCase()])]) {
        const snap = await getDocs(query(collection(db, 'members'), where('registrationNumber', '==', candidate), limit(1)));
        if (!snap.empty) { found = { id: snap.docs[0].id, ...snap.docs[0].data() }; break; }
      }
      if (!found) { message.warning(`No member found with number ${typed}`); return; }

      let program = null;
      if (found.programId) {
        const p = await getDoc(doc(db, 'programs', found.programId));
        if (p.exists()) program = { id: p.id, ...p.data() };
      }
      let agentName = found.agentName || found.addedByName || '';
      if (!agentName && found.agentId) {
        const a = await getDoc(doc(db, 'agents', found.agentId));
        if (a.exists()) agentName = a.data().name || '';
      }
      setRealMember({
        member: { ...found, agentName, dateJoin: found.programJoinDate || found.dateJoin || '' },
        program,
      });
      setSampleMode('member');
    } catch (e) {
      console.error(e);
      message.error('Could not load that member: ' + e.message);
    } finally {
      setSearching(false);
    }
  };

  const previewMember = sampleMode === 'member' && realMember ? realMember.member : CERT_SAMPLE_MEMBER;
  const previewProgram = sampleMode === 'member' && realMember ? realMember.program : CERT_SAMPLE_PROGRAM;

  // The certificate exactly as it will print, with the layout being edited
  const draftTrust = useMemo(() => {
    const certificate = normalizeCertificate(cfg);
    certificate.leftSignSrc = imageAddress(certificate.leftSignPath);
    certificate.rightSignSrc = imageAddress(certificate.rightSignPath);
    return {
      ...trust,
      certificate,
      // the frame picture chosen on this page (not yet saved) shows in the preview
      framePath: frame.framePath,
      hasCustomFrame: !!frame.framePath,
      frameSrc: imageAddress(frame.framePath),
    };
  }, [cfg, trust, frame]);

  // Re-make the PDF a moment after the last change
  useEffect(() => {
    if (loading) return undefined;
    const run = ++previewRun.current;
    setPreviewBusy(true);
    const timer = setTimeout(async () => {
      try {
        const blob = await pdf(
          <CertificateCom data={previewMember} memberProgram={previewProgram} trust={draftTrust} />,
        ).toBlob();
        if (run !== previewRun.current) return;                // a newer change is already on its way
        const next = URL.createObjectURL(blob);
        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = next;
        setPreviewUrl(next);
        setPreviewError('');
      } catch (e) {
        if (run !== previewRun.current) return;
        console.error('Certificate preview failed:', e);
        setPreviewError(e?.message || 'Unknown error');
      } finally {
        if (run === previewRun.current) setPreviewBusy(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [draftTrust, previewMember, previewProgram, loading]);

  // Free the last preview when leaving the page
  useEffect(() => () => { if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current); }, []);

  if (loading) {
    return (
      <div style={{ padding: 60, textAlign: 'center' }}>
        <Spin indicator={<LoadingOutlined style={{ fontSize: 28 }} spin />} />
      </div>
    );
  }

  // ── Pieces of the form ──────────────────────────────────────────────────
  const leftRows = cfg.fields.filter((f) => f.col !== 'right');
  const rightRows = cfg.fields.filter((f) => f.col === 'right');
  const shownRows = Math.max(leftRows.filter((f) => f.show).length, rightRows.filter((f) => f.show).length);
  const tightFit = shownRows * (cfg.detailFontSize * 1.45 + 4) > 118;
  const canAdd = cfg.fields.length < CERT_MAX_FIELDS;

  const rowList = (title, rows, col) => (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <Text strong style={{ fontSize: 12.5 }}>{title} <Text type="secondary" style={{ fontWeight: 400 }}>({rows.filter((f) => f.show).length} printed)</Text></Text>
        <Button size="small" icon={<PlusOutlined />} disabled={disabled || !canAdd} onClick={() => addField(col)}>Add row</Button>
      </div>
      {rows.length === 0 && <div style={{ fontSize: 12, color: '#9ca3af', padding: '4px 0 8px' }}>No rows in this column.</div>}
      {rows.map((f, i) => (
        <FieldRow key={f.id} f={f} first={i === 0} last={i === rows.length - 1} disabled={disabled}
          onChange={(patch) => patchField(f.id, patch)} onMove={(dir) => moveField(f.id, dir)}
          onSwap={() => swapColumn(f.id)} onRemove={() => removeField(f.id)} />
      ))}
    </div>
  );

  const signBox = (side, title) => {
    const path = cfg[`${side}SignPath`];
    const busy = uploadingKey === side;
    return (
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '6px 0' }}>
        <div style={{
          width: 110, height: 44, flexShrink: 0, borderRadius: 6, border: '1px dashed #d1d5db', background: '#fafafa',
          display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
        }}>
          {busy ? <Spin size="small" /> : path ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageAddress(path)} alt={title} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          ) : <Text type="secondary" style={{ fontSize: 11 }}>No picture</Text>}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 500 }}>{title}</div>
          {canEdit && (
            <Space size={6} wrap style={{ marginTop: 4 }}>
              <Upload accept="image/*" showUploadList={false} beforeUpload={uploadSign(side)} disabled={!!uploadingKey || saving}>
                <Button size="small" icon={<UploadOutlined />} loading={busy} disabled={!!uploadingKey || saving}>
                  {path ? 'Replace' : 'Upload'}
                </Button>
              </Upload>
              {path && <Button size="small" icon={<DeleteOutlined />} onClick={() => set(`${side}SignPath`)('')} disabled={saving}>Remove</Button>}
            </Space>
          )}
        </div>
      </div>
    );
  };

  const sections = [
    {
      key: 'frame',
      label: '1. Frame picture and page space',
      children: (
        <>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{
              width: 170, aspectRatio: '210 / 148', flexShrink: 0, borderRadius: 8, border: '1px solid #e5e7eb',
              background: '#fafafa', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
            }}>
              {uploadingKey === 'frame' ? <Spin /> : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={frame.framePath ? imageAddress(frame.framePath) : BuiltInFrame} alt="Frame"
                  style={{ width: '100%', height: '100%', objectFit: cfg.frameFit === 'contain' ? 'contain' : 'fill', opacity: cfg.showFrame ? 1 : 0.35 }} />
              )}
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>
                Frame picture{' '}
                {frame.framePath ? <Tag color="green">Your picture</Tag> : <Tag>Built-in</Tag>}
                {frame.framePath !== savedFrame.framePath && <Tag color="orange">not saved yet</Tag>}
              </div>
              <div style={{ fontSize: 11, color: '#6b7280', margin: '2px 0 8px' }}>
                The border / background of the whole certificate. Best: a wide picture, 2480 × 1748 pixels
                (same shape as the page, 210 × 148 mm), with an empty middle for the text. JPG or PNG.
              </div>
              {canEdit && (
                <Space size={6} wrap>
                  <Upload accept="image/*" showUploadList={false} beforeUpload={uploadFrame} disabled={!!uploadingKey || saving}>
                    <Button size="small" type="primary" ghost icon={<UploadOutlined />} loading={uploadingKey === 'frame'} disabled={!!uploadingKey || saving}>
                      {frame.framePath ? 'Change picture' : 'Upload picture'}
                    </Button>
                  </Upload>
                  {frame.framePath && (
                    <Popconfirm title="Go back to the built-in frame?" okText="Yes" disabled={saving}
                      onConfirm={() => { setFrame(NO_FRAME); setFrameNote(''); }}>
                      <Button size="small" icon={<UndoOutlined />} disabled={saving}>Use built-in</Button>
                    </Popconfirm>
                  )}
                </Space>
              )}
            </div>
          </div>
          {frameNote && <Alert type="warning" showIcon style={{ marginTop: 10 }} title={frameNote} />}
          <Divider />
          <OnOff label="Print the frame picture" hint="Off = plain white page (for pre-printed paper)."
            checked={cfg.showFrame} onChange={set('showFrame')} disabled={disabled} />
          {cfg.showFrame && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '6px 0', flexWrap: 'wrap' }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>How the picture is placed</div>
              <Segmented value={cfg.frameFit} onChange={set('frameFit')} disabled={disabled}
                options={[{ value: 'fill', label: 'Fill the whole page' }, { value: 'contain', label: 'Keep its shape' }]} />
            </div>
          )}
          <Divider />
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>
            If the text touches or covers the frame, give it more space. If the frame is thin, give less and the text gets more room.
          </div>
          <div style={{ fontSize: 12, fontWeight: 500, color: '#374151' }}>Space at the left and right</div>
          <div style={{ padding: '0 22px' }}>
            <Slider min={15} max={60} value={cfg.padX} onChange={set('padX')} disabled={disabled}
              marks={{ 15: 'less', 35: 'normal', 60: 'more' }} />
          </div>
          <div style={{ fontSize: 12, fontWeight: 500, color: '#374151', marginTop: 14 }}>Space at the top and bottom</div>
          <div style={{ padding: '0 22px' }}>
            <Slider min={15} max={60} value={cfg.padY} onChange={set('padY')} disabled={disabled}
              marks={{ 15: 'less', 35: 'normal', 60: 'more' }} />
          </div>
        </>
      ),
    },
    {
      key: 'top',
      label: '2. Top part — heading, logos, title',
      children: (
        <>
          <TextBox label="Certificate title (the coloured badge)" value={cfg.title} onChange={set('title')}
            maxLength={60} disabled={disabled} hint="Leave empty to print no badge." />
          <Divider />
          <LineWithText label="Address line" on={cfg.showAddress} onToggle={set('showAddress')}
            text={cfg.addressLabel} onText={set('addressLabel')} maxLength={40} disabled={disabled} />
          <LineWithText label="Phone line" on={cfg.showContact} onToggle={set('showContact')}
            text={cfg.contactLabel} onText={set('contactLabel')} maxLength={40} disabled={disabled}
            hint="The address and numbers themselves come from Trust Details." />
          <Divider />
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <OnOff label="Blessing lines (very top)" checked={cfg.showBlessings} onChange={set('showBlessings')} disabled={disabled} />
              <OnOff label="Trust logo (left)" checked={cfg.showLogo} onChange={set('showLogo')} disabled={disabled} />
              <OnOff label="“SINCE” year under the logo" checked={cfg.showSince} onChange={set('showSince')} disabled={disabled} />
              <OnOff label="State names beside the title" checked={cfg.showStates} onChange={set('showStates')} disabled={disabled} />
            </Col>
            <Col xs={24} sm={12}>
              <OnOff label="Right-side picture" checked={cfg.showRightImage} onChange={set('showRightImage')} disabled={disabled} />
              <OnOff label="Reg. No. under the picture" checked={cfg.showRegNo} onChange={set('showRegNo')} disabled={disabled} />
              <OnOff label="Faded logo behind the page" checked={cfg.showWatermark} onChange={set('showWatermark')} disabled={disabled} />
            </Col>
          </Row>
          {cfg.showWatermark && (
            <div style={{ padding: '4px 0' }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: '#374151' }}>How strong the faded logo is</div>
              <div style={{ padding: '0 22px' }}>
                <Slider min={2} max={30} value={cfg.watermarkOpacity} onChange={set('watermarkOpacity')} disabled={disabled}
                  marks={{ 2: 'light', 8: 'normal', 30: 'strong' }} />
              </div>
            </div>
          )}
        </>
      ),
    },
    {
      key: 'line',
      label: '3. Member number, yojna and date line',
      children: (
        <>
          <LineWithText label="Member number" on={cfg.showMemberNo} onToggle={set('showMemberNo')}
            text={cfg.memberNoLabel} onText={set('memberNoLabel')} maxLength={40} disabled={disabled} />
          <LineWithText label="Yojna (middle)" on={cfg.showScheme} onToggle={set('showScheme')}
            text={cfg.schemeText} onText={set('schemeText')} maxLength={120} disabled={disabled}
            hint="{programName} = yojna name, {groupName} = age group." />
          <LineWithText label="Date" on={cfg.showDate} onToggle={set('showDate')}
            text={cfg.dateLabel} onText={set('dateLabel')} maxLength={40} disabled={disabled} />
        </>
      ),
    },
    {
      key: 'rows',
      label: `4. Member details — ${cfg.fields.filter((f) => f.show).length} rows`,
      children: (
        <>
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>
            Each row prints a label and one detail of the member. Change the label, choose what it shows,
            switch a row off to hide it, or move it with the arrows.
          </div>
          {tightFit && (
            <Alert type="warning" showIcon style={{ marginBottom: 10 }}
              title="This many rows may not fit on the page — check the preview, hide a row or make the text smaller." />
          )}
          {rowList('Left column', leftRows, 'left')}
          {rowList('Right column', rightRows, 'right')}
          {!canAdd && <div style={{ fontSize: 11, color: '#b45309' }}>The certificate can hold at most {CERT_MAX_FIELDS} rows.</div>}
          <Popconfirm title="Put the 12 original rows back?" okText="Yes" disabled={disabled}
            onConfirm={() => set('fields')(DEFAULT_CERT_FIELDS.map((f) => ({ ...f })))}>
            <Button size="small" icon={<UndoOutlined />} disabled={disabled}>Original rows</Button>
          </Popconfirm>
        </>
      ),
    },
    {
      key: 'look',
      label: '5. Photo and text style',
      children: (
        <>
          <OnOff label="Member photo" hint="Off = the details use the full width."
            checked={cfg.showPhoto} onChange={set('showPhoto')} disabled={disabled} />
          <OnOff label="Print details in CAPITAL letters" hint="Only changes English text."
            checked={cfg.valuesUppercase} onChange={set('valuesUppercase')} disabled={disabled} />
          <Divider />
          <div style={{ fontSize: 12, fontWeight: 500, color: '#374151' }}>Size of the detail text</div>
          <div style={{ padding: '0 22px' }}>
            <Slider min={7} max={13} step={0.5} value={cfg.detailFontSize} onChange={set('detailFontSize')} disabled={disabled}
              marks={{ 7: 'small', 10: 'normal', 13: 'big' }} />
          </div>
          <div style={{ fontSize: 12, fontWeight: 500, color: '#374151', marginTop: 14 }}>Room for the labels</div>
          <div style={{ padding: '0 22px' }}>
            <Slider min={15} max={55} value={cfg.labelWidth} onChange={set('labelWidth')} disabled={disabled}
              marks={{ 15: 'narrow', 30: 'normal', 55: 'wide' }} />
          </div>
          <Row gutter={12} style={{ marginTop: 14 }}>
            <Col xs={24} sm={12}>
              <div style={{ fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 3 }}>Label colour</div>
              <Select value={cfg.labelColor} onChange={set('labelColor')} options={COLOR_OPTIONS} disabled={disabled} style={{ width: '100%' }} />
            </Col>
            <Col xs={24} sm={12}>
              <div style={{ fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 3 }}>Detail colour</div>
              <Select value={cfg.valueColor} onChange={set('valueColor')} options={COLOR_OPTIONS} disabled={disabled} style={{ width: '100%' }} />
            </Col>
          </Row>
          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 6 }}>
            Main and second colour are the PDF colours from Trust Details.
          </div>
        </>
      ),
    },
    {
      key: 'amount',
      label: '6. Amount, rules and note lines',
      children: (
        <>
          <LineWithText label="Sahyog amount" on={cfg.showContribution} onToggle={set('showContribution')}
            text={cfg.contributionText} onText={set('contributionText')} maxLength={200} disabled={disabled}
            hint="{payAmount} = the member's sahyog amount." />
          <LineWithText label="Join fee pending" on={cfg.showJoinFee} onToggle={set('showJoinFee')}
            text={cfg.joinFeeText} onText={set('joinFeeText')} maxLength={120} disabled={disabled}
            hint="{joinFeePending} = the amount still pending." />
          <LineWithText label="Yojna rules" on={cfg.showRules} onToggle={set('showRules')}
            text={cfg.rulesLabel} onText={set('rulesLabel')} maxLength={40} disabled={disabled}
            hint="This box is only the heading. The rule text is written on each yojna (Programs → Yojna)." />
          <Divider />
          <TextBox label="Extra note (printed under the rules)" value={cfg.note} onChange={set('note')}
            maxLength={300} rows={2} disabled={disabled} placeholder="Optional — leave empty for no note" />
        </>
      ),
    },
    {
      key: 'footer',
      label: '7. Bottom part — names and signatures',
      children: (
        <>
          <OnOff label="Left side" checked={cfg.showLeft} onChange={set('showLeft')} disabled={disabled} />
          {cfg.showLeft && (
            <Row gutter={12}>
              <Col xs={24} sm={12}><TextBox label="Heading" value={cfg.leftLabel} onChange={set('leftLabel')} maxLength={40} disabled={disabled} /></Col>
              <Col xs={24} sm={12}><TextBox label="Name under it" value={cfg.leftText} onChange={set('leftText')} maxLength={80} disabled={disabled} hint="{agentName} = the member's agent." /></Col>
              <Col xs={24}>{signBox('left', 'Signature picture (optional)')}</Col>
            </Row>
          )}
          <Divider />
          <OnOff label="Middle lines" checked={cfg.showCenter} onChange={set('showCenter')} disabled={disabled} />
          {cfg.showCenter && (
            <>
              <TextBox label="Line 1" value={cfg.centerLine1} onChange={set('centerLine1')} maxLength={160} disabled={disabled}
                hint="{slogan} = the slogan from Trust Details. You can also type your own text." />
              <TextBox label="Line 2" value={cfg.centerLine2} onChange={set('centerLine2')} maxLength={160} disabled={disabled}
                hint="{jurisdiction} = the jurisdiction line from Trust Details." />
            </>
          )}
          <Divider />
          <OnOff label="Right side" checked={cfg.showRight} onChange={set('showRight')} disabled={disabled} />
          {cfg.showRight && (
            <Row gutter={12}>
              <Col xs={24} sm={8}><TextBox label="Heading" value={cfg.rightLabel} onChange={set('rightLabel')} maxLength={40} disabled={disabled} /></Col>
              <Col xs={24} sm={8}><TextBox label="Line 1" value={cfg.rightLine1} onChange={set('rightLine1')} maxLength={120} disabled={disabled} hint="{trustName} = trust name." /></Col>
              <Col xs={24} sm={8}><TextBox label="Line 2" value={cfg.rightLine2} onChange={set('rightLine2')} maxLength={80} disabled={disabled} hint="{trustCity} = city from Trust Details." /></Col>
              <Col xs={24}>{signBox('right', 'Signature / stamp picture (optional)')}</Col>
            </Row>
          )}
        </>
      ),
    },
  ];

  return (
    <div style={{ padding: 20, maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>
            <SafetyCertificateOutlined style={{ color: 'var(--primary)', marginRight: 8 }} />Certificate Builder
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Change what the membership certificate prints. The picture on the right is the real certificate.
          </Text>
          {lastSaved && (
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>Last saved {lastSaved.toLocaleString('en-IN')}</div>
          )}
        </div>
        <Space wrap>
          {dirty && <Tag color="orange">Changes not saved yet</Tag>}
          <WordsHelp />
          <Popconfirm title="Go back to the original certificate?" description="All changes on this page are removed. Nothing is saved until you press Save."
            okText="Reset" onConfirm={resetAll} disabled={disabled}>
            <Button icon={<UndoOutlined />} disabled={disabled}>Original</Button>
          </Popconfirm>
          <Popconfirm title="Discard unsaved changes and reload?" onConfirm={load} okText="Reload" disabled={saving || !dirty}>
            <Button icon={<ReloadOutlined />} disabled={saving || !dirty}>Undo changes</Button>
          </Popconfirm>
          <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSave}
            disabled={!canEdit || !dirty || !!uploadingKey}>
            Save
          </Button>
        </Space>
      </div>

      {!canEdit && (
        <Alert type="info" showIcon style={{ marginBottom: 16 }} title="View only"
          description="Only an admin or superadmin can change the certificate." />
      )}

      <Row gutter={16}>
        {/* ── Left: what to change ──────────────────────────────────────── */}
        <Col xs={24} xl={11}>
          <Alert type="info" showIcon style={{ marginBottom: 12, borderRadius: 10 }}
            title={(
              <span style={{ fontSize: 12.5 }}>
                Trust name, address, phone numbers, logos and colours are changed in{' '}
                <Link href="/settings/trust-details">Trust Details</Link>.
              </span>
            )} />
          <Collapse items={sections} defaultActiveKey={['frame', 'top']} style={{ background: '#fff', borderRadius: 10 }} />
        </Col>

        {/* ── Right: the real certificate ───────────────────────────────── */}
        <Col xs={24} xl={13}>
          <div style={{ position: 'sticky', top: 12 }}>
            <Card size="small" style={{ borderRadius: 10 }}
              title={<Space><EyeOutlined style={{ color: 'var(--primary)' }} />Preview</Space>}
              extra={previewBusy ? <Tag icon={<LoadingOutlined spin />} color="processing">updating</Tag> : <Tag color="green">up to date</Tag>}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
                <Segmented value={sampleMode} onChange={setSampleMode}
                  options={[{ value: 'sample', label: 'Sample member' }, { value: 'member', label: 'Real member', disabled: !realMember }]} />
                <Input value={searchText} onChange={(e) => setSearchText(e.target.value)} onPressEnter={findMember}
                  placeholder="Member number, e.g. MEM548217" allowClear style={{ flex: '1 1 180px', minWidth: 160 }} />
                <Button icon={<SearchOutlined />} loading={searching} onClick={findMember}>Show</Button>
                {previewUrl && (
                  <Tooltip title="Download this preview">
                    <Button icon={<DownloadOutlined />} href={previewUrl} download="certificate-preview.pdf" />
                  </Tooltip>
                )}
              </div>
              {sampleMode === 'member' && realMember && (
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>
                  Showing {realMember.member.displayName || 'member'} ({realMember.member.registrationNumber})
                </div>
              )}
              {previewError && (
                <Alert type="error" showIcon style={{ marginBottom: 10 }} title="The preview could not be made" description={previewError} />
              )}
              <div style={{
                position: 'relative', width: '100%', aspectRatio: '210 / 150', borderRadius: 8, overflow: 'hidden',
                border: '1px solid #e5e7eb', background: '#f3f4f6',
              }}>
                {previewUrl ? (
                  <iframe title="Certificate preview" src={`${previewUrl}#toolbar=0&navpanes=0&view=FitH`}
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }} />
                ) : (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Spin indicator={<LoadingOutlined style={{ fontSize: 24 }} spin />} />
                  </div>
                )}
              </div>
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 8 }}>
                The preview follows your changes. Other people see them only after you press Save.
                Certificates already sent on WhatsApp do not change.
              </div>
            </Card>
          </div>
        </Col>
      </Row>
    </div>
  );
}
