"use client";
import React, { useEffect, useState } from 'react';
import { useAuth } from './AuthProvider';
import { usePathname, useRouter } from 'next/navigation';
import { Layout, message } from 'antd';
import SideBar from './SideBar';
import TopBar from './TopBar';
import { Provider, useDispatch } from 'react-redux';
import store from '@/Redux/store';
import { db, auth } from '../../../lib/firbase-client';
import { collection, getDocs } from 'firebase/firestore';
import { setAgentList, setProgramList } from '@/Redux/Slice/commonSlice';
import { PinLockProvider } from './PinLockContext';
import PinLockScreen from './PinLockScreen';
import { useTrust } from '@/utils/trust/useTrust';

const { Content } = Layout;

const MainLayout = ({ children }) => {
  const [collapsed, setCollapsed] = useState(false);
  const withoutLayout = ["/auth/login", "/auth/register", "/auth/forgot-password"];
  const { user, loading } = useAuth();
  const trust = useTrust();
  const pathname = usePathname();
  const router = useRouter();
  const dispatch=useDispatch()
   const programsCollectionRef = collection(db, 'programs');
 const agentsCollectionRef = collection(db, 'agents');
  // These run immediately after sign-in, when the ID token can still be
  // propagating — the first read then fails with permission-denied and the
  // program/agent lists come back empty ("Failed to fetch programs"). One
  // retry after a forced token refresh clears that.
  const withRetry = async (label, run) => {
    try {
      return await run();
    } catch (firstErr) {
      console.warn(`${label}: first attempt failed, retrying after token refresh`, firstErr?.code || firstErr);
      try {
        await auth.currentUser?.getIdToken(true);
        await new Promise(r => setTimeout(r, 400));
        return await run();
      } catch (secondErr) {
        console.error(`${label} failed:`, secondErr);
        message.error(`Failed to fetch ${label}`);
        return null;
      }
    }
  };

  const fetchPrograms = async () => {
    await withRetry('programs', async () => {
      const querySnapshot = await getDocs(programsCollectionRef);
      const programsData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Sort by creation date
      programsData.sort((a, b) => b.created_at?.toDate() - a.created_at?.toDate());

      dispatch(setProgramList(programsData));
      return programsData;
    });
  };

  const fetchAgents = async () => {
    await withRetry('agents', async () => {
      const querySnapshot = await getDocs(agentsCollectionRef);
      const agentsData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      dispatch(setAgentList(agentsData));
      return agentsData;
    });
  };

  // Redirect guard — AuthProvider has its own; this one covers the layout.
  useEffect(() => {
    if (!loading && !user && !withoutLayout.includes(pathname)) {
      router.replace("/auth/login");
    }
  }, [user, loading, pathname, router]);

  // Load reference data once per signed-in user. Previously this also depended
  // on `pathname` and `router`, so it refetched every collection on every
  // navigation.
  useEffect(() => {
    if (user?.uid && dispatch) {
      fetchAgents();
      fetchPrograms();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, dispatch]);

  // If the current route should not have layout, render children only
  if (withoutLayout.includes(pathname)) {
    return <>{children}</>;
  }

  // Show loading state while checking authentication
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[var(--background)]">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-[var(--primary)] border-t-transparent"></div>
          <p className="mt-4 text-[var(--foreground-secondary)]">Loading...</p>
        </div>
      </div>
    );
  }

  // If not authenticated, don't render layout (will redirect)
  if (!user) {
    return null;
  }



  // Fetch programs
 
  // Initial fetch


  return (
    <PinLockProvider>
      <PinLockScreen />
    <Layout className="min-h-screen">
      {/* Sidebar */}
      <SideBar collapsed={collapsed} setCollapsed={setCollapsed} />

      {/* Main Layout */}
      <Layout
        className="transition-all duration-300"
        style={{
          marginLeft: collapsed ? 80 : 260,
          minHeight: '100vh',
        }}
      >
        {/* TopBar */}
        <TopBar collapsed={collapsed} setCollapsed={setCollapsed} />

        {/* Main Content */}
        <Content
          className="mx-4 p-4  bg-[var(--surface)] rounded-lg shadow-md min-h-[calc(100vh-112px)]"
          style={{
            background: 'var(--surface)',
            borderRadius: '12px',
            boxShadow: 'var(--shadow-md)',
          }}
        >
          {children}
        </Content>

        {/* Footer */}
        <footer className="text-center py-4 text-[var(--muted-foreground)] text-sm border-t border-[var(--border)] bg-[var(--surface)]">
          {trust.shortName} Admin panel © {new Date().getFullYear()}{trust.footerTagline ? ` - ${trust.footerTagline}` : ''}
        </footer>
      </Layout>

      <style jsx global>{`
        .ant-layout {
          background: var(--background) !important;
        }

        .ant-layout-content {
          background: var(--surface) !important;
        }

        /* Responsive adjustments */
        @media (max-width: 768px) {
          .ant-layout {
            margin-left: 0 !important;
          }
        }

        /* Smooth transitions */
        * {
          transition-property: background-color, border-color, color, fill, stroke;
          transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
          transition-duration: 150ms;
        }

        /* Custom scrollbar for content */
        .ant-layout-content::-webkit-scrollbar {
          width: 8px;
        }

        .ant-layout-content::-webkit-scrollbar-track {
          background: var(--surface-secondary);
          border-radius: 4px;
        }

        .ant-layout-content::-webkit-scrollbar-thumb {
          background: var(--primary);
          border-radius: 4px;
        }

        .ant-layout-content::-webkit-scrollbar-thumb:hover {
          background: var(--primary-dark);
        }
      `}</style>
    </Layout>
    </PinLockProvider>

  );
};

export default MainLayout;