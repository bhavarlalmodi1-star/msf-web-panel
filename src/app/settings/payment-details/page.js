"use client";
// Organisation payment details — the account information members use to pay.
//
// Stored as a single document at settings/paymentDetails so the member app can
// read it with one fetch. Supports several UPI IDs and bank accounts, because
// trusts commonly run more than one, plus a QR code image.

import React, { useState, useEffect } from 'react';
import {
  Card, Button, Form, Input, message, Row, Col, Typography, Divider,
  Space, Upload, Image, Switch, Tag, Spin, Alert, Popconfirm, Empty,
} from 'antd';
import {
  SaveOutlined, ReloadOutlined, PlusOutlined, DeleteOutlined,
  QrcodeOutlined, BankOutlined, MobileOutlined, LoadingOutlined,
  CheckCircleOutlined, UploadOutlined,
} from '@ant-design/icons';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage, auth } from '../../../../lib/firbase-client';
import { useAuth } from '@/components/Base/AuthProvider';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

const DOC_PATH = ['settings', 'paymentDetails'];

const emptyUpi  = () => ({ id: `upi_${Date.now()}`,  upiId: '', payeeName: '', label: '', active: true });
const emptyBank = () => ({
  id: `bank_${Date.now()}`, bankName: '', accountName: '', accountNumber: '',
  ifsc: '', branch: '', accountType: 'Savings', active: true,
});

