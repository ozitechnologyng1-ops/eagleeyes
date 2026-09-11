import React, { useState } from 'react';
import { Outlet, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { Menu, X, LogOut, LayoutDashboard, Users, Camera, Map, ChevronRight, CreditCard, MessageSquare, Cpu } from 'lucide-react';
import { cn } from '../lib/utils';

export default function Layout() {
  const { user, logout, locations } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const navItems = [
    { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, roles: ['national_admin', 'state_admin', 'lga_admin', 'ward_admin', 'pu_agent'] },
    { name: 'Agents', path: '/agents', icon: Users, roles: ['national_admin', 'state_admin', 'lga_admin', 'ward_admin'] },
    { name: 'Jurisdictions', path: '/locations', icon: Map, roles: ['national_admin', 'state_admin', 'lga_admin', 'ward_admin'] },
    { name: 'Voters', path: '/voters', icon: Users, roles: ['ward_admin', 'pu_agent'] },
    { name: 'Result Capture', path: '/capture', icon: Camera, roles: ['ward_admin', 'pu_agent'] },
    { 
      name: ['pu_agent', 'ward_admin', 'lga_admin'].includes(user.role) ? 'Earnings' : 'Payment', 
      path: '/payment', 
      icon: CreditCard, 
      roles: ['national_admin', 'state_admin', 'lga_admin', 'ward_admin', 'pu_agent'] 
    },
    { name: 'WhatsApp Hub', path: '/whatsapp-config', icon: MessageSquare, roles: ['national_admin', 'state_admin'] },
    { name: 'Group AI Monitor', path: '/group-monitor', icon: Users, roles: ['national_admin', 'state_admin'] },
    { name: 'SMS Tracker', path: '/sms', icon: MessageSquare, roles: ['national_admin', 'state_admin'] },
    { name: 'Token Usage', path: '/billing', icon: Cpu, roles: ['national_admin', 'state_admin'] },
  ];

  const filteredNav = navItems.filter(item => item.roles.includes(user.role));

  // Find user's location name
  const userLocation = user.locationName || locations.find((l: any) => l.id === user.locationId)?.name || 'Unknown Location';

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
      {/* Mobile Header */}
      <div className="md:hidden bg-[#004d25] text-white p-4 flex justify-between items-center shadow-md z-20 relative">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-[#d4af37] rounded-full flex items-center justify-center font-bold text-[#004d25]">EE</div>
          <span className="font-bold text-lg tracking-tight">EagleEye 2027</span>
        </div>
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-1 cursor-pointer">
          {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Sidebar */}
      <div className={cn(
        "fixed inset-y-0 left-0 transform md:relative md:translate-x-0 transition duration-200 ease-in-out z-10",
        "w-64 bg-[#004d25] text-white shadow-xl flex flex-col",
        isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-6 hidden md:flex items-center gap-3 border-b border-[#006331]">
          <div className="w-10 h-10 bg-[#d4af37] rounded-lg flex items-center justify-center font-bold text-[#004d25] text-xl shadow-inner">EE</div>
          <span className="font-bold text-xl tracking-tight">EagleEye 2027</span>
        </div>
        
        <div className="p-4 border-b border-[#006331]">
          <div className="text-sm text-[#d4af37] font-medium mb-1">Logged in as</div>
          <div className="font-semibold">{user.name}</div>
          <div className="text-xs text-green-200 mt-1 flex items-center gap-1">
            <Map size={12} /> {userLocation}
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          {filteredNav.map((item) => {
            const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
            return (
              <button
                key={item.name}
                onClick={() => {
                  navigate(item.path);
                  setIsMobileMenuOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-left cursor-pointer",
                  isActive 
                    ? "bg-[#d4af37] text-[#004d25] font-semibold shadow-md" 
                    : "text-green-100 hover:bg-[#006331] hover:text-white"
                )}
              >
                <item.icon size={20} />
                <span>{item.name}</span>
                {isActive && <ChevronRight size={16} className="ml-auto" />}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-[#006331] space-y-2">
          <button 
            onClick={() => {
              navigate('/profile');
              setIsMobileMenuOpen(false);
            }}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors cursor-pointer",
              location.pathname === '/profile'
                ? "bg-[#d4af37] text-[#004d25] font-semibold shadow-md" 
                : "text-green-100 hover:bg-[#006331] hover:text-white"
            )}
          >
            <Users size={20} />
            <span>My Profile</span>
          </button>
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-green-100 hover:bg-red-600 hover:text-white transition-colors cursor-pointer"
          >
            <LogOut size={20} />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <Outlet />
        </main>
      </div>
      
      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-0 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}
    </div>
  );
}
