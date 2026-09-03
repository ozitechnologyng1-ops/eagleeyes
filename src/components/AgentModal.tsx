import React, { useState, useEffect } from 'react';
import { useApp, Agent, Location, Role } from '../context/AppContext';
import { X, Upload, Loader2, Eye, EyeOff, Lock, Unlock, Camera, Trash2, RefreshCw, Check, AlertCircle, ChevronRight, ShieldCheck } from 'lucide-react';
import { cn } from '../lib/utils';

interface AgentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (agent: Partial<Agent>) => void;
  initialData?: Partial<Agent>;
  fixedLocation?: Location;
  locations: Location[];
  userRole: Role;
}

export default function AgentModal({ isOpen, onClose, onSave, initialData, fixedLocation, locations, userRole }: AgentModalProps) {
  const { user } = useApp();
  const [tab, setTab] = useState<'personal' | 'jurisdiction'>('personal');
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState<Partial<Agent>>({
    firstName: '',
    lastName: '',
    phone: '',
    picture: '',
    bankName: '',
    accountName: '',
    accountNumber: '',
    locationId: '',
    role: 'pu_agent'
  });

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isPasswordChangeEnabled, setIsPasswordChangeEnabled] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  // Camera capture state
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);

  const startCamera = async () => {
    setCameraError('');
    setIsCameraActive(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 640 }
        },
        audio: false
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err: any) {
      console.error('Camera error:', err);
      setCameraError('Camera access denied or unavailable. You can upload an image file instead.');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
    setCameraError('');
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    const width = video.videoWidth || 640;
    const height = video.videoHeight || 640;
    const size = Math.min(width, height);
    canvas.width = 400;
    canvas.height = 400;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const startX = (width - size) / 2;
      const startY = (height - size) / 2;
      ctx.drawImage(video, startX, startY, size, size, 0, 0, 400, 400);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      setForm(prev => ({ ...prev, picture: dataUrl }));
    }
    stopCamera();
  };

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      let defaultLocId = '';
      if (initialData?.locationId) {
        defaultLocId = initialData.locationId;
      } else if (fixedLocation?.id) {
        defaultLocId = fixedLocation.id;
      } else if (user) {
        defaultLocId = user.puId ? `pu_${user.puId}`
                     : user.wardId ? `ward_${user.wardId}`
                     : user.lgaId ? `lga_${user.lgaId}`
                     : user.stateId ? `state_${user.stateId}` : '';
      }

      // Robust prefill for first name, last name, and profile picture
      const rawName = initialData?.name?.trim() || '';
      const nameParts = rawName ? rawName.split(/\s+/) : [];
      const prefilledFirst = initialData?.firstName || (nameParts.length > 0 ? nameParts[0] : '');
      const prefilledLast = initialData?.lastName || (nameParts.length > 1 ? nameParts.slice(1).join(' ') : '');
      const prefilledPic = initialData?.picture || (initialData as any)?.profile_picture_url || '';

      setForm({
        firstName: prefilledFirst,
        lastName: prefilledLast,
        phone: initialData?.phone || '',
        picture: prefilledPic,
        bankName: initialData?.bankName || '',
        accountName: initialData?.accountName || '',
        accountNumber: initialData?.accountNumber || '',
        locationId: defaultLocId,
        role: initialData?.role || 'pu_agent'
      });
      setPassword('');
      setConfirmPassword('');
      setShowPassword(false);
      setShowConfirmPassword(false);
      setIsPasswordChangeEnabled(false);
      setPasswordError('');
      setTab('personal');
    }
  }, [isOpen, initialData, fixedLocation, user]);

  useEffect(() => {
    // Auto-fill account name if empty
    if (!form.accountName && (form.firstName || form.lastName)) {
      setForm(prev => ({ ...prev, accountName: `${prev.firstName || ''} ${prev.lastName || ''}`.trim() }));
    }
  }, [form.firstName, form.lastName]);

  const commonWeakPasswords = new Set([
    '123456', '1234567', '12345678', '123456789', 'password', 'qwerty',
    '111111', '000000', '222222', '333333', '444444', '555555',
    '666666', '777777', '888888', '999999', '123123', 'admin123',
    'abcdef', 'pass123', 'secret'
  ]);

  const validatePasswordStrength = (pwd: string): string | null => {
    if (!pwd || pwd.trim().length === 0) {
      return 'Password is required';
    }
    if (pwd.length < 6) {
      return 'Password must be at least 6 characters long';
    }
    const lower = pwd.toLowerCase();
    if (commonWeakPasswords.has(lower)) {
      return 'This password is too common and weak (e.g. 123456). Please choose a stronger password.';
    }
    if (/^(.)\1+$/.test(pwd)) {
      return 'Password cannot be all the same character';
    }
    const hasLetters = /[a-zA-Z]/.test(pwd);
    const hasNumbers = /[0-9]/.test(pwd);
    if (!hasLetters || !hasNumbers) {
      return 'Password must include both letters and numbers (e.g. Agent2027)';
    }
    return null;
  };

  const getPasswordStrength = (pwd: string) => {
    if (!pwd) return { score: 0, label: '', color: 'bg-gray-200', text: 'text-gray-400', isSecure: false };
    const err = validatePasswordStrength(pwd);
    if (err) {
      return { score: 1, label: 'Weak', color: 'bg-red-500', text: 'text-red-600', isSecure: false };
    }
    const hasSymbolsOrUpper = /[^a-zA-Z0-9]|[A-Z]/.test(pwd);
    if (pwd.length >= 8 && hasSymbolsOrUpper) {
      return { score: 3, label: 'Strong', color: 'bg-green-500', text: 'text-green-600', isSecure: true };
    }
    return { score: 2, label: 'Good', color: 'bg-amber-500', text: 'text-amber-600', isSecure: true };
  };

  const isDev = import.meta.env.DEV;

  const handleNextTab = () => {
    if (!form.firstName?.trim()) {
      setPasswordError("Please enter the agent's first name");
      return;
    }
    if (!form.lastName?.trim()) {
      setPasswordError("Please enter the agent's last name");
      return;
    }
    if (!form.phone?.trim()) {
      setPasswordError("Please enter the agent's phone number");
      return;
    }

    if (!initialData?.id) {
      if (!password || password.trim().length === 0) {
        setPasswordError('Password is required');
        return;
      }
      if (!isDev) {
        // Full strength check only in production
        if (password.length < 6) {
          setPasswordError('Password must be at least 6 characters long');
          return;
        }
        const pwdError = validatePasswordStrength(password);
        if (pwdError) {
          setPasswordError(pwdError);
          return;
        }
      }
      if (!confirmPassword) {
        setPasswordError('Please confirm the password');
        return;
      }
      if (password !== confirmPassword) {
        setPasswordError('Passwords do not match');
        return;
      }
    } else if (isPasswordChangeEnabled) {
      if (!password || password.trim().length === 0) {
        setPasswordError('Password is required');
        return;
      }
      if (!isDev) {
        // Full strength check only in production
        if (password.length < 6) {
          setPasswordError('Password must be at least 6 characters long');
          return;
        }
        const pwdError = validatePasswordStrength(password);
        if (pwdError) {
          setPasswordError(pwdError);
          return;
        }
      }
      if (!confirmPassword) {
        setPasswordError('Please confirm the new password');
        return;
      }
      if (password !== confirmPassword) {
        setPasswordError('Passwords do not match');
        return;
      }
    }

    setPasswordError('');
    setTab('jurisdiction');
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Password validation for new agent registration
    if (!initialData?.id) {
      const pwdError = validatePasswordStrength(password);
      if (pwdError) {
        setPasswordError(pwdError);
        setTab('personal');
        return;
      }
      if (!confirmPassword) {
        setPasswordError('Please confirm the password');
        setTab('personal');
        return;
      }
      if (password !== confirmPassword) {
        setPasswordError('Passwords do not match');
        setTab('personal');
        return;
      }
    } else if (isPasswordChangeEnabled) {
      const pwdError = validatePasswordStrength(password);
      if (pwdError) {
        setPasswordError(pwdError);
        setTab('personal');
        return;
      }
      if (!confirmPassword) {
        setPasswordError('Please confirm the new password');
        setTab('personal');
        return;
      }
      if (password !== confirmPassword) {
        setPasswordError('Passwords do not match');
        setTab('personal');
        return;
      }
    }

    setIsSaving(true);
    try {
      const finalRole = (form.role || userRole) as Role;
      const savePayload: any = {
        ...form,
        name: `${form.firstName} ${form.lastName}`.trim(),
        role: finalRole,
        status: initialData?.status || 'active'
      };

      if ((!initialData?.id && password) || (isPasswordChangeEnabled && password)) {
        savePayload.password = password;
      }

      await onSave(savePayload);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-4 border-b border-gray-100 bg-[#004d25] text-white flex justify-between items-center">
          <div>
            <h3 className="font-bold text-lg">{initialData?.id ? 'Edit Agent' : 'Register Agent'}</h3>
            {fixedLocation && <p className="text-xs text-green-100">Assigning to {fixedLocation.name}</p>}
          </div>
          <button onClick={onClose} className="text-green-100 hover:text-white">
            <X size={20} />
          </button>
        </div>
        
        <div className="flex border-b border-gray-200">
          <button 
            type="button"
            onClick={() => setTab('personal')}
            className={cn("flex-1 py-3 text-sm font-medium text-center border-b-2 transition-colors", tab === 'personal' ? "border-[#004d25] text-[#004d25]" : "border-transparent text-gray-500 hover:text-gray-700")}
          >
            Personal
          </button>
          <button 
            type="button"
            onClick={() => {
              if (tab === 'personal') {
                handleNextTab();
              } else {
                setTab('jurisdiction');
              }
            }}
            className={cn("flex-1 py-3 text-sm font-medium text-center border-b-2 transition-colors cursor-pointer", tab === 'jurisdiction' ? "border-[#004d25] text-[#004d25]" : "border-transparent text-gray-500 hover:text-gray-700")}
          >
            Jurisdiction
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          {tab === 'personal' ? (
            <div className="space-y-4">
              {/* Photo Area: Snap Camera or File Upload */}
              {isCameraActive ? (
                <div className="bg-black/95 rounded-xl p-4 text-white flex flex-col items-center space-y-3 animate-in fade-in zoom-in-95 duration-200">
                  <div className="relative w-52 h-52 rounded-xl overflow-hidden border-2 border-[#d4af37] bg-black shadow-inner flex items-center justify-center">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                    />
                    {/* Portrait guide circle */}
                    <div className="absolute inset-4 rounded-full border-2 border-dashed border-white/60 pointer-events-none" />
                  </div>

                  {cameraError ? (
                    <div className="text-center text-xs text-red-300 px-2">{cameraError}</div>
                  ) : (
                    <p className="text-xs text-gray-300">Position face within the circle, then click Snap</p>
                  )}

                  <div className="flex items-center gap-3 pt-1">
                    <button
                      type="button"
                      onClick={capturePhoto}
                      disabled={!!cameraError}
                      className="flex items-center gap-2 bg-[#004d25] hover:bg-[#006331] text-white px-4 py-2 rounded-lg font-semibold text-xs shadow-md transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                    >
                      <Camera size={15} />
                      <span>Snap Photo</span>
                    </button>
                    <button
                      type="button"
                      onClick={stopCamera}
                      className="flex items-center gap-1.5 bg-gray-700 hover:bg-gray-600 text-white px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer"
                    >
                      <X size={14} />
                      <span>Cancel</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center mb-3">
                  <div className="relative">
                    <div className="w-24 h-24 rounded-full bg-gray-100 border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden shadow-inner">
                      {form.picture ? (
                        <img src={form.picture} alt="Profile" className="w-full h-full object-cover" />
                      ) : (
                        <Upload className="text-gray-400" size={24} />
                      )}
                    </div>

                    {form.picture && (
                      <button
                        type="button"
                        onClick={() => setForm(prev => ({ ...prev, picture: '' }))}
                        className="absolute -top-1 -right-1 bg-red-500 hover:bg-red-600 text-white p-1 rounded-full shadow-md cursor-pointer transition-colors"
                        title="Remove photo"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>

                  {/* Action buttons: Snap Photo & Upload File */}
                  <div className="flex items-center gap-2 mt-2.5">
                    <button
                      type="button"
                      onClick={startCamera}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-[#004d25] text-white text-xs font-semibold rounded-lg hover:bg-[#006331] shadow-xs transition-colors cursor-pointer"
                    >
                      <Camera size={13} />
                      <span>Snap Photo</span>
                    </button>

                    <label className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer">
                      <Upload size={13} />
                      <span>Upload File</span>
                      <input 
                        type="file" 
                        accept="image/*" 
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            const reader = new FileReader();
                            reader.onload = (e) => setForm(prev => ({ ...prev, picture: e.target?.result as string }));
                            reader.readAsDataURL(e.target.files[0]);
                          }
                        }}
                      />
                    </label>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                  <input required type="text" value={form.firstName} onChange={e => setForm({...form, firstName: e.target.value})} className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-[#004d25]" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                  <input required type="text" value={form.lastName} onChange={e => setForm({...form, lastName: e.target.value})} className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-[#004d25]" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                <input required type="tel" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-[#004d25]" />
              </div>

              {/* Password Section */}
              {!initialData?.id ? (
                // Registration mode: Password and Confirm Password with view/hide toggles
                <div className="space-y-3 pt-1 border-t border-gray-100">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Password <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        required
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={e => { setPassword(e.target.value); setPasswordError(''); }}
                        placeholder="Create strong password (min. 6 characters, e.g. Agent2027)"
                        className="w-full border border-gray-300 rounded-lg p-2 pr-10 focus:ring-2 focus:ring-[#004d25]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer p-1"
                        title={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Confirm Password <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        required
                        type={showConfirmPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={e => { setConfirmPassword(e.target.value); setPasswordError(''); }}
                        placeholder="Confirm password"
                        className="w-full border border-gray-300 rounded-lg p-2 pr-10 focus:ring-2 focus:ring-[#004d25]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer p-1"
                        title={showConfirmPassword ? "Hide password" : "Show password"}
                      >
                        {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>

                  {/* Live Strength & Match Indicator */}
                  {password && (
                    <div className="space-y-1.5 pt-1 bg-gray-50/70 p-2.5 rounded-lg border border-gray-100">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-500 text-[11px] font-medium">Password Strength:</span>
                        <span className={cn("text-[11px] font-bold", getPasswordStrength(password).text)}>
                          {getPasswordStrength(password).label}
                        </span>
                      </div>
                      {/* Strength segments */}
                      <div className="grid grid-cols-3 gap-1.5 h-1.5 w-full">
                        <div className={cn("rounded-full h-full transition-colors duration-300", getPasswordStrength(password).score >= 1 ? getPasswordStrength(password).color : "bg-gray-200")} />
                        <div className={cn("rounded-full h-full transition-colors duration-300", getPasswordStrength(password).score >= 2 ? getPasswordStrength(password).color : "bg-gray-200")} />
                        <div className={cn("rounded-full h-full transition-colors duration-300", getPasswordStrength(password).score >= 3 ? getPasswordStrength(password).color : "bg-gray-200")} />
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-[11px]">
                        <span className={cn("flex items-center gap-1 font-medium", password.length >= 6 ? "text-green-600" : "text-gray-400")}>
                          <Check size={12} className={password.length >= 6 ? "text-green-600" : "text-gray-300"} />
                          Min 6 characters
                        </span>
                        <span className={cn("flex items-center gap-1 font-medium", (/[a-zA-Z]/.test(password) && /[0-9]/.test(password)) ? "text-green-600" : "text-gray-400")}>
                          <Check size={12} className={(/[a-zA-Z]/.test(password) && /[0-9]/.test(password)) ? "text-green-600" : "text-gray-300"} />
                          Letters & numbers
                        </span>
                        {confirmPassword && (
                          <span className={cn("flex items-center gap-1 font-medium ml-auto", password === confirmPassword ? "text-green-600" : "text-red-500")}>
                            {password === confirmPassword ? <Check size={12} /> : <AlertCircle size={12} />}
                            {password === confirmPassword ? "Passwords match" : "Passwords do not match"}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {passwordError && (
                    <div className="flex items-center gap-2 text-xs text-red-600 font-medium bg-red-50 p-2.5 rounded-lg border border-red-200 animate-in fade-in">
                      <AlertCircle size={15} className="shrink-0 text-red-500" />
                      <span>{passwordError}</span>
                    </div>
                  )}
                </div>
              ) : (
                // Edit mode: Disabled by default with toggle button to enable changes
                <div className="space-y-3 pt-2 border-t border-gray-100">
                  <div className="flex items-center justify-between">
                    <label className="block text-sm font-medium text-gray-700">
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setIsPasswordChangeEnabled(!isPasswordChangeEnabled);
                        if (isPasswordChangeEnabled) {
                          setPassword('');
                          setConfirmPassword('');
                          setPasswordError('');
                        }
                      }}
                      className={cn(
                        "flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-md transition-colors cursor-pointer",
                        isPasswordChangeEnabled 
                          ? "bg-amber-100 text-amber-800 hover:bg-amber-200" 
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      )}
                    >
                      {isPasswordChangeEnabled ? (
                        <>
                          <Unlock size={13} className="text-amber-600" />
                          <span>Cancel Change</span>
                        </>
                      ) : (
                        <>
                          <Lock size={13} className="text-gray-500" />
                          <span>Change Password</span>
                        </>
                      )}
                    </button>
                  </div>

                  {isPasswordChangeEnabled ? (
                    <div className="space-y-3 bg-amber-50/50 p-3 rounded-lg border border-amber-100 animate-in fade-in duration-200">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">New Password</label>
                        <div className="relative">
                          <input
                            type={showPassword ? "text" : "password"}
                            value={password}
                            onChange={e => { setPassword(e.target.value); setPasswordError(''); }}
                            placeholder="Enter new strong password (min. 6 characters)"
                            className="w-full border border-gray-300 rounded-lg p-2 pr-10 focus:ring-2 focus:ring-[#004d25] bg-white text-sm"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer p-1"
                          >
                            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Confirm New Password</label>
                        <div className="relative">
                          <input
                            type={showConfirmPassword ? "text" : "password"}
                            value={confirmPassword}
                            onChange={e => { setConfirmPassword(e.target.value); setPasswordError(''); }}
                            placeholder="Confirm new password"
                            className="w-full border border-gray-300 rounded-lg p-2 pr-10 focus:ring-2 focus:ring-[#004d25] bg-white text-sm"
                          />
                          <button
                            type="button"
                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer p-1"
                          >
                            {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                      </div>

                      {/* Live Strength & Match Indicator for Edit Mode */}
                      {password && (
                        <div className="space-y-1.5 pt-1 bg-white p-2.5 rounded-lg border border-amber-200">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-500 text-[11px] font-medium">Password Strength:</span>
                            <span className={cn("text-[11px] font-bold", getPasswordStrength(password).text)}>
                              {getPasswordStrength(password).label}
                            </span>
                          </div>
                          <div className="grid grid-cols-3 gap-1.5 h-1.5 w-full">
                            <div className={cn("rounded-full h-full transition-colors duration-300", getPasswordStrength(password).score >= 1 ? getPasswordStrength(password).color : "bg-gray-200")} />
                            <div className={cn("rounded-full h-full transition-colors duration-300", getPasswordStrength(password).score >= 2 ? getPasswordStrength(password).color : "bg-gray-200")} />
                            <div className={cn("rounded-full h-full transition-colors duration-300", getPasswordStrength(password).score >= 3 ? getPasswordStrength(password).color : "bg-gray-200")} />
                          </div>

                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-[11px]">
                            <span className={cn("flex items-center gap-1 font-medium", password.length >= 6 ? "text-green-600" : "text-gray-400")}>
                              <Check size={12} className={password.length >= 6 ? "text-green-600" : "text-gray-300"} />
                              Min 6 characters
                            </span>
                            <span className={cn("flex items-center gap-1 font-medium", (/[a-zA-Z]/.test(password) && /[0-9]/.test(password)) ? "text-green-600" : "text-gray-400")}>
                              <Check size={12} className={(/[a-zA-Z]/.test(password) && /[0-9]/.test(password)) ? "text-green-600" : "text-gray-300"} />
                              Letters & numbers
                            </span>
                            {confirmPassword && (
                              <span className={cn("flex items-center gap-1 font-medium ml-auto", password === confirmPassword ? "text-green-600" : "text-red-500")}>
                                {password === confirmPassword ? <Check size={12} /> : <AlertCircle size={12} />}
                                {password === confirmPassword ? "Passwords match" : "Passwords do not match"}
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      {passwordError && (
                        <div className="flex items-center gap-2 text-xs text-red-600 font-medium bg-red-50 p-2.5 rounded-lg border border-red-200 animate-in fade-in">
                          <AlertCircle size={15} className="shrink-0 text-red-500" />
                          <span>{passwordError}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div>
                      <input
                        disabled
                        type="password"
                        value="••••••••••••"
                        className="w-full border border-gray-200 rounded-lg p-2 bg-gray-50 text-gray-400 cursor-not-allowed select-none text-sm"
                      />
                      <p className="text-[11px] text-gray-400 mt-1 flex items-center gap-1">
                        <Lock size={11} /> Password is encrypted and hidden. Click &quot;Change Password&quot; to update.
                      </p>
                    </div>
                  )}
                </div>
              )}
              
              <div className="pt-4 flex justify-end">
                <button 
                  type="button" 
                  onClick={handleNextTab} 
                  className="px-5 py-2.5 bg-[#004d25] hover:bg-[#006331] text-white text-sm font-semibold rounded-lg shadow-sm transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <span>Next: Jurisdiction</span>
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <JurisdictionSelector 
                locations={locations} 
                selectedLocationId={form.locationId || ''} 
                onChange={(id, details) => setForm({...form, locationId: id, ...details})} 
                fixedLocation={fixedLocation}
                user={user}
              />
              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setTab('personal')} className="px-4 py-2 border rounded-lg hover:bg-gray-50 cursor-pointer">Back</button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 px-4 py-2 bg-[#004d25] text-white rounded-lg hover:bg-[#006331] disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2 transition-colors"
                >
                  {isSaving ? (
                    <><Loader2 size={16} className="animate-spin" /> {initialData?.id ? 'Saving...' : 'Registering...'}</>
                  ) : (
                    initialData?.id ? 'Save Changes' : 'Register Agent'
                  )}
                </button>
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

import { supabase } from '../lib/supabase';

function JurisdictionSelector({ locations, selectedLocationId, onChange, fixedLocation, user }: { locations: Location[], selectedLocationId: string, onChange: (id: string, details: any) => void, fixedLocation?: Location, user: any }) {
  const [states, setStates] = useState<any[]>([]);
  const [lgas, setLgas] = useState<any[]>([]);
  const [wards, setWards] = useState<any[]>([]);
  const [pus, setPus] = useState<any[]>([]);

  const [selectedState, setSelectedState] = useState('');
  const [selectedLga, setSelectedLga] = useState('');
  const [selectedWard, setSelectedWard] = useState('');
  const [selectedPu, setSelectedPu] = useState('');
  const [loading, setLoading] = useState(false);

  // Initialize data
  useEffect(() => {
    supabase.from('states').select('id,name').order('name').then(({ data }) => setStates(data || []));
  }, []);

  // When selectedLocationId changes externally (or initially), try to reconstruct the path
  useEffect(() => {
    if (!selectedLocationId) return;
    
    // If it's a fixed location from the tree, we still want to resolve its parents
    // to populate the locked dropdowns.
    
    // We would need to resolve the path if not provided by predefined fields,
    // but in many cases selectedLocationId is set from the top down.
    // Setting up the initial path perfectly would require reverse lookups:
    const resolvePath = async () => {
      let st = '', lg = '', wd = '', pu = '';
      if (selectedLocationId.startsWith('state_')) st = selectedLocationId.replace('state_', '');
      else if (selectedLocationId.startsWith('lga_')) {
        lg = selectedLocationId.replace('lga_', '');
        const isLagosLGA = user?.stateId === 24 || (parseInt(lg) <= 20);
        const table = isLagosLGA ? 'local_governments_lagos' : 'local_governments';
        const { data } = await supabase.from(table).select('state_id').eq('id', lg).single();
        if (data) st = data.state_id?.toString() || '';
      }
      else if (selectedLocationId.startsWith('ward_')) {
        wd = selectedLocationId.replace('ward_', '');
        const isLagosWard = user?.stateId === 24 || (parseInt(wd) < 1000);
        if (isLagosWard) {
          const { data: wData } = await supabase.from('wards_lagos').select('localgovernment_lagos_id').eq('id', wd).single();
          if (wData?.localgovernment_lagos_id) {
            lg = wData.localgovernment_lagos_id.toString();
            st = '24';
          }
        } else {
          const { data: wData } = await supabase.from('wards').select('localgovernment_id').eq('id', wd).single();
          if (wData?.localgovernment_id) {
            lg = wData.localgovernment_id.toString();
            const { data: lData } = await supabase.from('local_governments').select('state_id').eq('id', lg).single();
            if (lData) st = lData.state_id?.toString() || '';
          }
        }
      }
      else if (selectedLocationId.startsWith('pu_')) {
        pu = selectedLocationId.replace('pu_', '');
        const { data: lagosPu } = await supabase.from('polling_units_lagos').select('id, ward_id, localgovernment_id').eq('id', pu).single();
        if (lagosPu) {
          pu = lagosPu.id.toString();
          wd = lagosPu.ward_id.toString();
          lg = lagosPu.localgovernment_id.toString();
          st = '24';
        } else {
          const { data: pData } = await supabase.from('polling_units').select('ward_id').eq('id', pu).single();
          if (pData?.ward_id) {
            wd = pData.ward_id.toString();
            const { data: wData } = await supabase.from('wards').select('localgovernment_id').eq('id', wd).single();
            if (wData?.localgovernment_id) {
              lg = wData.localgovernment_id.toString();
              const { data: lData } = await supabase.from('local_governments').select('state_id').eq('id', lg).single();
              if (lData) st = lData.state_id?.toString() || '';
            }
          }
        }
      }
      
      setSelectedState(st);
      const isLagos = st === '24' || user?.stateId === 24;
      if (st) {
        const table = isLagos ? 'local_governments_lagos' : 'local_governments';
        supabase.from(table).select('id,name').eq('state_id', st).order('name').then(res => setLgas(res.data || []));
      }
      setSelectedLga(lg);
      if (lg) {
        const table = isLagos ? 'wards_lagos' : 'wards';
        const filterCol = isLagos ? 'localgovernment_lagos_id' : 'localgovernment_id';
        supabase.from(table).select('id,name').eq(filterCol, lg).order('name').then(res => setWards(res.data || []));
      }
      setSelectedWard(wd);
      if (wd) {
        const table = isLagos ? 'polling_units_lagos' : 'polling_units';
        supabase.from(table).select('id,name').eq('ward_id', wd).order('name').then(res => setPus(res.data || []));
      }
      setSelectedPu(pu);

      // CRITICAL: Sync the resolved hierarchy back to the parent form
      onChange(selectedLocationId, {
        stateId: st ? parseInt(st) : null,
        lgaId: lg ? parseInt(lg) : null,
        wardId: wd ? parseInt(wd) : null,
        puId: pu ? parseInt(pu) : null
      });
    };

    resolvePath();
  }, [selectedLocationId, fixedLocation]);

  const isLagos = selectedState === '24' || user?.stateId === 24;

  const handleStateChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSelectedState(val);
    setSelectedLga('');
    setSelectedWard('');
    setSelectedPu('');
    setLgas([]); setWards([]); setPus([]);
    onChange(val ? `state_${val}` : '', {
      stateId: val ? parseInt(val) : null,
      lgaId: null,
      wardId: null,
      puId: null
    });
    
    if (val) {
      setLoading(true);
      const table = val === '24' ? 'local_governments_lagos' : 'local_governments';
      const { data } = await supabase.from(table).select('id,name').eq('state_id', val).order('name');
      setLgas(data || []);
      setLoading(false);
    }
  };

  const handleLgaChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSelectedLga(val);
    setSelectedWard('');
    setSelectedPu('');
    setWards([]); setPus([]);
    onChange(val ? `lga_${val}` : (selectedState ? `state_${selectedState}` : ''), {
      stateId: selectedState ? parseInt(selectedState) : null,
      lgaId: val ? parseInt(val) : null,
      wardId: null,
      puId: null
    });
    
    if (val) {
      setLoading(true);
      const table = isLagos ? 'wards_lagos' : 'wards';
      const filterCol = isLagos ? 'localgovernment_lagos_id' : 'localgovernment_id';
      const { data } = await supabase.from(table).select('id,name').eq(filterCol, val).order('name');
      setWards(data || []);
      setLoading(false);
    }
  };

  const handleWardChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSelectedWard(val);
    setSelectedPu('');
    setPus([]);
    onChange(val ? `ward_${val}` : (selectedLga ? `lga_${selectedLga}` : ''), {
      stateId: selectedState ? parseInt(selectedState) : null,
      lgaId: selectedLga ? parseInt(selectedLga) : null,
      wardId: val ? parseInt(val) : null,
      puId: null
    });
    
    if (val) {
      setLoading(true);
      const table = isLagos ? 'polling_units_lagos' : 'polling_units';
      const { data } = await supabase.from(table).select('id,name').eq('ward_id', val).order('name');
      setPus(data || []);
      setLoading(false);
    }
  };

  const handlePuChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSelectedPu(val);
    onChange(val ? `pu_${val}` : (selectedWard ? `ward_${selectedWard}` : ''), {
      stateId: selectedState ? parseInt(selectedState) : null,
      lgaId: selectedLga ? parseInt(selectedLga) : null,
      wardId: selectedWard ? parseInt(selectedWard) : null,
      puId: val ? parseInt(val) : null
    });
  };

  const levelPriority = { 'national': 4, 'state': 3, 'lga': 2, 'ward': 1, 'pu': 0 };
  const fixedLevel = fixedLocation ? levelPriority[fixedLocation.type as keyof typeof levelPriority] : -1;

  const isStateDisabled = (fixedLevel >= 3) || (!!user?.stateId && user?.role !== 'national_admin');
  const isLgaDisabled = (fixedLevel >= 2) || (isStateDisabled && !!user?.lgaId && ['lga_admin', 'ward_admin', 'pu_agent'].includes(user?.role));
  const isWardDisabled = (fixedLevel >= 1) || (isLgaDisabled && !!user?.wardId && ['ward_admin', 'pu_agent'].includes(user?.role));
  const isPuDisabled = (fixedLevel >= 0) || (isWardDisabled && !!user?.puId && user?.role === 'pu_agent');

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
        <select value={selectedState} onChange={handleStateChange} disabled={isStateDisabled} className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-[#004d25] disabled:bg-gray-100 disabled:text-gray-500">
          <option value="">Select State...</option>
          {states.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </div>

      {(lgas.length > 0 || isStateDisabled) && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">LGA (Optional)</label>
          <select value={selectedLga} onChange={handleLgaChange} disabled={isLgaDisabled} className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-[#004d25] disabled:bg-gray-100 disabled:text-gray-500">
            <option value="">Select LGA...</option>
            {lgas.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
      )}

      {(wards.length > 0 || isLgaDisabled) && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Ward (Optional)</label>
          <select value={selectedWard} onChange={handleWardChange} disabled={isWardDisabled} className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-[#004d25] disabled:bg-gray-100 disabled:text-gray-500">
            <option value="">Select Ward...</option>
            {wards.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
      )}

      {(pus.length > 0 || isWardDisabled) && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Polling Unit (Optional)</label>
          <select value={selectedPu} onChange={handlePuChange} disabled={isPuDisabled} className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-[#004d25] disabled:bg-gray-100 disabled:text-gray-500">
            <option value="">Select PU...</option>
            {pus.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}
