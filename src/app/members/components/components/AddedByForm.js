import React from 'react'
import { Card, Form, Radio, Select } from 'antd'

const AddedByForm = ({ 
  addedByRole, 
  setAddedByRole, 
  agents, 
  selectedAgent, 
  setSelectedAgent 
}) => {
  const agentOptions = agents
    ?.filter(agent => !agent.delete_flag && agent.active_flag)
    ?.map((item) => ({
      label: `${item.name} - ${item.phone1}`,
      value: item.id 
    })) || []

  return (
    <Card title="Added By" size="small" className="mb-4">
      <Form.Item
        label="Added By"
        name="addedBy"
        rules={[{ required: true, message: 'Please select who is adding' }]}
      >
        <Radio.Group onChange={(e) => setAddedByRole(e.target.value)}>
          <Radio value="admin">Admin</Radio>
          <Radio value="agent">Agent</Radio>
        </Radio.Group>
      </Form.Item>

      {addedByRole === 'agent' && (
        <Form.Item
          label="Select Agent"
          name="selectedAgent"
          rules={[{ required: true, message: 'Please select agent' }]}
        >
          <Select
            placeholder="Select agent"
            options={agentOptions}
            onChange={setSelectedAgent}
            style={{ width: '100%' }}
          />
        </Form.Item>
      )}
    </Card>
  )
}

export default AddedByForm