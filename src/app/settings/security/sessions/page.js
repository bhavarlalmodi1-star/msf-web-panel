"use client";
import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, deleteDoc, doc } from "firebase/firestore";
import { Modal, Button, Card, Tag, Empty, Spin, Tooltip, Badge, Avatar, message } from "antd";
import { 
  DesktopOutlined, 
  MobileOutlined, 
  GlobalOutlined,
  ChromeOutlined,
  AppleOutlined,
  AndroidOutlined,
  WindowsOutlined,
  LinuxOutlined,
  ClockCircleOutlined,
  EnvironmentOutlined,
  LaptopOutlined,
  TabletOutlined,
  LogoutOutlined,
  CheckCircleOutlined,
  InfoCircleOutlined,
  ExclamationCircleOutlined
} from '@ant-design/icons';
import { db } from '../../../../../lib/firbase-client';
import { useAuth } from '@/components/Base/AuthProvider';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

const Sessions = ({ activeTab, activeSubTab }) => {
  const { user } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [revokeSessionId, setRevokeSessionId] = useState(null);
  const [selectedSession, setSelectedSession] = useState(null);

  // Get current session token
  const currentSessionToken = localStorage.getItem("session_token");

  // Fetch sessions when security-sessions tab is active
  useEffect(() => {
    const fetchSessions = async () => {
      if (user?.uid) {
        setSessionsLoading(true);
        try {
          const sessionsRef = collection(db, "users", user.uid, "sessions");
          const q = query(sessionsRef);
          const snapshot = await getDocs(q);
          const data = [];
          snapshot.forEach(docSnap => {
            data.push({ id: docSnap.id, ...docSnap.data() });
          });
          // Sort by last active (most recent first)
          data.sort((a, b) => new Date(b.lastActive) - new Date(a.lastActive));
          setSessions(data);
        } catch (e) {
          console.error("Error fetching sessions:", e);
          setSessions([]);
        }
        setSessionsLoading(false);
      }
    };
    fetchSessions();
  }, [user]);

  const handleRevokeSession = async (sessionId) => {
    if (!user?.uid || !sessionId) return;
    try {
      await deleteDoc(doc(db, "users", user.uid, "sessions", sessionId));
      setSessions(sessions.filter(s => s.id !== sessionId));
      message.success('Session revoked successfully');
    } catch (error) {
      message.error('Failed to revoke session');
      console.error('Revoke session error:', error);
    }
    setRevokeSessionId(null);
    setSelectedSession(null);
  };

  const getDeviceIcon = (device) => {
    const deviceLower = device?.toLowerCase() || '';
    if (deviceLower.includes('mobile')) return <MobileOutlined />;
    if (deviceLower.includes('tablet')) return <TabletOutlined />;
    if (deviceLower.includes('desktop')) return <DesktopOutlined />;
    if (deviceLower.includes('laptop')) return <LaptopOutlined />;
    return <DesktopOutlined />;
  };

  const getBrowserIcon = (browser) => {
    const browserLower = browser?.toLowerCase() || '';
    if (browserLower.includes('chrome')) return <ChromeOutlined />;
    return <GlobalOutlined />;
  };

  const getOSIcon = (os) => {
    const osLower = os?.toLowerCase() || '';
    if (osLower.includes('windows')) return <WindowsOutlined />;
    if (osLower.includes('mac')) return <AppleOutlined />;
    if (osLower.includes('ios')) return <AppleOutlined />;
    if (osLower.includes('android')) return <AndroidOutlined />;
    if (osLower.includes('linux')) return <LinuxOutlined />;
    return <DesktopOutlined />;
  };

  const formatTimeAgo = (timestamp) => {
    if (!timestamp) return 'Never';
    return dayjs(timestamp).fromNow();
  };

  const formatFullDate = (timestamp) => {
    if (!timestamp) return 'N/A';
    return dayjs(timestamp).format('DD MMM YYYY, hh:mm A');
  };

  const truncateText = (text, maxLength = 25) => {
    if (!text) return 'N/A';
    return text.length > maxLength ? `${text.substring(0, maxLength)}...` : text;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <LaptopOutlined className="text-rose-500" />
            Active Sessions
          </h2>
          <p className="text-gray-500 mt-1">
            Manage your account's active login sessions across different devices
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge 
            count={sessions.length} 
            showZero 
            style={{ backgroundColor: 'var(--primary)' }}
          />
          <span className="text-gray-600 text-sm">
            {sessions.length} active session{sessions.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Current Session Info Card */}
      {currentSessionToken && sessions.some(s => s.id === currentSessionToken) && (
        <Card 
          bordered={false}
          className="shadow-md border-l-4 border-rose-500 bg-gradient-to-r from-rose-50 to-pink-50"
        >
          <div className="flex items-start gap-3">
            <Avatar 
              size="large" 
              className="bg-gradient-to-r from-rose-500 to-orange-500"
              icon={<CheckCircleOutlined />}
            />
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold text-gray-800">Current Session</h3>
                <Tag color="success" className="font-medium">
                  Active Now
                </Tag>
              </div>
              <p className="text-gray-600 text-sm mb-2">
                You are currently logged in on this device
              </p>
              <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <ClockCircleOutlined />
                  {formatTimeAgo(sessions.find(s => s.id === currentSessionToken)?.lastActive)}
                </span>
                <span className="flex items-center gap-1">
                  <EnvironmentOutlined />
                  {truncateText(sessions.find(s => s.id === currentSessionToken)?.location, 40)}
                </span>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Sessions List */}
      <Card 
        bordered={false}
        className="shadow-lg rounded-xl border-0 bg-gradient-to-br from-white to-gray-50"
      >
        {sessionsLoading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Spin size="large" className="mb-4" />
            <p className="text-gray-500">Loading sessions...</p>
          </div>
        ) : sessions.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="No active sessions found"
            className="py-12"
          >
            <p className="text-gray-500 mb-4">You don't have any active sessions yet.</p>
          </Empty>
        ) : (
          <div className="space-y-3">
            {sessions.map(session => {
              const isCurrent = session.id === currentSessionToken;
              return (
                <div
                  key={session.id}
                  className={`
                    p-4 rounded-lg border transition-all duration-200
                    ${isCurrent 
                      ? 'border-rose-200 bg-gradient-to-r from-rose-50 to-pink-50 shadow-sm' 
                      : 'border-gray-100 hover:border-rose-200 hover:bg-gray-50'
                    }
                  `}
                >
                  <div className="flex items-start gap-3">
                    {/* Device Icon */}
                    <div className={`
                      p-2 rounded-lg
                      ${isCurrent 
                        ? 'bg-gradient-to-r from-rose-500 to-orange-500 text-white' 
                        : 'bg-gray-100 text-gray-600'
                      }
                    `}>
                      {getDeviceIcon(session.device)}
                    </div>

                    {/* Session Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-800 truncate">
                            {session.device || 'Unknown Device'}
                          </span>
                          {isCurrent && (
                            <Tag 
                              color="success" 
                              className="font-medium text-xs"
                              icon={<CheckCircleOutlined />}
                            >
                              Current
                            </Tag>
                          )}
                          <Tag 
                            color={session.device?.toLowerCase().includes('mobile') ? 'blue' : 'purple'}
                            className="text-xs"
                          >
                            {session.device}
                          </Tag>
                        </div>
                        <div className="text-xs text-gray-500 flex items-center gap-1">
                          <ClockCircleOutlined />
                          {formatTimeAgo(session.lastActive)}
                        </div>
                      </div>

                      {/* Details Row */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-gray-400">{getBrowserIcon(session.browser)}</span>
                          <span className="text-gray-600 truncate">{session.browser || 'Unknown Browser'}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-gray-400">{getOSIcon(session.os)}</span>
                          <span className="text-gray-600 truncate">{session.os || 'Unknown OS'}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-gray-400"><EnvironmentOutlined /></span>
                          <span className="text-gray-600 truncate">
                            {truncateText(session.location || 'Unknown Location', 30)}
                            {session.pinCode && ` - ${session.pinCode}`}
                          </span>
                        </div>
                      </div>

                      {/* IP and Actions */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs px-2 py-1 bg-gray-100 rounded text-gray-600 font-mono">
                            IP: {session.ip || 'N/A'}
                          </span>
                          <Tooltip title="View session details">
                            <Button
                              type="link"
                              size="small"
                              icon={<InfoCircleOutlined />}
                              onClick={() => setSelectedSession(session)}
                              className="text-gray-500"
                            >
                              Details
                            </Button>
                          </Tooltip>
                        </div>
                        <div className="flex items-center gap-2">
                          {!isCurrent && (
                            <Tooltip title="Revoke this session">
                              <Button
                                type="primary"
                                danger
                                size="small"
                                icon={<LogoutOutlined />}
                                onClick={() => setRevokeSessionId(session.id)}
                                className="bg-gradient-to-r from-rose-500 to-orange-500 border-0 hover:from-rose-600 hover:to-orange-600"
                              >
                                Revoke
                              </Button>
                            </Tooltip>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Revoke Session Modal */}
      <Modal
        title={
          <div className="flex items-center gap-2">
            <ExclamationCircleOutlined className="text-rose-500" />
            <span>Revoke Session</span>
          </div>
        }
        open={!!revokeSessionId}
        onOk={() => handleRevokeSession(revokeSessionId)}
        onCancel={() => {
          setRevokeSessionId(null);
          setSelectedSession(null);
        }}
        okText="Yes, Revoke"
        okButtonProps={{
          danger: true,
          className: 'bg-gradient-to-r from-rose-500 to-orange-500 border-0 hover:from-rose-600 hover:to-orange-600'
        }}
        cancelText="Cancel"
        centered
      >
        <div className="space-y-3">
          <p>Are you sure you want to revoke this session?</p>
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600">
              <strong>Device:</strong> {sessions.find(s => s.id === revokeSessionId)?.device || 'Unknown'}<br />
              <strong>Location:</strong> {sessions.find(s => s.id === revokeSessionId)?.location || 'Unknown'}<br />
              <strong>Last Active:</strong> {formatFullDate(sessions.find(s => s.id === revokeSessionId)?.lastActive)}
            </p>
          </div>
          <p className="text-sm text-gray-500">
            The device will be logged out immediately and will need to sign in again.
          </p>
        </div>
      </Modal>

      {/* Session Details Modal */}
      <Modal
        title="Session Details"
        open={!!selectedSession}
        onCancel={() => setSelectedSession(null)}
        footer={[
          <Button key="close" onClick={() => setSelectedSession(null)}>
            Close
          </Button>,
          selectedSession?.id !== currentSessionToken && (
            <Button
              key="revoke"
              danger
              onClick={() => {
                setSelectedSession(null);
                setRevokeSessionId(selectedSession.id);
              }}
              className="bg-gradient-to-r from-rose-500 to-orange-500 border-0 hover:from-rose-600 hover:to-orange-600"
            >
              Revoke Session
            </Button>
          )
        ]}
        centered
        width={500}
      >
        {selectedSession && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-500">Device</label>
                <p className="text-gray-800">{selectedSession.device || 'Unknown'}</p>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-500">Browser</label>
                <p className="text-gray-800">{selectedSession.browser || 'Unknown'}</p>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-500">Operating System</label>
                <p className="text-gray-800">{selectedSession.os || 'Unknown'}</p>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-500">IP Address</label>
                <p className="text-gray-800 font-mono">{selectedSession.ip || 'N/A'}</p>
              </div>
              <div className="space-y-1 col-span-2">
                <label className="text-xs font-medium text-gray-500">Location</label>
                <p className="text-gray-800">
                  {selectedSession.location || 'Unknown'}
                  {selectedSession.pinCode && ` - PIN: ${selectedSession.pinCode}`}
                </p>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-500">Session Created</label>
                <p className="text-gray-800">{formatFullDate(selectedSession.createdAt)}</p>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-500">Last Active</label>
                <p className="text-gray-800">{formatFullDate(selectedSession.lastActive)}</p>
              </div>
            </div>
            {selectedSession.id === currentSessionToken && (
              <div className="p-3 bg-rose-50 rounded-lg border border-rose-100">
                <div className="flex items-center gap-2 text-rose-600">
                  <InfoCircleOutlined />
                  <span className="text-sm font-medium">This is your current active session</span>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>


    </div>
  );
};

export default Sessions;