import { useState } from 'react';
import { message } from 'antd';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../../../lib/firbase-client';


export const usePaymentHistory = () => {
  const [paymentGroups, setPaymentGroups] = useState([]);
  const [paymentTransactions, setPaymentTransactions] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const fetchPaymentGroups = async (agentId) => {
    if (!agentId) return;

    setHistoryLoading(true);
    try {
      // NOTE: Do NOT combine where() + where() + orderBy() on different fields —
      // that requires a composite Firestore index that may not exist.
      // Instead: query by agentId only, filter paymentType and sort in JS.
      const groupsQuery = query(
        collection(db, 'paymentGroups'),
        where('agentId', '==', agentId)
      );
      const groupsSnapshot = await getDocs(groupsQuery);
      const groups = [];

      for (const groupDoc of groupsSnapshot.docs) {
        const groupData = groupDoc.data();
        // Filter to joinFees only (in JS — avoids composite index)
        if (groupData.paymentType && groupData.paymentType !== 'joinFees') continue;

        // Fetch transactions for this group
        const transactionsQuery = query(
          collection(db, 'memberJoinFees'),
          where('groupId', '==', groupDoc.id)
        );
        const transactionsSnapshot = await getDocs(transactionsQuery);
        const transactions = transactionsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        groups.push({
          id: groupDoc.id,
          ...groupData,
          transactions
        });
      }

      // Sort by createdAt desc in JS (avoids Firestore composite index)
      groups.sort((a, b) => {
        const aT = a.createdAt?.toMillis?.() ?? (a.createdAt ? new Date(a.createdAt).getTime() : 0);
        const bT = b.createdAt?.toMillis?.() ?? (b.createdAt ? new Date(b.createdAt).getTime() : 0);
        return bT - aT;
      });

      setPaymentGroups(groups);

      // Flatten all transactions for timeline view
      const allTransactions = groups.flatMap(group =>
        group.transactions.map(t => ({
          ...t,
          groupId: group.id,
          paymentDate: group.paymentDate,
          paymentMethod: group.paymentMethod,
          transactionId: group.transactionId
        }))
      );
      setPaymentTransactions(allTransactions);

    } catch (error) {
      console.error('Error fetching payment history:', error);
      message.error('Failed to load payment history: ' + error.message);
    } finally {
      setHistoryLoading(false);
    }
  };

  return {
    paymentGroups,
    paymentTransactions,
    historyLoading,
    fetchPaymentGroups
  };
};