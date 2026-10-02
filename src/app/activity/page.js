"use client"
import React, { useState, useEffect, useCallback } from "react"
import {
  Card, Table, Tag, Typography, Row, Col, Statistic, Select, Space,
  Button, Input, Tabs, Badge, Tooltip, Avatar, message, Form, Modal,
  Empty, Spin, Descriptions, Divider, Alert, InputNumber
} from "antd"
import {
  WifiOutlined, MobileOutlined, LaptopOutlined,
  TabletOutlined, QuestionCircleOutlined, CheckCircleOutlined,
  CloseCircleOutlined, ReloadOutlined, SendOutlined,
  UserOutlined, TeamOutlined, ClockCircleOutlined,
  LoginOutlined, LogoutOutlined, BellOutlined
} from "@ant-design/icons"
import dayjs from "dayjs"
import relativeTime from "dayjs/plugin/relativeTime"
import { auth } from "../../../lib/firbase-client"
import { useAuth } from "@/components/Base/AuthProvider"

dayjs.extend(relativeTime)

const { Text, Title } = Typography

// ── Helpers ─────────────────────────────────────────────────────────────────────
const fmt = (iso) => (iso ? dayjs(iso).format("DD-MM-YYYY hh:mm A") : "—")
const fromNow = (iso) => (iso ? dayjs(iso).fromNow() : "—")
const isOnline = (activeSessions) => activeSessions > 0
const isRecent = (iso, mins = 5) => iso && dayjs().diff(dayjs(iso), "minute") <= mins

const deviceIcon = (platform) => {
  if (!platform) return <QuestionCircleOutlined />
  const p = platform.toLowerCase()
  if (p.includes("android") || p.includes("ios") || p.includes("iphone") || p.includes("ipad"))
    return <MobileOutlined />
  if (p.includes("windows") || p.includes("mac") || p.includes("linux"))
    return <LaptopOutlined />
  if (p.includes("tablet")) return <TabletOutlined />
  return <QuestionCircleOutlined />
}

