import React from 'react';
import { FireOutlined, BellOutlined, UserOutlined } from '@ant-design/icons';
import { Tag, Badge, Avatar, Space } from 'antd';

const Header = ({ title, subtitle }) => {
  return (
    <div className="mb-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <div className="inline-block mb-4">
            <Tag color="blue" className="px-6 py-2 text-lg rounded-full">
              <FireOutlined className="mr-2" />
              FINANCIAL DASHBOARD
            </Tag>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-2">
            {title}
          </h1>
          <p className="text-gray-600 text-lg">
            {subtitle}
          </p>
        </div>
        
        <Space size="large">
          <Badge count={3} size="small">
            <BellOutlined className="text-2xl text-gray-600 cursor-pointer hover:text-purple-600" />
          </Badge>
          <Avatar 
            size="large" 
            icon={<UserOutlined />}
            className="bg-gradient-to-r from-purple-500 to-pink-500"
          />
        </Space>
      </div>
    </div>
  );
};

export default Header;