export default function PaymentDetailsPage() {
  const { user } = useAuth();
  const canEdit = user?.role === 'superadmin' || user?.role === 'admin';

  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [uploading, setUploading] = useState(false);

  const [upiList, setUpiList]   = useState([]);
  const [bankList, setBankList] = useState([]);
  const [qrUrl, setQrUrl]       = useState('');
  const [lastSaved, setLastSaved] = useState(null);

  // ── Load ────────────────────────────────────────────────────────────────
  const load = async () => {
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, ...DOC_PATH));
      if (snap.exists()) {
        const d = snap.data();
        setUpiList(Array.isArray(d.upiAccounts) ? d.upiAccounts : []);
        setBankList(Array.isArray(d.bankAccounts) ? d.bankAccounts : []);
        setQrUrl(d.qrCodeUrl || '');
        setLastSaved(d.updated_at?.toDate ? d.updated_at.toDate() : null);
        form.setFieldsValue({
          paymentNote:   d.paymentNote || '',
          contactPhone:  d.contactPhone || '',
          showToMembers: d.showToMembers !== false,
        });
      } else {
        form.setFieldsValue({ showToMembers: true });
      }
    } catch (e) {
      console.error('Failed to load payment details:', e);
      message.error('Could not load payment details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  // ── QR upload ───────────────────────────────────────────────────────────
  const handleQrUpload = async (file) => {
    if (!file.type?.startsWith('image/')) {
      message.error('QR code must be an image');
      return Upload.LIST_IGNORE;
    }
    if (file.size > 3 * 1024 * 1024) {
      message.error('Image must be under 3 MB');
      return Upload.LIST_IGNORE;
    }
    setUploading(true);
    try {
      const path = `settings/paymentQr/${Date.now()}_${file.name.replace(/[^\w.-]/g, '_')}`;
      const r = ref(storage, path);
      await uploadBytes(r, file);
      const url = await getDownloadURL(r);
      setQrUrl(url);
      message.success('QR code uploaded — remember to save');
    } catch (e) {
      console.error(e);
      message.error('Upload failed: ' + e.message);
    } finally {
      setUploading(false);
    }
    return Upload.LIST_IGNORE;   // we manage the preview ourselves
  };

  const removeQr = () => {
    setQrUrl('');
    message.info('QR removed — save to apply');
  };

  // ── UPI / Bank row helpers ──────────────────────────────────────────────
  const updateUpi  = (id, patch) => setUpiList(l  => l.map(x => x.id === id ? { ...x, ...patch } : x));
  const updateBank = (id, patch) => setBankList(l => l.map(x => x.id === id ? { ...x, ...patch } : x));

  // ── Save ────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    try {
      const values = await form.validateFields();

      // Drop rows the user added but never filled in
      const cleanUpi = upiList
        .map(u => ({ ...u, upiId: u.upiId.trim(), payeeName: u.payeeName.trim(), label: u.label.trim() }))
        .filter(u => u.upiId);

      const cleanBank = bankList
        .map(b => ({
          ...b,
          bankName: b.bankName.trim(), accountName: b.accountName.trim(),
          accountNumber: b.accountNumber.trim(), ifsc: b.ifsc.trim().toUpperCase(),
          branch: b.branch.trim(),
        }))
        .filter(b => b.accountNumber || b.bankName);

      // A malformed UPI id is worse than none — members would pay into nowhere
      const badUpi = cleanUpi.find(u => !/^[\w.\-]{2,}@[a-zA-Z]{2,}$/.test(u.upiId));
      if (badUpi) {
        message.error(`"${badUpi.upiId}" doesn't look like a valid UPI ID (e.g. name@bank)`);
        return;
      }
      const badIfsc = cleanBank.find(b => b.ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(b.ifsc));
      if (badIfsc) {
        message.error(`"${badIfsc.ifsc}" is not a valid IFSC code`);
        return;
      }

      if (!cleanUpi.length && !cleanBank.length && !qrUrl) {
        message.warning('Add at least one payment method — UPI, bank account or QR code');
        return;
      }

      setSaving(true);
      await setDoc(doc(db, ...DOC_PATH), {
        upiAccounts:  cleanUpi,
        bankAccounts: cleanBank,
        qrCodeUrl:    qrUrl || '',
        paymentNote:  values.paymentNote || '',
        contactPhone: values.contactPhone || '',
        showToMembers: values.showToMembers !== false,
        updated_at:   serverTimestamp(),
        updatedBy:    auth.currentUser?.uid || null,
      }, { merge: true });

      setUpiList(cleanUpi);
      setBankList(cleanBank);
      setLastSaved(new Date());
      message.success('Payment details saved');
    } catch (e) {
      if (e?.errorFields) return;   // form validation already surfaced
      console.error(e);
      message.error('Save failed: ' + e.message);
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

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>Payment Details</Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Bank, UPI and QR details members use to pay the trust
          </Text>
          {lastSaved && (
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
              Last updated {lastSaved.toLocaleString('en-IN')}
            </div>
          )}
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={load} disabled={saving}>Reload</Button>
          <Button type="primary" icon={<SaveOutlined />} loading={saving}
            onClick={handleSave} disabled={!canEdit}>
            Save Details
          </Button>
        </Space>
      </div>

      {!canEdit && (
        <Alert type="info" showIcon style={{ marginBottom: 16 }}
          message="View only"
          description="Only an admin or superadmin can change payment details." />
      )}

      <Form form={form} layout="vertical" disabled={!canEdit || saving}>
        <Row gutter={16}>
          {/* ── QR code ──────────────────────────────────────────────────── */}
          <Col xs={24} lg={8}>
            <Card
              size="small"
              title={<Space><QrcodeOutlined style={{ color: 'var(--primary)' }} />Payment QR Code</Space>}
              style={{ marginBottom: 16 }}
            >
              {qrUrl ? (
                <div style={{ textAlign: 'center' }}>
                  <Image
                    src={qrUrl}
                    alt="Payment QR"
                    style={{ maxWidth: '100%', borderRadius: 8, border: '1px solid #eee' }}
                  />
                  {canEdit && (
                    <Popconfirm title="Remove this QR code?" onConfirm={removeQr} okText="Remove" okButtonProps={{ danger: true }}>
                      <Button danger size="small" icon={<DeleteOutlined />} style={{ marginTop: 10 }}>
                        Remove QR
                      </Button>
                    </Popconfirm>
                  )}
                </div>
              ) : (
                <Upload.Dragger
                  accept="image/*"
                  showUploadList={false}
                  beforeUpload={handleQrUpload}
                  disabled={!canEdit || uploading}
                  style={{ padding: 12 }}
                >
                  {uploading ? <Spin /> : (
                    <>
                      <p style={{ margin: 0 }}><UploadOutlined style={{ fontSize: 26, color: 'var(--primary)' }} /></p>
                      <p style={{ fontSize: 13, margin: '8px 0 2px' }}>Upload QR code</p>
                      <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>PNG or JPG, under 3 MB</p>
                    </>
                  )}
                </Upload.Dragger>
              )}

              <Divider style={{ margin: '14px 0' }} />

              <Form.Item
                name="contactPhone"
                label="Payment Help Number"
                tooltip="Shown to members if they have trouble paying"
                style={{ marginBottom: 12 }}
              >
                <Input placeholder="e.g. 9876543210" maxLength={15} />
              </Form.Item>

              <Form.Item
                name="showToMembers"
                label="Visible to members"
                valuePropName="checked"
                tooltip="Turn off to hide payment details in the member app"
                style={{ marginBottom: 0 }}
              >
                <Switch checkedChildren="Shown" unCheckedChildren="Hidden" />
              </Form.Item>
            </Card>
          </Col>

          <Col xs={24} lg={16}>
            {/* ── UPI ────────────────────────────────────────────────────── */}
            <Card
              size="small"
              title={<Space><MobileOutlined style={{ color: '#16a34a' }} />UPI IDs</Space>}
              extra={canEdit && (
                <Button size="small" icon={<PlusOutlined />} onClick={() => setUpiList(l => [...l, emptyUpi()])}>
                  Add UPI
                </Button>
              )}
              style={{ marginBottom: 16 }}
            >
              {upiList.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No UPI ID added"
                  style={{ margin: '12px 0' }} />
              ) : upiList.map(u => (
                <div key={u.id} style={{
                  border: '1px solid #eee', borderRadius: 8, padding: 12, marginBottom: 10,
                  background: u.active ? '#fff' : '#fafafa',
                }}>
                  <Row gutter={10}>
                    <Col xs={24} sm={9}>
                      <Text style={{ fontSize: 11, color: '#6b7280' }}>UPI ID *</Text>
                      <Input placeholder="name@bank" value={u.upiId}
                        onChange={e => updateUpi(u.id, { upiId: e.target.value.trim() })}
                        className="font-mono" />
                    </Col>
                    <Col xs={24} sm={7}>
                      <Text style={{ fontSize: 11, color: '#6b7280' }}>Payee Name</Text>
                      <Input placeholder="Name shown while paying" value={u.payeeName}
                        onChange={e => updateUpi(u.id, { payeeName: e.target.value })} />
                    </Col>
                    <Col xs={24} sm={5}>
                      <Text style={{ fontSize: 11, color: '#6b7280' }}>Label</Text>
                      <Input placeholder="e.g. Primary" value={u.label}
                        onChange={e => updateUpi(u.id, { label: e.target.value })} />
                    </Col>
                    <Col xs={24} sm={3} style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
                      <Switch size="small" checked={u.active}
                        onChange={v => updateUpi(u.id, { active: v })} />
                      {canEdit && (
                        <Button danger type="text" size="small" icon={<DeleteOutlined />}
                          onClick={() => setUpiList(l => l.filter(x => x.id !== u.id))} />
                      )}
                    </Col>
                  </Row>
                </div>
              ))}
            </Card>

            {/* ── Bank accounts ──────────────────────────────────────────── */}
            <Card
              size="small"
              title={<Space><BankOutlined style={{ color: '#2563eb' }} />Bank Accounts</Space>}
              extra={canEdit && (
                <Button size="small" icon={<PlusOutlined />} onClick={() => setBankList(l => [...l, emptyBank()])}>
                  Add Account
                </Button>
              )}
              style={{ marginBottom: 16 }}
            >
              {bankList.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No bank account added"
                  style={{ margin: '12px 0' }} />
              ) : bankList.map(b => (
                <div key={b.id} style={{
                  border: '1px solid #eee', borderRadius: 8, padding: 12, marginBottom: 10,
                  background: b.active ? '#fff' : '#fafafa',
                }}>
                  <Row gutter={10} style={{ marginBottom: 10 }}>
                    <Col xs={24} sm={8}>
                      <Text style={{ fontSize: 11, color: '#6b7280' }}>Bank Name</Text>
                      <Input placeholder="e.g. State Bank of India" value={b.bankName}
                        onChange={e => updateBank(b.id, { bankName: e.target.value })} />
                    </Col>
                    <Col xs={24} sm={9}>
                      <Text style={{ fontSize: 11, color: '#6b7280' }}>Account Holder</Text>
                      <Input placeholder="As printed on the passbook" value={b.accountName}
                        onChange={e => updateBank(b.id, { accountName: e.target.value })} />
                    </Col>
                    <Col xs={24} sm={7}>
                      <Text style={{ fontSize: 11, color: '#6b7280' }}>Account Type</Text>
                      <Input placeholder="Savings / Current" value={b.accountType}
                        onChange={e => updateBank(b.id, { accountType: e.target.value })} />
                    </Col>
                  </Row>
                  <Row gutter={10}>
                    <Col xs={24} sm={8}>
                      <Text style={{ fontSize: 11, color: '#6b7280' }}>Account Number *</Text>
                      <Input placeholder="Account number" value={b.accountNumber}
                        onChange={e => updateBank(b.id, { accountNumber: e.target.value.replace(/\s/g, '') })}
                        className="font-mono" />
                    </Col>
                    <Col xs={24} sm={6}>
                      <Text style={{ fontSize: 11, color: '#6b7280' }}>IFSC</Text>
                      <Input placeholder="SBIN0001234" value={b.ifsc}
                        onChange={e => updateBank(b.id, { ifsc: e.target.value.toUpperCase().trim() })}
                        maxLength={11} className="font-mono uppercase" />
                    </Col>
                    <Col xs={24} sm={7}>
                      <Text style={{ fontSize: 11, color: '#6b7280' }}>Branch</Text>
                      <Input placeholder="Branch name" value={b.branch}
                        onChange={e => updateBank(b.id, { branch: e.target.value })} />
                    </Col>
                    <Col xs={24} sm={3} style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
                      <Switch size="small" checked={b.active}
                        onChange={v => updateBank(b.id, { active: v })} />
                      {canEdit && (
                        <Button danger type="text" size="small" icon={<DeleteOutlined />}
                          onClick={() => setBankList(l => l.filter(x => x.id !== b.id))} />
                      )}
                    </Col>
                  </Row>
                </div>
              ))}
            </Card>

            {/* ── Note ───────────────────────────────────────────────────── */}
            <Card size="small" title="Instructions for Members">
              <Form.Item name="paymentNote" style={{ marginBottom: 0 }}>
                <TextArea
                  rows={3}
                  maxLength={500}
                  showCount
                  placeholder="e.g. भुगतान के बाद स्क्रीनशॉट व्हाट्सएप पर भेजें और रजिस्ट्रेशन नंबर लिखें।"
                />
              </Form.Item>
            </Card>
          </Col>
        </Row>
      </Form>
    </div>
  );
}
