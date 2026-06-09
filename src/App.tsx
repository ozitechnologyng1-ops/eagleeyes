/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { HelmetProvider, Helmet } from 'react-helmet-async';
import { AppProvider } from './context/AppContext';
import Layout from './components/Layout';
import { Toaster } from 'react-hot-toast';
import Login from './pages/Login';
import Landing from './pages/Landing';
import Dashboard from './pages/Dashboard';
import Voters from './pages/Voters';
import ResultCapture from './pages/ResultCapture';
import Agents from './pages/Agents';
import Jurisdictions from './pages/Jurisdictions';
import Profile from './pages/Profile';
import Payment from './pages/Payment';
import Sms from './pages/Sms';
import Billing from './pages/Billing';

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
        </BrowserRouter>
      </AppProvider>
    </HelmetProvider>
  );
}
