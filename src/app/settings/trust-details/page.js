"use client";
// Trust Details — the ONE place to change the trust's name, address, contact
// numbers, registration number, header lines and logos.
//
// Stored as a single document at settings/trustInfo (images in Storage under
// settings/trust/). Every PDF, receipt, print page, the login page, the sidebar
// and the WhatsApp / e-mail texts read from it, so a change saved here shows up
// everywhere — nothing else needs editing.

import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, Button, Form, Input, message, Row, Col, Typography, Space, Upload,
  Spin, Alert, Popconfirm, Tag, ColorPicker, Tooltip, Switch,
} from 'antd';
import {
  SaveOutlined, ReloadOutlined, UploadOutlined, LoadingOutlined, UndoOutlined,
  BankOutlined, EnvironmentOutlined, PictureOutlined, FileTextOutlined,
  SafetyCertificateOutlined, LaptopOutlined, EyeOutlined, BgColorsOutlined, WhatsAppOutlined,
} from '@ant-design/icons';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, auth } from '../../../../lib/firbase-client';
import { useAuth } from '@/components/Base/AuthProvider';
import {
  TRUST_DOC_PATH, TRUST_STORAGE_FOLDER, DEFAULT_TRUST, DEFAULT_LOGO_SRC,
  DEFAULT_RIGHT_IMAGE_SRC, pickTrustFields, setTrust, getTrustRaw,
} from '@/utils/trust/trustStore';
import {
  DEFAULT_PDF_PRIMARY, DEFAULT_PDF_ACCENT, DEFAULT_THEME_PRIMARY, DEFAULT_THEME_SECONDARY,
  THEME_PRESETS, PDF_PRESETS, cleanHex, isTooLight,
} from '@/utils/trust/theme';

const { Title, Text } = Typography;
const { TextArea } = Input;

// Text fields handled by the form (everything except the image fields)
const IMAGE_KEYS = ['logoUrl', 'logoPath', 'rightImageUrl', 'rightImagePath', 'frameUrl', 'framePath'];
const COLOR_KEYS = ['pdfColorPrimary', 'pdfColorAccent', 'themePrimary', 'themeSecondary'];
const COLOR_DEFAULTS = {
  pdfColorPrimary: DEFAULT_PDF_PRIMARY, pdfColorAccent: DEFAULT_PDF_ACCENT,
  themePrimary: DEFAULT_THEME_PRIMARY, themeSecondary: DEFAULT_THEME_SECONDARY,
};
const FLAG_KEYS = ['whatsappEnabled'];   // on/off switches
// Edited on their own page (Settings → Certificate Builder) — this form must
// neither show nor overwrite them.
const OTHER_PAGE_KEYS = ['certificateConfig'];
const TEXT_KEYS = Object.keys(DEFAULT_TRUST).filter((k) => !IMAGE_KEYS.includes(k) && !COLOR_KEYS.includes(k) && !FLAG_KEYS.includes(k) && !OTHER_PAGE_KEYS.includes(k));

const IMAGE_SLOTS = [
  {
    key: 'logo', urlKey: 'logoUrl', pathKey: 'logoPath', maxSide: 800,
    title: 'Trust Logo',
    hint: 'Left side of every header, the page watermark and the sidebar. A PNG with a transparent background looks best.',
    fallback: DEFAULT_LOGO_SRC,
  },
  {
    key: 'right', urlKey: 'rightImageUrl', pathKey: 'rightImagePath', maxSide: 800,
    title: 'Right-side Image',
    hint: 'Right side of every header (deity / second logo).',
    fallback: DEFAULT_RIGHT_IMAGE_SRC,
  },
  {
    key: 'frame', urlKey: 'frameUrl', pathKey: 'framePath', maxSide: 2400,
    title: 'Certificate Frame',
    hint: 'Border / background of the membership certificate (landscape, 210 × 148 mm).',
    fallback: '',
  },
];

const emptyImages = () => Object.fromEntries(IMAGE_KEYS.map((k) => [k, '']));

