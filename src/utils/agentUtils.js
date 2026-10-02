export const processAgentStats = (agentList, programList) => {
  return agentList.map((agent) => {
    const programStats = agent.programStats || {};
    const programs = Object.entries(programStats).map(([programId, prog]) => ({
      ...prog,
      programId,
      programName: programList.find(p => p.id === programId)?.name || 'Unknown Program',
      paymentProgress: prog.totalJoinFees
        ? (prog.totalJoinFeesPaid / prog.totalJoinFees) * 100
        : 0,
      // Closing side — same shape as the join-fees progress above so the
      // closing page can render a bar without recomputing.
      closingProgress: prog.totalClosingAmount
        ? ((prog.totalClosingPaidAmount || 0) / prog.totalClosingAmount) * 100
        : 0,
    }));

    const totalJoinFeesFromStats   = programs.reduce((s, p) => s + (p.totalJoinFees        || 0), 0);
    const totalPaidFromStats       = programs.reduce((s, p) => s + (p.totalJoinFeesPaid    || 0), 0);
    const totalPendingFromStats    = programs.reduce((s, p) => s + (p.totalJoinFeesPending || 0), 0);
    const totalMembers             = programs.reduce((s, p) => s + (p.memberCount          || 0), 0);

    // Closing rollups from programStats, used as the fallback when the
    // top-level closing_* fields are missing on the agent doc. Without this the
    // closing page showed ₹0 pending for agents whose top-level fields were
    // never backfilled, which also hid the Pay button.
    const closingTotalFromStats    = programs.reduce((s, p) => s + (p.totalClosingAmount        || 0), 0);
    const closingPaidFromStats     = programs.reduce((s, p) => s + (p.totalClosingPaidAmount    || 0), 0);
    const closingPendingFromStats  = programs.reduce((s, p) => s + (p.totalClosingPendingAmount || 0), 0);

    // Top-level agent fields (totalJoinFeesPaid, totalJoinFeesPending) are updated by
    // MORE code paths (join-fees-add, adjust-stats, addMemberStats) and are reliable.
    // programStats.{pid} fields may be stale (older payments skipped updating them).
    // Use ?? so that a legitimate 0 doesn't fall through to the programStats sum.
    const closing_totalAmount   = agent.closing_totalAmount   ?? closingTotalFromStats;
    const closing_paidAmount    = agent.closing_paidAmount    ?? closingPaidFromStats;
    // Pending is the field the Pay button keys off, so derive it from total−paid
    // when neither the agent doc nor programStats carries it.
    const closing_pendingAmount =
      agent.closing_pendingAmount
      ?? (closingPendingFromStats || Math.max(0, closing_totalAmount - closing_paidAmount));

    return {
      ...agent,
      totalJoinFees:        agent.totalJoinFees        ?? totalJoinFeesFromStats,
      totalJoinFeesPaid:    agent.totalJoinFeesPaid    ?? totalPaidFromStats,
      totalJoinFeesPending: agent.totalJoinFeesPending ?? totalPendingFromStats,
      closing_totalAmount,
      closing_paidAmount,
      closing_pendingAmount,
      totalMembers:         totalMembers || (agent.memberCount || 0),
      programs,
    };
  });
};
