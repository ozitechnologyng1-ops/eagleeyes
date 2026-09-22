import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  X, LogOut, LayoutDashboard, Users, Camera, Map, ChevronRight, 
  CreditCard, MessageSquare, Bot, User 
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { cn } from '../lib/utils';

interface SidebarProps {
  onClose?: () => void;
  showCloseButton?: boolean;
  className?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  onClose, 
  showCloseButton = false,
  className 
}) => {
  const { user, logout, locations } = useApp();
  const navigate = useNavigate();
  const location = useLocation();

  if (!user) return null;

  const handleLogout = () => {
    logout();
    onClose?.();
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
    { name: 'Group AI Monitor', path: '/group-monitor', icon: Bot, roles: ['national_admin', 'state_admin'] },
  ];

  const filteredNav = navItems.filter(item => item.roles.includes(user.role));
  const userLocation = user.locationName || locations?.find((l: any) => l.id === user.locationId)?.name || 'State Command';

  return (
    <aside className={cn(
      "w-64 bg-[#004d25] text-white flex flex-col h-full select-none",
      className
    )}>
      {/* Brand Header */}
      <div className="p-4 sm:p-5 flex items-center justify-between border-b border-[#006331] shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-[#d4af37] rounded-lg flex items-center justify-center font-bold text-[#004d25] text-base shadow-inner">
            EE
          </div>
          <span className="font-bold text-lg tracking-tight">EagleEye 2027</span>
        </div>
        {showCloseButton && (
          <button 
            type="button"
            onClick={onClose}
            className="p-1.5 text-green-200 hover:text-white rounded-lg hover:bg-[#006331] cursor-pointer transition"
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        )}
      </div>

      {/* Logged in User Card */}
      <div className="p-4 border-b border-[#006331] shrink-0 bg-[#004220]/60">
        <div className="text-xs text-[#d4af37] font-medium uppercase tracking-wider mb-1">Logged in as</div>
        <div className="font-semibold text-sm truncate" title={user.name}>{user.name}</div>
        <div className="text-xs text-green-200 mt-1 flex items-center gap-1.5 truncate">
          <Map size={12} className="shrink-0 text-[#d4af37]" /> 
          <span className="truncate">{userLocation}</span>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto overflow-x-hidden">
        {filteredNav.map((item) => {
          const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
          return (
            <button
              key={item.name}
              type="button"
              onClick={() => {
                navigate(item.path);
                onClose?.();
              }}
              className={cn(
                "w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg transition-all text-left text-sm cursor-pointer",
                isActive 
                  ? "bg-[#d4af37] text-[#004d25] font-semibold shadow-md" 
                  : "text-green-100 hover:bg-[#006331] hover:text-white"
              )}
            >
              <item.icon size={18} className={cn("shrink-0", isActive ? "text-[#004d25]" : "text-green-200")} />
              <span className="truncate">{item.name}</span>
              {isActive && <ChevronRight size={15} className="ml-auto shrink-0" />}
            </button>
          );
        })}
      </nav>

      {/* Profile & Logout (Anchored to bottom) */}
      <div className="p-3 border-t border-[#006331] space-y-1 shrink-0 bg-[#004220]/40">
        <button 
          type="button"
          onClick={() => {
            navigate('/profile');
            onClose?.();
          }}
          className={cn(
            "w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg transition-all text-left text-sm cursor-pointer",
            location.pathname === '/profile'
              ? "bg-[#d4af37] text-[#004d25] font-semibold shadow-md" 
              : "text-green-100 hover:bg-[#006331] hover:text-white"
          )}
        >
          <User size={18} className="shrink-0 text-green-200" />
          <span>My Profile</span>
        </button>
        <button 
          type="button"
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-green-100 hover:bg-red-600 hover:text-white transition-all text-left text-sm cursor-pointer"
        >
          <LogOut size={18} className="shrink-0 text-red-300" />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
};
