import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { Shield, Phone, Lock, ChevronRight, ArrowLeft, Eye, EyeOff, CheckCircle2, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';

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
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const { login } = useApp();
  const navigate = useNavigate();

  // TODO: re-enable password rules when ready
  // const ruleResults = useMemo(
  //   () => PASSWORD_RULES.map((r) => r.test(password)),
  //   [password]
  // );
  // const allRulesMet = ruleResults.every(Boolean);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    // TODO: uncomment when enforcing password rules
    // if (!allRulesMet) {
    //   toast.error('Password does not meet security requirements.');
    //   return;
    // }

    setIsLoading(true);
    try {
      await login(phone, password);
      toast.success('Login successful!');
      navigate('/dashboard');
    } catch (err: any) {
      toast.error(err.message || 'Invalid credentials. Please try again.');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-0 left-0 w-full h-64 bg-[#004d25] rounded-b-[50%] scale-x-150 transform -translate-y-24 z-0" />

      {/* Back Button */}
      <button
        onClick={() => navigate('/')}
        className="absolute top-6 left-6 sm:top-8 sm:left-8 z-20 flex items-center space-x-2 text-white/90 hover:text-white bg-black/10 hover:bg-black/20 px-4 py-2 rounded-full backdrop-blur-sm transition-all duration-300 cursor-pointer"
      >
        <ArrowLeft className="w-5 h-5" />
        <span className="font-medium text-sm">Back to Home</span>
      </button>

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="flex justify-center">
          <div className="w-20 h-20 bg-[#d4af37] rounded-2xl flex items-center justify-center shadow-xl transform rotate-12">
            <Shield className="text-[#004d25] w-12 h-12 -rotate-12" />
          </div>
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900 tracking-tight">
          EagleEye 2027
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Secure Election Management System
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="bg-white py-8 px-4 shadow-2xl sm:rounded-xl sm:px-10 border border-gray-100">
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

              {/* TODO: re-enable live strength checklist when enforcing password rules */}
              {/* {passwordTouched && (
                <ul className="mt-3 space-y-1.5">
                  {PASSWORD_RULES.map((rule, i) => {
                    const met = ruleResults[i];
                    return (
                      <li
                        key={rule.label}
                        className={`flex items-center gap-2 text-xs font-medium transition-colors duration-200 ${
                          met ? 'text-emerald-600' : 'text-gray-400'
                        }`}
                      >
                        {met ? (
                          <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-500" />
                        ) : (
                          <XCircle className="w-4 h-4 flex-shrink-0 text-gray-300" />
                        )}
                        {rule.label}
                      </li>
                    );
                  })}
                </ul>
              )} */}
            </div>

            {/* Submit */}
            <div>
              <button
                id="login-submit-btn"
                type="submit"
                disabled={isLoading}
                className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-[#004d25] bg-[#d4af37] hover:bg-[#c4a030] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#d4af37] transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
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
  );
}
