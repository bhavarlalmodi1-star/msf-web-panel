import React, { useState } from 'react';
import { 
  EyeOutlined, 
  EditOutlined, 
  DeleteOutlined,
  CalendarOutlined,
  DollarOutlined,
  TagOutlined,
  FileTextOutlined,
  PictureOutlined,
  DownloadOutlined,
  PrinterOutlined,
  CloseOutlined,
  LeftOutlined,
  RightOutlined
} from '@ant-design/icons';
import {
  Drawer,
  Card,
  Tag,
  Button,
  Space,
  Divider,
  Image,
  Row,
  Col,
  message,
  Modal,
  Tooltip,
  Badge
} from 'antd';
import dayjs from 'dayjs';

const ExpenseDetails = ({ visible, expense, category, onClose, onEdit, onDelete }) => {
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewImage, setPreviewImage] = useState('');
  const [previewTitle, setPreviewTitle] = useState('');
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  
  if (!expense) return null;

  const billUrls = expense.billUrls || (expense.billUrl ? [expense.billUrl] : []);

  const handleDelete = () => {
    Modal.confirm({
      title: 'Delete Expense',
      content: 'Are you sure you want to delete this expense?',
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: () => {
        if (onDelete) {
          onDelete(expense.id);
        }
        message.success('Expense deleted!');
        onClose();
      },
    });
  };

  const handleDownloadBill = (url, index) => {
    try {
      const link = document.createElement('a');
      link.href = url;
      link.download = `bill_${expense.voucherNo}_${index + 1}.jpg`;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      message.success('Download started!');
    } catch (error) {
      message.error('Failed to download');
    }
  };

  const handlePreview = (url, index) => {
    setPreviewImage(url);
    setPreviewTitle(`Bill ${index + 1} - ${expense.title}`);
    setSelectedImageIndex(index);
    setPreviewVisible(true);
  };

  const nextImage = () => {
    if (selectedImageIndex < billUrls.length - 1) {
      const nextIndex = selectedImageIndex + 1;
      setPreviewImage(billUrls[nextIndex]);
      setPreviewTitle(`Bill ${nextIndex + 1} - ${expense.title}`);
      setSelectedImageIndex(nextIndex);
    }
  };

  const prevImage = () => {
    if (selectedImageIndex > 0) {
      const prevIndex = selectedImageIndex - 1;
      setPreviewImage(billUrls[prevIndex]);
      setPreviewTitle(`Bill ${prevIndex + 1} - ${expense.title}`);
      setSelectedImageIndex(prevIndex);
    }
  };

  return (
    <Drawer
      title={
        <div className="flex items-center gap-2">
          <EyeOutlined className="text-blue-500" />
          <span className="font-bold">Expense Details</span>
        </div>
      }
      open={visible}
      onClose={onClose}
      width={600}
      closeIcon={<CloseOutlined />}
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="border-b pb-4">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-xl font-bold text-gray-900">{expense.title}</h2>
              <div className="flex items-center gap-2 mt-2">
                <Tag color="blue" className="font-mono">
                  {expense.voucherNo}
                </Tag>
                <span className="text-gray-500 text-sm">
                  <CalendarOutlined className="mr-1" />
                  {dayjs(expense.date).format('DD MMM YYYY')}
                </span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold text-gray-900">
                ₹{parseFloat(expense.amount).toLocaleString('en-IN')}
              </div>
            </div>
          </div>
        </div>

        {/* Category and Date */}
        <Row gutter={16}>
          <Col span={12}>
            <Card size="small">
              <div className="flex items-center gap-2 mb-2">
                <TagOutlined className="text-purple-500" />
                <span className="font-medium">Category</span>
              </div>
              {category ? (
                <Tag 
                  color={category.color}
                  className="text-white px-3 py-1"
                >
                  {category.icon} {category.name}
                </Tag>
              ) : (
                <span className="text-gray-400">No category</span>
              )}
            </Card>
          </Col>
          <Col span={12}>
            <Card size="small">
              <div className="flex items-center gap-2 mb-2">
                <CalendarOutlined className="text-green-500" />
                <span className="font-medium">Timeline</span>
              </div>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Created:</span>
                  <span>
                    {dayjs(expense.createdAt?.toDate?.()).format('DD MMM, hh:mm A') || 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Updated:</span>
                  <span>
                    {dayjs(expense.updatedAt?.toDate?.()).format('DD MMM, hh:mm A') || 'N/A'}
                  </span>
                </div>
              </div>
            </Card>
          </Col>
        </Row>

        {/* Description */}
        {expense.description && (
          <Card>
            <div className="flex items-center gap-2 mb-3">
              <FileTextOutlined className="text-blue-500" />
              <span className="font-medium">Description</span>
            </div>
            <p className="text-gray-700 whitespace-pre-wrap">
              {expense.description}
            </p>
          </Card>
        )}

        {/* Bill Attachments */}
        {billUrls.length > 0 && (
          <Card>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <PictureOutlined className="text-orange-500" />
                <span className="font-medium">Bill Attachments</span>
                <Badge count={billUrls.length} color="blue" />
              </div>
              <Tooltip title="Download All">
                <Button
                  icon={<DownloadOutlined />}
                  size="small"
                  onClick={() => {
                    billUrls.forEach((url, index) => {
                      setTimeout(() => {
                        handleDownloadBill(url, index);
                      }, index * 100);
                    });
                  }}
                >
                  Download All
                </Button>
              </Tooltip>
            </div>

            <div className="space-y-4">
              {billUrls.map((url, index) => (
                <div key={index} className="border rounded-lg p-3">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">Bill {index + 1}</span>
                      <Tag size="small">{(new URL(url).pathname.split('/').pop() || 'image.jpg').substring(0, 20)}</Tag>
                    </div>
                    <Space>
                      <Tooltip title="View">
                        <Button
                          size="small"
                          icon={<EyeOutlined />}
                          onClick={() => handlePreview(url, index)}
                        />
                      </Tooltip>
                      <Tooltip title="Download">
                        <Button
                          size="small"
                          icon={<DownloadOutlined />}
                          onClick={() => handleDownloadBill(url, index)}
                        />
                      </Tooltip>
                    </Space>
                  </div>
                  
                  <div 
                    className="bg-gray-100 rounded-lg overflow-hidden cursor-pointer"
                    onClick={() => handlePreview(url, index)}
                  >
                    <Image
                      src={url}
                      alt={`Bill ${index + 1}`}
                      className="w-full h-48 object-contain"
                      preview={false}
                      placeholder={
                        <div className="flex items-center justify-center h-48">
                          <PictureOutlined className="text-3xl text-gray-400" />
                        </div>
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Actions */}
        <div className="sticky bottom-0 bg-white pt-4 border-t">
          <div className="flex gap-3">
            <Button
              icon={<DeleteOutlined />}
              danger
              onClick={handleDelete}
              block
            >
              Delete
            </Button>
            <Button
              icon={<EditOutlined />}
              type="primary"
              onClick={onEdit}
              block
            >
              Edit Expense
            </Button>
          </div>
        </div>
      </div>

      {/* Image Preview Modal */}
      <Modal
        open={previewVisible}
        title={previewTitle}
        footer={null}
        onCancel={() => setPreviewVisible(false)}
        width="80%"
        className="image-preview-modal"
        closeIcon={<CloseOutlined />}
      >
        <div className="relative">
          {billUrls.length > 1 && (
            <div className="absolute top-1/2 left-0 right-0 transform -translate-y-1/2 z-10 flex justify-between px-4">
              <Button
                icon={<LeftOutlined />}
                onClick={prevImage}
                disabled={selectedImageIndex === 0}
                shape="circle"
                type="primary"
                size="large"
              />
              <Button
                icon={<RightOutlined />}
                onClick={nextImage}
                disabled={selectedImageIndex === billUrls.length - 1}
                shape="circle"
                type="primary"
                size="large"
              />
            </div>
          )}
          
          <Image
            alt={previewTitle}
            src={previewImage}
            className="w-full max-h-[70vh] object-contain"
          />
          
          {billUrls.length > 1 && (
            <div className="text-center mt-4">
              <span className="text-gray-600">
                {selectedImageIndex + 1} of {billUrls.length}
              </span>
            </div>
          )}
          
          <div className="text-center mt-4">
            <Button
              icon={<DownloadOutlined />}
              type="primary"
              onClick={() => handleDownloadBill(previewImage, selectedImageIndex)}
              className="mr-2"
            >
              Download
            </Button>
            <Button onClick={() => setPreviewVisible(false)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>
    </Drawer>
  );
};

export default ExpenseDetails;