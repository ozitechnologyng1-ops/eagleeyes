import React, { useState, useEffect } from 'react';
import { Outlet, useLocation, Navigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { Menu } from 'lucide-react';
import { cn } from '../lib/utils';
import { Sidebar } from './Sidebar';

export default function Layout() {
  const { user } = useApp();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Close mobile/tablet menu automatically on route change
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  // Close drawer if window is resized to desktop width (>= 1024px)
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setIsMobileMenuOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col lg:flex-row">
      {/* Mobile & Tablet Top Bar (< 1024px) */}
      <header className="lg:hidden bg-[#004d25] text-white px-4 py-3.5 flex justify-between items-center shadow-md z-30 sticky top-0 shrink-0">
        <button 
          type="button"
          onClick={() => setIsMobileMenuOpen(true)} 
          className="p-1.5 cursor-pointer hover:bg-[#006331] rounded-lg transition text-green-100 hover:text-white" 
          aria-label="Open Navigation Menu"
        >
          <Menu size={22} />
        </button>
        <div className="flex items-center gap-2.5 select-none">
          <div className="w-8 h-8 bg-[#d4af37] rounded-lg flex items-center justify-center font-bold text-[#004d25] text-sm shadow-inner">
            EE
          </div>
          <span className="font-bold text-base tracking-tight text-white">EagleEye 2027</span>
        </div>
      </header>

      {/* Mobile & Tablet Backdrop Overlay (< 1024px) */}
      {isMobileMenuOpen && (
        <div 
          onClick={() => setIsMobileMenuOpen(false)} 
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 lg:hidden transition-opacity"
          aria-hidden="true"
        />
      )}

      {/* Mobile & Tablet Off-canvas Sidebar Drawer (< 1024px) */}
      <div className={cn(
        "fixed inset-y-0 left-0 z-50 w-64 max-w-[85vw] transform transition-transform duration-300 ease-in-out lg:hidden shadow-2xl",
        isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <Sidebar 
          onClose={() => setIsMobileMenuOpen(false)} 
          showCloseButton={true} 
          className="h-full shadow-2xl"
        />
      </div>

      {/* Desktop Persistent Full-Height Sidebar (>= 1024px) */}
      <div className="hidden lg:flex lg:flex-col lg:w-64 lg:h-screen lg:sticky lg:top-0 shrink-0 border-r border-[#006331] shadow-md z-20">
        <Sidebar showCloseButton={false} className="h-full" />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen bg-gray-50 overflow-x-hidden">
        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
