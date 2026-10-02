"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import { message } from "antd";
import { useRouter, usePathname } from "next/navigation";
import { auth, db } from "../../../lib/firbase-client";
import { Provider } from "react-redux";
import store from "@/Redux/store";
import { useDispatch } from "react-redux";
import { setUser as setReduxUser, clearUser } from "@/Redux/Slice/userSlice";

const AuthContext = createContext();

const PUBLIC_PATHS = [
  "/auth/login",
  "/auth/register",
  "/auth/forgot-password",
  "/auth/reset-password",
];

function isSuperAdmin(user) {
  return user?.role === "superadmin";
}

function hasPageAccess(user, pageKey) {
  if (!user) return false;
  if (isSuperAdmin(user)) return true;
  const pages = user.permissions?.pages || [];
  if (pages.includes(pageKey)) return true;
  if (pageKey === '/' && pages.includes('/dashboard')) return true;
  return false;
}

function canVisit(user, pathname) {
  if (!user) return false;
  if (isSuperAdmin(user)) return true;
  if (pathname === "/") return true;

  const pages = user.permissions?.pages || [];

  // Exact grant
  if (pages.includes(pathname)) return true;

  // Parent page: the granted page is an ancestor of where we're going.
  // This is what makes detail/dynamic routes work — granting
  // "/payments/join-fees" must also allow "/payments/join-fees/{agentId}",
  // which can never be listed explicitly because the id is data, not a route.
  const hasParentAccess = pages.some(
    (p) => p !== "/" && p !== pathname && pathname.startsWith(p + "/")
  );
  if (hasParentAccess) return true;

  // Child page: only a sub-page was granted, so the section index is reachable
  // too (e.g. "/payments/join-fees" granted → "/payments" opens).
  const hasChildAccess = pages.some(
    (p) => p !== pathname && p.startsWith(pathname + "/")
  );
  return hasChildAccess;
}

const DEFAULT_PERMISSIONS = {
  pages: ['/'],
  actions: { create: false, edit: false, delete: false, view: true, download: false },
  moduleAccess: { dashboard: true },
  pagePermissions: {},
};

