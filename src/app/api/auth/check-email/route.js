import { NextResponse } from "next/server";
import admin from "../../db/firebaseAdmin";

const db = admin.firestore();
// async function setSuperAdmin(uid) {
//   try {
//     await admin.auth().setCustomUserClaims(uid, {
//       role: 'superadmin'
//     });

//     console.log('✅ Superadmin role assigned successfully');
//   } catch (error) {
//     console.error('❌ Error setting role:', error);
//   }
// }

export async function POST(req) {
  try {
    const { email } = await req.json();
    if (!email) {
      return NextResponse.json(
        { success: false, message: "Email required" },
        { status: 400 }
      );
    }
let existsInAuth = false;

    try {
      await admin.auth().getUserByEmail(email);
      console.log(existsInAuth,"existauth")
      existsInAuth = true;
    } catch (error) {
      // auth/user-not-found means email not in Auth
      if (error.code !== "auth/user-not-found") {
        throw error;
      }
    }
    /* -----------------------------
       1️⃣ Check Firestore users collection
    ------------------------------ */
   const userSnap = await db
  .collection("users")
  .where("email", "==", email)
  .limit(1)
  .get();

let existsInFirestore = false;
let userData = null;

if (!userSnap.empty) {
  existsInFirestore = true;
  userData = userSnap.docs[0].data();
}

return NextResponse.json({
  success: true,
  exists: existsInFirestore || existsInAuth,
  firestore: existsInFirestore,
  auth: existsInAuth,
  status: userData?.status || 'active' // Add status field
});

  } catch (error) {
    console.error("Check email error:", error);
    return NextResponse.json(
      { success: false, message: "Server error" },
      { status: 500 }
    );
  }
}
