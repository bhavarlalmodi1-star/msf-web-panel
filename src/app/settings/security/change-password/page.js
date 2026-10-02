"use client";
import React, { useState } from 'react';
import { reauthenticateWithCredential, EmailAuthProvider, updatePassword } from "firebase/auth";
import {  Card, Form, Input, Button, Typography, Alert, App } from 'antd';
import { useAuth } from '@/components/Base/AuthProvider';
import { auth } from '../../../../../lib/firbase-client';
import { 
  LockOutlined, 
  EyeInvisibleOutlined, 
  EyeTwoTone,
  SafetyCertificateOutlined,
  KeyOutlined,
  CheckCircleOutlined 
} from '@ant-design/icons';

const { Title, Text } = Typography;

const PasswordChange = () => {
  const { user } = useAuth();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [success, setSuccess] = useState(false);
const {message}=App.useApp()
  const validatePassword = (password) => {
    const errors = [];
    if (password.length < 6) errors.push('at least 6 characters');
    if (!/[A-Z]/.test(password)) errors.push('one uppercase letter');
    if (!/[a-z]/.test(password)) errors.push('one lowercase letter');
    if (!/\d/.test(password)) errors.push('one number');
    if (!/[!@#$%^&*]/.test(password)) errors.push('one special character (!@#$%^&*)');
    return errors;
  };

  const handlePasswordChange = async (values) => {
    const { currentPassword, newPassword, confirmPassword } = values;
    
    if (newPassword !== confirmPassword) {
      message.error("New passwords do not match.");
      return;
    }

    const passwordErrors = validatePassword(newPassword);
    if (passwordErrors.length > 0) {
      setPasswordError(`Password must contain: ${passwordErrors.join(', ')}`);
      return;
    }

    setLoading(true);
    setPasswordError('');
    setSuccess(false);

    try {
      const authUser = auth.currentUser;
      if (!authUser || !authUser.email) {
        throw new Error("User not authenticated");
      }

      const credential = EmailAuthProvider.credential(authUser.email, currentPassword);
      
      // Reauthenticate user
      await reauthenticateWithCredential(authUser, credential);
      
      // Update password
      await updatePassword(authUser, newPassword);
      
      message.success("Password updated successfully!");
      setSuccess(true);
      form.resetFields();
      
      // Clear success message after 5 seconds
      setTimeout(() => setSuccess(false), 5000);
    } catch (error) {
      console.error("Password change error:", error);
      
      let errorMessage = "Failed to update password.";
      if (error.code === 'auth/wrong-password') {
        errorMessage = "Current password is incorrect.";
      } else if (error.code === 'auth/requires-recent-login') {
        errorMessage = "This operation requires recent authentication. Please log out and log in again.";
      } else if (error.code === 'auth/weak-password') {
        errorMessage = "Password is too weak. Please use a stronger password.";
      } else if (error.message.includes('auth/')) {
        errorMessage = error.message.replace('auth/', '').replace(/-/g, ' ');
      }
      
      message.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const passwordRules = [
    { required: true, message: 'Please enter your current password' },
    { min: 6, message: 'Password must be at least 6 characters' }
  ];

  const newPasswordRules = [
    { required: true, message: 'Please enter new password' },
    { min: 6, message: 'Password must be at least 6 characters' },
    { pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*])/, 
      message: 'Must include uppercase, lowercase, number & special character' }
  ];

  const confirmPasswordRules = [
    { required: true, message: 'Please confirm your new password' },
    ({ getFieldValue }) => ({
      validator(_, value) {
        if (!value || getFieldValue('newPassword') === value) {
          return Promise.resolve();
        }
        return Promise.reject(new Error('The two passwords do not match!'));
      },
    }),
  ];

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6">
      <Card 
        bordered={false}
        className="shadow-lg rounded-xl border-0 bg-gradient-to-br from-white to-gray-50"
      >
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <SafetyCertificateOutlined className="text-2xl text-primary" />
            </div>
            <div>
              <Title level={3} className="!mb-1 text-gray-800">
                Change Password
              </Title>
              <Text type="secondary" className="text-sm">
                Update your password for enhanced security
              </Text>
            </div>
          </div>
        </div>

        {success && (
          <Alert
            message="Password Updated Successfully"
            description="Your password has been changed. You'll need to use your new password for future logins."
            type="success"
            showIcon
            icon={<CheckCircleOutlined />}
            className="mb-6 animate-fadeIn"
            closable
            onClose={() => setSuccess(false)}
          />
        )}

        <Form
          form={form}
          layout="vertical"
          onFinish={handlePasswordChange}
          className="space-y-6"
          size="large"
        >
          {/* Current Password */}
          <Form.Item
            name="currentPassword"
            label={
              <span className="font-medium text-gray-700">
                <KeyOutlined className="mr-2" />
                Current Password
              </span>
            }
            rules={passwordRules}
          >
            <Input.Password
              placeholder="Enter your current password"
              prefix={<LockOutlined className="text-gray-400" />}
              iconRender={(visible) => (visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />)}
              className="rounded-lg"
            />
          </Form.Item>

          {/* New Password */}
          <Form.Item
            name="newPassword"
            label={
              <span className="font-medium text-gray-700">
                <KeyOutlined className="mr-2" />
                New Password
              </span>
            }
            rules={newPasswordRules}
     
          >
            <Input.Password
              placeholder="Enter new password"
              prefix={<LockOutlined className="text-gray-400" />}
              iconRender={(visible) => (visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />)}
              className="rounded-lg"
              onChange={() => setPasswordError('')}
            />
          </Form.Item>

          {/* Confirm New Password */}
          <Form.Item
            name="confirmPassword"
            label={
              <span className="font-medium text-gray-700">
                <KeyOutlined className="mr-2" />
                Confirm New Password
              </span>
            }
            rules={confirmPasswordRules}
          >
            <Input.Password
              placeholder="Confirm your new password"
              prefix={<LockOutlined className="text-gray-400" />}
              iconRender={(visible) => (visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />)}
              className="rounded-lg"
            />
          </Form.Item>

          {/* Error Display */}
          {passwordError && (
            <Alert
              message="Password Requirements"
              description={passwordError}
              type="error"
              showIcon
              className="mb-4"
              closable
              onClose={() => setPasswordError('')}
            />
          )}

          {/* Submit Button */}
          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              disabled={loading}
              icon={<SafetyCertificateOutlined />}
              className="w-full sm:w-auto px-8 h-12 rounded-lg font-medium text-base shadow-lg hover:shadow-xl transition-all duration-300"
              style={{
                background: 'linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%)',
                border: 'none'
              }}
            >
              {loading ? 'Updating Password...' : 'Update Password'}
            </Button>
          </Form.Item>
        </Form>

       
      </Card>

      <style jsx>{`
        .animate-fadeIn {
          animation: fadeIn 0.5s ease-out;
        }
        
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
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
          height: 48px !important;
          padding: 0 32px !important;
        }
        
        :global(.ant-card) {
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.05) !important;
        }
      `}</style>
    </div>
  );
};

export default PasswordChange;