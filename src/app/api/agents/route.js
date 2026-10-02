// app/api/agents/route.js
import { NextResponse } from "next/server";
import admin from "../db/firebaseAdmin";
import { checkRole, verifyToken } from "../../../../middleware/authMiddleware";
import { sendEmailFun } from "../utils/emailSender";
import { getTrustServer } from "../db/trustServer";

const db     = admin.firestore();
const auth   = admin.auth();
const bucket = admin.storage().bucket();
const STS    = admin.firestore.FieldValue.serverTimestamp;
const INC    = admin.firestore.FieldValue.increment;
const DEL    = admin.firestore.FieldValue.delete;

// ─── Helpers ──────────────────────────────────────────────────────────────────
const generatePassword = (length = 12) => {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%";
  return Array.from({ length }, () => charset[Math.floor(Math.random() * charset.length)]).join('');
};

const deleteFileFromStorage = async (fileUrl) => {
  if (!fileUrl) return;
  try {
    const filePath = decodeURIComponent(fileUrl.split('/o/')[1]?.split('?')[0] || '');
    if (filePath) {
      const file = bucket.file(filePath);
      const [exists] = await file.exists();
      if (exists) await file.delete();
    }
  } catch (e) { console.error("Error deleting file:", e); }
};

const uploadBase64ToStorage = async (base64Data, filename, path, agentId) => {
  if (!base64Data?.data) return null;
  try {
    const ext      = filename.split('.').pop() || 'jpg';
    const fileName = `${agentId}/${path}_${Date.now()}.${ext}`;
    const fileRef  = bucket.file(`agents/${fileName}`);
    await fileRef.save(Buffer.from(base64Data.data, 'base64'), {
      metadata: { contentType: base64Data.type || 'application/octet-stream' }
    });
    const [url] = await fileRef.getSignedUrl({ action: 'read', expires: '03-01-2500' });
    return url;
  } catch (e) { console.error(`Error uploading ${path}:`, e); throw e; }
};

// ─── Agent counter helpers ─────────────────────────────────────────────────────
// When an agent is soft-deleted we DON'T touch member/program/org counters —
// those counters are per-member. We only disable auth and mark the agent doc.
// There are no "agent count" fields on org stats in this schema, so nothing to decrement.

