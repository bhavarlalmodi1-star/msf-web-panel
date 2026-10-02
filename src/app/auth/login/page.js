"use client";
import React, { useState, useEffect } from 'react';
import { Mail, Lock, ArrowRight, Heart, Eye, EyeOff, CheckCircle, Phone } from 'lucide-react';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../../../../lib/firbase-client';
import { message } from 'antd';
import { useRouter } from 'next/navigation';
import { useTrust } from '@/utils/trust/useTrust';

const LoginPage = () => {
  // Trust name / address / reg. no. — edited at Settings → Trust Details
  const trust = useTrust();
  const router = useRouter();
  const [view, setView] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [otpTimer, setOtpTimer] = useState(0);
  const [otpResendDisabled, setOtpResendDisabled] = useState(true);
  const [isOtpVerified, setIsOtpVerified] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();
 
  // Timer for OTP expiration (1 minute)
  useEffect(() => {
    let interval;
    if (otpTimer > 0) {
      interval = setInterval(() => {
        setOtpTimer((prev) => prev - 1);
      }, 1000);
    } else {
      setOtpResendDisabled(false);
    }
    return () => clearInterval(interval);
  }, [otpTimer]);

  // Show success/error messages using Ant Design
  const showMessage = (type, content) => {
    messageApi.open({
      type,
      content,
      duration: 3,
    });
  };

  // Check if email exists in database and get user status
  const checkEmailAndStatus = async () => {
    try {
      const response = await fetch('/api/auth/check-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Email check failed');
      }
      
      return {
        exists: data.exists,
        firestore: data.firestore,
        auth: data.auth,
        status: data.status || 'active' // Get status from API response
      };
    } catch (error) {
      console.error('Email check error:', error);
      showMessage('error', error.message || 'Error checking email');
      return { exists: false, firestore: false, auth: false, status: null };
    }
  };

  // ── Trusted device ─────────────────────────────────────────────────────────
  // A browser that has already passed OTP for this email skips it next time.
  // The deviceId is just an opaque handle — the authoritative record is
  // server-side, so editing localStorage alone doesn't get you past OTP.
  const getDeviceId = () => {
    try {
      let id = localStorage.getItem('device_id');
      if (!id) {
        id = `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
        localStorage.setItem('device_id', id);
      }
      return id;
    } catch {
      return null;   // private mode / storage blocked → always ask for OTP
    }
  };

  const isDeviceTrusted = async (emailAddr) => {
    const deviceId = getDeviceId();
    if (!deviceId) return false;
    try {
      const res = await fetch('/api/auth/trusted-device', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'check', email: emailAddr, deviceId }),
      });
      const data = await res.json();
      return data?.trusted === true;
    } catch {
      return false;  // any failure → fall back to OTP
    }
  };

  const rememberDevice = async (emailAddr) => {
    const deviceId = getDeviceId();
    if (!deviceId) return;
    try {
      await fetch('/api/auth/trusted-device', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'register', email: emailAddr, deviceId }),
      });
    } catch (e) {
      console.warn('Could not remember this device (non-critical):', e);
    }
  };

  // Send OTP to email
  const sendOtp = async () => {
    try {
      const response = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Failed to send OTP');
      }
      
      // Reset OTP state
      setIsOtpVerified(false);
      setOtp(['', '', '', '', '', '']);
      
      // Start OTP timer (1 minute = 60 seconds)
      setOtpTimer(60);
      setOtpResendDisabled(true);
      
      showMessage('success', `OTP sent to ${email}`);
      return data.success;
    } catch (error) {
      console.error('OTP send error:', error);
      showMessage('error', error.message || 'Error sending OTP');
      return false;
    }
  };

  // Verify OTP
  const verifyOtp = async () => {
    const otpValue = otp.join('');
    if (otpValue.length !== 6) {
      showMessage('warning', 'Please enter complete 6-digit OTP');
      return false;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email,
          otp: otpValue 
        })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'OTP verification failed');
      }
      
      if (data.success) {
        setIsOtpVerified(true);
        // Remember this browser so the next login goes straight to password.
        // Must happen here — the server only accepts registration while the
        // OTP for this email is in a verified state.
        await rememberDevice(email);
        showMessage('success', 'OTP verified — this device will skip OTP next time');
        return true;
      } else {
        showMessage('error', 'Invalid OTP. Please try again.');
        return false;
      }
    } catch (error) {
      console.error('OTP verify error:', error);
      showMessage('error', error.message || 'Error verifying OTP');
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Get device info for session
  const getDeviceInfo = () => {
    const userAgent = navigator.userAgent;
    return {
      device: /mobile/i.test(userAgent) ? 'Mobile' : 'Desktop',
      os: userAgent.match(/\(([^)]+)\)/)?.[1] || 'Unknown OS',
      browser: userAgent.match(/(chrome|firefox|safari|edge|opera)/i)?.[0] || 'Unknown Browser'
    };
  };

  // Save session to Firestore
  const saveSession = async (userId, sessionToken) => {
    try {
      const deviceInfo = getDeviceInfo();
      const ipRes = await fetch("https://ipapi.co/json/");
      const locationData = await ipRes.json();

      const session = {
        ip: locationData.ip,
        location: `${locationData.city}, ${locationData.region}, ${locationData.country_name}`,
        pinCode: locationData.postal,
        device: deviceInfo.device,
        os: deviceInfo.os,
        browser: deviceInfo.browser,
        createdAt: new Date().toISOString(),
        lastActive: new Date().toISOString(),
        sessionToken,
      };

      await setDoc(doc(db, "users", userId, "sessions", sessionToken), session);
      console.log('Session saved successfully');
    } catch (error) {
      console.error('Error saving session:', error);
    }
  };

  // Generate session token
  const generateSessionToken = () => {
    return 'session_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
  };

  // Handle email submission (Step 1)
  const handleEmailSubmit = async () => {
    if (!email) {
      showMessage('warning', 'Please enter your email');
      return;
    }

    setLoading(true);
    try {
      // Check if email exists and get status
      const emailCheck = await checkEmailAndStatus();
      
      if (!emailCheck.exists) {
        showMessage('error', 'Email not found. Please check your email or contact administrator.');
        setLoading(false);
        return;
      }

      // Check user status - DON'T proceed if not active
      if (emailCheck.status && emailCheck.status.toLowerCase() !== 'active') {
        showMessage('error', `Your account is ${emailCheck.status}. Please contact administrator for assistance.`);
        setLoading(false);
        return; // STOP HERE - Don't send OTP
      }

      // Already verified on this browser? Skip OTP and go straight to password.
      // The password step is the 'loginOtp' view with isOtpVerified set — there
      // is no separate password view.
      if (await isDeviceTrusted(email)) {
        setIsOtpVerified(true);
        setView('loginOtp');
        showMessage('success', 'Welcome back — enter your password');
        setLoading(false);
        return;
      }

      // Send OTP only if account is active
      const otpSent = await sendOtp();

      if (otpSent) {
        setView('loginOtp');
      }
    } catch (error) {
      console.error('Email submission error:', error);
    } finally {
      setLoading(false);
    }
  };

  // Handle OTP verification button click
  const handleVerifyOtp = async () => {
    await verifyOtp();
  };

  // Handle login after OTP verification
  const handleLoginWithPassword = async () => {
    if (!password) {
      showMessage('warning', 'Please enter your password');
      return;
    }

    if (!isOtpVerified) {
      showMessage('warning', 'Please verify OTP first');
      return;
    }

    setLoading(true);
    try {
      // Firebase login with email and password
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Double-check user status from Firestore.
      //
      // This runs moments after sign-in, when the ID token may still be
      // propagating, so the read can fail with permission-denied. It used to
      // throw into the outer catch, which reported "login failed" even though
      // the user WAS signed in — the classic "first attempt fails, second
      // works" (by then the token is warm). It's an extra safety check, not
      // the thing that authenticates, so a failure here must not abort login.
      try {
        const userRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userRef);

        if (userDoc.exists()) {
          const userData = userDoc.data();
          if (userData.status && userData.status.toLowerCase() !== 'active') {
            // Genuinely blocked account — this one DOES stop the login
            await auth.signOut();
            showMessage('error', `Your account is ${userData.status}. Please contact administrator.`);
            setLoading(false);
            return;
          }
        }
      } catch (statusErr) {
        console.warn('Post-login status check skipped:', statusErr?.code || statusErr);
        // AuthProvider re-reads the profile and enforces access anyway
      }

      // Generate or get session token
      let sessionToken = localStorage.getItem("session_token");
      if (!sessionToken) {
        sessionToken = generateSessionToken();
        localStorage.setItem("session_token", sessionToken);
      }

      // Session bookkeeping — also non-fatal for the same reason
      try {
        await saveSession(user.uid, sessionToken);
      } catch (sessErr) {
        console.warn('Could not save session record:', sessErr?.code || sessErr);
      }

      showMessage('success', 'Login successful! Redirecting...');

      // Navigate explicitly. AuthProvider's guard also redirects once its
      // profile load finishes, but relying on that alone meant any hiccup in
      // that async path left the user stranded on the login screen.
      // router.replace is idempotent, so both firing is harmless.
      router.replace('/');

    } catch (error) {
      console.error('Login error:', error);
      if (error.code === 'auth/wrong-password') {
        showMessage('error', 'Incorrect password. Please try again.');
      } else if (error.code === 'auth/user-not-found') {
        showMessage('error', 'User not found. Please check your email.');
      } else if (error.code === 'auth/user-disabled') {
        showMessage('error', 'Your account has been disabled. Please contact administrator.');
      } else if (error.code === 'auth/too-many-requests') {
        showMessage('error', 'Too many login attempts. Please try again later.');
      } else {
        showMessage('error', error.message || 'Login failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Handle forgot password
  const handleForgotPassword = async () => {
    if (!email) {
      showMessage('warning', 'Please enter your email first');
      setView('login');
      return;
    }

    // Check if account exists and is active before sending reset link
    setLoading(true);
    try {
      const emailCheck = await checkEmailAndStatus();
      
      if (!emailCheck.exists) {
        showMessage('error', 'Email not found. Please check your email or contact administrator.');
        setLoading(false);
        return;
      }

      // Check user status - DON'T proceed if not active
      if (emailCheck.status && emailCheck.status.toLowerCase() !== 'active') {
        showMessage('error', `Cannot send reset link. Your account is ${emailCheck.status}. Please contact administrator.`);
        setLoading(false);
        return; // STOP HERE - Don't send reset link
      }

      // Send password reset email only if account is active
      await sendPasswordResetEmail(auth, email);
      showMessage('success', 'Password reset link sent! Please check your email inbox.');
      setView('resetLinkSent');
    } catch (error) {
      console.error('Password reset error:', error);
      if (error.code === 'auth/user-not-found') {
        showMessage('error', 'Email not found. Please check your email address.');
      } else if (error.code === 'auth/user-disabled') {
        showMessage('error', 'Account is disabled. Please contact administrator.');
      } else {
        showMessage('error', error.message || 'Failed to send reset link. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Handle OTP resend
  const handleResendOtp = async () => {
    if (otpResendDisabled) return;
    
    setLoading(true);
    try {
      // Check status again before resending OTP
      const emailCheck = await checkEmailAndStatus();
      
      if (emailCheck.status && emailCheck.status.toLowerCase() !== 'active') {
        showMessage('error', `Cannot resend OTP. Your account is ${emailCheck.status}. Please contact administrator.`);
        setLoading(false);
        return; // STOP HERE - Don't resend OTP
      }

      const otpSent = await sendOtp();
      if (otpSent) {
        showMessage('success', `New OTP sent to ${email}`);
      }
    } catch (error) {
      console.error('Resend OTP error:', error);
      showMessage('error', error.message || 'Failed to resend OTP');
    } finally {
      setLoading(false);
    }
  };

  // Handle OTP input change
  const handleOtpChange = (index, value) => {
    if (value.length <= 1 && /^\d*$/.test(value)) {
      const newOtp = [...otp];
      newOtp[index] = value;
      setOtp(newOtp);
      
      if (value && index < 5) {
        document.getElementById(`otp-${index + 1}`)?.focus();
      }
    }
  };

  return (
    <>
      {contextHolder}
      <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-orange-50 flex items-center justify-center p-3 sm:p-4 md:p-6">
        {/* Animated Background Orbs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-10 sm:top-20 left-5 sm:left-10 w-48 sm:w-72 h-48 sm:h-72 bg-rose-300 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"></div>
          <div className="absolute bottom-10 sm:bottom-20 right-5 sm:right-10 w-48 sm:w-72 h-48 sm:h-72 bg-orange-300 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse" style={{animationDelay: '1s'}}></div>
          <div className="absolute top-1/2 left-1/2 w-48 sm:w-72 h-48 sm:h-72 bg-pink-300 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse" style={{animationDelay: '2s'}}></div>
        </div>

        <div className="w-full max-w-7xl relative z-10">
          <div className="bg-white/95 backdrop-blur-sm rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden">
            <div className="grid lg:grid-cols-2 gap-0">
              
              {/* Left side - Organization Info */}
              <div className="bg-gradient-to-br from-rose-600 via-pink-600 to-orange-500 p-4 sm:p-6 lg:p-8 text-white flex flex-col justify-center relative overflow-hidden">
                {/* Decorative Circles */}
                <div className="absolute inset-0 opacity-10">
                  <div className="absolute top-5 sm:top-10 left-5 sm:left-10 w-24 sm:w-40 h-24 sm:h-40 border-2 sm:border-4 border-white rounded-full"></div>
                  <div className="absolute bottom-5 sm:bottom-10 right-5 sm:right-10 w-40 sm:w-60 h-40 sm:h-60 border-2 sm:border-4 border-white rounded-full"></div>
                  <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-60 sm:w-80 h-60 sm:h-80 border-2 sm:border-4 border-white rounded-full"></div>
                </div>
                
                <div className="relative z-10 space-y-3 sm:space-y-4 lg:space-y-6">
                  {/* Logos and Header */}
                  <div className="text-center">
                    <div className="mb-2 sm:mb-3">
                      <p className="text-[10px] sm:text-xs font-medium mb-1 sm:mb-2 leading-relaxed flex flex-wrap justify-center gap-x-3 gap-y-0.5">
                        {trust.blessings.map((line, i) => <span key={i}>{line}</span>)}
                      </p>
                    </div>

                    {/* Logo — name — right-side image (same as the PDF header) */}
                    <div className="flex items-center justify-center gap-2 sm:gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={trust.logoSrc} alt="Logo" className="w-12 h-12 sm:w-16 sm:h-16 lg:w-[72px] lg:h-[72px] object-contain bg-white rounded-xl p-1 shadow-md shrink-0"
                        onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
                      <div className="min-w-0 flex-1">
                        <h1 className="text-sm sm:text-lg lg:text-xl font-bold mb-1 leading-tight">{trust.name}</h1>
                        <p className="text-xs sm:text-base lg:text-lg font-semibold">{trust.cityLine}</p>
                      </div>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={trust.rightImageSrc} alt="" className="w-12 h-12 sm:w-16 sm:h-16 lg:w-[72px] lg:h-[72px] object-contain bg-white rounded-xl p-1 shadow-md shrink-0"
                        onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
                    </div>
                    <div className="flex flex-wrap justify-center items-center gap-2 text-[10px] sm:text-xs mt-2">
                      <span className="bg-white/20 px-2 sm:px-3 py-0.5 sm:py-1 rounded-full backdrop-blur-sm">SINCE: {trust.since}</span>
                      <span className="bg-white/20 px-2 sm:px-3 py-0.5 sm:py-1 rounded-full backdrop-blur-sm">Reg. No: {trust.regNo}</span>
                    </div>
                  </div>

                  {/* Head Office Info */}
                  <div className="bg-white/15 backdrop-blur-sm rounded-xl p-3 sm:p-4">
                    <h3 className="text-xs sm:text-sm lg:text-base font-bold mb-2 flex items-center gap-2">
                      <span className="text-sm sm:text-base lg:text-lg">🏢</span>
                      हेड ऑफिस
                    </h3>
                    <div className="space-y-0.5 sm:space-y-1 text-[10px] sm:text-xs lg:text-sm leading-relaxed">
                      <div>{trust.addressWithOffice}</div>
                      {trust.contactNumbers && <div className="opacity-90">संपर्क : {trust.contactNumbers}</div>}
                    </div>
                  </div>

                  {/* Admin Portal Badge */}
                  <div className="bg-white/15 backdrop-blur-sm rounded-xl p-3 sm:p-4">
                    <div className="flex items-center gap-2 sm:gap-3">
                      <div className="bg-white/20 p-1.5 sm:p-2 rounded-lg backdrop-blur-sm">
                        <Heart className="w-4 h-4 sm:w-5 md:w-6 sm:h-5 md:h-6" fill="currentColor" />
                      </div>
                      <div>
                        <h3 className="font-bold text-xs sm:text-sm lg:text-base">Admin Portal</h3>
                        <p className="text-[10px] sm:text-xs opacity-90">{trust.panelTitle}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right side - Forms */}
              <div className="p-6 sm:p-8 lg:p-12 flex flex-col justify-center">
                {/* Step 1: Enter Email (Login) */}
                {view === 'login' && (
                  <div className="space-y-4 sm:space-y-6 animate-fadeIn">
                    <div>
                      <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1 sm:mb-2">Welcome Back</h2>
                      <p className="text-sm sm:text-base text-gray-600">Enter your email to verify your account</p>
                    </div>

                    <div className="space-y-4 sm:space-y-5">
                      <div>
                        <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">Email Address</label>
                        <div className="relative">
                          <Mail className="absolute left-3 sm:left-4 top-1/2 transform -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
                          <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && handleEmailSubmit()}
                            className="w-full pl-10 sm:pl-12 pr-3 sm:pr-4 py-2.5 sm:py-3 text-sm sm:text-base border-2 border-gray-200 rounded-xl focus:border-rose-500 focus:outline-none transition-colors"
                            placeholder="admin@example.com"
                          />
                        </div>
                      </div>

                      <button
                        onClick={handleEmailSubmit}
                        disabled={loading || !email}
                        className="w-full bg-gradient-to-r from-rose-600 to-orange-600 text-white py-2.5 sm:py-3 rounded-xl text-sm sm:text-base font-semibold hover:from-rose-700 hover:to-orange-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-rose-200 disabled:opacity-50"
                      >
                        {loading ? 'Checking...' : 'Continue'}
                        {!loading && <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5" />}
                      </button>

                      <div className="text-center pt-2 sm:pt-4">
                        <button
                          onClick={handleForgotPassword}
                          className="text-xs sm:text-sm text-rose-600 hover:text-rose-700 font-medium"
                        >
                          Forgot Password?
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Step 2: Enter OTP and Password (Login) */}
                {view === 'loginOtp' && (
                  <div className="space-y-4 sm:space-y-6 animate-fadeIn">
                    <div>
                      <button
                        onClick={() => {
                          setView('login');
                          setOtp(['', '', '', '', '', '']);
                          setIsOtpVerified(false);
                          setOtpTimer(0);
                        }}
                        className="text-rose-600 hover:text-rose-700 font-medium mb-3 sm:mb-4 flex items-center gap-1 text-sm sm:text-base"
                      >
                        ← Change email
                      </button>
                      <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1 sm:mb-2">
                        {isOtpVerified ? 'Enter Password' : 'Verify OTP'}
                      </h2>
                      <p className="text-sm sm:text-base text-gray-600">
                        {isOtpVerified 
                          ? 'OTP verified! Now enter your password' 
                          : `Enter the OTP sent to ${email}`}
                      </p>
                      {!isOtpVerified && otpTimer > 0 && (
                        <p className="text-xs text-red-500 mt-1">
                          OTP expires in: {Math.floor(otpTimer / 60)}:{(otpTimer % 60).toString().padStart(2, '0')}
                        </p>
                      )}
                    </div>

                    <div className="space-y-4 sm:space-y-5">
                      {!isOtpVerified ? (
                        <>
                          <div>
                            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2 sm:mb-3">Verification Code</label>
                            <div className="flex gap-1.5 sm:gap-2 justify-between">
                              {otp.map((digit, index) => (
                                <input
                                  key={index}
                                  id={`otp-${index}`}
                                  type="text"
                                  inputMode="numeric"
                                  maxLength={1}
                                  value={digit}
                                  onChange={(e) => handleOtpChange(index, e.target.value)}
                                  className="w-10 h-12 sm:w-12 sm:h-14 text-center text-xl sm:text-2xl font-bold border-2 border-gray-200 rounded-xl focus:border-rose-500 focus:outline-none transition-colors"
                                />
                              ))}
                            </div>
                            <div className="mt-2 flex justify-between items-center">
                              <button
                                onClick={handleResendOtp}
                                disabled={otpResendDisabled || loading}
                                className="text-xs sm:text-sm text-gray-600 hover:text-rose-600 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                Didn't receive code? <span className="text-rose-600">Resend OTP</span>
                              </button>
                              {otpResendDisabled && otpTimer > 0 && (
                                <span className="text-xs text-gray-500">
                                  Resend in {otpTimer}s
                                </span>
                              )}
                            </div>
                          </div>

                          <button
                            onClick={handleVerifyOtp}
                            disabled={loading || otp.join('').length !== 6 || otpTimer <= 0}
                            className="w-full bg-gradient-to-r from-rose-600 to-orange-600 text-white py-2.5 sm:py-3 rounded-xl text-sm sm:text-base font-semibold hover:from-rose-700 hover:to-orange-700 transition-all shadow-lg shadow-rose-200 disabled:opacity-50"
                          >
                            {loading ? 'Verifying OTP...' : 'Verify OTP'}
                          </button>
                        </>
                      ) : (
                        <>
                          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl mb-2">
                            <div className="flex items-center gap-2 text-emerald-700">
                              <CheckCircle className="w-5 h-5" />
                              <span className="text-sm font-medium">OTP verified successfully!</span>
                            </div>
                          </div>

                          <div>
                            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">Password</label>
                            <div className="relative">
                              <Lock className="absolute left-3 sm:left-4 top-1/2 transform -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
                              <input
                                type={showPassword ? "text" : "password"}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && handleLoginWithPassword()}
                                className="w-full pl-10 sm:pl-12 pr-10 sm:pr-12 py-2.5 sm:py-3 text-sm sm:text-base border-2 border-gray-200 rounded-xl focus:border-rose-500 focus:outline-none transition-colors"
                                placeholder="••••••••"
                              />
                              <button
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 sm:right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                              >
                                {showPassword ? <EyeOff className="w-4 h-4 sm:w-5 sm:h-5" /> : <Eye className="w-4 h-4 sm:w-5 sm:h-5" />}
                              </button>
                            </div>
                          </div>

                          <button
                            onClick={handleLoginWithPassword}
                            disabled={loading || !password}
                            className="w-full bg-gradient-to-r from-rose-600 to-orange-600 text-white py-2.5 sm:py-3 rounded-xl text-sm sm:text-base font-semibold hover:from-rose-700 hover:to-orange-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-rose-200 disabled:opacity-50"
                          >
                            {loading ? 'Logging in...' : 'Sign In'}
                            {!loading && <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5" />}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* Forgot Password - Enter Email */}
                {view === 'forgot' && (
                  <div className="space-y-4 sm:space-y-6 animate-fadeIn">
                    <div>
                      <button
                        onClick={() => setView('login')}
                        className="text-rose-600 hover:text-rose-700 font-medium mb-3 sm:mb-4 flex items-center gap-1 text-sm sm:text-base"
                      >
                        ← Back to login
                      </button>
                      <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1 sm:mb-2">Forgot Password?</h2>
                      <p className="text-sm sm:text-base text-gray-600">Enter your email to receive password reset link</p>
                    </div>

                    <div className="space-y-4 sm:space-y-5">
                      <div>
                        <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">Email Address</label>
                        <div className="relative">
                          <Mail className="absolute left-3 sm:left-4 top-1/2 transform -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
                          <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleForgotPassword()}
                            className="w-full pl-10 sm:pl-12 pr-3 sm:pr-4 py-2.5 sm:py-3 text-sm sm:text-base border-2 border-gray-200 rounded-xl focus:border-rose-500 focus:outline-none transition-colors"
                            placeholder="admin@example.com"
                          />
                        </div>
                      </div>

                      <button
                        onClick={handleForgotPassword}
                        disabled={loading || !email}
                        className="w-full bg-gradient-to-r from-rose-600 to-orange-600 text-white py-2.5 sm:py-3 rounded-xl text-sm sm:text-base font-semibold hover:from-rose-700 hover:to-orange-700 transition-all shadow-lg shadow-rose-200 disabled:opacity-50"
                      >
                        {loading ? 'Checking...' : 'Send Reset Link'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Reset Link Sent Confirmation */}
                {view === 'resetLinkSent' && (
                  <div className="space-y-4 sm:space-y-6 animate-fadeIn text-center">
                    <div className="flex justify-center mb-2 sm:mb-4">
                      <div className="bg-emerald-100 p-3 sm:p-4 rounded-full">
                        <CheckCircle className="w-12 h-12 sm:w-16 sm:h-16 text-emerald-600" />
                      </div>
                    </div>
                    
                    <div>
                      <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1 sm:mb-2">Check Your Email</h2>
                      <p className="text-sm sm:text-base text-gray-600 mb-1 sm:mb-2">
                        We've sent a password reset link to
                      </p>
                      <p className="text-rose-600 font-semibold text-base sm:text-lg mb-2 sm:mb-4 break-all px-2">{email}</p>
                      <p className="text-xs sm:text-sm text-gray-500 px-2">
                        Click the link in the email to reset your password. The link will expire in 1 hour.
                      </p>
                    </div>

                    <div className="space-y-2 sm:space-y-3 pt-2 sm:pt-4">
                      <button
                        onClick={() => setView('login')}
                        className="text-rose-600 hover:text-rose-700 font-medium flex items-center gap-1 mx-auto text-sm sm:text-base"
                      >
                        ← Back to login
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="text-center mt-4 sm:mt-6 text-gray-600 text-xs sm:text-sm px-4">
            <p>© {new Date().getFullYear()} {trust.name}. All rights reserved.</p>
          </div>
        </div>

        <style jsx>{`
          @keyframes fadeIn {
            from {
              opacity: 0;
              transform: translateY(10px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
          .animate-fadeIn {
            animation: fadeIn 0.3s ease-out;
          }
        `}</style>
      </div>
    </>
  );
};

export default LoginPage;