// ── Main Page ────────────────────────────────────────────────────────────────────
export default function ActivityPage() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [agentData, setAgentData] = useState([])
  const [memberData, setMemberData] = useState([])
  const [summary, setSummary] = useState({ total: 0, online: 0, offline: 0 })
  const [memberSummary, setMemberSummary] = useState({ total: 0, online: 0, offline: 0 })
  const [agentFilter, setAgentFilter] = useState(null)
  const [searchText, setSearchText] = useState("")
  const [memberSearch, setMemberSearch] = useState("")
  const [agentList, setAgentList] = useState([])

  // Test notification modal
  const [testModal, setTestModal] = useState(false)
  const [testAgent, setTestAgent] = useState(null)
  const [testTitle, setTestTitle] = useState("Test Notification")
  const [testBody, setTestBody] = useState("This is a test notification from admin panel")
  const [sending, setSending] = useState(false)

  // Detail drawer
  const [detailAgent, setDetailAgent] = useState(null)

  const fetchActivity = useCallback(async () => {
    setLoading(true)
    try {
      const token = await auth.currentUser?.getIdToken()
      const [agentRes, memberRes, agentsListRes] = await Promise.all([
        fetch("/api/activity?type=agents", {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch("/api/activity?type=members", {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch("/api/agents?status=active&limit=200", {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ])

      const agentJson = await agentRes.json()
      const memberJson = await memberRes.json()
      const agentsListJson = await agentsListRes.json()

      if (agentJson.success) {
        setAgentData(agentJson.data || [])
        setSummary(agentJson.summary || { total: 0, online: 0, offline: 0 })
      }
      if (memberJson.success) {
        setMemberData(memberJson.data || [])
        setMemberSummary(memberJson.summary || { total: 0, online: 0, offline: 0 })
      }
      if (agentsListJson.success) {
        setAgentList(agentsListJson.data || [])
      }
    } catch (e) {
      console.error(e)
      message.error("Failed to load activity data")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchActivity()
    const interval = setInterval(fetchActivity, 30000) // refresh every 30s
    return () => clearInterval(interval)
  }, [fetchActivity])

  // ── Send test notification ─────────────────────────────────────────────────────
  const sendTestNotification = async () => {
    if (!testAgent) { message.warning("Please select an agent"); return }
    setSending(true)
    try {
      const token = await auth.currentUser?.getIdToken()
      const res = await fetch("/api/notifications/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          agentId: testAgent,
          title: testTitle,
          body: testBody,
          data: { click_action: "/", type: "test" },
        }),
      })
      const json = await res.json()
      if (json.success) {
        message.success("Test notification sent!")
      } else {
        message.error(json.message || "Failed to send")
      }
    } catch (e) {
      message.error("Failed to send: " + e.message)
    } finally {
      setSending(false)
    }
  }

  // ── Filtered data ──────────────────────────────────────────────────────────────
  const filteredAgents = agentData.filter((a) => {
    if (agentFilter && agentFilter !== "all") {
      if (agentFilter === "online" && !isOnline(a.activeSessionCount)) return false
      if (agentFilter === "offline" && isOnline(a.activeSessionCount)) return false
    }
    if (searchText) {
      const s = searchText.toLowerCase()
      return (
        a.name?.toLowerCase().includes(s) ||
        a.email?.toLowerCase().includes(s) ||
        a.phone?.includes(s)
      )
    }
    return true
  })

  const filteredMembers = memberData.filter((m) => {
    if (memberSearch) {
      const s = memberSearch.toLowerCase()
      return (
        m.displayName?.toLowerCase().includes(s) ||
        m.registrationNumber?.toLowerCase().includes(s) ||
        m.phone?.includes(s)
      )
    }
    return true
  })

  // ── Agent columns ──────────────────────────────────────────────────────────────
  const agentColumns = [
    {
      title: "Agent",
      key: "agent",
      width: 220,
      render: (_, r) => (
        <Space>
          <Avatar src={r.photoUrl} icon={<UserOutlined />} />
          <div>
            <div style={{ fontWeight: 600, cursor: "pointer" }} onClick={() => setDetailAgent(r)}>
              {r.name}
            </div>
            <Text type="secondary" style={{ fontSize: 12 }}>{r.email}</Text>
          </div>
        </Space>
      ),
    },
    {
      title: "Phone",
      dataIndex: "phone",
      key: "phone",
      width: 120,
    },
    {
      title: "Status",
      key: "status",
      width: 100,
      render: (_, r) => {
        const online = isOnline(r.activeSessionCount)
        const recent = isRecent(r.lastActiveTime)
        return (
          <Space>
            <Badge status={online ? "success" : recent ? "processing" : "default"} />
            <Text style={{ color: online ? "#52c41a" : recent ? "#faad14" : "#999" }}>
              {online ? "Online" : recent ? "Away" : "Offline"}
            </Text>
          </Space>
        )
      },
    },
    {
      title: "Sessions",
      dataIndex: "activeSessionCount",
      key: "sessions",
      width: 80,
      align: "center",
      render: (v) => <Tag color={v > 0 ? "green" : "default"}>{v}</Tag>,
    },
    {
      title: "Device",
      key: "device",
      width: 100,
      render: (_, r) => {
        const d = r.latestSession?.deviceInfo
        if (!d) return <Text type="secondary">—</Text>
        return (
          <Tooltip title={`${d.platform || ""} ${d.osVersion || ""}`}>
            <Space>
              {deviceIcon(d.platform)}
              <Text style={{ fontSize: 12 }}>{d.platform || "?"}</Text>
            </Space>
          </Tooltip>
        )
      },
    },
    {
      title: "Last Active",
      key: "lastActive",
      width: 130,
      render: (_, r) => (
        <Tooltip title={fmt(r.lastActiveTime || r.lastLoginTime)}>
          <Text style={{ fontSize: 12 }}>{fromNow(r.lastActiveTime || r.lastLoginTime)}</Text>
        </Tooltip>
      ),
    },
    {
      title: "Login / Logout",
      key: "loginLogout",
      width: 160,
      render: (_, r) => (
        <div style={{ fontSize: 12 }}>
          <div><LoginOutlined style={{ color: "#52c41a", marginRight: 4 }} />{fmt(r.lastLoginTime)}</div>
          {r.lastLogoutTime && (
            <div><LogoutOutlined style={{ color: "#ff4d4f", marginRight: 4 }} />{fmt(r.lastLogoutTime)}</div>
          )}
        </div>
      ),
    },
    {
      title: "Token",
      key: "token",
      width: 60,
      align: "center",
      render: (_, r) =>
        r.notificationToken ? (
          <Tooltip title="Has FCM token">
            <BellOutlined style={{ color: "#52c41a", fontSize: 16 }} />
          </Tooltip>
        ) : (
          <Tooltip title="No FCM token">
            <BellOutlined style={{ color: "#d9d9d9", fontSize: 16 }} />
          </Tooltip>
        ),
    },
    {
      title: "Members",
      key: "members",
      width: 100,
      align: "center",
      render: (_, r) => (
        <Space>
          <Tag color="blue">{r.activeMemberCount} active</Tag>
          {r.pendingMemberCount > 0 && <Tag color="orange">{r.pendingMemberCount} pending</Tag>}
        </Space>
      ),
    },
    {
      title: "Action",
      key: "action",
      width: 120,
      render: (_, r) => (
        <Button
          size="small"
          icon={<SendOutlined />}
          onClick={() => { setTestAgent(r.agentId); setTestModal(true) }}
          disabled={!r.notificationToken}
        >
          Notify
        </Button>
      ),
    },
  ]

  // ── Member columns ─────────────────────────────────────────────────────────────
  const memberColumns = [
    {
      title: "Member",
      key: "member",
      width: 220,
      render: (_, r) => (
        <Space>
          <Avatar src={r.photoURL} icon={<UserOutlined />} />
          <div>
            <div style={{ fontWeight: 600 }}>{r.displayName} {r.fatherName}</div>
            <Text type="secondary" style={{ fontSize: 12 }}>{r.registrationNumber}</Text>
          </div>
        </Space>
      ),
    },
    { title: "Phone", dataIndex: "phone", key: "phone", width: 120 },
    {
      title: "Status",
      key: "status",
      width: 90,
      render: (_, r) => {
        const online = isOnline(r.activeSessionCount)
        return (
          <Space>
            <Badge status={online ? "success" : "default"} />
            <Text style={{ color: online ? "#52c41a" : "#999" }}>
              {online ? "Online" : "Offline"}
            </Text>
          </Space>
        )
      },
    },
    {
      title: "Last Active",
      key: "lastActive",
      width: 130,
      render: (_, r) => (
        <Tooltip title={fmt(r.lastActiveTime || r.lastLoginTime)}>
          <Text style={{ fontSize: 12 }}>{fromNow(r.lastActiveTime || r.lastLoginTime)}</Text>
        </Tooltip>
      ),
    },
    {
      title: "Login / Logout",
      key: "loginLogout",
      width: 160,
      render: (_, r) => (
        <div style={{ fontSize: 12 }}>
          <div><LoginOutlined style={{ color: "#52c41a", marginRight: 4 }} />{fmt(r.lastLoginTime)}</div>
          {r.lastLogoutTime && (
            <div><LogoutOutlined style={{ color: "#ff4d4f", marginRight: 4 }} />{fmt(r.lastLogoutTime)}</div>
          )}
        </div>
      ),
    },
    {
      title: "Token",
      key: "token",
      width: 60,
      align: "center",
      render: (_, r) =>
        r.notificationToken ? (
          <BellOutlined style={{ color: "#52c41a", fontSize: 16 }} />
        ) : (
          <BellOutlined style={{ color: "#d9d9d9", fontSize: 16 }} />
        ),
    },
    {
      title: "Device",
      key: "device",
      width: 100,
      render: (_, r) => {
        const d = r.latestSession?.deviceInfo
        if (!d) return <Text type="secondary">—</Text>
        return (
          <Tooltip title={`${d.platform || ""} ${d.osVersion || ""}`}>
            <Space>
              {deviceIcon(d.platform)}
              <Text style={{ fontSize: 12 }}>{d.platform || "?"}</Text>
            </Space>
          </Tooltip>
        )
      },
    },
  ]

  // ── Agent Detail Modal ─────────────────────────────────────────────────────────
  const AgentDetailModal = () => {
    if (!detailAgent) return null
    const d = detailAgent
    const online = isOnline(d.activeSessionCount)
    const session = d.latestSession
    return (
      <Modal
        title={<Space><Avatar src={d.photoUrl} icon={<UserOutlined />} /><span>{d.name}</span></Space>}
        open={!!detailAgent}
        onCancel={() => setDetailAgent(null)}
        footer={null}
        width={600}
      >
        <Descriptions column={2} bordered size="small">
          <Descriptions.Item label="Email">{d.email}</Descriptions.Item>
          <Descriptions.Item label="Phone">{d.phone}</Descriptions.Item>
          <Descriptions.Item label="Status">
            <Badge status={online ? "success" : "default"} />
            {online ? "Online" : "Offline"}
          </Descriptions.Item>
          <Descriptions.Item label="Active Sessions">
            <Tag color={d.activeSessionCount > 0 ? "green" : "default"}>{d.activeSessionCount}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="Active Members" span={2}>
            <Tag color="blue">{d.activeMemberCount} active</Tag>
            {d.pendingMemberCount > 0 && <Tag color="orange">{d.pendingMemberCount} pending</Tag>}
          </Descriptions.Item>
          <Descriptions.Item label="Last Login">
            <Space><LoginOutlined style={{ color: "#52c41a" }} />{fmt(d.lastLoginTime)}</Space>
          </Descriptions.Item>
          <Descriptions.Item label="Last Logout">
            <Space><LogoutOutlined style={{ color: "#ff4d4f" }} />{fmt(d.lastLogoutTime) || "—"}</Space>
          </Descriptions.Item>
          <Descriptions.Item label="Last Active" span={2}>
            <ClockCircleOutlined style={{ marginRight: 4 }} />{fmt(d.lastActiveTime) || "—"}
            <Text type="secondary" style={{ marginLeft: 8 }}>({fromNow(d.lastActiveTime)})</Text>
          </Descriptions.Item>
          <Descriptions.Item label="FCM Token" span={2}>
            {d.notificationToken ? (
              <Tag color="green" icon={<CheckCircleOutlined />}>Registered</Tag>
            ) : (
              <Tag icon={<CloseCircleOutlined />} color="error">Not Registered</Tag>
            )}
          </Descriptions.Item>
        </Descriptions>

        {session && (
          <>
            <Divider>Latest Session</Divider>
            <Descriptions column={2} bordered size="small">
              <Descriptions.Item label="Session ID" span={2}>
                <Text copyable style={{ fontSize: 12 }}>{session.sessionId}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Active">
                <Badge status={session.isActive ? "success" : "default"} />
                {session.isActive ? "Yes" : "No"}
              </Descriptions.Item>
              <Descriptions.Item label="Login Time">{fmt(session.loginTime)}</Descriptions.Item>
              <Descriptions.Item label="Last Active">{fmt(session.lastActiveTime) || "—"}</Descriptions.Item>
              <Descriptions.Item label="Logout Time">{fmt(session.logoutTime) || "—"}</Descriptions.Item>
              {session.deviceInfo && (
                <>
                  <Descriptions.Item label="Device">
                    {deviceIcon(session.deviceInfo.platform)} {session.deviceInfo.platform || "—"}
                  </Descriptions.Item>
                  <Descriptions.Item label="Device Name">
                    {session.deviceInfo.deviceName || "—"}
                  </Descriptions.Item>
                  <Descriptions.Item label="OS Version">
                    {session.deviceInfo.osVersion || "—"}
                  </Descriptions.Item>
                  <Descriptions.Item label="Physical Device">
                    {session.deviceInfo.isDevice ? (
                      <Tag color="green">Yes</Tag>
                    ) : (
                      <Tag>No (Emulator)</Tag>
                    )}
                  </Descriptions.Item>
                </>
              )}
            </Descriptions>
          </>
        )}
      </Modal>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────────
  const tabItems = [
    {
      key: "agents",
      label: (
        <span>
          <TeamOutlined style={{ marginRight: 6 }} />
          Agent Activity
        </span>
      ),
      children: (
        <div>
          {/* Summary cards */}
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col xs={24} sm={8}>
              <Card size="small">
                <Statistic title="Total Agents" value={summary.total} prefix={<TeamOutlined />} />
              </Card>
            </Col>
            <Col xs={24} sm={8}>
              <Card size="small">
                <Statistic
                  title="Online Now"
                  value={summary.online}
                  valueStyle={{ color: "#52c41a" }}
                  prefix={<WifiOutlined />}
                />
              </Card>
            </Col>
            <Col xs={24} sm={8}>
              <Card size="small">
                <Statistic
                  title="Offline"
                  value={summary.offline}
                  valueStyle={{ color: "#999" }}
                  prefix={<WifiOutlined style={{ color: "#999" }} />}
                />
              </Card>
            </Col>
          </Row>

          {/* Filters */}
          <Card size="small" style={{ marginBottom: 16 }}>
            <Row gutter={16} align="middle">
              <Col>
                <Select
                  value={agentFilter || "all"}
                  onChange={setAgentFilter}
                  style={{ width: 140 }}
                  options={[
                    { value: "all", label: "All Agents" },
                    { value: "online", label: "Online" },
                    { value: "offline", label: "Offline" },
                  ]}
                />
              </Col>
              <Col flex="auto">
                <Input
                  placeholder="Search by name, email, or phone..."
                  prefix={<UserOutlined />}
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  allowClear
                />
              </Col>
              <Col>
                <Button icon={<ReloadOutlined />} onClick={fetchActivity} loading={loading}>
                  Refresh
                </Button>
              </Col>
            </Row>
          </Card>

          {/* Agent table */}
          <Spin spinning={loading}>
            <Table
              dataSource={filteredAgents}
              columns={agentColumns}
              rowKey="agentId"
              pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `${t} agents` }}
              size="small"
              scroll={{ x: 1400 }}
            />
          </Spin>
        </div>
      ),
    },
    {
      key: "members",
      label: (
        <span>
          <TeamOutlined style={{ marginRight: 6 }} />
          Member Activity
        </span>
      ),
      children: (
        <div>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col xs={24} sm={8}>
              <Card size="small">
                <Statistic title="Total Active Members" value={memberSummary.total} prefix={<TeamOutlined />} />
              </Card>
            </Col>
            <Col xs={24} sm={8}>
              <Card size="small">
                <Statistic
                  title="Online Now"
                  value={memberSummary.online}
                  valueStyle={{ color: "#52c41a" }}
                  prefix={<WifiOutlined />}
                />
              </Card>
            </Col>
            <Col xs={24} sm={8}>
              <Card size="small">
                <Statistic
                  title="Offline"
                  value={memberSummary.offline}
                  valueStyle={{ color: "#999" }}
                  prefix={<WifiOutlined style={{ color: "#999" }} />}
                />
              </Card>
            </Col>
          </Row>

          <Card size="small" style={{ marginBottom: 16 }}>
            <Row gutter={16} align="middle">
              <Col flex="auto">
                <Input
                  placeholder="Search by name, reg no, or phone..."
                  prefix={<UserOutlined />}
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  allowClear
                />
              </Col>
              <Col>
                <Button icon={<ReloadOutlined />} onClick={fetchActivity} loading={loading}>
                  Refresh
                </Button>
              </Col>
            </Row>
          </Card>

          <Spin spinning={loading}>
            <Table
              dataSource={filteredMembers}
              columns={memberColumns}
              rowKey="memberId"
              pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `${t} members` }}
              size="small"
              scroll={{ x: 1200 }}
            />
          </Spin>
        </div>
      ),
    },
    {
      key: "test",
      label: (
        <span>
          <SendOutlined style={{ marginRight: 6 }} />
          Test Notification
        </span>
      ),
      children: (
        <Card style={{ maxWidth: 500, margin: "0 auto" }}>
          <Space direction="vertical" size="middle" style={{ width: "100%" }}>
            <Title level={5}><BellOutlined /> Send Test Push Notification</Title>

            <div>
              <Text style={{ display: "block", marginBottom: 4 }}>Select Agent</Text>
              <Select
                showSearch
                style={{ width: "100%" }}
                placeholder="Search & select agent..."
                value={testAgent}
                onChange={setTestAgent}
                optionFilterProp="label"
                options={agentList.map((a) => ({
                  value: a.id || a.uid,
                  label: `${a.name} (${a.email})`,
                }))}
              />
            </div>

            <div>
              <Text style={{ display: "block", marginBottom: 4 }}>Title</Text>
              <Input value={testTitle} onChange={(e) => setTestTitle(e.target.value)} />
            </div>

            <div>
              <Text style={{ display: "block", marginBottom: 4 }}>Body</Text>
              <Input.TextArea rows={3} value={testBody} onChange={(e) => setTestBody(e.target.value)} />
            </div>

            <Alert
              message="The agent must have logged into the mobile app at least once and granted notification permissions for the FCM token to exist."
              type="info"
              showIcon
            />

            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={sendTestNotification}
              loading={sending}
              block
              disabled={!testAgent}
            >
              Send Test Notification
            </Button>
          </Space>
        </Card>
      ),
    },
  ]

  return (
    <div style={{ padding: 16 }}>
      <Title level={3}>Activity Monitor</Title>
      <Text type="secondary" style={{ display: "block", marginBottom: 16 }}>
        Monitor agent and member login sessions, device info, and send test push notifications.
        Auto-refreshes every 30 seconds.
      </Text>

      <Tabs defaultActiveKey="agents" items={tabItems} />

      <AgentDetailModal />
    </div>
  )
}
