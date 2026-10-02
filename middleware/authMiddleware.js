// middleware/authMiddleware.js
import admin from "@/app/api/db/firebaseAdmin";
import { NextResponse } from "next/server";


export async function verifyToken(req) {
  try {
    const authHeader = req.headers.get('authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return {
        success: false,
        error: 'No token provided',
        status: 401
      };
    }

    const token = authHeader.split('Bearer ')[1];
    
    // Verify Firebase token
    const decodedToken = await admin.auth().verifyIdToken(token);
    console.log(decodedToken,'decodedToken')
    // Get user from Firestore
    const userDoc = await admin.firestore()
      .collection('users')
      .doc(decodedToken.uid)
      .get();

    if (!userDoc.exists) {
      return {
        success: false,
        error: 'User not found in database',
        status: 404
      };
    }

    const userData = userDoc.data();
    
    return {
      success: true,
      user: {
        uid: decodedToken.uid,
        email: decodedToken.email,
        role: userData.role,
        permissions: userData.permissions,
        ...userData
      }
    };
  } catch (error) {
    console.error('Token verification error:', error.message);
    
    if (error.code === 'auth/id-token-expired') {
      return {
        success: false,
        error: 'Token expired',
        status: 401
      };
    }
    
    if (error.code === 'auth/id-token-revoked') {
      return {
        success: false,
        error: 'Token revoked',
        status: 401
      };
    }
    
    return {
      success: false,
      error: 'Invalid token',
      status: 401
    };
  }
}

// Role-based access control middleware
export function checkRole(allowedRoles, userRole) {
  return allowedRoles.includes(userRole);
}

// Permission-based access control middleware
export function checkPermission(userPermissions, requiredPermission) {
    console.log(userPermissions,'userPermissions')
  // Super admin has all permissions
  if (userPermissions.role === 'superadmin') {
    return true;
  }
  
  // Check specific permission
  const [module, action] = requiredPermission.split('.');
  return userPermissions[module]?.[action] || false;
}