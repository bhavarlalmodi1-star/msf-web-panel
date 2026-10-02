import React, { useState } from 'react'
import { Card, Row, Col, Form, Input, Select, Button, Modal, message } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../../../../../lib/firbase-client'

const GuardianForm = ({ relations, onRelationAdded }) => {
  const [relationModal,  setRelationModal]  = useState(false)
  const [relationName,   setRelationName]   = useState('')
  const [savingRelation, setSavingRelation] = useState(false)

  const saveRelation = async () => {
    const name = relationName.trim()
    if (!name) { message.warning('Enter relation name'); return }
    setSavingRelation(true)
    try {
      const ref = await addDoc(collection(db, 'relations'), {
        name, status: 'active',
        createdAt: serverTimestamp(),
      })
      const newItem = { id: ref.id, name, status: 'active' }
      onRelationAdded?.(newItem)
      setRelationName('')
      setRelationModal(false)
      message.success(`Relation "${name}" added`)
    } catch (err) {
      console.error(err)
      message.error('Failed to add relation')
    } finally {
      setSavingRelation(false)
    }
  }

  const relationLabel = (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      Relation with Nominee / Varisdar
      <Button
        type="link"
        size="small"
        icon={<PlusOutlined />}
        onClick={e => { e.preventDefault(); setRelationName(''); setRelationModal(true) }}
        style={{ padding: 0, height: 'auto', lineHeight: 1, fontSize: 12 }}
        title="Add new relation"
      >
        Add
      </Button>
    </span>
  )

  return (
    <>
      <Card title="Nominee / Varisdar Information" size="small" className="mb-4">
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item
              label="Nominee / Varisdar Name"
              name="guardian"
              rules={[{ required: true, message: 'Please enter nominee / varisdar name' }]}
            >
              <Input placeholder="Enter nominee / varisdar name" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item
              label={relationLabel}
              name="guardianRelation"
              rules={[{ required: true, message: 'Please select relation' }]}
            >
              <Select
                placeholder="Select relation"
                showSearch
                optionFilterProp="label"
                options={relations.map(r => ({ label: r.name, value: r.id }))}
              />
            </Form.Item>
          </Col>
        </Row>
      </Card>

      {/* ── Add Relation Modal ───────────────────────────────────────────── */}
      <Modal
        title={<><PlusOutlined /> Add New Relation</>}
        open={relationModal}
        onCancel={() => setRelationModal(false)}
        onOk={saveRelation}
        okText={savingRelation ? 'Saving…' : 'Save'}
        okButtonProps={{ loading: savingRelation, disabled: !relationName.trim() }}
        width={380}
        destroyOnClose
      >
        <Input
          autoFocus
          placeholder="e.g. Father, Mother, Brother…"
          value={relationName}
          onChange={e => setRelationName(e.target.value)}
          onPressEnter={saveRelation}
          style={{ marginTop: 8 }}
        />
      </Modal>
    </>
  )
}

export default GuardianForm
