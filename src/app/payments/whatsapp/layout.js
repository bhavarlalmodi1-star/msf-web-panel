"use client";
// Covers every WhatsApp page (/payments/whatsapp, …/inbox, …/send-credentials).
// When WhatsApp is switched off in Settings → Trust Details the pages are not
// shown at all — a notice is shown instead.
import Link from 'next/link';
import { Result, Button } from 'antd';
import { WhatsAppOutlined } from '@ant-design/icons';
import { useTrust } from '@/utils/trust/useTrust';

export default function WhatsAppLayout({ children }) {
  const trust = useTrust();
  if (trust.whatsappOn) return children;

  return (
    <Result
      icon={<WhatsAppOutlined style={{ color: '#9ca3af' }} />}
      title="WhatsApp messages are turned off"
      subTitle="No WhatsApp message is sent from this panel. An admin can turn it on at Settings → Trust Details → WhatsApp Messages."
      extra={<Link href="/settings/trust-details"><Button type="primary">Open Trust Details</Button></Link>}
    />
  );
}
