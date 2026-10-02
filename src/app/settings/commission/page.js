"use client";
import React, { useState, useEffect } from "react";
import {
  Card, Form, InputNumber, Button, Typography, Divider,
  Row, Col, Tag, Spin, App, Tooltip, Alert,
} from "antd";
import {
  SaveOutlined, EditOutlined, ReloadOutlined,
  PercentageOutlined, InfoCircleOutlined,
} from "@ant-design/icons";
import { auth } from "../../../../lib/firbase-client";
import { useAuth } from "@/components/Base/AuthProvider";

const { Title, Text } = Typography;

// ── helpers ───────────────────────────────────────────────────────────────────
const authFetch = async (url, opts = {}) => {
  const token = await auth.currentUser?.getIdToken();
  return fetch(url, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(opts.headers || {}),
    },
  });
};

// ─────────────────────────────────────────────────────────────────────────────
const CommissionSettingsPage = () => {
  const [form]     = Form.useForm();
  const { message } = App.useApp();
  const { user }   = useAuth();

  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [current,  setCurrent]  = useState(null);   // saved settings from server

  // Must be at top level — never inside JSX or conditionals (Rules of Hooks)
  const watchedJoinRate    = Form.useWatch("joinFeesRate",       form);
  const watchedClosingRate = Form.useWatch("closingPaymentRate", form);

  const isSuperAdmin = user?.role === "superadmin";
  const isAdmin      = user?.role === "admin" || isSuperAdmin;

  // ── Load settings ───────────────────────────────────────────────────────────
  const loadSettings = async () => {
    setLoading(true);
    try {
      const res  = await authFetch("/api/settings/commission");
      const data = await res.json();
      if (data.success) {
        setCurrent(data.data);
        form.setFieldsValue({
          joinFeesRate:       data.data.joinFeesRate,
          closingPaymentRate: data.data.closingPaymentRate,
        });
      } else {
        message.error(data.message || "Failed to load settings");
      }
    } catch (e) {
      message.error("Failed to load commission settings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadSettings(); }, []);

  // ── Save settings ───────────────────────────────────────────────────────────
  const handleSave = async (values) => {
    setSaving(true);
    try {
      const res  = await authFetch("/api/settings/commission", {
        method: "PUT",
        body:   JSON.stringify(values),
      });
      const data = await res.json();
      if (data.success) {
        message.success("Commission settings saved successfully");
        setCurrent({ ...current, ...values });
        setEditMode(false);
      } else {
        message.error(data.message || "Failed to save settings");
      }
    } catch (e) {
      message.error("Failed to save commission settings");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    form.setFieldsValue({
      joinFeesRate:       current?.joinFeesRate,
      closingPaymentRate: current?.closingPaymentRate,
    });
    setEditMode(false);
  };

  // ── Preview helper ──────────────────────────────────────────────────────────
  const previewAmount = (rate, sampleAmount = 1000) =>
    `₹${((sampleAmount * rate) / 100).toFixed(2)} on ₹${sampleAmount.toLocaleString("en-IN")}`;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-gradient-to-r from-rose-500 to-orange-500">
            <PercentageOutlined className="text-white text-2xl" />
          </div>
          <div>
            <Title level={3} className="!mb-0">Commission Settings</Title>
            <Text type="secondary">Configure join fee &amp; closing payment commission rates</Text>
          </div>
        </div>

        {isAdmin && !editMode && (
          <div className="flex gap-2">
            <Button icon={<ReloadOutlined />} onClick={loadSettings}>Refresh</Button>
            <Button
              type="primary"
              icon={<EditOutlined />}
              onClick={() => setEditMode(true)}
              style={{ background: "linear-gradient(to right,var(--primary),var(--secondary))", border: "none" }}
            >
              Edit Rates
            </Button>
          </div>
        )}
      </div>

      <Alert
        type="info"
        showIcon
        icon={<InfoCircleOutlined />}
        message="How commission works"
        description={
          <ul className="list-disc ml-4 mt-1 space-y-1 text-sm">
            <li>Commission is calculated as a percentage of the <b>payment amount received</b>.</li>
            <li>Commission is only credited to agents who have <b>commission enabled</b> on their profile.</li>
            <li>Changing rates here affects <b>all future</b> payments — past transactions are not recalculated.</li>
            <li>Set a rate to <b>0</b> to disable commission for that payment type globally.</li>
          </ul>
        }
      />

      <Form form={form} layout="vertical" onFinish={handleSave} disabled={!editMode}>
        <Row gutter={24}>
          {/* Join Fees Rate */}
          <Col xs={24} md={12}>
            <Card
              className="rounded-xl shadow-sm border border-blue-100"
              style={{ background: "linear-gradient(135deg,#eff6ff,#fff)" }}
            >
              <div className="flex items-center gap-2 mb-4">
                <div className="w-3 h-3 rounded-full bg-blue-500" />
                <Title level={5} className="!mb-0 text-blue-700">Join Fees Commission</Title>
              </div>

              <Form.Item
                name="joinFeesRate"
                label={
                  <span className="flex items-center gap-1">
                    Rate (%)
                    <Tooltip title="Percentage of join fee payment credited to the agent's wallet">
                      <InfoCircleOutlined className="text-gray-400" />
                    </Tooltip>
                  </span>
                }
                rules={[
                  { required: true, message: "Required" },
                  { type: "number", min: 0, max: 100, message: "Must be 0–100" },
                ]}
              >
                <InputNumber
                  min={0} max={100} step={0.5}
                  precision={2}
                  size="large"
                  addonAfter="%"
                  style={{ width: "100%" }}
                  placeholder="e.g. 25"
                />
              </Form.Item>

              {/* Live preview */}
              <div className="mt-1 p-3 bg-blue-50 rounded-lg text-sm">
                <Text type="secondary">Preview: </Text>
                <Text strong className="text-blue-700">
                  {previewAmount(watchedJoinRate ?? current?.joinFeesRate ?? 0)}
                </Text>
              </div>

              {!editMode && current && (
                <Tag color="blue" className="mt-3 text-base px-3 py-1">
                  Current: {current.joinFeesRate}%
                </Tag>
              )}
            </Card>
          </Col>

          {/* Closing Payment Rate */}
          <Col xs={24} md={12}>
            <Card
              className="rounded-xl shadow-sm border border-green-100"
              style={{ background: "linear-gradient(135deg,#f0fdf4,#fff)" }}
            >
              <div className="flex items-center gap-2 mb-4">
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <Title level={5} className="!mb-0 text-green-700">Closing Payment Commission</Title>
              </div>

              <Form.Item
                name="closingPaymentRate"
                label={
                  <span className="flex items-center gap-1">
                    Rate (%)
                    <Tooltip title="Percentage of closing payment credited to the agent's wallet">
                      <InfoCircleOutlined className="text-gray-400" />
                    </Tooltip>
                  </span>
                }
                rules={[
                  { required: true, message: "Required" },
                  { type: "number", min: 0, max: 100, message: "Must be 0–100" },
                ]}
              >
                <InputNumber
                  min={0} max={100} step={0.5}
                  precision={2}
                  size="large"
                  addonAfter="%"
                  style={{ width: "100%" }}
                  placeholder="e.g. 5"
                />
              </Form.Item>

              {/* Live preview */}
              <div className="mt-1 p-3 bg-green-50 rounded-lg text-sm">
                <Text type="secondary">Preview: </Text>
                <Text strong className="text-green-700">
                  {previewAmount(watchedClosingRate ?? current?.closingPaymentRate ?? 0)}
                </Text>
              </div>

              {!editMode && current && (
                <Tag color="green" className="mt-3 text-base px-3 py-1">
                  Current: {current.closingPaymentRate}%
                </Tag>
              )}
            </Card>
          </Col>
        </Row>

        {editMode && (
          <>
            <Divider />
            <div className="flex justify-end gap-3">
              <Button size="large" onClick={handleCancel} disabled={saving}>Cancel</Button>
              <Button
                type="primary"
                htmlType="submit"
                size="large"
                loading={saving}
                icon={<SaveOutlined />}
                style={{ background: "linear-gradient(to right,var(--primary),var(--secondary))", border: "none" }}
              >
                Save Commission Rates
              </Button>
            </div>
          </>
        )}
      </Form>

      {/* Last updated info */}
      {current?.updatedAt && (
        <Text type="secondary" className="text-xs">
          Last updated: {
            current.updatedAt?.seconds
              ? new Date(current.updatedAt.seconds * 1000).toLocaleString("en-IN")
              : String(current.updatedAt)
          }
        </Text>
      )}
    </div>
  );
};

export default CommissionSettingsPage;
