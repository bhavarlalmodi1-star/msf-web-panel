import React, { useState } from 'react'
import { Card, Row, Col, Form, Input, Select, Button, Modal, message } from 'antd'
import { PlusOutlined, LoadingOutlined } from '@ant-design/icons'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../../../../../lib/firbase-client'

// ── Small label with inline "+" button ───────────────────────────────────────
const LabelWithAdd = ({ label, onAdd, disabled }) => (
  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
    {label}
    <Button
      type="link"
      size="small"
      icon={<PlusOutlined />}
      disabled={disabled}
      onClick={e => { e.preventDefault(); onAdd() }}
      style={{ padding: 0, height: 'auto', lineHeight: 1, fontSize: 12 }}
      title={`Add new ${label.toLowerCase()}`}
    >
      Add
    </Button>
  </span>
)

const AddressForm = ({
  states,
  districts,
  cities,
  selectedState,
  selectedDistrict,
  handleStateChange,
  handleDistrictChange,
  form,
  onDistrictAdded,
  onCityAdded,
}) => {
  // ── Modal state ───────────────────────────────────────────────────────────
  const [districtModal, setDistrictModal] = useState(false)
  const [districtName,  setDistrictName]  = useState('')
  const [savingDistrict, setSavingDistrict] = useState(false)

  const [cityModal, setCityModal]   = useState(false)
  const [cityName,  setCityName]    = useState('')
  const [savingCity, setSavingCity] = useState(false)

  // ── Save district ─────────────────────────────────────────────────────────
  const saveDistrict = async () => {
    const name = districtName.trim()
    if (!name) { message.warning('Enter district name'); return }
    setSavingDistrict(true)
    try {
      const ref = await addDoc(collection(db, 'districts'), {
        name, stateId: selectedState, status: 'active',
        createdAt: serverTimestamp(),
      })
      const newItem = { id: ref.id, name, stateId: selectedState, status: 'active' }
      onDistrictAdded?.(newItem)
      setDistrictName('')
      setDistrictModal(false)
      message.success(`District "${name}" added`)
    } catch (err) {
      console.error(err)
      message.error('Failed to add district')
    } finally {
      setSavingDistrict(false)
    }
  }

  // ── Save city ─────────────────────────────────────────────────────────────
  const saveCity = async () => {
    const name = cityName.trim()
    if (!name) { message.warning('Enter city name'); return }
    setSavingCity(true)
    try {
      const ref = await addDoc(collection(db, 'cities'), {
        name, districtId: selectedDistrict, stateId: selectedState || '', status: 'active',
        createdAt: serverTimestamp(),
      })
      const newItem = { id: ref.id, name, districtId: selectedDistrict, status: 'active' }
      onCityAdded?.(newItem)
      setCityName('')
      setCityModal(false)
      message.success(`City "${name}" added`)
    } catch (err) {
      console.error(err)
      message.error('Failed to add city')
    } finally {
      setSavingCity(false)
    }
  }

  return (
    <>
      <Card title="Address Information" size="small" className="mb-4">
        <Row gutter={16}>
          <Col span={24}>
            <Form.Item
              label="Current Address"
              name="currentAddress"
              rules={[{ required: true, message: 'Please enter address' }]}
            >
              <Input.TextArea rows={2} placeholder="Enter complete address" />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={8}>
            <Form.Item
              label="State"
              name="state"
              rules={[{ required: true, message: 'Please select state' }]}
            >
              <Select
                placeholder="Select state"
                showSearch
                optionFilterProp="label"
                options={states.map(s => ({ label: s.name, value: s.id }))}
                onChange={handleStateChange}
              />
            </Form.Item>
          </Col>

          <Col span={8}>
            <Form.Item
              label={
                <LabelWithAdd
                  label="District"
                  disabled={!selectedState}
                  onAdd={() => { setDistrictName(''); setDistrictModal(true) }}
                />
              }
              name="district"
              rules={[{ required: true, message: 'Please select district' }]}
            >
              <Select
                placeholder={selectedState ? 'Select district' : 'Select state first'}
                showSearch
                optionFilterProp="label"
                options={districts.map(d => ({ label: d.name, value: d.id }))}
                disabled={!selectedState}
                onChange={handleDistrictChange}
              />
            </Form.Item>
          </Col>

          <Col span={8}>
            <Form.Item
              label={
                <LabelWithAdd
                  label="City"
                  disabled={!selectedDistrict}
                  onAdd={() => { setCityName(''); setCityModal(true) }}
                />
              }
              name="city"
              rules={[{ required: true, message: 'Please select city' }]}
            >
              <Select
                placeholder={selectedDistrict ? 'Select city' : 'Select district first'}
                showSearch
                optionFilterProp="label"
                options={cities.map(c => ({ label: c.name, value: c.id }))}
                disabled={!selectedDistrict}
              />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              label="Pin Code"
              name="pinCode"
              rules={[
                { required: true, message: 'Please enter pin code' },
                { pattern: /^[0-9]{6}$/, message: 'Please enter valid 6-digit pin code' }
              ]}
            >
              <Input placeholder="Enter pin code" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              label="Village"
              name="village"
              rules={[{ required: true, message: 'Please enter village' }]}
            >
              <Input placeholder="Enter village" />
            </Form.Item>
          </Col>
        </Row>
      </Card>

      {/* ── Add District Modal ───────────────────────────────────────────── */}
      <Modal
        title={<><PlusOutlined /> Add New District</>}
        open={districtModal}
        onCancel={() => setDistrictModal(false)}
        onOk={saveDistrict}
        okText={savingDistrict ? 'Saving…' : 'Save'}
        okButtonProps={{ loading: savingDistrict, disabled: !districtName.trim() }}
        width={380}
        destroyOnClose
      >
        <Input
          autoFocus
          placeholder="Enter district name"
          value={districtName}
          onChange={e => setDistrictName(e.target.value)}
          onPressEnter={saveDistrict}
          style={{ marginTop: 8 }}
        />
      </Modal>

      {/* ── Add City Modal ───────────────────────────────────────────────── */}
      <Modal
        title={<><PlusOutlined /> Add New City</>}
        open={cityModal}
        onCancel={() => setCityModal(false)}
        onOk={saveCity}
        okText={savingCity ? 'Saving…' : 'Save'}
        okButtonProps={{ loading: savingCity, disabled: !cityName.trim() }}
        width={380}
        destroyOnClose
      >
        <Input
          autoFocus
          placeholder="Enter city name"
          value={cityName}
          onChange={e => setCityName(e.target.value)}
          onPressEnter={saveCity}
          style={{ marginTop: 8 }}
        />
      </Modal>
    </>
  )
}

export default AddressForm
