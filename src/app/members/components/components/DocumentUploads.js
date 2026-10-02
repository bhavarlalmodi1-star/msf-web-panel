import React, { useState } from 'react'
import { Card, Row, Col, Form, Button, Upload, Space, Modal, Image } from 'antd'
import { UploadOutlined, FilePdfOutlined, EyeOutlined, DeleteOutlined } from '@ant-design/icons'
import { message } from 'antd'
import ImgCrop from 'antd-img-crop'

const DocumentUploads = ({ 
  memberDocFront, 
  setMemberDocFront, 
  memberDocBack, 
  setMemberDocBack,
  guardianDoc,
  setGuardianDoc,
  existingMemberDocFront,
  existingMemberDocBack,
  existingGuardianDoc,
  isEditMode = false
}) => {
  const [previewVisible, setPreviewVisible] = useState(false)
  const [previewImage, setPreviewImage] = useState('')
  const [memberFrontFileList, setMemberFrontFileList] = useState([])
  const [memberBackFileList, setMemberBackFileList] = useState([])
  const [guardianFileList, setGuardianFileList] = useState([])

  // Initialize file lists from existing documents.
  //
  // Each doc state holds EITHER a File the user just picked, OR an https URL
  // carried over from an edited/copied member. The old guard (`!memberDocFront`)
  // meant a URL in that state suppressed its own preview, so copied documents
  // looked like they hadn't come across. Only a real File should take over.
  React.useEffect(() => {
    const url = (typeof memberDocFront === 'string' && memberDocFront) || existingMemberDocFront
    if (url && !(memberDocFront instanceof File)) {
      setMemberFrontFileList([{
        uid: '-1',
        name: url.includes('.pdf') ? 'member_front.pdf' : 'member_front.jpg',
        status: 'done',
        url,
        preview: url,
        isImage: !url.includes('.pdf')
      }])
    }
  }, [existingMemberDocFront, memberDocFront])

  React.useEffect(() => {
    const url = (typeof memberDocBack === 'string' && memberDocBack) || existingMemberDocBack
    if (url && !(memberDocBack instanceof File)) {
      setMemberBackFileList([{
        uid: '-2',
        name: url.includes('.pdf') ? 'member_back.pdf' : 'member_back.jpg',
        status: 'done',
        url,
        preview: url,
        isImage: !url.includes('.pdf')
      }])
    }
  }, [existingMemberDocBack, memberDocBack])

  React.useEffect(() => {
    const url = (typeof guardianDoc === 'string' && guardianDoc) || existingGuardianDoc
    if (url && !(guardianDoc instanceof File)) {
      setGuardianFileList([{
        uid: '-3',
        name: url.includes('.pdf') ? 'guardian_document.pdf' : 'guardian_document.jpg',
        status: 'done',
        url,
        preview: url,
        isImage: !url.includes('.pdf')
      }])
    }
  }, [existingGuardianDoc, guardianDoc])

  // Check if file is an image
  const isImageFile = (file) => {
    return file.type?.startsWith('image/') || 
           file.name?.match(/\.(jpg|jpeg|png|gif|webp|bmp)$/i) ||
           file.url?.includes('image')
  }

  // Check if file is a PDF
  const isPdfFile = (file) => {
    return file.type === 'application/pdf' || 
           file.name?.match(/\.pdf$/i) ||
           file.url?.includes('.pdf')
  }

  // Handle document upload for member front
  const handleMemberFrontChange = ({ fileList }) => {
    const updatedList = fileList.map((file) => {
      if (file.originFileObj && !file.url && !file.preview) {
        if (isImageFile(file.originFileObj)) {
          file.preview = URL.createObjectURL(file.originFileObj)
        }
        file.isImage = isImageFile(file.originFileObj)
      }
      return file
    })
    
    setMemberFrontFileList(updatedList)
    
    if (updatedList.length > 0) {
      const file = updatedList[0]
      if (file.originFileObj) {
        // Set the actual File object, not metadata
        setMemberDocFront(file.originFileObj)
      } else if (file.url && !file.originFileObj) {
        // This is an existing document URL
        setMemberDocFront(file.url)
      }
    } else {
      setMemberDocFront(null)
    }
  }

  // Handle document upload for member back - FIXED
  const handleMemberBackChange = ({ fileList }) => {
    const updatedList = fileList.map((file) => {
      if (file.originFileObj && !file.url && !file.preview) {
        if (isImageFile(file.originFileObj)) {
          file.preview = URL.createObjectURL(file.originFileObj)
        }
        file.isImage = isImageFile(file.originFileObj)
      }
      return file
    })
    
    setMemberBackFileList(updatedList)
    
    if (updatedList.length > 0) {
      const file = updatedList[0]
      if (file.originFileObj) {
        // FIX: Set the File object directly, not metadata
        setMemberDocBack(file.originFileObj)
      } else if (file.url && !file.originFileObj) {
        // This is an existing document URL
        setMemberDocBack(file.url)
      }
    } else {
      setMemberDocBack(null)
    }
  }

  // Handle document upload for guardian - FIXED
  const handleGuardianChange = ({ fileList }) => {
    const updatedList = fileList.map((file) => {
      if (file.originFileObj && !file.url && !file.preview) {
        if (isImageFile(file.originFileObj)) {
          file.preview = URL.createObjectURL(file.originFileObj)
        }
        file.isImage = isImageFile(file.originFileObj)
      }
      return file
    })
    
    setGuardianFileList(updatedList)
    
    if (updatedList.length > 0) {
      const file = updatedList[0]
      if (file.originFileObj) {
        // FIX: Set the File object directly, not metadata
        setGuardianDoc(file.originFileObj)
      } else if (file.url && !file.originFileObj) {
        // This is an existing document URL
        setGuardianDoc(file.url)
      }
    } else {
      setGuardianDoc(null)
    }
  }

  // Handle preview
  const handlePreview = async (file) => {
    if (file.url) {
      setPreviewImage(file.url)
    } else if (file.preview) {
      setPreviewImage(file.preview)
    }
    setPreviewVisible(true)
  }

  // Remove document
  const handleRemoveDoc = (type) => {
    if (type === 'memberFront') {
      setMemberFrontFileList([])
      setMemberDocFront(null)
      message.success('Member front document removed!')
    } else if (type === 'memberBack') {
      setMemberBackFileList([])
      setMemberDocBack(null)
      message.success('Member back document removed!')
    } else if (type === 'guardian') {
      setGuardianFileList([])
      setGuardianDoc(null)
      message.success('Nominee / Varisdar document removed!')
    }
  }

  // Before upload validation
  const beforeUpload = (file) => {
    const isImage = isImageFile(file)
    const isPdf = isPdfFile(file)
    
    if (!isImage && !isPdf) {
      message.error('You can only upload image or PDF files!')
      return false
    }
    
    const maxSizeMB = 5
    const isLtMax = file.size / 1024 / 1024 < maxSizeMB
    if (!isLtMax) {
      message.error(`File must be smaller than ${maxSizeMB}MB!`)
      return false
    }
    
    return false // Prevent auto upload
  }

  // Custom upload component for images (with crop) and PDFs (without crop)
  const UploadWithCropIfImage = ({ fileList, onChange, onPreview, type, required = false }) => {
    const currentFile = fileList[0]
    const isImage = currentFile?.isImage
    
    const uploadButton = (
      <div>
        <UploadOutlined />
        <div style={{ marginTop: 8 }}>Upload</div>
      </div>
    )

    if (isImage) {
      return (
        <ImgCrop 
          rotate 
          showGrid 
          rotationSlider 
          aspectSlider={false}
          showReset
          modalTitle={`Crop ${type}`}
          modalWidth={800}
          modalOk="Save"
          modalCancel="Cancel"
          quality={1}
          fillColor="transparent"
          aspect={16/9} // Document aspect ratio
        >
          <Upload
            listType="picture-card"
            multiple={false}
            maxCount={1}
            fileList={fileList}
            onChange={onChange}
            onPreview={onPreview}
            accept="image/*,.pdf"
            beforeUpload={beforeUpload}
          >
            {fileList.length === 0 && uploadButton}
          </Upload>
        </ImgCrop>
      )
    } else {
      return (
        <Upload
          listType="picture-card"
          multiple={false}
          maxCount={1}
          fileList={fileList}
          onChange={onChange}
          onPreview={onPreview}
          accept="image/*,.pdf"
          beforeUpload={beforeUpload}
          iconRender={(file) => {
            if (file.isImage) {
              return <img src={file.preview || file.url} alt={file.name} style={{ width: '100%' }} />
            }
            return <FilePdfOutlined style={{ fontSize: '48px', color: '#1890ff' }} />
          }}
        >
          {fileList.length === 0 && uploadButton}
        </Upload>
      )
    }
  }

  return (
    <>
      <Card title="Document Uploads" size="small" className="mb-4">
        <Row gutter={[24, 24]}>
          {/* Member Document Front */}
          <Col xs={24} md={8}>
            <Form.Item 
              label="Member Document (Front)" 
              required={!isEditMode}
              extra="Upload image or PDF (Max: 5MB)"
            >
              <div className="space-y-3">
                <UploadWithCropIfImage
                  fileList={memberFrontFileList}
                  onChange={handleMemberFrontChange}
                  onPreview={handlePreview}
                  type="Member Document Front"
                  required={!isEditMode}
                />
              </div>
            </Form.Item>
          </Col>

          {/* Member Document Back */}
          <Col xs={24} md={8}>
            <Form.Item 
              label="Member Document (Back)"
              extra="Upload image or PDF (Max: 5MB)"
            >
              <div className="space-y-3">
                <UploadWithCropIfImage
                  fileList={memberBackFileList}
                  onChange={handleMemberBackChange}
                  onPreview={handlePreview}
                  type="Member Document Back"
                />
              </div>
            </Form.Item>
          </Col>

          {/* Nominee / Varisdar Document */}
          <Col xs={24} md={8}>
            <Form.Item
              label="Nominee / Varisdar Document"
              extra="Upload image or PDF (Max: 5MB)"
            >
              <div className="space-y-3">
                <UploadWithCropIfImage
                  fileList={guardianFileList}
                  onChange={handleGuardianChange}
                  onPreview={handlePreview}
                  type="Nominee / Varisdar Document"
                />
              </div>
            </Form.Item>
          </Col>
        </Row>
      </Card>

      {/* Preview Modal */}
      <Modal
        open={previewVisible}
        title="Document Preview"
        footer={null}
        onCancel={() => setPreviewVisible(false)}
        width={800}
      >
        {previewImage && (
          previewImage.includes('.pdf') ? (
            <div className="text-center">
              <FilePdfOutlined style={{ fontSize: '64px', color: '#ff4d4f' }} />
              <p className="mt-4">PDF Document</p>
              <p className="text-sm text-gray-500">
                Preview not available. Download to view.
              </p>
              <a 
                href={previewImage} 
                download 
                className="mt-4 inline-block"
              >
                <Button type="primary">Download PDF</Button>
              </a>
            </div>
          ) : (
            <Image
              src={previewImage}
              alt="Document preview"
              style={{ width: '100%' }}
            />
          )
        )}
      </Modal>
    </>
  )
}

export default DocumentUploads