// ─── GET ───────────────────────────────────────────────────────────────────────
export async function GET(req) {
  try {
    const authResult = await verifyToken(req);
    if (!authResult.success) return NextResponse.json({ success: false, message: authResult.error }, { status: authResult.status });
    if (!checkRole(['superadmin', 'admin'], authResult.user.role))
      return NextResponse.json({ success: false, message: 'Insufficient permissions' }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const agentId = searchParams.get("id");
    const status  = searchParams.get("status");
    const page    = parseInt(searchParams.get("page")  || "1");
    const limit   = parseInt(searchParams.get("limit") || "50");
    const search  = searchParams.get("search");

    if (agentId) {
      const agentDoc = await db.collection("agents").doc(agentId).get();
      if (!agentDoc.exists) return NextResponse.json({ success: false, message: "Agent not found" }, { status: 404 });
      return NextResponse.json({ success: true, data: { id: agentDoc.id, ...agentDoc.data() } });
    }

    let q = db.collection("agents").where("delete_flag", "==", false);
    if (status && status !== "all") q = q.where("status", "==", status);

    const offset = (page - 1) * limit;
    let agents;
    let total;

    if (search?.trim()) {
      // Search is in-memory, so it must run across ALL matching agents
      // BEFORE pagination — otherwise it only searches the current page.
      const allSnap = await q.orderBy("created_at", "desc").get();
      const s = search.toLowerCase();
      const filtered = allSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(a =>
          a.name?.toLowerCase().includes(s) || a.email?.toLowerCase().includes(s) ||
          a.phone1?.includes(search) || a.aadharNo?.includes(search) ||
          a.city?.toLowerCase().includes(s) || a.state?.toLowerCase().includes(s)
        );
      total  = filtered.length;
      agents = filtered.slice(offset, offset + limit);
    } else {
      // total = FULL matching count (was previously agents.length — the size
      // of the current page — which broke pagination at 50 rows).
      const countSnap = await q.count().get();
      total = countSnap.data().count;

      const agentsSnap = await q.orderBy("created_at", "desc").limit(limit).offset(offset).get();
      agents = agentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    const totalPages = Math.max(1, Math.ceil(total / limit));
    return NextResponse.json({
      success: true, data: agents,
      pagination: { page, limit, total, totalPages, hasNextPage: page < totalPages, hasPrevPage: page > 1 }
    });
  } catch (e) {
    console.error("GET agents error:", e);
    return NextResponse.json({ success: false, message: "Server error", error: e.message }, { status: 500 });
  }
}

// ─── POST — Create agent ───────────────────────────────────────────────────────
export async function POST(req) {
  let uid;
  try {
    const authResult = await verifyToken(req);
    if (!authResult.success) return NextResponse.json({ success: false, message: authResult.error }, { status: authResult.status });
    if (!checkRole(['superadmin', 'admin'], authResult.user.role))
      return NextResponse.json({ success: false, message: 'Insufficient permissions to create agents' }, { status: 403 });

    const body = await req.json();
    const {
      name, fatherName, email, phone1, phone2, password, caste, aadharNo,
      state, district, city, village, pincode,
      photoFile, signatureFile, document1File, document2File, document3File,
      sendEmail = false, status = "active",
      commissionJoinFeesEnabled = true,   // default: join fees commission ON
      commissionClosingEnabled  = true,   // default: closing commission ON
    } = body;

    if (!name || !email || !phone1 || !aadharNo)
      return NextResponse.json({ success: false, message: "Name, email, phone, and Aadhar are required" }, { status: 400 });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return NextResponse.json({ success: false, message: "Invalid email format" }, { status: 400 });
    if (!/^\d{10}$/.test(phone1))
      return NextResponse.json({ success: false, message: "Phone must be 10 digits" }, { status: 400 });
    if (!/^\d{12}$/.test(aadharNo))
      return NextResponse.json({ success: false, message: "Aadhar must be 12 digits" }, { status: 400 });

    const emailCheck  = await db.collection("agents").where("email",    "==", email).where("delete_flag","==",false).limit(1).get();
    if (!emailCheck.empty)  return NextResponse.json({ success: false, message: "Agent with this email already exists" }, { status: 400 });
    const aadharCheck = await db.collection("agents").where("aadharNo", "==", aadharNo).where("delete_flag","==",false).limit(1).get();
    if (!aadharCheck.empty) return NextResponse.json({ success: false, message: "Agent with this Aadhar already exists" }, { status: 400 });

    const agentPassword = password || generatePassword();
    const authUser = await auth.createUser({
      email, password: agentPassword, displayName: name,
      phoneNumber: `+91${phone1}`, disabled: status === "inactive", emailVerified: false
    });
    uid = authUser.uid;
    await auth.setCustomUserClaims(uid, { role: "agent", createdBy: authResult.user.uid });

    const agentId  = uid;
    const agentRef = db.collection("agents").doc(uid);

    const [photoUrl, signatureUrl, document1Url, document2Url, document3Url] = await Promise.all([
      photoFile?.data     ? uploadBase64ToStorage(photoFile,     photoFile.name,     'photo',     agentId) : Promise.resolve(''),
      signatureFile?.data ? uploadBase64ToStorage(signatureFile, signatureFile.name, 'signature', agentId) : Promise.resolve(''),
      document1File?.data ? uploadBase64ToStorage(document1File, document1File.name, 'document1', agentId) : Promise.resolve(''),
      document2File?.data ? uploadBase64ToStorage(document2File, document2File.name, 'document2', agentId) : Promise.resolve(''),
      document3File?.data ? uploadBase64ToStorage(document3File, document3File.name, 'document3', agentId) : Promise.resolve(''),
    ]);

    if (photoUrl) await auth.updateUser(uid, { photoURL: photoUrl });

    const agentData = {
      id: agentId, uid, name, fatherName: fatherName || "", email,
      phone1, phone2: phone2 || "", caste: caste || "", aadharNo,
      state: state || "", district: district || "", city: city || "",
      village: village || "", pincode: pincode || "",
      photoUrl, signatureUrl, document1Url, document2Url, document3Url,
      status, role: "agent", active_flag: true, delete_flag: false,
      commissionJoinFeesEnabled: commissionJoinFeesEnabled !== false,
      commissionClosingEnabled:  commissionClosingEnabled  !== false,
      walletBalance: 0, totalCommissionEarned: 0, totalCommissionWithdrawn: 0,
      created_at: STS(), updated_at: STS(),
      createdBy: authResult.user.uid, lastPasswordReset: new Date().toISOString()
    };
    await agentRef.set(agentData);

    let emailResult = null;
    if (sendEmail) {
      const loginUrl     = `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/login`;
      const trust        = await getTrustServer();   // name shown in the e-mail subject
      const supportEmail = process.env.SUPPORT_EMAIL || trust.supportEmail || '';
      emailResult = await sendEmailFun({
        to: email,
        subject: `Your Agent Account Has Been Created - ${trust.shortName}`,
        html: `<p>Hello <b>${name}</b>,</p><p>Email: ${email}<br>Password: ${agentPassword}<br><a href="${loginUrl}">Login</a></p>`,
        text: `Hello ${name},\nEmail: ${email}\nPassword: ${agentPassword}\nLogin: ${loginUrl}`
      });
    }

    return NextResponse.json({
      success: true, message: "Agent created successfully",
      data: { ...agentData, tempPassword: !password ? agentPassword : undefined, emailSent: sendEmail ? (emailResult?.success || false) : null }
    }, { status: 201 });

  } catch (e) {
    console.error("POST agents error:", e);
    if (uid) { try { await auth.deleteUser(uid) } catch (_) {} }
    return NextResponse.json({ success: false, message: "Failed to create agent", error: e.message }, { status: 500 });
  }
}

// ─── PUT — Update agent ────────────────────────────────────────────────────────
export async function PUT(req) {
  try {
    const authResult = await verifyToken(req);
    if (!authResult.success) return NextResponse.json({ success: false, message: authResult.error }, { status: authResult.status });
    if (!checkRole(['superadmin', 'admin'], authResult.user.role))
      return NextResponse.json({ success: false, message: 'Insufficient permissions' }, { status: 403 });

    const body = await req.json();
    const { id, updatePassword, photoFile, signatureFile, document1File, document2File, document3File, ...updateData } = body;
    if (!id) return NextResponse.json({ success: false, message: "Agent ID is required" }, { status: 400 });

    const agentDoc = await db.collection("agents").doc(id).get();
    if (!agentDoc.exists) return NextResponse.json({ success: false, message: "Agent not found" }, { status: 404 });
    const existingAgent = agentDoc.data();

    // Duplicate checks
    if (updateData.email && updateData.email !== existingAgent.email) {
      const ec = await db.collection("agents").where("email","==",updateData.email).where("delete_flag","==",false).limit(1).get();
      if (!ec.empty && ec.docs[0].id !== id) return NextResponse.json({ success: false, message: "Email already in use" }, { status: 400 });
    }
    if (updateData.aadharNo && updateData.aadharNo !== existingAgent.aadharNo) {
      const ac = await db.collection("agents").where("aadharNo","==",updateData.aadharNo).where("delete_flag","==",false).limit(1).get();
      if (!ac.empty && ac.docs[0].id !== id) return NextResponse.json({ success: false, message: "Aadhar already in use" }, { status: 400 });
    }

    // File uploads
    const uploadIfNew = async (fileObj, oldUrl, pathName) => {
      if (!fileObj?.data) return oldUrl;
      if (oldUrl) await deleteFileFromStorage(oldUrl);
      return uploadBase64ToStorage(fileObj, fileObj.name, pathName, id);
    };
    const [photoUrl, signatureUrl, document1Url, document2Url, document3Url] = await Promise.all([
      uploadIfNew(photoFile,     existingAgent.photoUrl,     'photo'),
      uploadIfNew(signatureFile, existingAgent.signatureUrl, 'signature'),
      uploadIfNew(document1File, existingAgent.document1Url, 'document1'),
      uploadIfNew(document2File, existingAgent.document2Url, 'document2'),
      uploadIfNew(document3File, existingAgent.document3Url, 'document3'),
    ]);

    const updates = {
      ...updateData, photoUrl, signatureUrl, document1Url, document2Url, document3Url,
      updated_at: STS()
    };
    Object.keys(updates).forEach(k => updates[k] === undefined && delete updates[k]);

    // Auth update
    if (existingAgent.uid) {
      const authUpdates = {};
      if (updateData.name)   authUpdates.displayName = updateData.name;
      if (updateData.email   && updateData.email   !== existingAgent.email)   { authUpdates.email = updateData.email; authUpdates.emailVerified = false; }
      if (updateData.phone1  && updateData.phone1  !== existingAgent.phone1)  authUpdates.phoneNumber = `+91${updateData.phone1}`;
      if (photoFile?.data)   authUpdates.photoURL = photoUrl || null;
      if (updateData.status !== undefined)   authUpdates.disabled = updateData.status === "inactive";
      if (updatePassword)    { authUpdates.password = updatePassword; updates.lastPasswordReset = new Date().toISOString(); }
      if (Object.keys(authUpdates).length) await auth.updateUser(existingAgent.uid, authUpdates).catch(e => { throw e; });
      // Sync users collection
      try {
        const uu = { updatedAt: STS() };
        if (updateData.name)   uu.name    = updateData.name;
        if (updateData.email)  uu.email   = updateData.email;
        if (updateData.phone1) uu.phone   = updateData.phone1;
        if (photoFile?.data)   uu.photoURL = photoUrl || "";
        if (updateData.status) uu.status  = updateData.status;
        await db.collection("users").doc(existingAgent.uid).update(uu);
      } catch (_) {}
    }

    await db.collection("agents").doc(id).update(updates);
    const updated = await db.collection("agents").doc(id).get();
    return NextResponse.json({ success: true, message: "Agent updated successfully", data: { id: updated.id, ...updated.data() } });
  } catch (e) {
    console.error("PUT agents error:", e);
    return NextResponse.json({ success: false, message: "Failed to update agent", error: e.message }, { status: 500 });
  }
}

// ─── DELETE — Soft-delete OR hard-delete agent ─────────────────────────────────
export async function DELETE(req) {
  try {
    const authResult = await verifyToken(req);
    if (!authResult.success) return NextResponse.json({ success: false, message: authResult.error }, { status: authResult.status });
    if (!checkRole(['superadmin'], authResult.user.role))
      return NextResponse.json({ success: false, message: 'Only super admin can delete agents' }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const id         = searchParams.get("id");
    const hardDelete = searchParams.get("hard") === "true";
    if (!id) return NextResponse.json({ success: false, message: "Agent ID is required" }, { status: 400 });

    const agentDoc = await db.collection("agents").doc(id).get();
    if (!agentDoc.exists) return NextResponse.json({ success: false, message: "Agent not found" }, { status: 404 });
    const agent = agentDoc.data();

    if (hardDelete) {
      // ── Permanent delete ──────────────────────────────────────────────────
      // Delete storage files
      await Promise.all([
        deleteFileFromStorage(agent.photoUrl),
        deleteFileFromStorage(agent.signatureUrl),
        deleteFileFromStorage(agent.document1Url),
        deleteFileFromStorage(agent.document2Url),
        deleteFileFromStorage(agent.document3Url),
      ]);
      // Delete from Auth + users collection
      if (agent.uid) {
        await auth.deleteUser(agent.uid).catch(console.error);
        await db.collection("users").doc(agent.uid).delete().catch(console.error);
      }
      // Delete agent doc
      await db.collection("agents").doc(id).delete();

      return NextResponse.json({ success: true, message: "Agent permanently deleted" });

    } else {
      // ── Soft delete ───────────────────────────────────────────────────────
      // Mark agent doc as deleted
      await db.collection("agents").doc(id).update({
        delete_flag: true,
        active_flag: false,
        status:      "inactive",
        deleted_at:  STS(),
        deleted_by:  authResult.user.uid,
        updated_at:  STS(),
      });

      // Disable Firebase Auth account
      if (agent.uid) {
        await auth.updateUser(agent.uid, { disabled: true }).catch(console.error);
        await db.collection("users").doc(agent.uid).update({
          delete_flag: true, active_flag: false, status: "inactive", updatedAt: STS()
        }).catch(console.error);
      }

      return NextResponse.json({ success: true, message: "Agent deleted (soft). Can be restored from Trash." });
    }
  } catch (e) {
    console.error("DELETE agents error:", e);
    return NextResponse.json({ success: false, message: "Failed to delete agent", error: e.message }, { status: 500 });
  }
}

// ─── PATCH — Status toggle OR restore agent ────────────────────────────────────
export async function PATCH(req) {
  try {
    const authResult = await verifyToken(req);
    if (!authResult.success) return NextResponse.json({ success: false, message: authResult.error }, { status: authResult.status });
    if (!checkRole(['superadmin', 'admin'], authResult.user.role))
      return NextResponse.json({ success: false, message: 'Insufficient permissions' }, { status: 403 });

    const body = await req.json();
    const { id, status, action } = body;  // action = 'restore' | undefined

    if (!id) return NextResponse.json({ success: false, message: "Agent ID is required" }, { status: 400 });

    const agentDoc = await db.collection("agents").doc(id).get();
    if (!agentDoc.exists) return NextResponse.json({ success: false, message: "Agent not found" }, { status: 404 });
    const agent = agentDoc.data();

    // ── RESTORE action ────────────────────────────────────────────────────────
    if (action === 'restore') {
      // Un-delete the agent doc
      await db.collection("agents").doc(id).update({
        delete_flag:  false,
        active_flag:  true,
        status:       'active',
        deleted_at:   DEL(),
        deleted_by:   DEL(),
        restored_at:  STS(),
        restored_by:  authResult.user.uid,
        updated_at:   STS(),
      });

      // Re-enable Firebase Auth account
      if (agent.uid) {
        await auth.updateUser(agent.uid, { disabled: false }).catch(console.error);
        await db.collection("users").doc(agent.uid).update({
          delete_flag: false, active_flag: true, status: 'active', updatedAt: STS()
        }).catch(console.error);
      }

      return NextResponse.json({ success: true, message: "Agent restored successfully" });
    }

    // ── Status toggle (active / inactive) ─────────────────────────────────────
    if (!status || !['active', 'inactive'].includes(status))
      return NextResponse.json({ success: false, message: "Invalid status. Must be 'active' or 'inactive'" }, { status: 400 });

    await db.collection("agents").doc(id).update({
      status, active_flag: status === "active", updated_at: STS()
    });

    if (agent.uid) {
      await auth.updateUser(agent.uid, { disabled: status === "inactive" }).catch(console.error);
      await db.collection("users").doc(agent.uid).update({
        status, active_flag: status === "active", updatedAt: STS()
      }).catch(console.error);
    }

    return NextResponse.json({ success: true, message: `Agent marked as ${status}`, data: { id, status } });

  } catch (e) {
    console.error("PATCH agents error:", e);
    return NextResponse.json({ success: false, message: "Failed to update agent", error: e.message }, { status: 500 });
  }
}