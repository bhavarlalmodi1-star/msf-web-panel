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
  Upload,
  Image,
  Space,
  Tag,
  Switch,
  Tooltip
} from 'antd';
import { 
  Building, 
  FileText, 
  Image as ImageIcon, 
  Upload as UploadIcon,
  Globe,
  Calendar,
  Users,
  Target,
  Award,
  Save,
  Edit,
  Eye,
  X,
  Plus,
  RefreshCw
} from 'lucide-react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, storage } from '../../../../lib/firbase-client';
import { getTrust } from '@/utils/trust/trustStore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';

const { Title, Text } = Typography;
const { TextArea } = Input;

const AboutPage = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [formValues, setFormValues] = useState({});
  const [editMode, setEditMode] = useState(false);
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);
  const [imageFiles, setImageFiles] = useState([null, null, null]);
  const [imagePreviews, setImagePreviews] = useState([null, null, null]);

  // Initial form values
  const initialValues = {
    organizationName: getTrust().name,   // from Settings → Trust Details
    tagline: "Building Bridges Through Matrimony",
    description: "Our organization is dedicated to providing trusted matrimonial services with a focus on cultural values and long-term relationships. We strive to create meaningful connections that lead to lifelong partnerships.",
    mission: "To provide a reliable and secure platform for matrimonial services that respects cultural values and promotes lasting relationships.",
    vision: "To be the most trusted matrimonial service provider, connecting hearts across communities.",
    registrationNumber: getTrust().regNo,
    establishedYear: getTrust().since,
    totalMembers: "5000+",
    successfulMatches: "1000+",
    isActive: true,
  };

  // Load about data from Firebase
  const loadAboutData = async () => {
    setLoading(true);
    try {
      const aboutDoc = await getDoc(doc(db, 'about', 'organization'));
      if (aboutDoc.exists()) {
        const data = aboutDoc.data();
        form.setFieldsValue(data);
        setFormValues(data);
        
        // Set previews if images exist
        if (data.logoUrl) {
          setLogoPreview(data.logoUrl);
        }
        if (data.images) {
          setImagePreviews(data.images);
        }
      } else {
        // Set initial values if no data exists
        form.setFieldsValue(initialValues);
        setFormValues(initialValues);
      }
    } catch (error) {
      console.error('Error loading about data:', error);
      message.error('Failed to load organization information');
      form.setFieldsValue(initialValues);
      setFormValues(initialValues);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAboutData();
  }, []);

  // Handle logo upload
  const handleLogoUpload = async (file) => {
    if (!file) return null;
    
    try {
      setUploading(true);
      // Delete old logo if exists
      if (formValues.logoUrl) {
        try {
          // Extract filename from URL
          const logoPath = formValues.logoUrl.split('/').pop().split('?')[0];
          const oldLogoRef = ref(storage, `about/${logoPath}`);
          await deleteObject(oldLogoRef);
        } catch (error) {
          console.log('Old logo not found or already deleted:', error);
        }
      }

      // Upload new logo
      const timestamp = Date.now();
      const logoName = `logo_${timestamp}`;
      const logoRef = ref(storage, `about/${logoName}`);
      await uploadBytes(logoRef, file);
      const logoUrl = await getDownloadURL(logoRef);
      
      setLogoPreview(logoUrl);
      return logoUrl;
    } catch (error) {
      console.error('Error uploading logo:', error);
      message.error('Failed to upload logo');
      return null;
    } finally {
      setUploading(false);
    }
  };

  // Handle image upload
  const handleImageUpload = async (file, index) => {
    if (!file) return null;
    
    try {
      setUploading(true);
      // Delete old image if exists
      if (formValues.images?.[index]) {
        try {
          // Extract filename from URL
          const imagePath = formValues.images[index].split('/').pop().split('?')[0];
          const oldImageRef = ref(storage, `about/${imagePath}`);
          await deleteObject(oldImageRef);
        } catch (error) {
          console.log('Old image not found or already deleted:', error);
        }
      }

      // Upload new image
      const timestamp = Date.now();
      const imageName = `image_${index}_${timestamp}`;
      const imageRef = ref(storage, `about/${imageName}`);
      await uploadBytes(imageRef, file);
      const imageUrl = await getDownloadURL(imageRef);
      
      const newPreviews = [...imagePreviews];
      newPreviews[index] = imageUrl;
      setImagePreviews(newPreviews);
      
      return imageUrl;
    } catch (error) {
      console.error('Error uploading image:', error);
      message.error(`Failed to upload image ${index + 1}`);
      return null;
    } finally {
      setUploading(false);
    }
  };

  // Handle form submission
  const handleSubmit = async (values) => {
    setSaving(true);
    try {
      let logoUrl = formValues.logoUrl;
      if (logoFile) {
        logoUrl = await handleLogoUpload(logoFile);
      }

      const imageUrls = [...imagePreviews];
      for (let i = 0; i < imageFiles.length; i++) {
        if (imageFiles[i]) {
          const uploadedUrl = await handleImageUpload(imageFiles[i], i);
          if (uploadedUrl) {
            imageUrls[i] = uploadedUrl;
          }
        }
      }

      // Prepare data for Firebase
      const aboutData = {
        ...values,
        logoUrl: logoUrl || formValues.logoUrl,
        images: imageUrls.filter(url => url !== null),
        updatedAt: new Date().toISOString(),
      };

      // Save to Firebase
      await setDoc(doc(db, 'about', 'organization'), aboutData);

      // Update local state
      setFormValues(aboutData);
      setLogoFile(null);
      setImageFiles([null, null, null]);
      setEditMode(false);
      
      message.success('Organization information saved successfully!');
    } catch (error) {
      console.error('Error saving about data:', error);
      message.error('Failed to save organization information');
    } finally {
      setSaving(false);
    }
  };

  // Handle file selection - FIXED VERSION
  const handleLogoChange = (info) => {
    const file = info.file.originFileObj || info.file;
    
    if (!file || !(file instanceof File)) {
      message.error('Invalid file selected');
      return;
    }

    setLogoFile(file);
    
    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setLogoPreview(e.target.result);
    };
    reader.onerror = (error) => {
      console.error('Error reading file:', error);
      message.error('Error reading image file');
    };
    reader.readAsDataURL(file);
  };

  const handleImageChange = (index, info) => {
    const file = info.file.originFileObj || info.file;
    
    if (!file || !(file instanceof File)) {
      message.error('Invalid file selected');
      return;
    }

    const newFiles = [...imageFiles];
    newFiles[index] = file;
    setImageFiles(newFiles);
    
    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      const newPreviews = [...imagePreviews];
      newPreviews[index] = e.target.result;
      setImagePreviews(newPreviews);
    };
    reader.onerror = (error) => {
      console.error('Error reading file:', error);
      message.error('Error reading image file');
    };
    reader.readAsDataURL(file);
  };

  // Remove image
  const removeImage = async (index) => {
    try {
      if (formValues.images?.[index]) {
        // Try to delete from storage
        try {
          const imagePath = formValues.images[index].split('/').pop().split('?')[0];
          const imageRef = ref(storage, `about/${imagePath}`);
          await deleteObject(imageRef);
        } catch (error) {
          console.log('Image not found in storage or already deleted');
        }
      }
      
      // Update state
      const newPreviews = [...imagePreviews];
      newPreviews[index] = null;
      setImagePreviews(newPreviews);
      
      const newFiles = [...imageFiles];
      newFiles[index] = null;
      setImageFiles(newFiles);
      
      message.success('Image removed successfully');
    } catch (error) {
      console.error('Error removing image:', error);
      message.error('Failed to remove image');
    }
  };

  // Reset form
  const handleReset = () => {
    form.setFieldsValue(formValues); // Reset to current form values, not initial
    setLogoFile(null);
    setImageFiles([null, null, null]);
    // Keep existing previews from formValues
    message.info('Form reset to current values');
  };

  // Before upload validation
  const beforeUpload = (file) => {
    const isImage = file.type.startsWith('image/');
    if (!isImage) {
      message.error('You can only upload image files!');
      return Upload.LIST_IGNORE;
    }
    
    const isLt5M = file.size / 1024 / 1024 < 5;
    if (!isLt5M) {
      message.error('Image must be smaller than 5MB!');
      return Upload.LIST_IGNORE;
    }
    
    return true;
  };

  // Custom upload request handler
  const dummyRequest = ({ file, onSuccess }) => {
    setTimeout(() => {
      onSuccess("ok");
    }, 0);
  };

  return (
    <div className="space-y-6 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-gradient-to-r from-rose-500 to-orange-500">
            <Building className="w-8 h-8 text-white" />
          </div>
          <div>
            <Title level={2} className="!mb-1 text-gray-800">
              About Organization
            </Title>
            <Text type="secondary">
              Manage your organization's information and branding
            </Text>
          </div>
        </div>
        
        <div className="flex gap-2">
          {!editMode ? (
            <Button
              type="primary"
              icon={<Edit className="w-4 h-4" />}
              size="large"
              onClick={() => setEditMode(true)}
              className="bg-gradient-to-r from-rose-500 to-orange-500 border-0 hover:from-rose-600 hover:to-orange-600"
            >
              Edit Information
            </Button>
          ) : (
            <>
              <Button
                size="large"
                icon={<RefreshCw className="w-4 h-4" />}
                onClick={handleReset}
                disabled={saving || uploading}
              >
                Reset
              </Button>
              <Button
                size="large"
                onClick={() => {
                  setEditMode(false);
                  // Reload original data
                  loadAboutData();
                }}
                disabled={saving || uploading}
              >
                Cancel
              </Button>
            </>
          )}
        </div>
      </div>

      {editMode ? (
        // Edit Mode
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          className="max-w-6xl mx-auto"
          disabled={loading}
        >
          <Row gutter={24}>
            {/* Left Column - Basic Info */}
            <Col xs={24} lg={16}>
              <Card 
                bordered={false}
                className="shadow-lg rounded-xl border-0 bg-gradient-to-br from-white to-gray-50 mb-6"
              >
                {/* Organization Name & Tagline */}
                <div className="mb-6">
                  <Title level={4} className="!mb-4 flex items-center gap-2">
                    <Building className="w-5 h-5 text-rose-500" />
                    Basic Information
                  </Title>
                  
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

                  <Form.Item
                    name="tagline"
                    label="Tagline / Slogan"
                  >
                    <Input 
                      size="large"
                      placeholder="Enter organization tagline"
                      className="rounded-lg"
                    />
                  </Form.Item>
                </div>

                <Divider className="my-8" />

                {/* Description */}
                <div className="mb-6">
                  <Title level={4} className="!mb-4 flex items-center gap-2">
                    <FileText className="w-5 h-5 text-blue-500" />
                    Description
                  </Title>
                  
                  <Form.Item
                    name="description"
                    label="Organization Description"
                    rules={[{ required: true, message: 'Please enter organization description' }]}
                  >
                    <TextArea
                      rows={4}
                      placeholder="Describe your organization"
                      size="large"
                      className="rounded-lg"
                      maxLength={1000}
                      showCount
                    />
                  </Form.Item>

                  <Row gutter={16}>
                    <Col span={12}>
                      <Form.Item
                        name="mission"
                        label="Mission Statement"
                      >
                        <TextArea
                          rows={3}
                          placeholder="Enter mission statement"
                          size="large"
                          className="rounded-lg"
                          maxLength={500}
                          showCount
                        />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item
                        name="vision"
                        label="Vision Statement"
                      >
                        <TextArea
                          rows={3}
                          placeholder="Enter vision statement"
                          size="large"
                          className="rounded-lg"
                          maxLength={500}
                          showCount
                        />
                      </Form.Item>
                    </Col>
                  </Row>
                </div>

                <Divider className="my-8" />

                {/* Stats */}
                <div className="mb-6">
                  <Title level={4} className="!mb-4 flex items-center gap-2">
                    <Target className="w-5 h-5 text-green-500" />
                    Organization Statistics
                  </Title>
                  
                  <Row gutter={16}>
                    <Col span={8}>
                      <Form.Item
                        name="registrationNumber"
                        label="Registration Number"
                      >
                        <Input 
                          size="large"
                          placeholder="e.g., A/5231"
                          className="rounded-lg"
                        />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item
                        name="establishedYear"
                        label="Established Year"
                      >
                        <Input 
                          size="large"
                          placeholder="e.g., 2024"
                          className="rounded-lg"
                        />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item
                        name="isActive"
                        label="Status"
                        valuePropName="checked"
                      >
                        <Switch 
                          checkedChildren="Active" 
                          unCheckedChildren="Inactive"
                        />
                      </Form.Item>
                    </Col>
                  </Row>
                </div>
              </Card>
            </Col>

            {/* Right Column - Images */}
            <Col xs={24} lg={8}>
              <Card 
                bordered={false}
                className="shadow-lg rounded-xl border-0 bg-gradient-to-br from-white to-gray-50 mb-6"
              >
                {/* Logo Upload */}
                <div className="mb-6">
                  <Title level={4} className="!mb-4 flex items-center gap-2">
                    <ImageIcon className="w-5 h-5 text-purple-500" />
                    Organization Logo
                  </Title>
                  
                  <div className="text-center">
                    {logoPreview ? (
                      <div className="relative inline-block">
                        <img
                          src={logoPreview}
                          alt="Logo Preview"
                          className="rounded-lg border-2 border-gray-200 p-2 w-48 h-48 object-contain bg-white"
                        />
                        <Button
                          type="text"
                          danger
                          icon={<X className="w-4 h-4" />}
                          className="absolute -top-2 -right-2 bg-white rounded-full shadow-lg"
                          onClick={() => {
                            setLogoFile(null);
                            setLogoPreview(null);
                          }}
                        />
                      </div>
                    ) : (
                      <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 w-48 h-48 mx-auto flex flex-col items-center justify-center">
                        <ImageIcon className="w-12 h-12 text-gray-400 mb-3" />
                        <Text type="secondary" className="block mb-3 text-center">
                          Upload Organization Logo
                        </Text>
                      </div>
                    )}
                    
                    <Upload
                      beforeUpload={beforeUpload}
                      customRequest={dummyRequest}
                      onChange={handleLogoChange}
                      showUploadList={false}
                      accept="image/*"
                      className="mt-4"
                    >
                      <Button
                        icon={<UploadIcon className="w-4 h-4" />}
                        className="border-dashed"
                      >
                        {logoPreview ? 'Change Logo' : 'Upload Logo'}
                      </Button>
                    </Upload>
                    
                    <Text type="secondary" className="block mt-2 text-xs">
                      Recommended: Square logo, PNG format, max 5MB
                    </Text>
                  </div>
                </div>

                <Divider className="my-8" />

                {/* Gallery Images */}
                <div>
                  <Title level={4} className="!mb-4 flex items-center gap-2">
                    <ImageIcon className="w-5 h-5 text-blue-500" />
                    Gallery Images
                  </Title>
                  
                  <Text type="secondary" className="block mb-4">
                    Upload up to 3 images for your organization gallery
                  </Text>
                  
                  <div className="grid grid-cols-2 gap-4">
                    {[0, 1, 2].map((index) => (
                      <div key={index} className="relative">
                        {imagePreviews[index] ? (
                          <>
                            <img
                              src={imagePreviews[index]}
                              alt={`Gallery ${index + 1}`}
                              className="rounded-lg border-2 border-gray-200 w-full h-32 object-cover bg-gray-100"
                            />
                            <Button
                              type="text"
                              danger
                              size="small"
                              icon={<X className="w-3 h-3" />}
                              className="absolute -top-2 -right-2 bg-white rounded-full shadow"
                              onClick={() => removeImage(index)}
                            />
                          </>
                        ) : (
                          <div className="border-2 border-dashed border-gray-300 rounded-lg w-full h-32 flex flex-col items-center justify-center bg-gray-50">
                            <ImageIcon className="w-8 h-8 text-gray-400 mb-2" />
                            <Text type="secondary" className="text-xs">
                              Image {index + 1}
                            </Text>
                          </div>
                        )}
                        
                        <Upload
                          beforeUpload={beforeUpload}
                          customRequest={dummyRequest}
                          onChange={(info) => handleImageChange(index, info)}
                          showUploadList={false}
                          accept="image/*"
                        >
                          <Button
                            type="dashed"
                            size="small"
                            icon={<Plus className="w-3 h-3" />}
                            className="w-full mt-2"
                          >
                            {imagePreviews[index] ? 'Change' : 'Upload'}
                          </Button>
                        </Upload>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            </Col>
          </Row>

          {/* Save Button */}
          <div className="text-center mt-6">
            <Button
              type="primary"
              htmlType="submit"
              size="large"
              loading={saving || uploading}
              icon={<Save className="w-4 h-4" />}
              className="bg-gradient-to-r from-rose-500 to-orange-500 border-0 hover:from-rose-600 hover:to-orange-600 px-8"
            >
              Save Organization Information
            </Button>
          </div>
        </Form>
      ) : (
        // View Mode
        <div className="max-w-6xl mx-auto">
          {/* Organization Header */}
          <Card 
            bordered={false}
            className="shadow-lg rounded-xl border-0 bg-gradient-to-br from-rose-50 to-orange-50 mb-6"
          >
            <div className="flex flex-col md:flex-row items-center gap-6">
              {formValues.logoUrl && (
                <div className="w-32 h-32 bg-white rounded-xl p-4 shadow-md">
                  <img
                    src={formValues.logoUrl}
                    alt="Organization Logo"
                    className="w-full h-full object-contain"
                  />
                </div>
              )}
              
              <div className="flex-1 text-center md:text-left">
                <Title level={2} className="!mb-2 text-gray-900">
                  {formValues.organizationName || initialValues.organizationName}
                </Title>
                
                {formValues.tagline && (
                  <Text className="text-lg text-rose-600 font-medium">
                    {formValues.tagline}
                  </Text>
                )}
                
                <div className="flex flex-wrap gap-3 mt-4 justify-center md:justify-start">
                  {formValues.registrationNumber && (
                    <Tag color="blue" icon={<FileText className="w-3 h-3" />}>
                      Reg. No: {formValues.registrationNumber}
                    </Tag>
                  )}
                  
                  {formValues.establishedYear && (
                    <Tag color="green" icon={<Calendar className="w-3 h-3" />}>
                      Since: {formValues.establishedYear}
                    </Tag>
                  )}
                  
                  {formValues.isActive && (
                    <Tag color="success" icon={<Award className="w-3 h-3" />}>
                      Active Organization
                    </Tag>
                  )}
                </div>
              </div>
            </div>
          </Card>

          <Row gutter={24}>
            {/* Left Column - Content */}
            <Col xs={24} lg={16}>
              {/* Description Card */}
              <Card 
                bordered={false}
                className="shadow-lg rounded-xl border-0 bg-white mb-6"
              >
                <Title level={4} className="!mb-4 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-rose-500" />
                  About Us
                </Title>
                
                <Text className="text-gray-700 text-lg leading-relaxed">
                  {formValues.description || initialValues.description}
                </Text>
              </Card>

              {/* Mission & Vision */}
              <Row gutter={16} className="mb-6">
                <Col xs={24} md={12}>
                  <Card 
                    bordered={false}
                    className="shadow-lg rounded-xl border-0 bg-gradient-to-br from-blue-50 to-white h-full"
                  >
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2 rounded-lg bg-blue-100">
                        <Target className="w-5 h-5 text-blue-600" />
                      </div>
                      <Title level={4} className="!mb-0">Our Mission</Title>
                    </div>
                    
                    <Text className="text-gray-700">
                      {formValues.mission || initialValues.mission}
                    </Text>
                  </Card>
                </Col>
                
                <Col xs={24} md={12}>
                  <Card 
                    bordered={false}
                    className="shadow-lg rounded-xl border-0 bg-gradient-to-br from-green-50 to-white h-full"
                  >
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2 rounded-lg bg-green-100">
                        <Globe className="w-5 h-5 text-green-600" />
                      </div>
                      <Title level={4} className="!mb-0">Our Vision</Title>
                    </div>
                    
                    <Text className="text-gray-700">
                      {formValues.vision || initialValues.vision}
                    </Text>
                  </Card>
                </Col>
              </Row>

              {/* Stats Cards */}
              <Card 
                bordered={false}
                className="shadow-lg rounded-xl border-0 bg-gradient-to-br from-purple-50 to-white"
              >
                <Title level={4} className="!mb-6 flex items-center gap-2">
                  <Users className="w-5 h-5 text-purple-500" />
                  Organization Statistics
                </Title>
                
                <Row gutter={16}>
                  <Col xs={12} md={6}>
                    <div className="text-center">
                      <div className="text-3xl font-bold text-blue-600 mb-2">
                        {formValues.establishedYear || initialValues.establishedYear}
                      </div>
                      <Text type="secondary">Established Year</Text>
                    </div>
                  </Col>
                  
                  <Col xs={12} md={6}>
                    <div className="text-center">
                      <div className="text-3xl font-bold text-purple-600 mb-2">
                        {formValues.registrationNumber || initialValues.registrationNumber}
                      </div>
                      <Text type="secondary">Registration No.</Text>
                    </div>
                  </Col>
                </Row>
              </Card>
            </Col>

            {/* Right Column - Images */}
            <Col xs={24} lg={8}>
              {/* Gallery */}
              <Card 
                bordered={false}
                className="shadow-lg rounded-xl border-0 bg-white mb-6"
              >
                <Title level={4} className="!mb-4 flex items-center gap-2">
                  <ImageIcon className="w-5 h-5 text-rose-500" />
                  Gallery
                </Title>
                
                {(formValues.images || []).filter(img => img).length > 0 ? (
                  <div className="grid grid-cols-2 gap-4">
                    {formValues.images?.filter(img => img).map((img, index) => (
                      <div key={index} className="relative">
                        <img
                          src={img}
                          alt={`Gallery ${index + 1}`}
                          className="rounded-lg w-full h-32 object-cover bg-gray-100"
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <ImageIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <Text type="secondary">No gallery images uploaded yet</Text>
                  </div>
                )}
              </Card>
            </Col>
          </Row>
        </div>
      )}
    </div>
  );
};

export default AboutPage;