import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { HelmetProvider, Helmet } from 'react-helmet-async';
import { AppProvider } from './context/AppContext';
import Layout from './components/Layout';
import { Toaster } from 'react-hot-toast';

const Login        = lazy(() => import('./pages/Login'));
const Landing      = lazy(() => import('./pages/Landing'));
const Dashboard    = lazy(() => import('./pages/Dashboard'));
const Voters       = lazy(() => import('./pages/Voters'));
const ResultCapture = lazy(() => import('./pages/ResultCapture'));
const Agents       = lazy(() => import('./pages/Agents'));
const Jurisdictions = lazy(() => import('./pages/Jurisdictions'));
const Profile      = lazy(() => import('./pages/Profile'));
const Payment      = lazy(() => import('./pages/Payment'));
const Sms          = lazy(() => import('./pages/Sms'));
const Billing      = lazy(() => import('./pages/Billing'));

export default function App() {
  return (
    <HelmetProvider>
      <AppProvider>
        <Toaster position="top-right" />
        <Helmet>
          <title>EagleEye 2027 | Election Management System</title>
          <meta name="description" content="High-fidelity, interactive multi-tiered election management system for real-time result collation and voter canvassing." />
        </Helmet>
        <BrowserRouter>
          <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-4 border-[#004d25] border-t-transparent rounded-full animate-spin" /></div>}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<Login />} />
              <Route element={<Layout />}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/voters" element={<Voters />} />
                <Route path="/capture" element={<ResultCapture />} />
                <Route path="/agents" element={<Agents />} />
                <Route path="/locations" element={<Jurisdictions />} />
                <Route path="/payment" element={<Payment />} />
                <Route path="/sms" element={<Sms />} />
                <Route path="/billing" element={<Billing />} />
                <Route path="/profile" element={<Profile />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AppProvider>
    </HelmetProvider>
  );
}