// PDFs can only embed PNG and JPEG, so whatever is chosen (WebP, GIF, a huge
// phone photo…) is re-drawn on a canvas: resized and saved as PNG, or JPEG when
// the original was a JPEG.
const prepareImage = (file, maxSide) => new Promise((resolve, reject) => {
  const objectUrl = URL.createObjectURL(file);
  const img = new window.Image();
  img.onload = () => {
    try {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');

      const encode = (asJpeg) => new Promise((res) => {
        ctx.clearRect(0, 0, w, h);
        if (asJpeg) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h); }
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob(
          (blob) => res(blob && { blob, ext: asJpeg ? 'jpg' : 'png', type: asJpeg ? 'image/jpeg' : 'image/png' }),
          asJpeg ? 'image/jpeg' : 'image/png',
          0.92,
        );
      });

      (async () => {
        let out = await encode(file.type === 'image/jpeg');
        // Storage rules cap settings/* uploads at 5 MB — a big PNG falls back to JPEG
        if (out && out.blob.size > 4.5 * 1024 * 1024 && out.ext === 'png') out = await encode(true);
        URL.revokeObjectURL(objectUrl);
        if (!out) reject(new Error('Could not process this image'));
        else if (out.blob.size > 4.9 * 1024 * 1024) reject(new Error('Image is too large even after resizing'));
        else resolve(out);
      })();
    } catch (err) {
      URL.revokeObjectURL(objectUrl);
      reject(err);
    }
  };
  img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('This file is not a readable image')); };
  img.src = objectUrl;
});

const SectionTitle = ({ icon, children }) => (
  <Space>{React.cloneElement(icon, { style: { color: 'var(--primary)' } })}{children}</Space>
);

// ── Live preview of the header as it prints on receipts / PDFs ───────────────
const HeaderPreview = ({ values, images, colors }) => {
  const v = { ...DEFAULT_TRUST, ...values };
  const blessings = [v.blessing1, v.blessing2, v.blessing3].map((s) => (s || '').trim()).filter(Boolean);
  const logo = images.logoUrl || DEFAULT_LOGO_SRC;
  const right = images.rightImageUrl || DEFAULT_RIGHT_IMAGE_SRC;
  const red = colors.pdfColorAccent;     // accent colour
  const blue = colors.pdfColorPrimary;   // primary colour
  return (
    <div style={{ border: `2px solid ${red}`, borderRadius: 6, padding: 10, background: '#fff', fontFamily: "'Noto Sans Devanagari', sans-serif" }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 10, color: red, fontWeight: 600, marginBottom: 6 }}>
        {blessings.map((b, i) => <span key={i}>{b}</span>)}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo} alt="" style={{ width: 64, height: 64, objectFit: 'contain', flexShrink: 0 }} />
        <div style={{ flex: 1, textAlign: 'center', minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: red, lineHeight: 1.3 }}>{v.name}</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: blue }}>{v.cityLine}</div>
          <div style={{ fontSize: 10, color: '#111', marginTop: 2 }}>
            <b>हेड ऑफिस : </b>{v.address}{v.officePhone ? ` (O) ${v.officePhone}` : ''}
          </div>
          <div style={{ fontSize: 10, marginTop: 2 }}>
            <b>संपर्क सूत्र : </b><span style={{ color: blue, fontWeight: 600 }}>{v.presidentName}</span>
          </div>
          <div style={{ fontSize: 10 }}>
            <span style={{ color: blue, fontWeight: 600 }}>{v.presidentPhone}</span>
            &nbsp;&nbsp;<b>ऑफिस : </b><span style={{ color: blue, fontWeight: 600 }}>{v.officePhone}</span>
          </div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={right} alt="" style={{ width: 64, height: 64, objectFit: 'contain', flexShrink: 0 }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, padding: '3px 10px', background: blue, color: '#fff', fontSize: 10, fontWeight: 700, borderRadius: 3 }}>
        <span>{v.since ? `SINCE : ${v.since}` : ''}</span>
        <span>{v.regNo ? `Reg. No: ${v.regNo}` : ''}</span>
      </div>
      <div style={{ textAlign: 'center', fontSize: 9, color: '#555', marginTop: 6 }}>
        संपर्क सूत्र : {v.contactNumbers}{v.jurisdiction ? ` • ${v.jurisdiction}` : ''}
      </div>
    </div>
  );
};

