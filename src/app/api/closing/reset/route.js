import { NextResponse } from "next/server";
import admin from "../../db/firebaseAdmin";
import { verifyToken } from "../../../../../middleware/authMiddleware";

const db = admin.firestore();
const DEL = admin.firestore.FieldValue.delete;
const STS = admin.firestore.FieldValue.serverTimestamp;

export async function POST(req) {
  const auth = await verifyToken(req);
  if (!auth.success)
    return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });

  try {
    const [cpSnap, gcSnap, membersSnap, agentsSnap, programsSnap] = await Promise.all([
      db.collection("closing_payment").get(),
      db.collection("groupClosings").get(),
      db.collection("members").get(),
      db.collection("agents").get(),
      db.collection("programs").get(),
    ]);

    const closingPaymentCount = cpSnap.size;
    const groupClosingCount   = gcSnap.size;
    const memberCount         = membersSnap.size;
    const ts = STS();

    const deleteClosingPayments = async () => {
      const batches = [];
      let batch = db.batch();
      let ops = 0;
      cpSnap.forEach((doc) => {
        if (ops >= 490) { batches.push(batch.commit()); batch = db.batch(); ops = 0; }
        batch.delete(doc.ref);
        ops++;
      });
      if (ops > 0) batches.push(batch.commit());
      await Promise.all(batches);
    };

    const deleteGroupClosings = async () => {
      const batches = [];
      let batch = db.batch();
      let ops = 0;
      gcSnap.forEach((doc) => {
        if (ops >= 490) { batches.push(batch.commit()); batch = db.batch(); ops = 0; }
        batch.delete(doc.ref);
        ops++;
      });
      if (ops > 0) batches.push(batch.commit());
      await Promise.all(batches);
    };

    const resetMembers = async () => {
      const batches = [];
      let batch = db.batch();
      let ops = 0;
      membersSnap.forEach((doc) => {
        if (ops >= 490) { batches.push(batch.commit()); batch = db.batch(); ops = 0; }
        const d = doc.data();
        if (d.closing_totalAmount || d.closing_pendingAmount || d.closing_paidAmount ||
            d.totalClosingCount || d.pendingClosingCount || d.paidClosingCount ||
            d.closedStatus || d.closingGroupIds || d.member_closed) {
          batch.update(doc.ref, {
            closing_totalAmount: 0, closing_pendingAmount: 0, closing_paidAmount: 0,
            totalClosingCount: 0, pendingClosingCount: 0, paidClosingCount: 0,
            closingGroupIds: DEL(), closingGroupAmounts: DEL(), closingGroupCounts: DEL(),
            closingGroupPaidAmounts: DEL(), closingGroupPendingAmounts: DEL(),
            closingGroupPaidCounts: DEL(), closingGroupStatus: DEL(),
            member_closed: false, member_closed_at: DEL(), member_closed_by: DEL(),
            member_closed_program: DEL(), closed_date: DEL(), closed_note: DEL(),
            closed_invitation_url: DEL(), closedStatus: DEL(), closingGroupId: DEL(),
            updated_at: ts,
          });
          ops++;
        }
      });
      if (ops > 0) batches.push(batch.commit());
      await Promise.all(batches);
    };

    const resetAgents = async () => {
      const batches = [];
      let batch = db.batch();
      let ops = 0;
      agentsSnap.forEach((doc) => {
        if (ops >= 490) { batches.push(batch.commit()); batch = db.batch(); ops = 0; }
        const d = doc.data();
        if (d.closing_totalAmount || d.closing_pendingAmount || d.totalClosingCount || d.pendingClosingCount || d.closedCount) {
          const update = {
            closing_totalAmount: 0, closing_pendingAmount: 0,
            totalClosingCount: 0, pendingClosingCount: 0, closedCount: 0, updated_at: ts,
          };
          if (d.programStats) {
            for (const progId of Object.keys(d.programStats)) {
              update[`programStats.${progId}.totalClosingAmount`] = 0;
              update[`programStats.${progId}.totalClosingPendingAmount`] = 0;
              update[`programStats.${progId}.totalClosingCount`] = 0;
              update[`programStats.${progId}.pendingClosingCount`] = 0;
              update[`programStats.${progId}.closedCount`] = 0;
              update[`programStats.${progId}.lastUpdated`] = ts;
            }
          }
          batch.update(doc.ref, update);
          ops++;
        }
      });
      if (ops > 0) batches.push(batch.commit());
      await Promise.all(batches);
    };

    const resetGlobalStats = async () => {
      const batches = [];
      let batch = db.batch();
      let ops = 0;
      programsSnap.forEach((doc) => {
        if (ops >= 490) { batches.push(batch.commit()); batch = db.batch(); ops = 0; }
        batch.update(doc.ref, {
          closedCount: 0, totalClosingPendingAmount: 0, totalClosingAmount: 0,
          totalClosingCount: 0, pendingClosingCount: 0, paidClosingCount: 0,
          totalClosingPaidAmount: 0, updated_at: ts,
        });
        ops++;
      });
      batch.set(db.collection("organizationStats").doc("current"), {
        closedCount: 0, totalClosingPendingAmount: 0, totalClosingAmount: 0,
        totalClosingCount: 0, pendingClosingCount: 0, paidClosingCount: 0,
        totalClosingPaidAmount: 0, updated_at: ts,
      }, { merge: true });
      if (ops > 0) batches.push(batch.commit());
      await Promise.all(batches);
    };

    await Promise.all([
      deleteClosingPayments(), deleteGroupClosings(),
      resetMembers(), resetAgents(), resetGlobalStats(),
    ]);

    return NextResponse.json({
      success: true,
      summary: { closingPayments: closingPaymentCount, groupClosings: groupClosingCount, members: memberCount },
    });
  } catch (err) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
