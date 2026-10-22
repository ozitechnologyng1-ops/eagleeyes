import React, { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { HelmetProvider, Helmet } from "react-helmet-async";
import { AppProvider } from "./context/AppContext";
import Layout from "./components/Layout";
import { Toaster } from "react-hot-toast";

const Login = lazy(() => import("./pages/Login"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Voters = lazy(() => import("./pages/Voters"));
const ResultCapture = lazy(() => import("./pages/ResultCapture"));
const Agents = lazy(() => import("./pages/Agents"));
const Jurisdictions = lazy(() => import("./pages/Jurisdictions"));
const Profile = lazy(() => import("./pages/Profile"));
const Payment = lazy(() => import("./pages/Payment"));
const Sms = lazy(() => import("./pages/Sms"));
const Billing = lazy(() => import("./pages/Billing"));
const WhatsAppConfig = lazy(() =>
  import("./pages/WhatsAppConfig").then((m) => ({ default: m.WhatsAppConfig })),
);
const GroupMonitor = lazy(() =>
  import("./pages/GroupMonitor").then((m) => ({ default: m.GroupMonitor })),
);
const Volunteers = lazy(() => import("./pages/Volunteers"));
import { getBrandConfig } from "./lib/branding";

export default function App() {
  const brand = getBrandConfig();

  const siteOrigin =
    typeof window !== "undefined" && window.location.origin
      ? window.location.origin
      : "https://eagleeyess.vercel.app";
  const ogImageUrl = `${siteOrigin}/og-image.png`;

  return (
    <HelmetProvider>
      <AppProvider>
        <Toaster position="top-right" />
        <Helmet>
          <title>{brand.fullTitle}</title>
          <meta name="description" content={brand.metaDescription} />
          <meta property="og:type" content="website" />
          <meta property="og:site_name" content="Eagle Eye" />
          <meta property="og:url" content={siteOrigin} />
          <meta property="og:title" content={brand.fullTitle} />
          <meta property="og:description" content={brand.metaDescription} />
          <meta property="og:image" content={ogImageUrl} />
          <meta property="og:image:secure_url" content={ogImageUrl} />
          <meta property="og:image:type" content="image/png" />
          <meta name="twitter:card" content="summary_large_image" />
          <meta name="twitter:url" content={siteOrigin} />
          <meta name="twitter:title" content={brand.fullTitle} />
          <meta name="twitter:description" content={brand.metaDescription} />
          <meta name="twitter:image" content={ogImageUrl} />
          <link rel="icon" type="image/png" href="/favicon.png" />
          <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        </Helmet>
        <BrowserRouter>
          <Suspense
            fallback={
              <div className="min-h-screen flex items-center justify-center">
                <div className="w-8 h-8 border-4 border-[#004d25] border-t-transparent rounded-full animate-spin" />
              </div>
            }
          >
            <Routes>
              {/* Landing page removed: Login is directly at root */}
              <Route path="/" element={<Login />} />
              <Route path="/login" element={<Navigate to="/" replace />} />
              <Route element={<Layout />}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/volunteers" element={<Volunteers />} />
                <Route path="/voters" element={<Voters />} />
                <Route path="/capture" element={<ResultCapture />} />
                <Route path="/agents" element={<Agents />} />
                <Route path="/locations" element={<Jurisdictions />} />
                <Route path="/payment" element={<Payment />} />
                <Route path="/sms" element={<Sms />} />
                <Route path="/billing" element={<Billing />} />
                <Route path="/whatsapp-config" element={<WhatsAppConfig />} />
                <Route path="/group-monitor" element={<GroupMonitor />} />
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