export default function TrustDetailsPage() {
  const { user } = useAuth();
  const canEdit = user?.role === 'superadmin' || user?.role === 'admin';

  const [form] = Form.useForm();
  const watched = Form.useWatch([], form);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingKey, setUploadingKey] = useState(null);
  const [images, setImages] = useState(emptyImages);
  const [savedOnce, setSavedOnce] = useState(true);
  const [lastSaved, setLastSaved] = useState(null);
  const [dirtyImages, setDirtyImages] = useState(false);
  const [colors, setColors] = useState(COLOR_DEFAULTS);
  const [whatsappOn, setWhatsappOn] = useState(false);
  const [savedColors, setSavedColors] = useState(COLOR_DEFAULTS);

  // ── Load ────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, ...TRUST_DOC_PATH));
      const stored = snap.exists() ? pickTrustFields(snap.data()) : {};
      const merged = { ...DEFAULT_TRUST, ...stored };

      form.setFieldsValue(Object.fromEntries(TEXT_KEYS.map((k) => [k, merged[k]])));
      setImages(Object.fromEntries(IMAGE_KEYS.map((k) => [k, merged[k] || ''])));
      const loadedColors = Object.fromEntries(COLOR_KEYS.map((k) => [k, cleanHex(merged[k], COLOR_DEFAULTS[k])]));
      setColors(loadedColors);
      setSavedColors(loadedColors);
      setWhatsappOn(merged.whatsappEnabled === 'on');
      setSavedOnce(snap.exists());
      setDirtyImages(false);

      const ts = snap.exists() ? snap.data().updatedAt : null;
      setLastSaved(ts?.toDate ? ts.toDate() : null);
    } catch (e) {
      console.error('Failed to load trust details:', e);
      message.error('Could not load trust details');
    } finally {
      setLoading(false);
    }
  }, [form]);

  useEffect(() => { load(); }, [load]);

  // ── Image upload ────────────────────────────────────────────────────────
  const handleUpload = (slot) => async (file) => {
    if (!file.type?.startsWith('image/')) {
      message.error('Please choose an image file');
      return Upload.LIST_IGNORE;
    }
    setUploadingKey(slot.key);
    try {
      const { blob, ext, type } = await prepareImage(file, slot.maxSide);
      const path = `${TRUST_STORAGE_FOLDER}/${slot.key}_${Date.now()}.${ext}`;
      const r = ref(storage, path);
      await uploadBytes(r, blob, { contentType: type, cacheControl: 'public, max-age=31536000' });
      const url = await getDownloadURL(r);
      setImages((prev) => ({ ...prev, [slot.urlKey]: url, [slot.pathKey]: path }));
      setDirtyImages(true);
      message.success(`${slot.title} uploaded — press Save to apply it everywhere`);
    } catch (e) {
      console.error(e);
      message.error('Upload failed: ' + e.message);
    } finally {
      setUploadingKey(null);
    }
    return Upload.LIST_IGNORE;   // preview is handled here, not by antd
  };

  const resetImage = (slot) => {
    setImages((prev) => ({ ...prev, [slot.urlKey]: '', [slot.pathKey]: '' }));
    setDirtyImages(true);
    message.info(`${slot.title} reset to the built-in image — press Save to apply`);
  };

  // ── Save ────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const payload = pickTrustFields({
        ...Object.fromEntries(TEXT_KEYS.map((k) => [k, String(values[k] ?? '').trim()])),
        ...images,
        ...colors,
        whatsappEnabled: whatsappOn ? 'on' : 'off',
      });

      setSaving(true);
      await setDoc(doc(db, ...TRUST_DOC_PATH), {
        ...payload,
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser?.uid || null,
      }, { merge: true });

      // Apply at once in this tab (other tabs / users get it through the live listener).
      // Fields this form does not edit (certificate layout) keep their current value.
      setTrust({ ...getTrustRaw(), ...payload });
      // Drop the server's short cache so certificates and messages use it immediately
      fetch('/api/trust-info?refresh=1').catch(() => {});

      form.setFieldsValue(Object.fromEntries(TEXT_KEYS.map((k) => [k, payload[k]])));
      setSavedOnce(true);
      setDirtyImages(false);
      setLastSaved(new Date());

      // A new panel theme touches every screen — reload once so all of them pick it up.
      const themeChanged = savedColors.themePrimary !== colors.themePrimary || savedColors.themeSecondary !== colors.themeSecondary;
      setSavedColors(colors);
      if (themeChanged) {
        message.success('Saved — applying the new panel colours…');
        setTimeout(() => window.location.reload(), 900);
        return;
      }
      message.success('Trust details saved — every PDF and page now uses them');
    } catch (e) {
      if (e?.errorFields) {
        message.warning('Please fill the required fields');
        return;
      }
      console.error(e);
      message.error(e?.code === 'permission-denied'
        ? 'Save failed: only an admin or superadmin can change trust details'
        : 'Save failed: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 60, textAlign: 'center' }}>
        <Spin indicator={<LoadingOutlined style={{ fontSize: 28 }} spin />} />
      </div>
    );
  }

  const required = (label) => [{ required: true, whitespace: true, message: `${label} is required` }];

  const colorsChanged = COLOR_KEYS.some((k) => colors[k] !== savedColors[k]);
  const setColor = (key) => (value) => setColors((prev) => ({ ...prev, [key]: cleanHex(value?.toHexString?.() ?? value, prev[key]) }));

  // One colour row: picker + what the colour is used for (+ a warning when it is too pale)
  const colorRow = (key, label, hint) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
      <ColorPicker
        value={colors[key]} onChangeComplete={setColor(key)} disabledAlpha showText
        disabled={!canEdit || saving} format="hex"
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: 11, color: '#6b7280' }}>{hint}</div>
        {isTooLight(colors[key]) && (
          <div style={{ fontSize: 11, color: '#b45309' }}>This colour is very light — text may be hard to read. Choose a darker one.</div>
        )}
      </div>
    </div>
  );

  // Ready-made colour pairs
  const presetChips = (presets, keyA, keyB, bKey) => (
    <Space size={6} wrap style={{ marginBottom: 12 }}>
      {presets.map((p) => {
        const active = colors[keyA] === cleanHex(p.primary, '') && colors[keyB] === cleanHex(p[bKey], '');
        return (
          <Tooltip key={p.name} title={p.name}>
            <button
              type="button" disabled={!canEdit || saving}
              onClick={() => setColors((prev) => ({ ...prev, [keyA]: cleanHex(p.primary, prev[keyA]), [keyB]: cleanHex(p[bKey], prev[keyB]) }))}
              style={{
                width: 44, height: 24, padding: 0, borderRadius: 6, cursor: canEdit ? 'pointer' : 'default',
                border: active ? '2px solid #111827' : '1px solid #d1d5db',
                background: `linear-gradient(135deg, ${p.primary} 0%, ${p.primary} 50%, ${p[bKey]} 50%, ${p[bKey]} 100%)`,
              }}
              aria-label={p.name}
            />
          </Tooltip>
        );
      })}
    </Space>
  );
  const cardStyle = { marginBottom: 16 };

  return (
    <div style={{ padding: 20, maxWidth: 1180, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>Trust Details</Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Name, address, contacts and logos used on every PDF, receipt, certificate and page
          </Text>
          {lastSaved && (
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
              Last updated {lastSaved.toLocaleString('en-IN')}
            </div>
          )}
        </div>
        <Space>
          <Popconfirm
            title="Discard unsaved changes and reload?"
            onConfirm={load} okText="Reload" disabled={saving}
          >
            <Button icon={<ReloadOutlined />} disabled={saving}>Reload</Button>
          </Popconfirm>
          <Button type="primary" icon={<SaveOutlined />} loading={saving}
            onClick={handleSave} disabled={!canEdit || !!uploadingKey}>
            Save Details
          </Button>
        </Space>
      </div>

      {!canEdit && (
        <Alert type="info" showIcon style={{ marginBottom: 16 }}
          message="View only"
          description="Only an admin or superadmin can change trust details." />
      )}
      {canEdit && !savedOnce && (
        <Alert type="warning" showIcon style={{ marginBottom: 16 }}
          message="Not saved to Firebase yet"
          description="These are the built-in default values. Change what you need and press Save Details — after that everything reads from Firebase." />
      )}
      {dirtyImages && (
        <Alert type="info" showIcon style={{ marginBottom: 16 }}
          message="Image changed — press Save Details to apply it everywhere" />
      )}

      <Form form={form} layout="vertical" disabled={!canEdit || saving} requiredMark="optional">
        <Row gutter={16}>
          {/* ── Left column: text fields ─────────────────────────────────── */}
          <Col xs={24} lg={14}>
            <Card size="small" style={cardStyle}
              title={<SectionTitle icon={<BankOutlined />}>Trust Identity</SectionTitle>}>
              <Form.Item name="name" label="Trust Name (as printed on headers)" rules={required('Trust name')}>
                <Input placeholder="Full trust name" maxLength={120} />
              </Form.Item>
              <Row gutter={12}>
                <Col xs={24} sm={12}>
                  <Form.Item name="shortName" label="Short Name"
                    tooltip="Sidebar, WhatsApp / e-mail signature and the “Generated by …” line"
                    rules={required('Short name')}>
                    <Input placeholder="e.g. ABC TRUST" maxLength={40} />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item name="cityLine" label="City line (under the name)">
                    <Input placeholder="e.g. अहमदाबाद, गुजरात" maxLength={60} />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={8}>
                  <Form.Item name="city" label="City (signature block)"
                    tooltip="Printed under the trust name beside the founder's signature">
                    <Input placeholder="e.g. अहमदाबाद" maxLength={40} />
                  </Form.Item>
                </Col>
                <Col xs={12} sm={8}>
                  <Form.Item name="since" label="Since (year)">
                    <Input placeholder="e.g. 2024" maxLength={10} />
                  </Form.Item>
                </Col>
                <Col xs={12} sm={8}>
                  <Form.Item name="regNo" label="Registration No.">
                    <Input placeholder="e.g. A/5231" maxLength={30} />
                  </Form.Item>
                </Col>
              </Row>
            </Card>

            <Card size="small" style={cardStyle}
              title={<SectionTitle icon={<EnvironmentOutlined />}>Address &amp; Contact</SectionTitle>}>
              <Form.Item name="address" label="Head Office Address" rules={required('Address')}>
                <TextArea rows={2} placeholder="Full head-office address" maxLength={300} />
              </Form.Item>
              <Form.Item name="addressShort" label="Short Address (list PDFs)"
                tooltip="Used in the compact headers of member lists, payment details and the closing form. Leave empty to use the full address.">
                <TextArea rows={2} placeholder="Leave empty to use the full address" maxLength={300} />
              </Form.Item>
              <Row gutter={12}>
                <Col xs={24} sm={14}>
                  <Form.Item name="presidentName" label="Contact Person (संपर्क सूत्र)" rules={required('Contact person')}>
                    <Input placeholder="e.g. अध्यक्ष श्री …" maxLength={80} />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={10}>
                  <Form.Item name="presidentPhone" label="Contact Person Phone" rules={required('Phone')}>
                    <Input placeholder="e.g. 9876543210" maxLength={20} />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={10}>
                  <Form.Item name="officePhone" label="Office Phone (O)"
                    tooltip="Printed after the address and sent to members as the support number"
                    rules={required('Office phone')}>
                    <Input placeholder="e.g. 9876543210" maxLength={20} />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={14}>
                  <Form.Item name="supportEmail" label="Support E-mail"
                    rules={[{ type: 'email', message: 'Enter a valid e-mail' }]}>
                    <Input placeholder="e.g. support@example.com" maxLength={80} />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="contactNumbers" label="Contact Numbers (footer line)"
                tooltip="All numbers printed in the footer of receipts and on the certificate, separated by commas"
                rules={required('Contact numbers')} style={{ marginBottom: 0 }}>
                <Input placeholder="9876543210, 9876543211, …" maxLength={120} />
              </Form.Item>
            </Card>

            <Card size="small" style={cardStyle}
              title={<SectionTitle icon={<FileTextOutlined />}>Header Lines (top of every PDF)</SectionTitle>}>
              <Row gutter={12}>
                <Col xs={24} sm={8}>
                  <Form.Item name="blessing1" label="Left" style={{ marginBottom: 0 }}>
                    <Input placeholder="॥ श्री गणेशाय नमः ॥" maxLength={60} />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={8}>
                  <Form.Item name="blessing2" label="Centre" style={{ marginBottom: 0 }}>
                    <Input maxLength={60} />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={8}>
                  <Form.Item name="blessing3" label="Right" style={{ marginBottom: 0 }}>
                    <Input maxLength={60} />
                  </Form.Item>
                </Col>
              </Row>
            </Card>

            <Card size="small" style={cardStyle}
              title={<SectionTitle icon={<SafetyCertificateOutlined />}>Certificate &amp; Footer Text</SectionTitle>}>
              <Row gutter={12}>
                <Col xs={12}>
                  <Form.Item name="stateLeft" label="Certificate — left state">
                    <Input placeholder="e.g. राजस्थान" maxLength={30} />
                  </Form.Item>
                </Col>
                <Col xs={12}>
                  <Form.Item name="stateRight" label="Certificate — right state">
                    <Input placeholder="e.g. गुजरात" maxLength={30} />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="slogan" label="Certificate Slogan">
                <Input maxLength={120} />
              </Form.Item>
              <Form.Item name="jurisdiction" label="Jurisdiction Line (footer)" style={{ marginBottom: 0 }}>
                <Input placeholder="e.g. Exclusive jurisdiction Ahmedabad, Gujarat" maxLength={120} />
              </Form.Item>
            </Card>

            <Card size="small" style={cardStyle}
              title={<SectionTitle icon={<LaptopOutlined />}>Admin Panel &amp; App</SectionTitle>}>
              <Row gutter={12}>
                <Col xs={24} sm={12}>
                  <Form.Item name="panelTitle" label="Browser Tab Title">
                    <Input maxLength={60} />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item name="footerTagline" label="Panel Footer Tagline">
                    <Input maxLength={80} />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="appLink" label="Member App Link (Play Store)"
                tooltip="Inserted as {appLink} in the WhatsApp login-details message"
                rules={[{ type: 'url', message: 'Enter a full link starting with https://' }]}
                style={{ marginBottom: 0 }}>
                <Input placeholder="https://play.google.com/store/apps/details?id=…" maxLength={200} />
              </Form.Item>
            </Card>

            <Card size="small" style={cardStyle}
              title={<SectionTitle icon={<WhatsAppOutlined />}>WhatsApp Messages</SectionTitle>}
              extra={whatsappOn ? <Tag color="green">On</Tag> : <Tag>Off</Tag>}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Switch
                  checked={whatsappOn} onChange={setWhatsappOn}
                  disabled={!canEdit || saving}
                  checkedChildren="On" unCheckedChildren="Off"
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Send WhatsApp messages from this panel</div>
                  <div style={{ fontSize: 11.5, color: '#6b7280' }}>
                    Off: the WhatsApp menu, the “Send WhatsApp” buttons and the WhatsApp tick-boxes are hidden
                    for everyone, and no WhatsApp message is sent. Certificates are still created.
                    Press Save Details to apply.
                  </div>
                </div>
              </div>
            </Card>
          </Col>

          {/* ── Right column: preview + images ───────────────────────────── */}
          <Col xs={24} lg={10}>
            <Card size="small" style={cardStyle}
              title={<SectionTitle icon={<EyeOutlined />}>Header Preview</SectionTitle>}
              extra={<Tag color="blue">updates as you type</Tag>}>
              <HeaderPreview values={watched || {}} images={images} colors={colors} />
            </Card>

            <Card size="small" style={cardStyle}
              title={<SectionTitle icon={<BgColorsOutlined />}>Colours</SectionTitle>}
              extra={colorsChanged ? <Tag color="orange">not saved yet</Tag> : null}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>PDF &amp; print colours</div>
              {presetChips(PDF_PRESETS, 'pdfColorPrimary', 'pdfColorAccent', 'accent')}
              {colorRow('pdfColorPrimary', 'Primary', 'Trust name, bars, table headings on every PDF / receipt')}
              {colorRow('pdfColorAccent', 'Accent', 'Top header lines, title badge, labels, borders')}

              <div style={{ borderTop: '1px solid #f0f0f0', margin: '6px 0 12px' }} />

              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Web panel theme</div>
              {presetChips(THEME_PRESETS, 'themePrimary', 'themeSecondary', 'secondary')}
              {colorRow('themePrimary', 'Primary', 'Buttons, links, menu, sidebar, login page')}
              {colorRow('themeSecondary', 'Second colour', 'The other end of the header / button gradient')}
              <div style={{
                height: 34, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontWeight: 700, fontSize: 12, marginBottom: 6,
                background: `linear-gradient(135deg, ${colors.themePrimary} 0%, ${colors.themeSecondary} 100%)`,
              }}>
                Panel header preview
              </div>
              <div style={{ fontSize: 11, color: '#9ca3af' }}>
                The page reloads once after saving a new panel theme.
              </div>
            </Card>

            <Card size="small" style={cardStyle}
              title={<SectionTitle icon={<PictureOutlined />}>Logos &amp; Images</SectionTitle>}>
              {IMAGE_SLOTS.map((slot, idx) => {
                const url = images[slot.urlKey];
                const shown = url || slot.fallback;
                const busy = uploadingKey === slot.key;
                return (
                  <div key={slot.key} style={{
                    display: 'flex', gap: 12, alignItems: 'center',
                    padding: '12px 0', borderTop: idx ? '1px solid #f0f0f0' : 'none',
                  }}>
                    <div style={{
                      width: 92, height: 92, flexShrink: 0, borderRadius: 8, border: '1px solid #eee',
                      background: '#fafafa', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                    }}>
                      {busy ? <Spin /> : shown ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={shown} alt={slot.title} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                      ) : (
                        <Text type="secondary" style={{ fontSize: 11, textAlign: 'center' }}>Built-in<br />frame</Text>
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>
                        {slot.title}{' '}
                        {url ? <Tag color="green">Uploaded</Tag> : <Tag>Built-in</Tag>}
                      </div>
                      <div style={{ fontSize: 11, color: '#6b7280', margin: '2px 0 8px' }}>{slot.hint}</div>
                      {canEdit && (
                        <Space size={6} wrap>
                          <Upload accept="image/*" showUploadList={false}
                            beforeUpload={handleUpload(slot)} disabled={!!uploadingKey || saving}>
                            <Button size="small" icon={<UploadOutlined />} loading={busy} disabled={!!uploadingKey || saving}>
                              {url ? 'Replace' : 'Upload'}
                            </Button>
                          </Upload>
                          {url && (
                            <Popconfirm title="Go back to the built-in image?" okText="Reset"
                              onConfirm={() => resetImage(slot)}>
                              <Button size="small" icon={<UndoOutlined />}>Use built-in</Button>
                            </Popconfirm>
                          )}
                        </Space>
                      )}
                    </div>
                  </div>
                );
              })}
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
                Any image type works — it is resized and stored as PNG / JPG so PDFs can embed it.
              </div>
            </Card>
          </Col>
        </Row>
      </Form>
    </div>
  );
}
