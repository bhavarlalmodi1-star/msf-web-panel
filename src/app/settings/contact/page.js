"use client";
import React, { useState, useEffect } from 'react';
import { 
  Card, 
  Button, 
  Form, 
  Input, 
  message, 
  Row, 
  Col, 
  Typography,
  Divider,
  Tag,
  Space
} from 'antd';
import { 
  Phone, 
  Mail, 
  MapPin, 
  Building, 
  Globe, 
  Facebook, 
  Twitter, 
  Instagram, 
  Linkedin, 
  Youtube,
  Save,
  RefreshCw
} from 'lucide-react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../../../lib/firbase-client';
import { getTrust } from '@/utils/trust/trustStore';

const { Title, Text } = Typography;
const { TextArea } = Input;

const OrganizationContact = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formValues, setFormValues] = useState({});

  // Initial form values
  const initialValues = {
    organizationName: getTrust().name,   // from Settings → Trust Details
    organizationPhone: ["9876543210", "9876543211"],
    organizationEmail: ["info@matrimonyhub.com", "support@matrimonyhub.com"],
    address: getTrust().address,
    website: "https://matrimonyhub.com",
    facebook: "https://facebook.com/matrimonyhub",
    instagram: "https://instagram.com/matrimonyhub",
    twitter: "https://twitter.com/matrimonyhub",
    linkedin: "https://linkedin.com/company/matrimonyhub",
    youtube: "https://youtube.com/matrimonyhub",
    whatsapp: "9876543210",
    additionalInfo: "Our organization is dedicated to providing matrimonial services with trust and transparency."
  };

  // Load contact data from Firebase
  const loadContactData = async () => {
    setLoading(true);
    try {
      const contactDoc = await getDoc(doc(db, 'contact', 'organization'));
      if (contactDoc.exists()) {
        const data = contactDoc.data();
        form.setFieldsValue(data);
        setFormValues(data);
      } else {
        // Set initial values if no data exists
        form.setFieldsValue(initialValues);
        setFormValues(initialValues);
      }
    } catch (error) {
      console.error('Error loading contact data:', error);
      message.error('Failed to load contact information');
      form.setFieldsValue(initialValues);
      setFormValues(initialValues);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadContactData();
  }, []);

  // Handle form submission
  const handleSubmit = async (values) => {
    setSaving(true);
    try {
      // Convert arrays to comma-separated strings for storage
      const contactData = {
        ...values,
        organizationPhone: Array.isArray(values.organizationPhone) 
          ? values.organizationPhone.join(', ') 
          : values.organizationPhone,
        organizationEmail: Array.isArray(values.organizationEmail) 
          ? values.organizationEmail.join(', ') 
          : values.organizationEmail,
        updatedAt: new Date().toISOString(),
      };

      // Save to Firebase
      await setDoc(doc(db, 'contact', 'organization'), contactData);

      // Update local state
      setFormValues(contactData);
      message.success('Contact information saved successfully!');
    } catch (error) {
      console.error('Error saving contact:', error);
      message.error('Failed to save contact information');
    } finally {
      setSaving(false);
    }
  };

  // Handle form value changes
  const handleValuesChange = (changedValues, allValues) => {
    setFormValues(allValues);
  };

  // Reset form to initial values
  const handleReset = () => {
    form.setFieldsValue(initialValues);
    setFormValues(initialValues);
    message.info('Form reset to default values');
  };

  // Helper function to get comma-separated values as array
  const getArrayFromString = (value) => {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    return value.split(',').map(item => item.trim()).filter(item => item);
  };

  return (
    <div className="space-y-6 p-4 sm:p-6">
      {/* Header */}
      <div className="text-center mb-8">
        <Title level={2} className="!mb-2 text-gray-800 flex items-center justify-center gap-3">
          <Building className="w-8 h-8 text-rose-500" />
          Organization Contact Information
        </Title>
        <Text type="secondary" className="text-lg">
          Update your organization's contact details and social media links
        </Text>
      </div>

      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        onValuesChange={handleValuesChange}
        className="max-w-4xl mx-auto"
        disabled={loading}
      >
        <Card 
          bordered={false}
          className="shadow-lg rounded-xl border-0 bg-gradient-to-br from-white to-gray-50 mb-6"
        >
          {/* Organization Basic Info */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-4">
              <Building className="w-6 h-6 text-rose-500" />
              <Title level={4} className="!mb-0">Basic Information</Title>
            </div>
            
            <Form.Item
              name="organizationName"
              label="Organization Name"
              rules={[{ required: true, message: 'Please enter organization name' }]}
            >
              <Input 
                size="large"
                placeholder="Enter organization name"
                className="rounded-lg"
              />
            </Form.Item>

            <Row gutter={16}>
              <Col span={12}>
                <Form.Item
                  name="organizationPhone"
                  label={
                    <span className="flex items-center gap-2">
                      <Phone className="w-4 h-4 text-green-600" />
                      Contact Numbers
                    </span>
                  }
                  rules={[{ required: true, message: 'Please enter at least one phone number' }]}
                  extra="Enter multiple numbers separated by commas"
                  getValueFromEvent={(e) => e.target.value.split(',').map(item => item.trim())}
                  getValueProps={(value) => ({
                    value: Array.isArray(value) ? value.join(', ') : value
                  })}
                >
                  <Input 
                    size="large"
                    placeholder="9876543210, 9876543211"
                    className="rounded-lg"
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  name="organizationEmail"
                  label={
                    <span className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-blue-600" />
                      Email Addresses
                    </span>
                  }
                  rules={[{ required: true, message: 'Please enter at least one email' }]}
                  extra="Enter multiple emails separated by commas"
                  getValueFromEvent={(e) => e.target.value.split(',').map(item => item.trim())}
                  getValueProps={(value) => ({
                    value: Array.isArray(value) ? value.join(', ') : value
                  })}
                >
                  <Input 
                    size="large"
                    placeholder="info@example.com, support@example.com"
                    className="rounded-lg"
                  />
                </Form.Item>
              </Col>
            </Row>
          </div>

          <Divider className="my-8" />

          {/* Address */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-4">
              <MapPin className="w-6 h-6 text-red-500" />
              <Title level={4} className="!mb-0">Organization Address</Title>
            </div>
            
            <Form.Item
              name="address"
              label="Complete Address"
              rules={[{ required: true, message: 'Please enter organization address' }]}
            >
              <TextArea
                rows={3}
                placeholder="Enter complete organization address"
                size="large"
                className="rounded-lg"
                maxLength={500}
                showCount
              />
            </Form.Item>
          </div>

          <Divider className="my-8" />

          {/* Website */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-4">
              <Globe className="w-6 h-6 text-blue-500" />
              <Title level={4} className="!mb-0">Website</Title>
            </div>
            
            <Form.Item
              name="website"
              label="Website URL"
              rules={[{ type: 'url', message: 'Please enter a valid URL' }]}
            >
              <Input 
                size="large"
                placeholder="https://yourwebsite.com"
                prefix={<Globe className="w-4 h-4 text-gray-400" />}
                className="rounded-lg"
              />
            </Form.Item>
          </div>

          <Divider className="my-8" />

          {/* Social Media Links */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-2 rounded-lg bg-gradient-to-r from-rose-500 to-orange-500">
                <Globe className="w-4 h-4 text-white" />
              </div>
              <Title level={4} className="!mb-0">Social Media Links</Title>
            </div>

            <Row gutter={16}>
              <Col span={12}>
                <Form.Item
                  name="facebook"
                  label={
                    <span className="flex items-center gap-2">
                      <Facebook className="w-4 h-4 text-blue-600" />
                      Facebook
                    </span>
                  }
                  rules={[{ type: 'url', message: 'Please enter a valid URL' }]}
                >
                  <Input 
                    size="large"
                    placeholder="https://facebook.com/username"
                    className="rounded-lg"
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  name="instagram"
                  label={
                    <span className="flex items-center gap-2">
                      <Instagram className="w-4 h-4 text-pink-600" />
                      Instagram
                    </span>
                  }
                  rules={[{ type: 'url', message: 'Please enter a valid URL' }]}
                >
                  <Input 
                    size="large"
                    placeholder="https://instagram.com/username"
                    className="rounded-lg"
                  />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col span={12}>
                <Form.Item
                  name="twitter"
                  label={
                    <span className="flex items-center gap-2">
                      <Twitter className="w-4 h-4 text-blue-400" />
                      Twitter
                    </span>
                  }
                  rules={[{ type: 'url', message: 'Please enter a valid URL' }]}
                >
                  <Input 
                    size="large"
                    placeholder="https://twitter.com/username"
                    className="rounded-lg"
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  name="linkedin"
                  label={
                    <span className="flex items-center gap-2">
                      <Linkedin className="w-4 h-4 text-blue-700" />
                      LinkedIn
                    </span>
                  }
                  rules={[{ type: 'url', message: 'Please enter a valid URL' }]}
                >
                  <Input 
                    size="large"
                    placeholder="https://linkedin.com/company/username"
                    className="rounded-lg"
                  />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col span={12}>
                <Form.Item
                  name="youtube"
                  label={
                    <span className="flex items-center gap-2">
                      <Youtube className="w-4 h-4 text-red-600" />
                      YouTube
                    </span>
                  }
                  rules={[{ type: 'url', message: 'Please enter a valid URL' }]}
                >
                  <Input 
                    size="large"
                    placeholder="https://youtube.com/channel"
                    className="rounded-lg"
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  name="whatsapp"
                  label={
                    <span className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                        <span className="text-white text-xs font-bold">W</span>
                      </div>
                      WhatsApp Number
                    </span>
                  }
                  rules={[{ pattern: /^[0-9]{10}$/, message: 'Must be 10 digits' }]}
                >
                  <Input 
                    size="large"
                    placeholder="9876543210"
                    maxLength={10}
                    className="rounded-lg"
                  />
                </Form.Item>
              </Col>
            </Row>
          </div>

          <Divider className="my-8" />

          {/* Additional Information */}
          <div className="mb-6">
            <Title level={4} className="!mb-4">Additional Information</Title>
            
            <Form.Item
              name="additionalInfo"
              label="Organization Description"
            >
              <TextArea
                rows={4}
                placeholder="Brief description about your organization"
                size="large"
                className="rounded-lg"
                maxLength={1000}
                showCount
              />
            </Form.Item>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-6 border-t">
            <Button
              size="large"
              icon={<RefreshCw className="w-4 h-4" />}
              onClick={handleReset}
              disabled={loading || saving}
            >
              Reset
            </Button>
            <Button
              type="primary"
              htmlType="submit"
              size="large"
              loading={saving}
              icon={<Save className="w-4 h-4" />}
              className="bg-gradient-to-r from-rose-500 to-orange-500 border-0 hover:from-rose-600 hover:to-orange-600"
            >
              Save Contact Information
            </Button>
          </div>
        </Card>
      </Form>

      {/* Preview Card */}
      <Card 
        title={
          <div className="flex items-center gap-2">
            <Building className="w-5 h-5 text-rose-500" />
            <span>Contact Information Preview</span>
          </div>
        }
        className="max-w-4xl mx-auto shadow-md"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <Building className="w-5 h-5 text-gray-400 mt-1" />
            <div>
              <Text strong className="block">Organization</Text>
              <Text>{formValues.organizationName || 'Not set'}</Text>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Phone className="w-5 h-5 text-gray-400 mt-1" />
            <div>
              <Text strong className="block">Contact Numbers</Text>
              {getArrayFromString(formValues.organizationPhone).map((phone, index) => (
                phone && (
                  <Tag key={index} color="green" className="mb-1 mr-1">
                    {phone}
                  </Tag>
                )
              )) || <Text type="secondary">Not set</Text>}
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Mail className="w-5 h-5 text-gray-400 mt-1" />
            <div>
              <Text strong className="block">Email Addresses</Text>
              {getArrayFromString(formValues.organizationEmail).map((email, index) => (
                email && (
                  <Tag key={index} color="blue" className="mb-1 mr-1">
                    {email}
                  </Tag>
                )
              )) || <Text type="secondary">Not set</Text>}
            </div>
          </div>

          <div className="flex items-start gap-3">
            <MapPin className="w-5 h-5 text-gray-400 mt-1" />
            <div>
              <Text strong className="block">Address</Text>
              <Text>{formValues.address || 'Not set'}</Text>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Globe className="w-5 h-5 text-gray-400 mt-1" />
            <div>
              <Text strong className="block">Website</Text>
              {formValues.website ? (
                <a 
                  href={formValues.website} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  {formValues.website}
                </a>
              ) : (
                <Text type="secondary">Not set</Text>
              )}
            </div>
          </div>

          <div>
            <Text strong className="block mb-2">Social Media</Text>
            <Space wrap>
              {formValues.facebook && (
                <a href={formValues.facebook} target="_blank" rel="noopener noreferrer">
                  <Tag icon={<Facebook className="w-3 h-3" />} color="blue">
                    Facebook
                  </Tag>
                </a>
              )}
              {formValues.instagram && (
                <a href={formValues.instagram} target="_blank" rel="noopener noreferrer">
                  <Tag icon={<Instagram className="w-3 h-3" />} color="pink">
                    Instagram
                  </Tag>
                </a>
              )}
              {formValues.twitter && (
                <a href={formValues.twitter} target="_blank" rel="noopener noreferrer">
                  <Tag icon={<Twitter className="w-3 h-3" />} color="cyan">
                    Twitter
                  </Tag>
                </a>
              )}
              {formValues.linkedin && (
                <a href={formValues.linkedin} target="_blank" rel="noopener noreferrer">
                  <Tag icon={<Linkedin className="w-3 h-3" />} color="blue">
                    LinkedIn
                  </Tag>
                </a>
              )}
              {formValues.youtube && (
                <a href={formValues.youtube} target="_blank" rel="noopener noreferrer">
                  <Tag icon={<Youtube className="w-3 h-3" />} color="red">
                    YouTube
                  </Tag>
                </a>
              )}
              {formValues.whatsapp && (
                <a 
                  href={`https://wa.me/${formValues.whatsapp}`} 
                  target="_blank" 
                  rel="noopener noreferrer"
                >
                  <Tag color="green">
                    WhatsApp
                  </Tag>
                </a>
              )}
              {!formValues.facebook && !formValues.instagram && !formValues.twitter && 
               !formValues.linkedin && !formValues.youtube && !formValues.whatsapp && (
                <Text type="secondary">No social media links set</Text>
              )}
            </Space>
          </div>

          {formValues.additionalInfo && (
            <div className="flex items-start gap-3 mt-4">
              <div>
                <Text strong className="block">Additional Information</Text>
                <Text className="text-gray-600">{formValues.additionalInfo}</Text>
              </div>
            </div>
          )}
        </div>
      </Card>

      <style jsx>{`
        :global(.ant-input-affix-wrapper) {
          border-radius: 12px !important;
          padding: 12px 16px !important;
        }
        
        :global(.ant-input-affix-wrapper:hover),
        :global(.ant-input-affix-wrapper:focus) {
          border-color: #3B82F6 !important;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1) !important;
        }
        
        :global(.ant-btn-primary) {
          background: linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%) !important;
          border: none !important;
        }
        
        :global(.ant-btn-primary:hover) {
          background: linear-gradient(135deg, var(--primary-dark) 0%, var(--secondary-dark) 100%) !important;
        }
        
        :global(.ant-card-head) {
          background: linear-gradient(135deg, var(--pink-50) 0%, #fff7ed 100%) !important;
          border-bottom: 2px solid var(--border) !important;
        }
      `}</style>
    </div>
  );
};

export default OrganizationContact;