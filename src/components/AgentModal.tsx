import React, { useState, useEffect } from 'react';
import { useApp, Agent, Location, Role } from '../context/AppContext';
import { X, Upload, Loader2, Eye, EyeOff, Lock, Unlock, Camera, Trash2, RefreshCw, Check, AlertCircle, ChevronRight, ShieldCheck, Landmark, CheckCircle, QrCode, Phone as PhoneIcon, MessageSquare, Copy } from 'lucide-react';
import { cn } from '../lib/utils';
import toast from 'react-hot-toast';
import { fetchBanks, verifyAccount, verifyNameMatch, checkAccountExistsInDb, PaystackBank } from '../lib/paystack';
import { greenApiService, WhatsAppInstance } from '../lib/greenApi';

export const getAvailableRoles = (userRole: Role): { role: Role; label: string }[] => {
  switch (userRole) {
    case 'national_admin':
      return [
        { role: 'state_admin', label: 'State Admin' },
        { role: 'lga_admin', label: 'LGA Coordinator' },
        { role: 'ward_admin', label: 'Ward Admin' },
        { role: 'pu_agent', label: 'Polling Unit Agent' }
      ];
    case 'state_admin':
      return [
        { role: 'ward_admin', label: 'Ward Admin' },
        { role: 'lga_admin', label: 'LGA Coordinator' },
        { role: 'pu_agent', label: 'Polling Unit Agent' }
      ];
    case 'lga_admin':
      return [
        { role: 'ward_admin', label: 'Ward Admin' },
        { role: 'pu_agent', label: 'Polling Unit Agent' }
      ];
    case 'ward_admin':
      return [
        { role: 'pu_agent', label: 'Polling Unit Agent' }
      ];
    default:
      return [{ role: 'pu_agent', label: 'Polling Unit Agent' }];
  }
};

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
  const availableRoles = getAvailableRoles(userRole);
  const [tab, setTab] = useState<'personal' | 'bank' | 'jurisdiction' | 'whatsapp'>('personal');
  const [isSaving, setIsSaving] = useState(false);
  const [waInstance, setWaInstance] = useState<WhatsAppInstance | null>(null);
  const [waQrData, setWaQrData] = useState<string | null>(null);
  const [waAuthCode, setWaAuthCode] = useState<string | null>(null);
  const [waPairingPhone, setWaPairingPhone] = useState('');
  const [waConnectMethod, setWaConnectMethod] = useState<'qr' | 'phone'>('qr');
  const [isWaConnected, setIsWaConnected] = useState(false);
  const [isCheckingWa, setIsCheckingWa] = useState(false);
  const [copiedWaCode, setCopiedWaCode] = useState(false);

  const handleCopyWaCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedWaCode(true);
    toast.success('Pairing code copied to clipboard!');
    setTimeout(() => setCopiedWaCode(false), 2000);
  };
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

  // Paystack bank verification state
  const [banksList, setBanksList] = useState<PaystackBank[]>([]);
  const [selectedBankCode, setSelectedBankCode] = useState('');
  const [isFetchingBanks, setIsFetchingBanks] = useState(false);
  const [isVerifyingAccount, setIsVerifyingAccount] = useState(false);
  const [bankVerificationError, setBankVerificationError] = useState('');
  const [isAccountVerified, setIsAccountVerified] = useState(false);

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

      let defaultRole: Role = 'pu_agent';
      if (initialData?.role) {
        defaultRole = initialData.role;
      } else if (fixedLocation) {
        if (fixedLocation.type === 'pu') defaultRole = 'pu_agent';
        else if (fixedLocation.type === 'ward') defaultRole = userRole === 'state_admin' ? 'ward_admin' : 'pu_agent';
        else if (fixedLocation.type === 'lga') defaultRole = 'ward_admin';
        else if (fixedLocation.type === 'state') defaultRole = 'state_admin';
      } else {
        if (userRole === 'ward_admin') defaultRole = 'pu_agent';
        else if (userRole === 'state_admin') defaultRole = 'ward_admin';
        else if (userRole === 'lga_admin') defaultRole = 'ward_admin';
        else if (userRole === 'national_admin') defaultRole = 'state_admin';
      }

      setForm({
        firstName: prefilledFirst,
        lastName: prefilledLast,
        phone: initialData?.phone || '',
        picture: prefilledPic,
        bankName: initialData?.bankName || '',
        accountName: initialData?.accountName || '',
        accountNumber: initialData?.accountNumber || '',
        locationId: defaultLocId,
        role: defaultRole
      });
      setPassword('');
      setConfirmPassword('');
      setShowPassword(false);
      setShowConfirmPassword(false);
      setIsPasswordChangeEnabled(false);
      setPasswordError('');
      const hasBank = Boolean(initialData?.bankName && initialData?.accountNumber);
      setIsAccountVerified(hasBank);
      setBankVerificationError('');
      setSelectedBankCode('');
      setTab('personal');
    }
  }, [isOpen, initialData, fixedLocation, user]);

  // Fetch banks from Paystack when entering bank tab
  useEffect(() => {
    if (isOpen && tab === 'bank' && banksList.length === 0) {
      setIsFetchingBanks(true);
      fetchBanks()
        .then(list => {
          setBanksList(list);
          if (form.bankName) {
            const match = list.find(b => b.name.toLowerCase() === form.bankName?.toLowerCase());
            if (match) setSelectedBankCode(match.code);
          }
        })
        .catch(err => {
          console.error('Failed to load banks list:', err);
        })
        .finally(() => setIsFetchingBanks(false));
    }
  }, [isOpen, tab, banksList.length, form.bankName]);

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

  const handleNextFromPersonal = () => {
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
    setTab('bank');
  };

  const handleVerifyBankInModal = async () => {
    if (!selectedBankCode) {
      setBankVerificationError('Please select a bank first.');
      return;
    }
    const cleanNum = form.accountNumber?.trim() || '';
    if (cleanNum.length !== 10 || !/^\d{10}$/.test(cleanNum)) {
      setBankVerificationError('Account number must be exactly 10 digits.');
      return;
    }

    setIsVerifyingAccount(true);
    setBankVerificationError('');

    try {
      // 1. Paystack resolve
      const result = await verifyAccount(cleanNum, selectedBankCode);
      const resolvedName = result.account_name;

      // 2. Check if already exists in DB
      const existsResult = await checkAccountExistsInDb(cleanNum, initialData?.id);
      if (existsResult.exists) {
        setBankVerificationError(`Bank account already exists in the system (registered to ${existsResult.registeredTo}).`);
        setIsAccountVerified(false);
        return;
      }

      // 3. Check name tallying with agent firstName or lastName
      const matchResult = verifyNameMatch(
        resolvedName,
        form.firstName,
        form.lastName,
        `${form.firstName || ''} ${form.lastName || ''}`.trim()
      );
      if (!matchResult.isMatch) {
        setBankVerificationError(
          matchResult.reason ||
          `Bank account name ("${resolvedName}") does not match agent name. Must match first name or last name.`
        );
        setIsAccountVerified(false);
        return;
      }

      const selectedBank = banksList.find(b => b.code === selectedBankCode);
      setForm(prev => ({
        ...prev,
        accountName: resolvedName,
        bankName: selectedBank?.name || prev.bankName,
        accountNumber: cleanNum
      }));
      setIsAccountVerified(true);
      setBankVerificationError('');
      toast.success(`Account verified: ${resolvedName}`);
    } catch (err: any) {
      setBankVerificationError(err.message || 'Could not verify account. Please check the bank and account number.');
      setIsAccountVerified(false);
    } finally {
      setIsVerifyingAccount(false);
    }
  };

  const handleNextFromBank = () => {
    const cleanNum = form.accountNumber?.trim() || '';
    if (cleanNum.length > 0 && !isAccountVerified) {
      // Discard unverified bank details so registration is not hindered
      setForm(prev => ({ ...prev, bankName: '', accountNumber: '', accountName: '' }));
      setSelectedBankCode('');
      setBankVerificationError('');
      toast('Unverified bank details discarded. You can complete them in the Payment section later.', { icon: 'ℹ️' });
    } else {
      setBankVerificationError('');
    }
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
      
      // If bank account was not verified, discard bank details so registration succeeds cleanly
      const finalBankDetails = isAccountVerified ? {
        bankName: form.bankName || '',
        accountNumber: form.accountNumber || '',
        accountName: form.accountName || ''
      } : {
        bankName: '',
        accountNumber: '',
        accountName: ''
      };

      const savePayload: any = {
        ...form,
        ...finalBankDetails,
        name: `${form.firstName} ${form.lastName}`.trim(),
        role: finalRole,
        status: initialData?.status || 'active'
      };

      if ((!initialData?.id && password) || (isPasswordChangeEnabled && password)) {
        savePayload.password = password;
      }

      await onSave(savePayload);
      if (!isAccountVerified) {
        toast('Agent registered! Remember to complete bank details in the Payment tab before stipend disbursement.', { duration: 5000, icon: '💡' });
      }
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
            className={cn("flex-1 py-3 text-xs md:text-sm font-medium text-center border-b-2 transition-colors cursor-pointer", tab === 'personal' ? "border-[#004d25] text-[#004d25]" : "border-transparent text-gray-500 hover:text-gray-700")}
          >
            Personal
          </button>
          <button 
            type="button"
            onClick={() => {
              if (tab === 'personal') {
                handleNextFromPersonal();
              } else {
                setTab('bank');
              }
            }}
            className={cn("flex-1 py-3 text-xs md:text-sm font-medium text-center border-b-2 transition-colors cursor-pointer", tab === 'bank' ? "border-[#004d25] text-[#004d25]" : "border-transparent text-gray-500 hover:text-gray-700")}
          >
            Bank Details
          </button>
          <button 
            type="button"
            onClick={() => {
              if (tab === 'personal') {
                handleNextFromPersonal();
              } else if (tab === 'bank') {
                handleNextFromBank();
              } else {
                setTab('jurisdiction');
              }
            }}
            className={cn("flex-1 py-3 text-xs md:text-sm font-medium text-center border-b-2 transition-colors cursor-pointer", tab === 'jurisdiction' ? "border-[#004d25] text-[#004d25]" : "border-transparent text-gray-500 hover:text-gray-700")}
          >
            Jurisdiction
          </button>
          <button 
            type="button"
            onClick={async () => {
              setTab('whatsapp');
              if (!waInstance) {
                const stateId = user?.stateId || 24;
                const inst = await greenApiService.getStandbyInstance(stateId);
                if (inst) {
                  setWaInstance(inst);
                  const qrRes = await greenApiService.getQRCode(inst.id);
                  if (qrRes?.message) setWaQrData(qrRes.message);
                }
              }
            }}
            className={cn("flex-1 py-3 text-xs md:text-sm font-medium text-center border-b-2 transition-colors cursor-pointer flex items-center justify-center gap-1", tab === 'whatsapp' ? "border-[#004d25] text-[#004d25]" : "border-transparent text-gray-500 hover:text-gray-700")}
          >
            <MessageSquare size={14} className="text-emerald-600" />
            <span>WhatsApp</span>
            {isWaConnected && <CheckCircle size={12} className="text-emerald-600 ml-0.5" />}
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

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Cadre / Role <span className="text-red-500">*</span>
                </label>
                <select
                  value={form.role || 'pu_agent'}
                  onChange={e => {
                    const newRole = e.target.value as Role;
                    setForm(prev => ({ ...prev, role: newRole }));
                  }}
                  disabled={availableRoles.length <= 1}
                  className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-[#004d25] bg-white text-sm disabled:bg-gray-100 disabled:text-gray-600"
                >
                  {availableRoles.map(r => (
                    <option key={r.role} value={r.role}>
                      {r.label}
                    </option>
                  ))}
                </select>
                {availableRoles.length <= 1 && (
                  <p className="text-[11px] text-gray-400 mt-1">
                    Your account cadre as {userRole.replace(/_/g, ' ')} assigns {availableRoles[0]?.label}.
                  </p>
                )}
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
                  onClick={handleNextFromPersonal} 
                  className="px-5 py-2.5 bg-[#004d25] hover:bg-[#006331] text-white text-sm font-semibold rounded-lg shadow-sm transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <span>Next: Bank Details</span>
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          ) : tab === 'bank' ? (
            <div className="space-y-4">
              <div className="bg-blue-50/80 p-3.5 rounded-xl border border-blue-200/60 flex items-start gap-3">
                <Landmark size={22} className="text-blue-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-bold text-gray-900">Bank Account Details</h4>
                    <span className="text-[10px] bg-blue-100 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full font-semibold">Optional</span>
                  </div>
                  <p className="text-[11px] text-gray-600 mt-1">
                    You can skip this step and complete it later in the <strong>Payment</strong> section. Bank details are only required for stipend disbursement.
                  </p>
                  <button
                    type="button"
                    onClick={() => { setBankVerificationError(''); setTab('jurisdiction'); }}
                    className="mt-2 text-[11px] font-semibold text-blue-600 hover:text-blue-800 underline underline-offset-2 cursor-pointer"
                  >
                    Skip for now → Proceed to Jurisdiction
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Bank Name
                </label>
                <select
                  value={selectedBankCode}
                  onChange={e => {
                    const code = e.target.value;
                    setSelectedBankCode(code);
                    const selected = banksList.find(b => b.code === code);
                    if (selected) {
                      setForm(prev => ({ ...prev, bankName: selected.name }));
                    }
                    setIsAccountVerified(false);
                    setBankVerificationError('');
                  }}
                  disabled={isFetchingBanks}
                  className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-[#004d25] text-sm bg-white cursor-pointer"
                >
                  <option value="">{isFetchingBanks ? 'Loading Nigerian banks...' : '-- Select Bank --'}</option>
                  {banksList.map(b => (
                    <option key={`${b.code}-${b.id}`} value={b.code}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Account Number
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    maxLength={10}
                    placeholder="10 digit account number"
                    value={form.accountNumber || ''}
                    onChange={e => {
                      const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                      setForm(prev => ({ ...prev, accountNumber: val }));
                      setIsAccountVerified(false);
                      setBankVerificationError('');
                    }}
                    className="flex-1 border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-[#004d25] font-mono text-sm"
                  />
                  <button
                    type="button"
                    onClick={handleVerifyBankInModal}
                    disabled={isVerifyingAccount || !selectedBankCode || (form.accountNumber?.length !== 10)}
                    className="px-4 py-2 bg-[#004d25] hover:bg-[#006331] disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-lg shadow-sm flex items-center gap-1.5 shrink-0 cursor-pointer"
                  >
                    {isVerifyingAccount ? (
                      <>
                        <Loader2 size={15} className="animate-spin" />
                        <span>Verifying...</span>
                      </>
                    ) : isAccountVerified ? (
                      <>
                        <Check size={15} className="text-green-300" />
                        <span>Verified</span>
                      </>
                    ) : (
                      <span>Verify</span>
                    )}
                  </button>
                </div>
              </div>

              {/* Verified Account Name Display */}
              {isAccountVerified && form.accountName && (
                <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg flex items-start gap-2.5 animate-in fade-in">
                  <CheckCircle size={18} className="text-emerald-600 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] uppercase tracking-wider font-semibold text-emerald-800">Verified Name</p>
                      <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded">Name Matches</span>
                    </div>
                    <p className="text-sm font-bold text-emerald-950 font-mono mt-0.5">{form.accountName}</p>
                    <p className="text-[10px] text-emerald-700 mt-0.5">Verified via Paystack & checked against database</p>
                  </div>
                </div>
              )}

              {/* Verification Error Box */}
              {bankVerificationError && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-2 text-xs text-amber-900 animate-in fade-in">
                  <div className="flex items-start gap-2 text-red-700">
                    <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
                    <span className="font-medium leading-relaxed">{bankVerificationError}</span>
                  </div>
                  <div className="pt-1.5 flex items-center justify-between border-t border-amber-200/60 text-[11px]">
                    <span className="text-gray-600">Don&apos;t have matching bank details right now?</span>
                    <button
                      type="button"
                      onClick={() => {
                        setForm(prev => ({ ...prev, bankName: '', accountNumber: '', accountName: '' }));
                        setSelectedBankCode('');
                        setIsAccountVerified(false);
                        setBankVerificationError('');
                        setTab('jurisdiction');
                        toast('Bank details discarded. You can complete them in the Payment tab later.', { icon: 'ℹ️' });
                      }}
                      className="font-bold text-[#004d25] hover:underline cursor-pointer"
                    >
                      Skip & Complete Later →
                    </button>
                  </div>
                </div>
              )}

              <div className="pt-4 flex justify-between items-center gap-3">
                <button
                  type="button"
                  onClick={() => setTab('personal')}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 text-sm font-medium cursor-pointer"
                >
                  Back
                </button>
                <div className="flex items-center gap-3">
                  {!isAccountVerified && (
                    <button
                      type="button"
                      onClick={() => {
                        setForm(prev => ({ ...prev, bankName: '', accountNumber: '', accountName: '' }));
                        setSelectedBankCode('');
                        setIsAccountVerified(false);
                        setBankVerificationError('');
                        setTab('jurisdiction');
                        toast('Bank details skipped. You can add them in the Payment section later.', { icon: 'ℹ️' });
                      }}
                      className="text-xs font-semibold text-gray-500 hover:text-gray-800 underline cursor-pointer"
                    >
                      Skip Bank Details
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleNextFromBank}
                    className="px-5 py-2.5 bg-[#004d25] hover:bg-[#006331] text-white text-sm font-semibold rounded-lg shadow-sm transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <span>{isAccountVerified ? 'Next: Jurisdiction' : 'Continue to Jurisdiction'}</span>
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            </div>
          ) : tab === 'jurisdiction' ? (
            <div className="space-y-4">
              <JurisdictionSelector 
                locations={locations} 
                selectedLocationId={form.locationId || ''} 
                onChange={(id, details) => setForm(prev => ({ ...prev, locationId: id, ...details }))} 
                fixedLocation={fixedLocation}
                user={user}
                targetRole={form.role || 'pu_agent'}
              />
              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setTab('bank')} className="px-4 py-2 border rounded-lg hover:bg-gray-50 cursor-pointer">Back</button>
                <button
                  type="button"
                  onClick={async () => {
                    setTab('whatsapp');
                    if (!waInstance) {
                      const stateId = user?.stateId || 24;
                      const inst = await greenApiService.getStandbyInstance(stateId);
                      if (inst) {
                        setWaInstance(inst);
                        const qrRes = await greenApiService.getQRCode(inst.id);
                        if (qrRes?.message) setWaQrData(qrRes.message);
                      }
                    }
                  }}
                  className="px-4 py-2 border border-emerald-600 text-emerald-700 hover:bg-emerald-50 rounded-lg text-xs font-semibold cursor-pointer flex items-center gap-1.5"
                >
                  <MessageSquare size={14} />
                  <span>Next: Connect WhatsApp</span>
                </button>
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
          ) : (
            /* WhatsApp Tab UI */
            <div className="space-y-4">
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl space-y-1">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase text-emerald-800 tracking-wider flex items-center gap-1.5">
                    <MessageSquare size={15} />
                    Agent WhatsApp Connection (Optional)
                  </h4>
                  {isWaConnected && (
                    <span className="text-[10px] font-bold bg-emerald-200 text-emerald-900 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <CheckCircle size={12} /> Connected
                    </span>
                  )}
                </div>
                <p className="text-xs text-emerald-700">
                  Senior agents can help pair the agent's WhatsApp now, or the agent can connect it anytime from their dashboard.
                </p>
              </div>

              {/* Toggle QR vs Phone */}
              <div className="flex border-b border-gray-200">
                <button
                  type="button"
                  onClick={() => setWaConnectMethod('qr')}
                  className={cn("flex-1 py-2 text-xs font-semibold border-b-2 text-center", waConnectMethod === 'qr' ? "border-[#004d25] text-[#004d25]" : "border-transparent text-gray-500")}
                >
                  Scan QR Code
                </button>
                <button
                  type="button"
                  onClick={() => setWaConnectMethod('phone')}
                  className={cn("flex-1 py-2 text-xs font-semibold border-b-2 text-center", waConnectMethod === 'phone' ? "border-[#004d25] text-[#004d25]" : "border-transparent text-gray-500")}
                >
                  Pairing Code
                </button>
              </div>

              {waConnectMethod === 'qr' ? (
                <div className="text-center space-y-2 py-2">
                  <p className="text-xs text-gray-500">Scan with WhatsApp &gt; Linked Devices &gt; Link a Device</p>
                  {waQrData ? (
                    <div className="p-2.5 bg-white border border-gray-200 rounded-xl inline-block shadow">
                      <img src={`data:image/png;base64,${waQrData}`} alt="QR" className="w-48 h-48 mx-auto" />
                    </div>
                  ) : (
                    <div className="w-48 h-48 border-2 border-dashed border-gray-300 rounded-xl mx-auto flex items-center justify-center text-xs text-gray-400">
                      {waInstance ? 'Loading QR...' : 'No standby instance available in state pool.'}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3 py-2">
                  <p className="text-xs text-gray-500">Enter agent's phone number to generate a WhatsApp pairing code:</p>
                  <div className="flex gap-2">
                    <input
                      type="tel"
                      value={waPairingPhone || form.phone || ''}
                      onChange={e => setWaPairingPhone(e.target.value)}
                      placeholder="e.g. 08012345678"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        const ph = waPairingPhone || form.phone || '';
                        if (!waInstance || !ph) {
                          toast.error('Standby instance or phone missing');
                          return;
                        }
                        const t = toast.loading('Getting code...');
                        try {
                          const res = await greenApiService.getAuthCode(waInstance.id, ph);
                          if (res?.code) {
                            setWaAuthCode(res.code);
                            toast.success('Pairing code generated!', { id: t });
                          }
                        } catch (err: any) {
                          toast.error(err.message, { id: t });
                        }
                      }}
                      className="px-3 py-2 bg-[#004d25] text-white rounded-lg text-xs font-semibold"
                    >
                      Get Code
                    </button>
                  </div>

                  {waAuthCode && (
                    <div 
                      onClick={() => handleCopyWaCode(waAuthCode)}
                      className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-center space-y-1.5 cursor-pointer hover:bg-emerald-100/70 transition group"
                      title="Click to copy pairing code"
                    >
                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <span>Enter this code into WhatsApp:</span>
                        <span className="flex items-center gap-1 text-emerald-700 font-medium">
                          {copiedWaCode ? <Check size={12} /> : <Copy size={12} className="group-hover:scale-110 transition" />}
                          {copiedWaCode ? 'Copied' : 'Copy'}
                        </span>
                      </div>
                      <p className="text-2xl font-bold font-mono tracking-widest text-emerald-800 select-all">{waAuthCode}</p>
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    if (!waInstance) return;
                    setIsCheckingWa(true);
                    const t = toast.loading('Checking authorization...');
                    try {
                      const res = await greenApiService.checkInstanceState(waInstance.id);
                      if (res.waState === 'authorized') {
                        setIsWaConnected(true);
                        toast.success('WhatsApp device verified and linked!', { id: t });
                      } else {
                        toast('Device status: ' + res.waState, { icon: 'ℹ️', id: t });
                      }
                    } catch (err: any) {
                      toast.error(err.message, { id: t });
                    } finally {
                      setIsCheckingWa(false);
                    }
                  }}
                  disabled={isCheckingWa || !waInstance}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-xs font-semibold hover:bg-gray-50 flex items-center gap-1.5"
                >
                  <RefreshCw size={13} className={isCheckingWa ? 'animate-spin' : ''} />
                  Verify Connection
                </button>

                <div className="ml-auto flex items-center gap-2">
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-5 py-2.5 bg-[#004d25] hover:bg-[#006331] text-white text-xs font-semibold rounded-lg shadow-sm flex items-center gap-1.5"
                  >
                    {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                    <span>{isWaConnected ? 'Finish & Save with WhatsApp' : 'Complete Registration'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

import { supabase } from '../lib/supabase';

function JurisdictionSelector({ 
  locations, 
  selectedLocationId, 
  onChange, 
  fixedLocation, 
  user,
  targetRole = 'pu_agent'
}: { 
  locations: Location[]; 
  selectedLocationId: string; 
  onChange: (id: string, details: any) => void; 
  fixedLocation?: Location; 
  user: any;
  targetRole?: Role;
}) {
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

  // Synchronize hierarchy based on user scope, fixed location, or selectedLocationId
  useEffect(() => {
    let isCancelled = false;

    const initHierarchy = async () => {
      setLoading(true);
      try {
        let st = '';
        let lg = '';
        let wd = '';
        let pu = '';

        // 1. Initial defaults from user's assigned jurisdiction
        if (user?.stateId) st = String(user.stateId);
        if (user?.lgaId) lg = String(user.lgaId);
        if (user?.wardId) wd = String(user.wardId);
        if (user?.puId) pu = String(user.puId);

        // 2. Override from fixedLocation or selectedLocationId if provided
        const locToResolve = fixedLocation?.id || selectedLocationId;
        if (locToResolve) {
          if (locToResolve.startsWith('state_')) {
            st = locToResolve.replace('state_', '');
          } else if (locToResolve.startsWith('lga_')) {
            lg = locToResolve.replace('lga_', '');
            const { data } = await supabase.from('local_governments').select('state_id').eq('id', lg).single();
            if (data?.state_id) st = String(data.state_id);
          } else if (locToResolve.startsWith('ward_')) {
            wd = locToResolve.replace('ward_', '');
            const { data: wData } = await supabase.from('wards').select('localgovernment_id').eq('id', wd).single();
            if (wData?.localgovernment_id) {
              lg = String(wData.localgovernment_id);
              const { data: lData } = await supabase.from('local_governments').select('state_id').eq('id', lg).single();
              if (lData?.state_id) st = String(lData.state_id);
            }
          } else if (locToResolve.startsWith('pu_')) {
            pu = locToResolve.replace('pu_', '');
            const { data: pData } = await supabase.from('polling_units').select('ward_id, localgovernment_id').eq('id', pu).single();
            if (pData?.ward_id) {
              wd = String(pData.ward_id);
              if (pData.localgovernment_id) {
                lg = String(pData.localgovernment_id);
                const { data: lData } = await supabase.from('local_governments').select('state_id').eq('id', lg).single();
                if (lData?.state_id) st = String(lData.state_id);
              } else {
                const { data: wData } = await supabase.from('wards').select('localgovernment_id').eq('id', wd).single();
                if (wData?.localgovernment_id) {
                  lg = String(wData.localgovernment_id);
                  const { data: lData } = await supabase.from('local_governments').select('state_id').eq('id', lg).single();
                  if (lData?.state_id) st = String(lData.state_id);
                }
              }
            }
          }
        }

        if (isCancelled) return;

        setSelectedState(st);
        setSelectedLga(lg);
        setSelectedWard(wd);
        setSelectedPu(pu);

        // Fetch LGAs if state is set
        if (st) {
          const { data: lgaData } = await supabase.from('local_governments').select('id,name').eq('state_id', st).order('name');
          if (!isCancelled) setLgas(lgaData || []);
        }

        // Fetch Wards if LGA is set
        if (lg) {
          const { data: wardData } = await supabase.from('wards').select('id,name').eq('localgovernment_id', lg).order('name');
          if (!isCancelled) setWards(wardData || []);
        }

        // Fetch PUs if Ward is set
        if (wd) {
          const { data: puData } = await supabase.from('polling_units').select('id,name').eq('ward_id', wd).order('name');
          if (!isCancelled) setPus(puData || []);
        }

        // Calculate and sync assigned location ID based on targetRole
        let finalLocId = '';
        if (targetRole === 'state_admin' && st) finalLocId = `state_${st}`;
        else if (targetRole === 'lga_admin' && lg) finalLocId = `lga_${lg}`;
        else if (targetRole === 'ward_admin' && wd) finalLocId = `ward_${wd}`;
        else if (pu) finalLocId = `pu_${pu}`;
        else if (wd) finalLocId = `ward_${wd}`;
        else if (lg) finalLocId = `lga_${lg}`;
        else if (st) finalLocId = `state_${st}`;

        onChange(finalLocId, {
          stateId: st ? parseInt(st, 10) : null,
          lgaId: lg ? parseInt(lg, 10) : null,
          wardId: wd ? parseInt(wd, 10) : null,
          puId: pu ? parseInt(pu, 10) : null
        });
      } finally {
        if (!isCancelled) setLoading(false);
      }
    };

    initHierarchy();

    return () => {
      isCancelled = true;
    };
  }, [selectedLocationId, fixedLocation?.id, user?.stateId, user?.lgaId, user?.wardId, user?.puId, targetRole]);

  const handleStateChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSelectedState(val);
    setSelectedLga('');
    setSelectedWard('');
    setSelectedPu('');
    setLgas([]); setWards([]); setPus([]);
    onChange(val ? `state_${val}` : '', {
      stateId: val ? parseInt(val, 10) : null,
      lgaId: null,
      wardId: null,
      puId: null
    });
    
    if (val) {
      setLoading(true);
      const { data } = await supabase.from('local_governments').select('id,name').eq('state_id', val).order('name');
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

    const finalId = targetRole === 'lga_admin' && val ? `lga_${val}` : (val ? `lga_${val}` : (selectedState ? `state_${selectedState}` : ''));
    onChange(finalId, {
      stateId: selectedState ? parseInt(selectedState, 10) : null,
      lgaId: val ? parseInt(val, 10) : null,
      wardId: null,
      puId: null
    });
    
    if (val) {
      setLoading(true);
      const { data } = await supabase.from('wards').select('id,name').eq('localgovernment_id', val).order('name');
      setWards(data || []);
      setLoading(false);
    }
  };

  const handleWardChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSelectedWard(val);
    setSelectedPu('');
    setPus([]);

    const finalId = targetRole === 'ward_admin' && val ? `ward_${val}` : (val ? `ward_${val}` : (selectedLga ? `lga_${selectedLga}` : ''));
    onChange(finalId, {
      stateId: selectedState ? parseInt(selectedState, 10) : null,
      lgaId: selectedLga ? parseInt(selectedLga, 10) : null,
      wardId: val ? parseInt(val, 10) : null,
      puId: null
    });
    
    if (val && targetRole === 'pu_agent') {
      setLoading(true);
      const { data } = await supabase.from('polling_units').select('id,name').eq('ward_id', val).order('name');
      setPus(data || []);
      setLoading(false);
    }
  };

  const handlePuChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSelectedPu(val);
    onChange(val ? `pu_${val}` : (selectedWard ? `ward_${selectedWard}` : ''), {
      stateId: selectedState ? parseInt(selectedState, 10) : null,
      lgaId: selectedLga ? parseInt(selectedLga, 10) : null,
      wardId: selectedWard ? parseInt(selectedWard, 10) : null,
      puId: val ? parseInt(val, 10) : null
    });
  };

  const levelPriority: Record<string, number> = { 'national': 4, 'state': 3, 'lga': 2, 'ward': 1, 'pu': 0 };
  const fixedLevel = fixedLocation ? (levelPriority[fixedLocation.type] ?? -1) : -1;

  // Strict jurisdictional isolation:
  // - National admin can manage any state
  // - State admin has State locked; can only see/assign LGAs/Wards/PUs within that state
  // - LGA admin has State and LGA locked; can only see/assign Wards/PUs within that LGA
  // - Ward admin has State, LGA, and Ward locked; can only see/assign PUs within that Ward
  const isStateDisabled = (user?.role !== 'national_admin' && !!user?.stateId) || (fixedLevel >= 3);
  const isLgaDisabled = (['lga_admin', 'ward_admin', 'pu_agent'].includes(user?.role) && !!user?.lgaId) || (fixedLevel >= 2);
  const isWardDisabled = (['ward_admin', 'pu_agent'].includes(user?.role) && !!user?.wardId) || (fixedLevel >= 1);
  const isPuDisabled = (user?.role === 'pu_agent' && !!user?.puId) || (fixedLevel >= 0);

  return (
    <div className="space-y-4">
      {/* State Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          State {isStateDisabled && <span className="text-xs text-gray-400 font-normal">(Locked to your jurisdiction)</span>}
        </label>
        <select 
          value={selectedState} 
          onChange={handleStateChange} 
          disabled={isStateDisabled} 
          className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-[#004d25] disabled:bg-gray-100 disabled:text-gray-600 text-sm bg-white"
        >
          <option value="">Select State...</option>
          {states.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </div>

      {/* LGA Selection (hidden for State Admin target role) */}
      {targetRole !== 'state_admin' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Local Government Area (LGA) {isLgaDisabled && <span className="text-xs text-gray-400 font-normal">(Locked to your jurisdiction)</span>}
          </label>
          <select 
            value={selectedLga} 
            onChange={handleLgaChange} 
            disabled={isLgaDisabled || !selectedState} 
            className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-[#004d25] disabled:bg-gray-100 disabled:text-gray-600 text-sm bg-white"
          >
            <option value="">
              {!selectedState ? 'Select State first...' : lgas.length === 0 && loading ? 'Loading LGAs...' : 'Select LGA...'}
            </option>
            {lgas.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
      )}

      {/* Ward Selection (shown for Ward Admin or PU Agent target roles) */}
      {['ward_admin', 'pu_agent'].includes(targetRole) && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Ward {isWardDisabled && <span className="text-xs text-gray-400 font-normal">(Locked to your jurisdiction)</span>}
          </label>
          <select 
            value={selectedWard} 
            onChange={handleWardChange} 
            disabled={isWardDisabled || !selectedLga} 
            className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-[#004d25] disabled:bg-gray-100 disabled:text-gray-600 text-sm bg-white"
          >
            <option value="">
              {!selectedLga ? 'Select LGA first...' : wards.length === 0 && loading ? 'Loading Wards...' : 'Select Ward...'}
            </option>
            {wards.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
      )}

      {/* Polling Unit Selection (only required for PU Agent target role) */}
      {targetRole === 'pu_agent' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Polling Unit (PU) <span className="text-red-500">*</span>
          </label>
          <select 
            value={selectedPu} 
            onChange={handlePuChange} 
            disabled={isPuDisabled || !selectedWard} 
            className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-[#004d25] disabled:bg-gray-100 disabled:text-gray-600 text-sm bg-white"
            required={targetRole === 'pu_agent'}
          >
            <option value="">
              {!selectedWard 
                ? 'Select Ward first...' 
                : pus.length === 0 && loading 
                ? 'Loading Polling Units...' 
                : pus.length === 0 
                ? 'No polling units found for this ward' 
                : `Select Polling Unit (${pus.length} available)...`}
            </option>
            {pus.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}