function AuthProviderInner({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [messageApi, contextHolder] = message.useMessage();
  const dispatch = useDispatch();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Each auth change gets a generation number. The callback is async, so a
    // logout firing while a login's Firestore read is still in flight would
    // otherwise let the older result land last and resurrect the signed-out
    // user (or vice versa). Stale generations bail out before touching state.
    let generation = 0;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      const myGeneration = ++generation;
      const isStale = () => myGeneration !== generation;

      // Always set loading=true before any async work so the redirect guard
      // never sees user=null + loading=false while Firestore is still fetching.
      setLoading(true);
      try {
        if (firebaseUser) {
          let mergedUser = { tokens: firebaseUser?.stsTokenManager };

          // 1. Try users/{uid} first
          const userDocSnap = await getDoc(doc(db, "users", firebaseUser.uid));
          if (userDocSnap.exists()) {
            mergedUser = { ...mergedUser, ...userDocSnap.data() };
          } else {
            // 2. Fallback: try agents/{uid} or find user by email
            const agentSnap = await getDoc(doc(db, "agents", firebaseUser.uid));
            if (agentSnap.exists()) {
              const agentData = agentSnap.data();
              mergedUser = {
                ...mergedUser,
                uid: firebaseUser.uid,
                name: agentData.name || firebaseUser.displayName || '',
                email: firebaseUser.email || '',
                phone: agentData.phone1 || firebaseUser.phoneNumber || '',
                photoURL: agentData.photoURL || firebaseUser.photoURL || '',
                role: 'agent',
                permissions: agentData.permissions || DEFAULT_PERMISSIONS,
              };
              // Try to get permissions from users/{uid} if it was created later
              const userDocRetry = await getDoc(doc(db, "users", firebaseUser.uid));
              if (userDocRetry.exists() && userDocRetry.data().permissions) {
                mergedUser.permissions = userDocRetry.data().permissions;
                mergedUser.role = userDocRetry.data().role || 'agent';
              }
            } else {
              // 3. Last resort: use token claims for role
              let role = 'member';
              try {
                const tokenResult = await firebaseUser.getIdTokenResult();
                role = tokenResult.claims.role || 'member';
              } catch {}
              mergedUser = {
                ...mergedUser,
                uid: firebaseUser.uid,
                name: firebaseUser.displayName || '',
                email: firebaseUser.email || '',
                phone: firebaseUser.phoneNumber || '',
                photoURL: firebaseUser.photoURL || '',
                role,
                permissions: DEFAULT_PERMISSIONS,
              };
            }
          }

          // Ensure permissions object always exists
          if (!mergedUser.permissions) {
            mergedUser.permissions = DEFAULT_PERMISSIONS;
          }

          // A newer auth change happened while we were reading Firestore —
          // that result is authoritative, so drop this one.
          if (isStale()) return;

          setUser(mergedUser);
          dispatch(setReduxUser(mergedUser));
        } else {
          if (isStale()) return;
          setUser(null);
          dispatch(clearUser());
        }
      } catch (error) {
        if (isStale()) return;
        console.error("AuthProvider error:", error);

        // A failed profile read must NOT sign the user out.
        //
        // Right after login the ID token can take a moment to propagate, so the
        // first users/{uid} read sometimes returns permission-denied. Nulling
        // the user here made the redirect guard bounce straight back to the
        // login page — "login succeeded, then returned to login". Clearing site
        // data appeared to fix it only because it changed the timing.
        //
        // Firebase Auth is the source of truth for *whether* someone is signed
        // in; Firestore only enriches the profile. So on failure, keep them
        // signed in with whatever the token can tell us and let a later render
        // pick up the full profile.
        if (firebaseUser) {
          try {
            // Force-refresh the token, then retry with a short backoff. A
            // single immediate retry isn't always enough — the token can take
            // a beat to be accepted by Firestore right after sign-in.
            await firebaseUser.getIdToken(true);

            let retrySnap = null;
            for (const waitMs of [150, 500, 1200]) {
              if (isStale()) return;
              try {
                retrySnap = await getDoc(doc(db, "users", firebaseUser.uid));
                break;
              } catch (attemptErr) {
                console.warn(`Profile read retry failed, waiting ${waitMs}ms`, attemptErr?.code);
                await new Promise(r => setTimeout(r, waitMs));
              }
            }
            if (!retrySnap) throw new Error('Profile unreadable after retries');

            let recovered;
            if (retrySnap.exists()) {
              recovered = { tokens: firebaseUser?.stsTokenManager, ...retrySnap.data() };
            } else {
              const claims = (await firebaseUser.getIdTokenResult()).claims || {};
              recovered = {
                tokens: firebaseUser?.stsTokenManager,
                uid: firebaseUser.uid,
                name: firebaseUser.displayName || '',
                email: firebaseUser.email || '',
                photoURL: firebaseUser.photoURL || '',
                role: claims.role || 'member',
                permissions: DEFAULT_PERMISSIONS,
              };
            }
            if (!recovered.permissions) recovered.permissions = DEFAULT_PERMISSIONS;

            if (isStale()) return;
            setUser(recovered);
            dispatch(setReduxUser(recovered));
            console.warn('AuthProvider recovered after a failed profile read');
          } catch (retryErr) {
            console.error('AuthProvider retry also failed:', retryErr);
            messageApi.error('Could not load your profile. Some pages may be limited.');
            // Still signed in — do not force a logout
          }
        } else {
          setUser(null);
          dispatch(clearUser());
        }
      } finally {
        // Only the newest generation may release the loading gate — otherwise a
        // stale callback finishing late would let the redirect guard run
        // against half-applied state.
        if (!isStale()) setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [messageApi, dispatch]);

  useEffect(() => {
    if (loading) return;
    const isPublic = PUBLIC_PATHS.some(
      (p) => pathname === p || pathname.startsWith(p + "/")
    );
    if (!user) {
      if (!isPublic) {
        messageApi.error("Please login to continue");
        router.replace("/auth/login");
      }
      return;
    }
    if (isPublic) {
      router.replace("/");
      return;
    }
    if (!canVisit(user, pathname)) {
      messageApi.error("You don't have permission to access this page");
      router.replace("/unauthorized");
    }
  }, [loading, user, pathname]);

  return (
    <AuthContext.Provider value={{ user, loading, messageApi }}>
      {contextHolder}
      {children}
    </AuthContext.Provider>
  );
}

export function AuthProvider({ children }) {
  return (
    <Provider store={store}>
      <AuthProviderInner children={children} />
    </Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
