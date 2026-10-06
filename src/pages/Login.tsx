import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { Shield, Phone, Lock, ChevronRight, ArrowLeft, Eye, EyeOff, CheckCircle2, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { getFriendlyErrorMessage } from '../lib/utils';
import Rvtech from "../assets/RVCTECH.png";
import { getBrandConfig } from '../lib/branding';

interface PasswordRule {
  label: string;
  test: (pw: string) => boolean;
}

const PASSWORD_RULES: PasswordRule[] = [
  { label: 'At least 8 characters',    test: (pw) => pw.length >= 8 },
  { label: 'One uppercase letter (A–Z)', test: (pw) => /[A-Z]/.test(pw) },
  { label: 'One lowercase letter (a–z)', test: (pw) => /[a-z]/.test(pw) },
  { label: 'One number (0–9)',           test: (pw) => /\d/.test(pw) },
];

export default function Login() {
  const brand = getBrandConfig();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const { login, user } = useApp();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (user) {
      const destination = (location.state as any)?.from || '/dashboard';
      navigate(destination, { replace: true });
    }
  }, [user, navigate, location.state]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    setIsLoading(true);
    try {
      await login(phone, password);
      toast.success('Login successful!');
      const destination = (location.state as any)?.from || '/dashboard';
      navigate(destination, { replace: true });
    } catch (err: any) {
      toast.error(getFriendlyErrorMessage(err));
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-between py-6 sm:py-10 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-0 left-0 w-full h-80 sm:h-96 bg-[#004d25] rounded-b-[40%] scale-x-150 transform -translate-y-16 z-0 shadow-lg" />

      <div className="flex-1 flex flex-col justify-center my-auto relative z-10 pt-4 pb-4">
        {/* Logo & Title */}
        <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
          <div className="flex justify-center items-center">
            {brand.logoUrl ? (
              <div className="bg-white p-3 rounded-2xl shadow-xl border border-white/40 max-w-[260px] sm:max-w-[300px]">
                <img 
                  src={brand.logoUrl} 
                  alt={brand.appName} 
                  className="h-14 sm:h-16 w-auto object-contain mx-auto"
                />
              </div>
            ) : (
              <div className="w-18 h-18 sm:w-20 sm:h-20 bg-[#d4af37] rounded-2xl flex items-center justify-center shadow-xl transform rotate-12">
                <Shield className="text-[#004d25] w-10 h-10 sm:w-12 sm:h-12 -rotate-12" />
              </div>
            )}
          </div>

          <h2 className="mt-5 text-center text-2xl sm:text-3xl font-extrabold text-white tracking-tight drop-shadow-sm">
            {brand.appName}
          </h2>
          <p className="mt-1 text-center text-xs sm:text-sm text-green-100/90 font-medium px-4">
            {brand.subtitle}
          </p>
        </div>

        {/* Login Card */}
        <div className="mt-6 sm:mt-8 mx-4 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white py-8 px-6 sm:px-10 shadow-xl rounded-2xl border border-gray-100">
            <form className="space-y-6" onSubmit={handleLogin}>

            {/* Phone */}
            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-gray-700">
                Phone Number
              </label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Phone className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="focus:ring-[#004d25] focus:border-[#004d25] block w-full pl-10 sm:text-sm border-gray-300 rounded-md py-3 border"
                  placeholder="0801 234 5678"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (!passwordTouched) setPasswordTouched(true);
                  }}
                  className="focus:ring-[#004d25] focus:border-[#004d25] block w-full pl-10 pr-10 sm:text-sm border-gray-300 rounded-md py-3 border"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 cursor-pointer"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {/* Submit */}
            <div>
              <button
                id="login-submit-btn"
                type="submit"
                disabled={isLoading}
                className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-semibold text-[#004d25] bg-[#d4af37] hover:bg-[#c4a030] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#d4af37] transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer active:scale-98"
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-[#004d25] border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    Secure Login <ChevronRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
      </div>

      {/* Footer from mainpage */}
      <footer className="relative z-10 w-full pt-2 pb-1 flex justify-center items-center pointer-events-none">
        <div className="flex flex-row items-center justify-center gap-0 px-1 -mb-6 sm:-mb-8">
          <p className="italic text-xs sm:text-sm text-yellow-600 whitespace-nowrap">
            Designed & Powered By
          </p>
          <img
            src={Rvtech}
            alt="RVTech"
            className="-ml-6 h-32 sm:h-36 object-contain filter brightness-[.15] sepia-[0.3] saturate-[3.5] hue-rotate-[25deg] contrast-[.1] drop-shadow-[0_0_8px_rgba(212,175,55,0.35)]"
          />
        </div>
      </footer>
    </div>
  );
}
