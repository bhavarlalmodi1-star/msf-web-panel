// app/api/users/route.js
import { NextResponse } from "next/server";
import admin from "../../db/firebaseAdmin";
import { checkPermission, verifyToken,checkRole } from "../../../../../middleware/authMiddleware";
import { sendEmailFun } from "../../utils/emailSender";
import { userEmailSendTampalet } from "../../utils/emailTamplates";
import { getTrustServer } from "../../db/trustServer";


const db = admin.firestore();
const auth = admin.auth();

const DEFAULT_PERMISSIONS = {
  pages: ['/'],
  actions: { create: false, edit: false, delete: false, view: true, download: false },
  moduleAccess: { dashboard: true },
  pagePermissions: {},
};

// Helper to send welcome email
const sendWelcomeEmail = async (email, name, tempPassword, loginUrl) => {
  // Implement your email service here
  console.log(`Would send email to ${email} with password: ${tempPassword}`);
  return true;
};

// GET - Fetch all users (with authentication)
export async function GET(req) {
  try {
    // Verify token


    const authResult = await verifyToken(req);
    if (!authResult.success) {
      return NextResponse.json(
        { success: false, message: authResult.error },
        { status: authResult.status }
      );
    }

    const currentUser = authResult.user;
    //        await admin.auth().setCustomUserClaims(currentUser.uid, {
    //   role:"superadmin",
    // });
    // Check permission - only superadmin and admin can view users
    if (!checkRole(['superadmin', 'admin'], currentUser.role)) {
      return NextResponse.json(
        { success: false, message: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("id");
    const email = searchParams.get("email");
    const role = searchParams.get("role");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");
    const status = searchParams.get("status");

    // Get single user by ID
    if (userId) {
      // Check if user can view this specific user
      // Allow if same user or has admin rights
      if (userId !== currentUser.uid && !checkRole(['superadmin', 'admin'], currentUser.role)) {
        return NextResponse.json(
          { success: false, message: 'Cannot view other users' },
          { status: 403 }
        );
      }

      const userDoc = await db.collection("users").doc(userId).get();
      
      if (!userDoc.exists) {
        return NextResponse.json(
          { success: false, message: "User not found" },
          { status: 404 }
        );
      }

      const userData = { id: userDoc.id, ...userDoc.data() };
      console.log(userData.length,'userData')
      // Remove sensitive data if not admin/superadmin
      if (!checkRole(['superadmin', 'admin'], currentUser.role)) {
        delete userData.permissions;
        delete userData.createdBy;
        delete userData.lastPasswordReset;
      }

      return NextResponse.json({
        success: true,
        data: userData
      });
    }

    // Get single user by email (admin only)
    if (email) {
      if (!checkRole(['superadmin', 'admin'], currentUser.role)) {
        return NextResponse.json(
          { success: false, message: 'Insufficient permissions' },
          { status: 403 }
        );
      }

      const userQuery = await db
        .collection("users")
        .where("email", "==", email)
        .limit(1)
        .get();

      if (userQuery.empty) {
        return NextResponse.json(
          { success: false, message: "User not found" },
          { status: 404 }
        );
      }

      const userDoc = userQuery.docs[0];
      const userData = { id: userDoc.id, ...userDoc.data() };

      return NextResponse.json({
        success: true,
        data: userData
      });
    }

    // Get paginated users (admin only)
    if (!checkRole(['superadmin', 'admin'], currentUser.role)) {
      return NextResponse.json(
        { success: false, message: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    let query = db.collection("users");

    // Apply filters
    if (role && role !== "all") {
      query = query.where("role", "==", role);
    }

    if (status && status !== "all") {
      query = query.where("status", "==", status);
    }

    // Get total count
    const countQuery = query;
    const countSnapshot = await countQuery.get();
    const countTotal = countSnapshot.size;

    // Apply pagination
    const offset = (page - 1) * limit;
    const usersSnapshot = await query
      .orderBy("createdAt", "desc")
      .limit(limit)
      .offset(offset)
      .get();

    const users = [];
    const userDocIds = new Set();
    usersSnapshot.forEach(doc => {
      users.push({ id: doc.id, ...doc.data() });
      userDocIds.add(doc.id);
    });

    // Also fetch agents that don't have a users/{uid} doc, so they appear in the user list
    if (!role || role === 'all' || role === 'agent') {
      const agentsQuery = db.collection('agents').orderBy('createdAt', 'desc').limit(limit);
      const agentsSnap = await agentsQuery.get();
      agentsSnap.forEach(doc => {
        if (!userDocIds.has(doc.id)) {
          const a = doc.data();
          users.push({
            id: doc.id,
            uid: a.uid || doc.id,
            name: a.name || '',
            email: a.email || '',
            phone: a.phone1 || '',
            photoURL: a.photoURL || '',
            role: 'agent',
            status: a.status || 'active',
            permissions: a.permissions || null,
            createdAt: a.createdAt || null,
          });
        }
      });
    }

    const totalPages = Math.ceil(Math.max(countTotal, users.length) / limit);

    return NextResponse.json({
      success: true,
      data: users,
      pagination: {
        page,
        limit,
        total: users.length + (page - 1) * limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    });

  } catch (error) {
    console.error("GET users error:", error);
    return NextResponse.json(
      { success: false, message: "Server error", error: error.message },
      { status: 500 }
    );
  }
}

// POST - Create new user (with role-based access)
export async function POST(req) {
  try {
    // Verify token
    const authResult = await verifyToken(req);
    if (!authResult.success) {
      return NextResponse.json(
        { success: false, message: authResult.error },
        { status: authResult.status }
      );
    }

    const currentUser = authResult.user;
    const body = await req.json();
    const {
      name,
      email,
      password,
      phone,
      role = "admin",
      photoURL = "",
      status = "active",
      permissions,
      sendWelcomeEmail: shouldSendEmail = false
    } = body;

    // Validation
    if (!name || !email) {
      return NextResponse.json(
        { success: false, message: "Name and email are required" },
        { status: 400 }
      );
    }

    // Role-based permission checks
    if (role === 'superadmin') {
      // Only superadmin can create another superadmin
      if (currentUser.role !== 'superadmin') {
        return NextResponse.json(
          { success: false, message: "Only super admin can create super admin users" },
          { status: 403 }
        );
      }
    } else if (role === 'admin') {
      // Only superadmin can create admin users
      if (currentUser.role !== 'superadmin') {
        return NextResponse.json(
          { success: false, message: "Only super admin can create admin users" },
          { status: 403 }
        );
      }
    } 

    // Check if user already exists
    const existingUserQuery = await db
      .collection("users")
      .where("email", "==", email)
      .limit(1)
      .get();

    if (!existingUserQuery.empty) {
      return NextResponse.json(
        { success: false, message: "User with this email already exists" },
        { status: 400 }
      );
    }

    // Check in Auth
    try {
      await auth.getUserByEmail(email);
      return NextResponse.json(
        { success: false, message: "User with this email already exists in Auth" },
        { status: 400 }
      );
    } catch (error) {
      if (error.code !== "auth/user-not-found") {
        throw error;
      }
    }

    // Generate password if not provided
    const userPassword = password 
    let uid;
    
    // Create user in Firebase Auth
    try {
      const authUser = await auth.createUser({
        email,
        password: userPassword,
        displayName: name,
        phoneNumber:"+91"+phone || undefined,
        photoURL: photoURL || undefined,
        disabled: status === "inactive",
        emailVerified: false
      });
      uid = authUser.uid;
       await auth.setCustomUserClaims(authUser.uid, {
      role:role,
      createdBy: currentUser.uid
    });
    } catch (authError) {
      console.error("Auth create error:", authError);
      return NextResponse.json(
        { success: false, message: "Failed to create auth user", error: authError.message },
        { status: 400 }
      );
    }

    // Default permissions based on role
    const defaultPermissions = {
      pages: ['/dashboard'],
      actions: {
        create: false,
        edit: false,
        delete: false,
        view: true,
        download: false,
        request: false,
        approve: false,
        add_agent: false,
        add_member: false
      },
      moduleAccess: {
        dashboard: true,
        programs: false,
        agents: false,
        members: false,
        payments: false,
        master: false,
        rulePolicy: false,
        settings: false
      },
      pagePermissions: {}
    };

    // Create user in Firestore
    const userData = {
      uid,
      name,
      email,
      phone: phone || "",
      role,
      photoURL: photoURL || "",
      status,
      permissions: permissions || defaultPermissions,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      active_flag:true,
      delete_flag:false,
      lastLogin: null,
      lastPasswordReset: new Date().toISOString(),
      createdBy: currentUser.uid // Track who created this user
    };

    await db.collection("users").doc(uid).set(userData);

    // Send welcome email if requested
    if (shouldSendEmail) {
      const loginUrl = `${process.env.NEXT_PUBLIC_APP_URL || req.headers.get('origin')}/login`;
      const trust = await getTrustServer();   // name shown in the e-mail
     const emailTamplate=userEmailSendTampalet({
        trust,
        to: email,
        name,
        password: userPassword,
        loginUrl,
        role,
        createdBy: currentUser.name || currentUser.email,
        supportEmail: process.env.SUPPORT_EMAIL || ''
     })
      sendEmailFun({
         to:email,
  subject:`Welcome to ${trust.shortName} - Your Admin Account Details`,
  html:emailTamplate,
      })
    }

    // Don't return password in response
    const { password: _, ...userResponse } = userData;

    return NextResponse.json({
      success: true,
      message: "User created successfully",
      data: {
        id: uid,
        ...userResponse,
        tempPassword: !password ? userPassword : undefined
      }
    }, { status: 201 });

  } catch (error) {
    console.error("POST users error:", error);
    
    // Clean up: If Auth user was created but Firestore failed
    if (uid) {
      try {
        await auth.deleteUser(uid);
        console.log("Cleaned up Auth user after Firestore failure");
      } catch (deleteError) {
        console.error("Failed to cleanup auth user:", deleteError);
      }
    }
    
    return NextResponse.json(
      { success: false, message: "Failed to create user", error: error.message },
      { status: 500 }
    );
  }
}

// PUT - Update user (with role-based access)
export async function PUT(req) {
  try {
    // Verify token
    const authResult = await verifyToken(req);
    if (!authResult.success) {
      return NextResponse.json(
        { success: false, message: authResult.error },
        { status: authResult.status }
      );
    }

    const currentUser = authResult.user;
    const body = await req.json();
    const {
      id,
      name,
      email,
      phone,
      role,
      photoURL,
      status,
      permissions,
      updateAuth = true,
      updatePassword
    } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, message: "User ID is required" },
        { status: 400 }
      );
    }

    // Get target user — auto-create doc if missing and permissions are being set
    let targetUser;
    const userDoc = await db.collection("users").doc(id).get();
    if (!userDoc.exists) {
      if (permissions === undefined) {
        return NextResponse.json(
          { success: false, message: "User not found" },
          { status: 404 }
        );
      }
      // Create user doc on the fly with basic info from Firebase Auth
      let fbUser = null;
      try { fbUser = await admin.auth().getUser(id); } catch {}
      const now = admin.firestore.FieldValue.serverTimestamp();
      await db.collection("users").doc(id).set({
        uid: id,
        name: fbUser?.displayName || '',
        email: fbUser?.email || '',
        phone: fbUser?.phoneNumber?.replace('+91', '') || '',
        photoURL: fbUser?.photoURL || '',
        role: 'agent',
        status: 'active',
        permissions: DEFAULT_PERMISSIONS,
        createdAt: now,
        updatedAt: now,
      });
      targetUser = { uid: id, role: 'agent', permissions: DEFAULT_PERMISSIONS };
    } else {
      targetUser = userDoc.data();
    }
    
    // Permission checks
    // 1. Users can edit their own profile (except role)
    const isEditingSelf = id === currentUser.uid;
    
    // 2. Check if trying to edit role
    if (role !== undefined && role !== targetUser.role) {
      // Only superadmin can change roles
      if (currentUser.role !== 'superadmin') {
        return NextResponse.json(
          { success: false, message: "Only super admin can change user roles" },
          { status: 403 }
        );
      }
      
      // Prevent downgrading superadmin
      if (targetUser.role === 'superadmin' && role !== 'superadmin') {
        return NextResponse.json(
          { success: false, message: "Cannot downgrade super admin" },
          { status: 403 }
        );
      }
      
      // Prevent creating new superadmin unless current user is superadmin
      if (role === 'superadmin' && currentUser.role !== 'superadmin') {
        return NextResponse.json(
          { success: false, message: "Only super admin can create super admin users" },
          { status: 403 }
        );
      }
    }
    
    // 3. Check permissions for editing other users
    if (!isEditingSelf) {
      // Can't edit users with higher role
      const roleHierarchy = {
        'superadmin': 4,
        'admin': 3,
        'agent': 2,
        'member': 1
      };
      
      if (roleHierarchy[targetUser.role] > roleHierarchy[currentUser.role]) {
        return NextResponse.json(
          { success: false, message: "Cannot edit users with higher role" },
          { status: 403 }
        );
      }
      
    //   // Check specific permission for editing users
    //   if (!checkPermission(currentUser.permissions, 'actions.edit')) {
    //     return NextResponse.json(
    //       { success: false, message: "No permission to edit users" },
    //       { status: 403 }
    //     );
    //   }
    }

    const updates = {};

    // Prepare Firestore updates
    if (name !== undefined) updates.name = name;
    if (email !== undefined && email !== targetUser.email) {
      // Check if new email already exists
      const emailCheck = await db
        .collection("users")
        .where("email", "==", email)
        .limit(1)
        .get();
      
      if (!emailCheck.empty && emailCheck.docs[0].id !== id) {
        return NextResponse.json(
          { success: false, message: "Email already in use by another user" },
          { status: 400 }
        );
      }
      updates.email = email;
    }
    if (phone !== undefined) updates.phone = phone;
    if (role !== undefined) updates.role = role;
    if (photoURL !== undefined) updates.photoURL = photoURL;
    if (status !== undefined) updates.status = status;
    if (permissions !== undefined) {
      // Only superadmin can change permissions
      if (currentUser.role !== 'superadmin') {
        return NextResponse.json(
          { success: false, message: "Only super admin can change permissions" },
          { status: 403 }
        );
      }
      updates.permissions = permissions;
    }
    
    updates.updatedAt = admin.firestore.FieldValue.serverTimestamp();

    // Update Firebase Auth if requested
    if (updateAuth) {
      const authUpdates = {};
      if (name !== undefined) authUpdates.displayName = name;
      if (email !== undefined && email !== targetUser.email) authUpdates.email = email;
      if (phone !== undefined) authUpdates.phoneNumber = "+91"+phone || null;
      if (photoURL !== undefined) authUpdates.photoURL = photoURL || null;
      if (status !== undefined) authUpdates.disabled = status === "inactive";
      if (updatePassword !== undefined) {
        // Check permission to reset password
        if (!isEditingSelf && !checkPermission(currentUser.permissions, 'actions.reset_password')) {
          return NextResponse.json(
            { success: false, message: "No permission to reset passwords" },
            { status: 403 }
          );
        }
        authUpdates.password = updatePassword;
      }

      if (Object.keys(authUpdates).length > 0) {
        try {
          await auth.updateUser(id, authUpdates);
          
          // If email was changed, mark as unverified
          if (email !== undefined && email !== targetUser.email) {
            await auth.updateUser(id, { emailVerified: false });
          }
        } catch (authError) {
          console.error("Auth update error:", authError);
          return NextResponse.json(
            { success: false, message: "Failed to update auth user", error: authError.message },
            { status: 400 }
          );
        }
      }
    }

    // Update Firestore
    await db.collection("users").doc(id).update(updates);

    // Get updated user
    const updatedDoc = await db.collection("users").doc(id).get();
    const updatedUser = { id: updatedDoc.id, ...updatedDoc.data() };

    return NextResponse.json({
      success: true,
      message: "User updated successfully",
      data: updatedUser
    });

  } catch (error) {
    console.error("PUT users error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to update user", error: error.message },
      { status: 500 }
    );
  }
}

// DELETE - Delete user (with role-based access)
export async function DELETE(req) {
  try {
    // Verify token
    const authResult = await verifyToken(req);
    if (!authResult.success) {
      return NextResponse.json(
        { success: false, message: authResult.error },
        { status: authResult.status }
      );
    }

    const currentUser = authResult.user;
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { success: false, message: "User ID is required" },
        { status: 400 }
      );
    }

    // Check if user exists
    const userDoc = await db.collection("users").doc(id).get();
    if (!userDoc.exists) {
      return NextResponse.json(
        { success: false, message: "User not found" },
        { status: 404 }
      );
    }

    const targetUser = userDoc.data();

    // Check permissions for deletion
    const isDeletingSelf = id === currentUser.uid;
    
    // Prevent self-deletion for superadmin (should have at least one)
    if (isDeletingSelf && targetUser.role === 'superadmin') {
      // Check if this is the last superadmin
      const superAdminQuery = await db
        .collection("users")
        .where("role", "==", "superadmin")
        .get();
      
      if (superAdminQuery.size <= 1) {
        return NextResponse.json(
          { success: false, message: "Cannot delete the last super admin" },
          { status: 403 }
        );
      }
    }
    
    if (!isDeletingSelf) {
      // Role hierarchy check
      const roleHierarchy = {
        'superadmin': 4,
        'admin': 3,
        'agent': 2,
        'member': 1
      };
      
      // Can't delete users with higher or equal role
      if (roleHierarchy[targetUser.role] >= roleHierarchy[currentUser.role]) {
        return NextResponse.json(
          { success: false, message: "Cannot delete users with same or higher role" },
          { status: 403 }
        );
      }
    
    }

    // Delete from Firebase Auth first
    try {
      await auth.deleteUser(id);
      console.log(`Deleted user ${id} from Firebase Auth`);
    } catch (authError) {
      console.error("Auth delete error:", authError);
      
      // If auth delete fails, don't proceed with Firestore deletion
      return NextResponse.json(
        { success: false, message: "Failed to delete auth user", error: authError.message },
        { status: 400 }
      );
    }

    // Delete from Firestore
    await db.collection("users").doc(id).delete();
    console.log(`Deleted user ${id} from Firestore`);

    // Delete related data collections
    try {
      // Delete user's subcollections
      const collections = ['sessions', 'logs', 'activities'];
      const deletePromises = [];

      for (const collectionName of collections) {
        const collectionRef = db.collection("users").doc(id).collection(collectionName);
        const snapshot = await collectionRef.get();
        snapshot.docs.forEach(doc => deletePromises.push(doc.ref.delete()));
      }

      await Promise.all(deletePromises);
      console.log(`Cleaned up related data for user ${id}`);
    } catch (error) {
      console.warn("Failed to delete related data:", error);
      // Continue even if cleanup fails
    }

    return NextResponse.json({
      success: true,
      message: "User deleted successfully"
    });

  } catch (error) {
    console.error("DELETE users error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to delete user", error: error.message },
      { status: 500 }
    );
  }
}

// OPTIONS - For CORS preflight
export async function OPTIONS() {
  return NextResponse.json({}, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    }
  });
}