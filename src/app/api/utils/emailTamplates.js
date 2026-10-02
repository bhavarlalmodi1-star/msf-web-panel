import { escapeHtml } from '@/utils/trust/trustStore';

// `trust` = trust details from Settings → Trust Details (getTrustServer()).
export const userEmailSendTampalet=({to, subject, name, password, loginUrl, role, createdBy, trust = {} })=>{
    const orgName = escapeHtml(trust.shortName || 'Admin Panel');
    const orgFullName = escapeHtml(trust.name || '');
       const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    const fromEmail = process.env.EMAIL_FROM || 'noreply@ssgmsss.com';
    const supportEmail = process.env.SUPPORT_EMAIL || trust.supportEmail || '';
    
    // Role-specific titles
    const roleTitles = {
      'superadmin': 'Super Admin',
      'admin': 'Admin',
      'agent': 'Agent',
      'member': 'Member'
    };
    
    const roleTitle = roleTitles[role] || role;

    return  `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${roleTitle} Account Created - ${orgName}</title>
        <style>
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f9f9f9;
          }
          .container {
            background-color: white;
            border-radius: 10px;
            overflow: hidden;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
          }
          .header {
            background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%);
            padding: 40px 30px;
            text-align: center;
            color: white;
          }
          .header h1 {
            margin: 0;
            font-size: 28px;
            font-weight: 600;
          }
          .header p {
            margin: 10px 0 0;
            opacity: 0.9;
            font-size: 16px;
          }
          .content {
            padding: 40px 30px;
          }
          .welcome-text {
            font-size: 18px;
            margin-bottom: 30px;
            color: #444;
          }
          .credentials-box {
            background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
            border: 1px solid #93c5fd;
            border-radius: 10px;
            padding: 25px;
            margin: 25px 0;
          }
          .credentials-box h3 {
            margin-top: 0;
            color: #1d4ed8;
            font-size: 20px;
            border-bottom: 2px solid #93c5fd;
            padding-bottom: 10px;
          }
          .credential-item {
            display: flex;
            margin: 15px 0;
            align-items: center;
          }
          .credential-label {
            font-weight: 600;
            color: #1e40af;
            width: 120px;
            min-width: 120px;
          }
          .credential-value {
            background: white;
            padding: 10px 15px;
            border-radius: 6px;
            border: 1px solid #cbd5e1;
            flex-grow: 1;
            font-family: monospace;
            color: #1e293b;
          }
          .highlight {
            background-color: #fef3c7;
            border: 1px solid #fbbf24;
            padding: 15px;
            border-radius: 8px;
            margin: 20px 0;
            color: #92400e;
          }
          .highlight strong {
            color: #d97706;
          }
          .login-btn {
            display: inline-block;
            background: linear-gradient(135deg, #1d4ed8 0%, #3b82f6 100%);
            color: white;
            text-decoration: none;
            padding: 15px 30px;
            border-radius: 8px;
            font-weight: 600;
            font-size: 16px;
            margin: 20px 0;
            text-align: center;
            transition: transform 0.2s;
          }
          .login-btn:hover {
            transform: translateY(-2px);
          }
          .instructions {
            background-color: #f8fafc;
            border-left: 4px solid #1d4ed8;
            padding: 20px;
            margin: 25px 0;
            border-radius: 0 8px 8px 0;
          }
          .instructions h4 {
            margin-top: 0;
            color: #1d4ed8;
          }
          .instructions ul {
            padding-left: 20px;
          }
          .instructions li {
            margin: 8px 0;
          }
          .role-badge {
            display: inline-block;
            background: ${role === 'superadmin' ? '#fef3c7' : '#dbeafe'};
            color: ${role === 'superadmin' ? '#92400e' : '#1e40af'};
            padding: 5px 15px;
            border-radius: 20px;
            font-weight: 600;
            font-size: 14px;
            margin: 10px 0;
          }
          .support {
            text-align: center;
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #e2e8f0;
            color: #64748b;
            font-size: 14px;
          }
          .footer {
            text-align: center;
            padding: 20px;
            background-color: #f1f5f9;
            color: #64748b;
            font-size: 12px;
          }
          @media (max-width: 600px) {
            .content {
              padding: 20px 15px;
            }
            .credential-item {
              flex-direction: column;
              align-items: flex-start;
            }
            .credential-label {
              width: 100%;
              margin-bottom: 5px;
            }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${roleTitle} Account Created</h1>
            <p>${orgFullName || orgName}</p>
          </div>
          
          <div class="content">
            <div class="welcome-text">
              Hello <strong>${name}</strong>,<br>
              Your ${roleTitle.toLowerCase()} account has been successfully created in the ${orgName} Admin Portal.
            </div>
            
            <div class="role-badge">
              ${roleTitle.toUpperCase()}
            </div>
            
            <div class="credentials-box">
              <h3>Your Login Credentials</h3>
              
              <div class="credential-item">
                <div class="credential-label">Email:</div>
                <div class="credential-value">${to}</div>
              </div>
              
              <div class="credential-item">
                <div class="credential-label">Password:</div>
                <div class="credential-value">${password}</div>
              </div>
              
              <div class="credential-item">
                <div class="credential-label">Login URL:</div>
                <div class="credential-value">${loginUrl}</div>
              </div>
            </div>
            
            <div class="highlight">
              <strong>Important Security Notice:</strong> 
              For security reasons, please change your password immediately after your first login.
            </div>
            
            <center>
              <a href="${loginUrl}" class="login-btn" style="color: white;">
                Login to Admin Portal
              </a>
            </center>
            
            <div class="instructions">
              <h4>Getting Started Guide:</h4>
              <ul>
                <li>Use the credentials above to login to the admin portal</li>
                ${role === 'superadmin' ? '<li>You have full administrative access to all features</li>' : ''}
                ${role === 'admin' ? '<li>You can manage programs, agents, and members</li>' : ''}
                <li>Complete your profile setup after login</li>
                <li>Review your assigned permissions and modules</li>
                <li>For any access issues, contact the super admin</li>
              </ul>
            </div>
            
            <div class="instructions">
              <h4>Your Permissions:</h4>
              <ul>
                ${role === 'superadmin' ? 
                  '<li>Full system access and control</li><li>Can create/edit/delete all users</li><li>Manage system settings and configurations</li>' : 
                  role === 'admin' ?
                  '<li>Manage programs and activities</li><li>Create and manage agents</li><li>View reports and analytics</li><li>Manage member registrations</li>' :
                  '<li>Basic dashboard access</li><li>Limited to assigned modules</li>'
                }
              </ul>
            </div>
            
            <div class="support">
              <p>Account created by: <strong>${createdBy}</strong></p>
              <p>Need technical support? Contact: <a href="mailto:${supportEmail}">${supportEmail}</a></p>
              <p>This is an automated email. Please do not reply directly to this message.</p>
            </div>
          </div>
          
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} ${orgName}. All rights reserved.</p>
            <p>This email was sent to ${to}</p>
            <p><small>If you did not request this account, please contact support immediately.</small></p>
          </div>
        </div>
      </body>
      </html>
    `;
}