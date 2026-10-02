"use client";
// React hook for the trust details — re-renders when they change.
// (PDF documents and print templates use getTrust() from trustStore directly.)
import { useSyncExternalStore } from 'react';
import { getTrust, subscribeTrust, SERVER_TRUST } from './trustStore';

const getServerSnapshot = () => SERVER_TRUST;

export function useTrust() {
  return useSyncExternalStore(subscribeTrust, getTrust, getServerSnapshot);
}

export default useTrust;
