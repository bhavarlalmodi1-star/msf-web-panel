// utils/api.js
import { getAuth } from "firebase/auth";

const API_BASE = "";

// Helper to get auth token
const getAuthToken = async () => {
  const auth = getAuth();
  const user = auth.currentUser;
  
  if (!user) {
    throw new Error('No authenticated user');
  }
  
  return await user.getIdToken();
};

// Generic API request with auth
const apiRequest = async (endpoint, options = {}) => {
  try {
    const token = await getAuthToken();
    
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers,
      },
    });

    const data = await response.json();
  
    if (!response.ok) {
   
      throw new Error(data.error || data.message || `API request failed with status ${response.status}`);
    }

    return data;
  } catch (error) {
    console.log(error,"error")
    console.error(`API request to ${endpoint} failed:`, error);
    throw error;
  }
};

// User management API functions
export const userApi = {
  // Get users with pagination
  getUsers: (page = 1, filters = {}) => {
    const params = new URLSearchParams({ page, limit: 10, ...filters });
    return apiRequest(`/api/auth/users?${params}`);
  },

  // Get single user
  getUser: (id) => apiRequest(`/api/auth/users?id=${id}`),

  // Create user
  createUser: (userData) => apiRequest('/api/auth/users', {
    method: 'POST',
    body: JSON.stringify(userData),
  }),

  // Update user
  updateUser: (id, updates) => apiRequest('/api/auth/users', {
    method: 'PUT',
    body: JSON.stringify({ id, ...updates }),
  }),

  // Delete user
  deleteUser: (id) => apiRequest(`/api/auth/users?id=${id}`, {
    method: 'DELETE',
  }),

  // Check email availability
  checkEmail: (email) => 
    fetch('/api/auth/check-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    }).then(res => res.json()),
};

// Agent management API functions
export const agentApi = {
  /**
   * Get all agents with pagination and filters
   * @param {number} page - Page number (default: 1)
   * @param {object} filters - Filter options
   * @param {string} filters.status - Filter by status ('active', 'inactive', 'all')
   * @param {number} filters.limit - Items per page (default: 50)
   * @param {string} filters.search - Search term
   * @returns {Promise} - API response with agents data and pagination
   */
  getAgents: (page = 1, filters = {}) => {
    const params = new URLSearchParams({ 
      page, 
      limit: filters.limit || 50,
      ...(filters.status && { status: filters.status }),
      ...(filters.search && { search: filters.search })
    });
    return apiRequest(`/api/agents?${params}`);
  },

  /**
   * Get single agent by ID
   * @param {string} id - Agent ID
   * @returns {Promise} - API response with agent data
   */
  getAgent: (id) => {
    if (!id) {
      return Promise.reject(new Error('Agent ID is required'));
    }
    return apiRequest(`/api/agents?id=${id}`);
  },

  /**
   * Create new agent
   * @param {object} agentData - Agent data
   * @param {string} agentData.name - Agent name (required)
   * @param {string} agentData.fatherName - Father's name (required)
   * @param {string} agentData.email - Email address (required)
   * @param {string} agentData.phone1 - Primary phone (required)
   * @param {string} agentData.aadharNo - Aadhar number (required)
   * @param {string} agentData.password - Password (optional, auto-generated if not provided)
   * @param {string} agentData.phone2 - Secondary phone (optional)
   * @param {string} agentData.caste - Caste (optional)
   * @param {string} agentData.state - State (optional)
   * @param {string} agentData.district - District (optional)
   * @param {string} agentData.city - City (optional)
   * @param {string} agentData.village - Village/Town (optional)
   * @param {string} agentData.pincode - Pincode (optional)
   * @param {string} agentData.photoUrl - Photo URL (optional)
   * @param {string} agentData.signatureUrl - Signature URL (optional)
   * @param {string} agentData.document1Url - Document 1 URL (optional)
   * @param {string} agentData.document2Url - Document 2 URL (optional)
   * @param {string} agentData.document3Url - Document 3 URL (optional)
   * @param {boolean} agentData.sendEmail - Send welcome email (optional)
   * @param {string} agentData.status - Status (optional, default: 'active')
   * @returns {Promise} - API response with created agent data
   */
  createAgent: (agentData) => {
    // Validate required fields
    const requiredFields = ['name', 'email', 'phone1', 'aadharNo'];
    const missingFields = requiredFields.filter(field => !agentData[field]);
    
    if (missingFields.length > 0) {
      return Promise.reject(new Error(`Missing required fields: ${missingFields.join(', ')}`));
    }

    return apiRequest('/api/agents', {
      method: 'POST',
      body: JSON.stringify(agentData),
    });
  },

  /**
   * Update existing agent
   * @param {string} id - Agent ID (required)
   * @param {object} updates - Fields to update
   * @param {string} updates.name - Agent name (optional)
   * @param {string} updates.fatherName - Father's name (optional)
   * @param {string} updates.email - Email address (optional)
   * @param {string} updates.phone1 - Primary phone (optional)
   * @param {string} updates.phone2 - Secondary phone (optional)
   * @param {string} updates.updatePassword - New password (optional)
   * @param {string} updates.caste - Caste (optional)
   * @param {string} updates.aadharNo - Aadhar number (optional)
   * @param {string} updates.state - State (optional)
   * @param {string} updates.district - District (optional)
   * @param {string} updates.city - City (optional)
   * @param {string} updates.village - Village/Town (optional)
   * @param {string} updates.pincode - Pincode (optional)
   * @param {string} updates.photoUrl - Photo URL (optional)
   * @param {string} updates.signatureUrl - Signature URL (optional)
   * @param {string} updates.document1Url - Document 1 URL (optional)
   * @param {string} updates.document2Url - Document 2 URL (optional)
   * @param {string} updates.document3Url - Document 3 URL (optional)
   * @param {string} updates.status - Status (optional)
   * @returns {Promise} - API response with updated agent data
   */
  updateAgent: (id, updates) => {
    if (!id) {
      return Promise.reject(new Error('Agent ID is required'));
    }

    return apiRequest('/api/agents', {
      method: 'PUT',
      body: JSON.stringify({ id, ...updates }),
    });
  },

  /**
   * Delete agent (soft delete by default)
   * @param {string} id - Agent ID
   * @param {boolean} hardDelete - Permanently delete (default: false)
   * @returns {Promise} - API response
   */
  deleteAgent: (id, hardDelete = false) => {
    if (!id) {
      return Promise.reject(new Error('Agent ID is required'));
    }

    const params = hardDelete ? `?id=${id}&hard=true` : `?id=${id}`;
    return apiRequest(`/api/agents${params}`, {
      method: 'DELETE',
    });
  },

  /**
   * Update agent status (active/inactive)
   * @param {string} id - Agent ID
   * @param {string} status - New status ('active' or 'inactive')
   * @returns {Promise} - API response
   */
  updateStatus: (id, status) => {
    if (!id || !status) {
      return Promise.reject(new Error('Agent ID and status are required'));
    }

    if (!['active', 'inactive'].includes(status)) {
      return Promise.reject(new Error('Status must be "active" or "inactive"'));
    }

    return apiRequest('/api/agents', {
      method: 'PATCH',
      body: JSON.stringify({ id, status }),
    });
  },

  /**
   * Toggle agent status (active <-> inactive)
   * @param {string} id - Agent ID
   * @param {string} currentStatus - Current status
   * @returns {Promise} - API response
   */
  toggleStatus: (id, currentStatus) => {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    return agentApi.updateStatus(id, newStatus);
  },

  /**
   * Search agents by term
   * @param {string} searchTerm - Search term
   * @returns {Promise} - API response with filtered agents
   */
  searchAgents: (searchTerm) => {
    return apiRequest(`/api/agents?search=${encodeURIComponent(searchTerm)}`);
  },

  /**
   * Get active agents only
   * @param {number} page - Page number
   * @param {number} limit - Items per page
   * @returns {Promise} - API response with active agents
   */
  getActiveAgents: (page = 1, limit = 50) => {
    return agentApi.getAgents(page, { status: 'active', limit });
  },

  /**
   * Get inactive agents only
   * @param {number} page - Page number
   * @param {number} limit - Items per page
   * @returns {Promise} - API response with inactive agents
   */
  getInactiveAgents: (page = 1, limit = 50) => {
    return agentApi.getAgents(page, { status: 'inactive', limit });
  },

  /**
   * Bulk update agent status
   * @param {Array<string>} agentIds - Array of agent IDs
   * @param {string} status - New status
   * @returns {Promise<Array>} - Array of API responses
   */
  bulkUpdateStatus: async (agentIds, status) => {
    if (!agentIds || agentIds.length === 0) {
      return Promise.reject(new Error('Agent IDs array is required'));
    }

    const promises = agentIds.map(id => agentApi.updateStatus(id, status));
    return Promise.all(promises);
  },

  /**
   * Bulk delete agents
   * @param {Array<string>} agentIds - Array of agent IDs
   * @param {boolean} hardDelete - Permanently delete (default: false)
   * @returns {Promise<Array>} - Array of API responses
   */
  bulkDelete: async (agentIds, hardDelete = false) => {
    if (!agentIds || agentIds.length === 0) {
      return Promise.reject(new Error('Agent IDs array is required'));
    }

    const promises = agentIds.map(id => agentApi.deleteAgent(id, hardDelete));
    return Promise.all(promises);
  },
};


export const paymentApi={
  JoinFeesAdd:(data)=>{
       return apiRequest('/api/join-fees-add', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
    closedPaymentEntry:(data)=>{
       return apiRequest('/api/closed_payment_entry', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  closedPaymentUpdate:(data)=>{
       return apiRequest('/api/closed_payment_update', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    
  },
  reverseClosing: (payload) =>
    apiRequest(`/api/closed_payment_entry`, {
      method: 'DELETE',
      body: JSON.stringify(payload),
    }),
  resetClosing: () =>
    apiRequest('/api/closing/reset', {
      method: 'POST',
    }),
  updateClosingDate: (payload) =>
    apiRequest('/api/closing/update-date', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  markClosingMemberActive: (payload) =>
    apiRequest('/api/closing/mark-active', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
}
// Export both APIs
export default {
  userApi,
  agentApi,
  paymentApi
};