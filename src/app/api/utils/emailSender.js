// app/utils/emailSender.js
import nodemailer from 'nodemailer';

/**
 * Common email sending function
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.html - HTML content
 * @param {string} options.text - Plain text content (optional)
 * @param {Array} options.attachments - Attachments (optional)
 * @returns {Promise<Object>} - Send result
 */
export const sendEmailFun = async ({
  to,
  subject,
  html,
  text = '',
  attachments = []
}) => {
  try {
    // Create transporter
    const transporter = nodemailer.createTransport({
      service: process.env.EMAIL_SERVICE || 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    // Email options
    const mailOptions = {
      from: process.env.EMAIL_USER || '"SSGMSSS" <noreply@ssgmsss.com>',
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]*>/g, ''), // Convert HTML to text if not provided
      attachments
    };

    // Send email
    const info = await transporter.sendMail(mailOptions);
    
    console.log('📧 Email sent:', info.messageId);
    return {
      success: true,
      messageId: info.messageId,
      response: info.response
    };
    
  } catch (error) {
    console.error('❌ Email sending error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Send multiple emails
 * @param {Array} emails - Array of email objects
 * @returns {Promise<Array>} - Results array
 */
export const sendBulkEmails = async (emails) => {
  const results = [];
  
  for (const email of emails) {
    const result = await sendEmail(email);
    results.push(result);
  }
  
  return results;
};