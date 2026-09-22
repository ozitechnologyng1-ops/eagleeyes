import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, BarChart3, Users, Lock, ChevronRight } from 'lucide-react';
import Rvtech from "../assets/RVCTECH.png"

export default function Landing() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col relative overflow-hidden font-sans">
      {/* Background decoration */}
      <div className="absolute top-0 left-0 w-full h-[65vh] bg-gradient-to-b from-[#004d25] to-[#002b15] rounded-b-[40%] scale-x-150 transform -translate-y-10 z-0 shadow-2xl"></div>
      
      {/* Navbar/Header */}
      <header className="relative z-10 py-6 px-4 sm:px-12 flex justify-between items-center w-full max-w-7xl mx-auto">
        <div className="flex items-center space-x-3">
          <div className="w-11 h-11 sm:w-12 sm:h-12 bg-[#d4af37] rounded-xl flex items-center justify-center shadow-lg transform rotate-6 hover:rotate-12 transition-transform duration-300 shrink-0">
            <Shield className="text-[#004d25] w-6 h-6 sm:w-7 sm:h-7 -rotate-6" />
          </div>
          <span className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">EagleEye</span>
        </div>
        <div>
          <button 
            onClick={() => navigate('/login')}
            className="flex items-center gap-2 bg-white/10 hover:bg-white/20 active:scale-95 backdrop-blur-md text-white px-4 sm:px-5 py-2 rounded-full font-semibold text-xs sm:text-sm tracking-wide transition-all duration-200 border border-white/25 shadow-xs whitespace-nowrap cursor-pointer hover:border-[#d4af37]/60"
          >
            <span>Login</span>
            <Lock className="w-3.5 h-3.5 opacity-80 shrink-0" />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 flex-grow flex flex-col items-center pt-20 px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-4xl mx-auto">
          <div className="inline-flex items-center px-4 py-2 rounded-full bg-[#d4af37]/20 border border-[#d4af37]/50 text-[#d4af37] text-sm font-semibold mb-8 backdrop-blur-sm shadow-[0_0_15px_rgba(212,175,55,0.2)]">
            <span className="flex h-2.5 w-2.5 rounded-full bg-[#d4af37] mr-3 animate-pulse"></span>
            2027 Election Management System
          </div>
          
          <h1 className="text-5xl sm:text-6xl md:text-7xl font-extrabold text-white tracking-tight mb-6 leading-tight drop-shadow-lg">
            Unprecedented Visibility. <br className="hidden sm:block" />
            <span className="text-[#d4af37]">Absolute Security.</span>
          </h1>
          <p className="mt-12 text-lg sm:text-xl text-gray-400 sm:text-green-50/90 max-w-2xl mx-auto mb-10 leading-relaxed font-medium drop-shadow-md">
            EagleEye is a high-fidelity, interactive multi-tiered platform designed for real-time result collation, agent tracking, and secure operations.
          </p>
          
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <button
              onClick={() => navigate('/login')}
              className="group flex items-center justify-center px-8 py-4 text-lg font-bold rounded-xl text-[#004d25] bg-[#d4af37] hover:bg-[#ebd074] hover:scale-105 active:scale-95 transition-all duration-300 shadow-[0_0_30px_rgba(212,175,55,0.4)] cursor-pointer"
            >
              Access Secure Portal
              <ChevronRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </div>

        {/* Features Grid */}
        <div className="mt-28 grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto pb-20 w-full">
          {[
            {
              title: "Real-Time Collation",
              description: "Capture and verify polling unit results instantly with location-backed validation and evidence.",
              icon: <BarChart3 className="w-8 h-8 text-[#d4af37]" />
            },
            {
              title: "Agent Management",
              description: "Monitor deployed agents across jurisdictions with a powerful multi-tiered hierarchical system.",
              icon: <Users className="w-8 h-8 text-[#d4af37]" />
            },
            {
              title: "Secure Operations",
              description: "End-to-end encrypted infrastructure ensuring data integrity, strict access control, and tamper-proof logs.",
              icon: <Shield className="w-8 h-8 text-[#d4af37]" />
            }
          ].map((feature, idx) => (
            <div key={idx} className="bg-white rounded-3xl p-8 shadow-xl border border-gray-100 hover:-translate-y-2 hover:shadow-2xl transition-all duration-300 group cursor-default relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-gray-50 rounded-bl-full -z-10 group-hover:bg-[#004d25]/5 transition-colors duration-500"></div>
              <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center mb-6 group-hover:bg-[#004d25]/10 group-hover:scale-110 transition-all duration-300 shadow-sm border border-gray-100">
                {feature.icon}
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">{feature.title}</h3>
              <p className="text-gray-600 leading-relaxed font-medium">{feature.description}</p>
            </div>
          ))}
        </div>
      </main>
      
      <footer className="relative z-10 border-t border-gray-200 bg-white py-8 text-center text-gray-500 text-sm font-medium ">
        {/* <p className="mb-4">&copy; {new Date().getFullYear()} Election Management System. All rights reserved.</p> */}


    <div className="absolute -bottom-7 p-4 mt-14 mb-2 sm:-bottom-12 left-0 right-0 w-full flex flex-col items-center  pointer-events-none">
  
  {/* Side-by-side flex block with precise margin-offsets to account for larger images */}
  <div className="flex flex-row items-center justify-center gap-0 px-1 -mb-10 sm:-mb-8 md:-mb-6 z-20">
    
    {/* Left: Text */}
    <p className="italic text-xs sm:text-sm text-yellow-600 whitespace-nowrap">
      Designed & Powered By
    </p>
    
    {/* Right: Logo - added negative margin-left (-ml-6) to cut through the image's empty space */}
    <img
      src={Rvtech}
      alt="RVTech"
      className="-ml-6 h-36 sm:h-36 md:h-40 object-contain filter brightness-[.15] sepia-[0.3] saturate-[3.5] hue-rotate-[25deg] contrast-[.1] drop-shadow-[0_0_8px_rgba(212,175,55,0.35)]"
    />
  </div>


</div>
      </footer>
    </div>
  );
}
