"use client"
import React from 'react'
import { Card, Tag, Button } from 'antd'
import {
  CheckCircleOutlined, ClockCircleOutlined, CalendarOutlined,
  EyeOutlined, UserOutlined, EnvironmentOutlined, PhoneOutlined,
  BarcodeOutlined
} from '@ant-design/icons'
import dayjs from 'dayjs'

const thStyle = { padding: '4px 6px', borderBottom: '1px solid #e8e8e8', textAlign: 'left', fontWeight: 600, fontSize: 10, color: '#1B385A', whiteSpace: 'nowrap' }
const tdStyle = { padding: '3px 6px', borderBottom: '1px solid #f0f0f0', fontSize: 11, verticalAlign: 'middle' }

const ClosingEntryCard = ({ entry }) => {
  const isPaid = entry.status === 'paid'

  return (
    <Card size="small" className="border-l-4" style={{ borderLeftColor: isPaid ? '#52c41a' : entry.status === 'partial' ? '#faad14' : '#ff4d4f' }}>
      {/* Compact header */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <Tag color={isPaid ? 'green' : entry.status === 'partial' ? 'orange' : 'red'} style={{ fontWeight: 600, fontSize: 10, margin: 0 }}>
            {isPaid ? 'PAID' : entry.status === 'partial' ? 'PARTIAL' : 'PENDING'}
          </Tag>
          <span className="font-bold text-sm" style={{ color: isPaid ? '#52c41a' : '#ff4d4f' }}>₹{entry.totalAmount?.toLocaleString()}</span>
          <span className="text-xs text-gray-400">({entry.payAmount || 0} × {entry.closingCount || 0})</span>
        </div>
        <div className="flex items-center gap-1">
          {entry.programName && <Tag color="blue" style={{ fontSize: 9, margin: 0 }}>{entry.programName.split(' ').slice(0,2).join(' ')}</Tag>}
          {entry.closingGroupName
            ? <Tag color="purple" style={{ fontSize: 9, margin: 0 }}>{entry.closingGroupName}</Tag>
            : entry.closingGroupId && <Tag style={{ fontSize: 9, margin: 0 }}>{entry.closingGroupId.slice(-6)}</Tag>}
        </div>
      </div>

      {/* Dates row — compact */}
      <div className="text-[11px] text-gray-400 mb-2 flex flex-wrap gap-x-3 gap-y-0.5">
        <span><CalendarOutlined className="mr-0.5" />{dayjs(entry.date).format('DD MMM YYYY')}</span>
        {entry.closingDetails?.[0]?.closed_date && (
          <span><ClockCircleOutlined className="mr-0.5" />Cls: {dayjs(entry.closingDetails[0].closed_date).isValid() ? dayjs(entry.closingDetails[0].closed_date).format('DD MMM YYYY') : entry.closingDetails[0].closed_date}</span>
        )}
      </div>

      {/* Closing details — compact member chips */}
      {entry.closingDetails?.length > 0 && (
        <div className="border rounded overflow-hidden">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#fafafa' }}>
                <th style={{ ...thStyle, width: 20 }}>#</th>
                <th style={thStyle}>Name</th>
                <th style={{ ...thStyle, width: 90 }}>Reg No</th>
                <th style={{ ...thStyle, width: 55 }}>Village</th>
                <th style={{ ...thStyle, width: 55 }}>Date</th>
                <th style={{ ...thStyle, width: 28 }}>Card</th>
              </tr>
            </thead>
            <tbody>
              {entry.closingDetails.map((d, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ ...tdStyle, textAlign: 'center', width: 20, color: '#999' }}>{i + 1}</td>
                  <td style={tdStyle}>
                    <span className="font-medium text-xs">{d.closed_memberName}</span>
                    {d.closed_fatherName && <span className="text-gray-400 text-[10px] ml-1">• {d.closed_fatherName}</span>}
                  </td>
                  <td style={tdStyle}>
                    <span className="font-mono text-[10px] font-medium">{d.closed_registrationNumber || entry.closing_registrationNumber || entry.registrationNumber || '—'}</span>
                  </td>
                  <td style={tdStyle} className="text-gray-500 text-[10px]">{d.closed_village || '—'}</td>
                  <td style={tdStyle} className="text-gray-500 text-[10px]">
                    {d.closed_date ? (dayjs(d.closed_date).isValid() ? dayjs(d.closed_date).format('DD/MM') : d.closed_date) : '—'}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'center', width: 28 }}>
                    {d.closed_invitation_url ? (
                      <Button size="small" type="link" icon={<EyeOutlined />} href={d.closed_invitation_url} target="_blank" style={{ fontSize: 10, padding: 0, height: 20 }} />
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

export default ClosingEntryCard
