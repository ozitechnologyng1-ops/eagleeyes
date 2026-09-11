import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';
import { Wallet, Landmark, CreditCard, CheckCircle, Clock, ChevronRight, Loader2, AlertCircle, Building2, Send, Filter, Settings, X, FileText, Upload, Check, MessageSquare, Receipt } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '../lib/utils';
import FileUpload, { UploadedFile } from '../components/FileUpload';
import { fetchBanks, verifyAccount, verifyNameMatch, checkAccountExistsInDb, PaystackBank } from '../lib/paystack';

export default function Payment() {
  const { user, updateUser, stats } = useApp();
  
  const [bankName, setBankName] = useState(user?.bankName || '');
  const [accountName, setAccountName] = useState(user?.accountName || '');
  const [accountNumber, setAccountNumber] = useState(user?.accountNumber || '');
  
  // Paystack bank verification state
  const [banksList, setBanksList] = useState<PaystackBank[]>([]);
  const [selectedBankCode, setSelectedBankCode] = useState('');
  const [isFetchingBanks, setIsFetchingBanks] = useState(false);
  const [isVerifyingAccount, setIsVerifyingAccount] = useState(false);
  const [verificationError, setVerificationError] = useState('');
  const [isAccountVerified, setIsAccountVerified] = useState(Boolean(user?.accountName && user?.accountNumber));
  
  const [isSaving, setIsSaving] = useState(false);

  const [agents, setAgents] = useState<any[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [payingAgentId, setPayingAgentId] = useState<string | null>(null);
  const [isAutoPaying, setIsAutoPaying] = useState(false);
  const [myWithdrawalRequested, setMyWithdrawalRequested] = useState(false);
  const [myResults, setMyResults] = useState<any[]>([]);

  // Supporting file uploads state
  const [myDocuments, setMyDocuments] = useState<UploadedFile[]>([]);
  const [adminBatchDocs, setAdminBatchDocs] = useState<UploadedFile[]>([]);
  const [selectedAgentForUpload, setSelectedAgentForUpload] = useState<any | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadedModalDocs, setUploadedModalDocs] = useState<UploadedFile[]>([]);
  
  const [showAllocationModal, setShowAllocationModal] = useState(false);
  const [allocations, setAllocations] = useState({ lga: 50000, ward: 20000, pu: 10000 });
  const [allocatedAmount, setAllocatedAmount] = useState(0);
  const [stateCounts, setStateCounts] = useState({ lga: 0, ward: 0, pu: 0 });

  const GATEWAY_FEE_RATE = 0.02; // 2% Paystack gateway charge
  const agentSubtotal = (stateCounts.lga * allocations.lga) + (stateCounts.ward * allocations.ward) + (stateCounts.pu * allocations.pu);
  const gatewayFee = Math.round(agentSubtotal * GATEWAY_FEE_RATE);
  const projectedTotal = agentSubtotal + gatewayFee;
  
  // Tab selection for admins
  const [activeTab, setActiveTab] = useState<'lga_admin' | 'ward_admin' | 'pu_agent'>('pu_agent');

  // Central Bank State
  const treasuryBalance = 1000000;
  const isCentralBank = user?.role === 'state_admin' || user?.role === 'national_admin';
  const isStateAdmin = isCentralBank;

  const [isEditingBank, setIsEditingBank] = useState(!isCentralBank && (!user?.bankName || !user?.accountNumber));
  const [myEligibility, setMyEligibility] = useState({ eligible: false, text: "Calculating..." });
  const [myWhatsAppEarnings, setMyWhatsAppEarnings] = useState(0);

  useEffect(() => {
    if (user?.id) {
      supabase.from('agents').select('whatsapp_earnings_balance').eq('id', user.id).single().then(({ data }) => {
        if (data) setMyWhatsAppEarnings(Number(data.whatsapp_earnings_balance || 0));
      });
    }
  }, [user?.id]);

  useEffect(() => {
    const fetchStateData = async () => {
      if (!user?.stateId || !isCentralBank) return;
      const stateId = user.stateId;

      const [{ count: lgaCount }, { count: wardCount }, { count: puCount }, { data: savedAlloc }] = await Promise.all([
        supabase.from('local_governments').select('*', { count: 'exact', head: true }).eq('state_id', stateId),
        supabase.from('wards').select('*', { count: 'exact', head: true }).eq('state_id', stateId),
        supabase.from('polling_units').select('*', { count: 'exact', head: true }).eq('state_id', stateId),
        supabase.from('treasury_allocations').select('*').eq('state_id', stateId).maybeSingle(),
      ]);

      setStateCounts({ lga: lgaCount || 0, ward: wardCount || 0, pu: puCount || 0 });

      if (savedAlloc) {
        setAllocations({ lga: savedAlloc.lga_payout, ward: savedAlloc.ward_payout, pu: savedAlloc.pu_payout });
        setAllocatedAmount(savedAlloc.allocated_total || 0);
      }
    };
    fetchStateData();
  }, [user?.stateId, isCentralBank]);

  useEffect(() => {
    const fetchAgents = async () => {
      if (!user) return;
      
      setLoadingAgents(true);
      try {
        let query = supabase.from('agents').select('*').limit(1000);
        
        // Jurisdiction Filtering for fetching all sub-agents to calculate nested eligibility
        if (user.stateId && user.role !== 'national_admin') {
          query = query.eq('state_id', user.stateId);
        }
        
        const { data: allAgentsData, error: agentsError } = await query;
        if (agentsError) throw agentsError;

        const allAgents = allAgentsData || [];

        // Fetch ALL election results for this state
        let resultsQuery = supabase.from('election_results').select('*');
        if (user.stateId && user.role !== 'national_admin') {
          resultsQuery = resultsQuery.eq('state_id', user.stateId);
        }
        
        const { data: resultsData, error: resultsError } = await resultsQuery;
        if (resultsError) throw resultsError;

        const agentResults = (resultsData || []).reduce((acc: any, r: any) => {
          if (r.agent_id) {
            if (!acc[r.agent_id]) acc[r.agent_id] = [];
            acc[r.agent_id].push(r);
          }
          return acc;
        }, {});

        // 1. Calculate eligibility for all agents rigidly
        const eligibilityMap: Record<string, boolean> = {};

        // Pass 1: PU Agents
        allAgents.forEach(a => {
          if (a.role === 'pu_agent') {
            eligibilityMap[a.id] = (agentResults[a.id]?.length || 0) > 0;
          }
        });

        // Pass 2: Ward Admins
        allAgents.forEach(a => {
          if (a.role === 'ward_admin') {
            const myPUs = allAgents.filter(sub => sub.role === 'pu_agent' && sub.wards_id === a.wards_id);
            if (myPUs.length === 0) {
              eligibilityMap[a.id] = false; // Rigid: Must have PUs who uploaded
            } else {
              eligibilityMap[a.id] = myPUs.every(sub => eligibilityMap[sub.id]);
            }
          }
        });

        // Pass 3: LGA Admins
        allAgents.forEach(a => {
          if (a.role === 'lga_admin') {
            const myWards = allAgents.filter(sub => sub.role === 'ward_admin' && sub.local_governments_id === a.local_governments_id);
            if (myWards.length === 0) {
              eligibilityMap[a.id] = false; // Rigid: Must have Wards who are eligible
            } else {
              eligibilityMap[a.id] = myWards.every(sub => eligibilityMap[sub.id]);
            }
          }
        });
        
        // 2. Filter the agents we actually want to display in the list (direct subordinates)
        let displayAgents = allAgents.filter(a => a.id !== user.id);
        
        if (user.role === 'lga_admin' && user.lgaId) {
          displayAgents = displayAgents.filter(a => a.local_governments_id === user.lgaId);
        } else if (user.role === 'ward_admin' && user.wardId) {
          displayAgents = displayAgents.filter(a => a.wards_id === user.wardId);
        } else if (user.role === 'pu_agent') {
          displayAgents = []; // PU Agent sees nobody
        }
        
        const formattedAgents = displayAgents.map(a => ({
          id: a.id,
          name: a.name,
          role: a.role,
          bankName: a.bank_name,
          accountNumber: a.account_number,
          uploadedCount: agentResults[a.id]?.length || 0,
          results: agentResults[a.id] || [],
          paymentStatus: a.payment_status || 'pending',
          withdrawalRequested: a.withdrawal_requested || false,
          isEligible: !!eligibilityMap[a.id]
        }));
        
        // 3. Figure out current user's eligibility
        let myEligible = false;
        if (user.role === 'pu_agent') myEligible = (agentResults[user.id]?.length || 0) > 0;
        else if (user.role === 'ward_admin') {
           const myPUs = allAgents.filter(sub => sub.role === 'pu_agent' && sub.wards_id === user.wardId);
           myEligible = myPUs.length > 0 && myPUs.every(sub => eligibilityMap[sub.id]);
        }
        else if (user.role === 'lga_admin') {
           const myWards = allAgents.filter(sub => sub.role === 'ward_admin' && sub.local_governments_id === user.lgaId);
           myEligible = myWards.length > 0 && myWards.every(sub => eligibilityMap[sub.id]);
        }

        setMyEligibility({
          eligible: myEligible,
          text: user.role === 'pu_agent' 
                ? (myEligible ? "Election result uploaded" : "Pending election result upload") 
                : (myEligible ? "All subordinate conditions met" : "Subordinate agents have pending uploads")
        });
        
        if (user.role === 'pu_agent') {
          setMyResults(agentResults[user.id] || []);
        }

        // Set default tab based on user role
        if (user.role === 'state_admin' || user.role === 'national_admin') setActiveTab('lga_admin');
        else if (user.role === 'lga_admin') setActiveTab('ward_admin');
        else setActiveTab('pu_agent');

        setAgents(formattedAgents);
      } catch (err) {
        console.error('Failed to fetch agents', err);
        toast.error('Failed to load agents for payout dashboard');
      } finally {
        setLoadingAgents(false);
      }
    };

    if (!isEditingBank || isCentralBank) {
      fetchAgents();
    }
  }, [user, isEditingBank, isCentralBank]);

  // Fetch Nigerian banks from Paystack when editing bank details
  useEffect(() => {
    if (isEditingBank && banksList.length === 0) {
      setIsFetchingBanks(true);
      fetchBanks()
        .then(list => {
          setBanksList(list);
          if (bankName) {
            const match = list.find(b => b.name.toLowerCase() === bankName.toLowerCase());
            if (match) setSelectedBankCode(match.code);
          }
        })
        .catch(err => {
          console.error('Failed to load banks:', err);
          toast.error('Failed to load Nigerian banks from Paystack');
        })
        .finally(() => setIsFetchingBanks(false));
    }
  }, [isEditingBank, banksList.length, bankName]);

  const handleVerifyAccount = async () => {
    if (!selectedBankCode) {
      setVerificationError('Please select your bank first.');
      return;
    }
    const cleanNumber = accountNumber.trim();
    if (cleanNumber.length !== 10 || !/^\d{10}$/.test(cleanNumber)) {
      setVerificationError('Account number must be exactly 10 digits.');
      return;
    }

    setIsVerifyingAccount(true);
    setVerificationError('');

    try {
      // 1. Resolve with Paystack
      const result = await verifyAccount(cleanNumber, selectedBankCode);
      const resolvedName = result.account_name;

      // 2. Check if already registered in the database by someone else
      const existsResult = await checkAccountExistsInDb(cleanNumber, user?.id);
      if (existsResult.exists) {
        setVerificationError(`Bank account already exists in the system (registered to ${existsResult.registeredTo}).`);
        setIsAccountVerified(false);
        return;
      }

      // 3. Verify account name tallies with agent name (first or last name)
      const userFirstName = (user as any)?.firstName;
      const userLastName = (user as any)?.lastName;
      const userFullName = user?.name;

      const matchResult = verifyNameMatch(resolvedName, userFirstName, userLastName, userFullName);
      if (!matchResult.isMatch) {
        setVerificationError(
          matchResult.reason ||
          `Bank account name ("${resolvedName}") does not match your registered name. Must match first name or last name.`
        );
        setIsAccountVerified(false);
        return;
      }

      // Verified successfully!
      setAccountName(resolvedName);
      setIsAccountVerified(true);
      setVerificationError('');
      toast.success(`Account verified: ${resolvedName}`);
    } catch (err: any) {
      setVerificationError(err.message || 'Could not verify account. Please check the bank and account number.');
      setIsAccountVerified(false);
    } finally {
      setIsVerifyingAccount(false);
    }
  };

  const handleSaveBankDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bankName || !accountNumber) {
      toast.error('Please select a bank and enter your account number');
      return;
    }
    if (!isAccountVerified) {
      toast.error('Please verify your account number before saving');
      return;
    }
    setIsSaving(true);
    try {
      await updateUser({ bankName, accountName, accountNumber });
      toast.success('Bank details saved successfully');
      setIsEditingBank(false);
    } catch (err) {
      toast.error('Failed to save bank details');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePayAgent = async (agentId: string) => {
    if (!isStateAdmin) return toast.error('Only State Admins can make payments.');
    setPayingAgentId(agentId);
    try {
      await new Promise(res => setTimeout(res, 1200));
      setAgents(prev => prev.map(a => a.id === agentId ? { ...a, paymentStatus: 'paid' } : a));
      toast.success('Payment disbursed successfully via Paystack');
    } catch (err) {
      toast.error('Payment failed');
    } finally {
      setPayingAgentId(null);
    }
  };

  const handleAutoPayAll = async () => {
    if (!isStateAdmin) return toast.error('Only State Admins can make payments.');
    setIsAutoPaying(true);
    try {
      const eligibleToPay = agents.filter(a => a.role === activeTab && a.isEligible && a.paymentStatus !== 'paid' && a.bankName);
      if (eligibleToPay.length === 0) {
        toast.error('No eligible agents to auto-pay in this category.');
        setIsAutoPaying(false);
        return;
      }
      // Mock Paystack batch processing
      await new Promise(res => setTimeout(res, 2500));
      setAgents(prev => prev.map(a => 
        (a.role === activeTab && a.isEligible && a.bankName) ? { ...a, paymentStatus: 'paid' } : a
      ));
      toast.success(`Successfully auto-paid ${eligibleToPay.length} agents via Paystack!`);
    } catch (err) {
      toast.error('Auto-pay batch failed');
    } finally {
      setIsAutoPaying(false);
    }
  };

  const handleRequestWithdrawal = () => {
    setMyWithdrawalRequested(true);
    toast.success('Withdrawal request submitted to State Admin.');
  };

  if (!user) return null;

  const filteredAgents = agents.filter(a => a.role === activeTab);

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            {isCentralBank ? 'Payments & Remuneration' : 'Earnings & Payouts'}
          </h1>
          <p className="text-gray-500 mt-1">
            {isCentralBank 
              ? 'Manage disbursements, track eligibility, and manage allocations.'
              : 'Track your earnings, review tasks, and request payouts.'}
          </p>
        </div>
        
        <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap sm:flex-nowrap shrink-0">
          {!isCentralBank && (
            <>
              {/* Total Amount Earned Badge */}
              <div className="bg-emerald-50 border border-emerald-200/80 px-3.5 py-1.5 rounded-xl flex flex-col justify-center shrink-0">
                <span className="text-[10px] text-emerald-700 font-bold uppercase tracking-wider leading-tight">Total Earned</span>
                <span className="font-mono text-lg font-black text-emerald-950 leading-tight">
                  ₦{((myEligibility.eligible ? (user?.role === 'lga_admin' ? allocations.lga : user?.role === 'ward_admin' ? allocations.ward : allocations.pu) : 0) + (myWhatsAppEarnings || 0)).toLocaleString('en-NG')}
                </span>
              </div>

              {/* Secondary Button: My Account */}
              <button
                type="button"
                onClick={() => setIsEditingBank(true)}
                className="bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 px-3.5 py-2.5 rounded-xl shadow-2xs flex items-center gap-2 text-sm font-semibold transition-all cursor-pointer shrink-0 whitespace-nowrap"
              >
                <Landmark size={16} className="text-[#004d25]" />
                <span>My Account</span>
              </button>

              {/* Primary Button: Request Payout */}
              <button
                type="button"
                onClick={handleRequestWithdrawal}
                disabled={!myEligibility.eligible || myWithdrawalRequested}
                className={cn(
                  "px-4 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-2 shadow-xs shrink-0 whitespace-nowrap cursor-pointer",
                  myWithdrawalRequested
                    ? "bg-emerald-100 text-emerald-800 cursor-not-allowed border border-emerald-300"
                    : !myEligibility.eligible
                    ? "bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed"
                    : "bg-[#004d25] hover:bg-[#00381b] text-white shadow-md hover:shadow-lg"
                )}
              >
                {myWithdrawalRequested ? (
                  <>
                    <Check size={16} className="text-emerald-700" />
                    <span>Payout Requested</span>
                  </>
                ) : (
                  <>
                    <Send size={15} className="text-[#d4af37]" />
                    <span>Request Payout</span>
                  </>
                )}
              </button>
            </>
          )}

          {isStateAdmin && (
            <div className="flex flex-col sm:flex-row items-end sm:items-center gap-3">
              {allocatedAmount > 0 && (
                <div className="flex gap-3 mr-2 animate-in fade-in zoom-in-95 duration-300">
                  <div className="bg-white px-4 py-2 rounded-xl shadow-sm border border-gray-100 text-right">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">Allocated</p>
                    <p className="text-sm font-bold text-gray-800">₦{allocatedAmount.toLocaleString('en-NG')}</p>
                  </div>
                  <div className="bg-white px-4 py-2 rounded-xl shadow-sm border border-green-100 text-right">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">Remaining</p>
                    <p className="text-sm font-bold text-[#004d25]">₦{(treasuryBalance - allocatedAmount).toLocaleString('en-NG')}</p>
                  </div>
                </div>
              )}
              <div 
                onClick={() => setShowAllocationModal(true)}
                className="bg-[#004d25] text-white px-5 py-2.5 rounded-xl shadow-md flex items-center gap-3 cursor-pointer hover:bg-[#003d1e] transition-colors group"
              >
                <Building2 size={20} className="text-[#d4af37]" />
                <div>
                  <p className="text-xs text-green-200 uppercase tracking-wider font-semibold">Central Bank Treasury</p>
                  <p className="font-mono text-xl font-bold">₦{treasuryBalance.toLocaleString('en-NG', { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="pl-3 ml-2 border-l border-green-700 text-green-400 group-hover:text-white transition-colors">
                  <Settings size={18} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {isEditingBank ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 max-w-2xl mx-auto mt-10">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-amber-50 text-[#d4af37] rounded-full flex items-center justify-center">
              <Landmark size={32} />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-center text-gray-900 mb-2">Setup Bank Details</h2>
          <p className="text-center text-gray-500 mb-8">
            Please provide your bank details to receive payments and access the payout dashboard.
          </p>
          
          <form onSubmit={handleSaveBankDetails} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Select Bank <span className="text-red-500">*</span>
              </label>
              <select 
                value={selectedBankCode}
                onChange={e => {
                  const code = e.target.value;
                  setSelectedBankCode(code);
                  const selected = banksList.find(b => b.code === code);
                  if (selected) setBankName(selected.name);
                  setIsAccountVerified(false);
                  setVerificationError('');
                }}
                disabled={isFetchingBanks}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#004d25] focus:border-transparent transition-all outline-none text-sm cursor-pointer"
              >
                <option value="">{isFetchingBanks ? 'Loading Nigerian banks...' : '-- Select your bank --'}</option>
                {banksList.map(b => (
                  <option key={`${b.code}-${b.id}`} value={b.code}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Account Number <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  maxLength={10}
                  placeholder="10 digit account number (e.g. 8131000117)" 
                  value={accountNumber}
                  onChange={e => {
                    const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                    setAccountNumber(val);
                    setIsAccountVerified(false);
                    setVerificationError('');
                  }}
                  className="flex-1 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#004d25] focus:border-transparent transition-all outline-none font-mono text-sm"
                />
                <button
                  type="button"
                  onClick={handleVerifyAccount}
                  disabled={isVerifyingAccount || accountNumber.length !== 10 || !selectedBankCode}
                  className="px-5 py-3 bg-[#004d25] hover:bg-[#006331] disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl transition-all shadow-sm flex items-center gap-1.5 shrink-0 cursor-pointer"
                >
                  {isVerifyingAccount ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>Verifying...</span>
                    </>
                  ) : isAccountVerified ? (
                    <>
                      <Check size={16} className="text-green-300" />
                      <span>Verified</span>
                    </>
                  ) : (
                    <span>Verify Account</span>
                  )}
                </button>
              </div>
            </div>

            {/* Verified Account Name Display */}
            {isAccountVerified && accountName && (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-3 animate-in fade-in">
                <CheckCircle size={20} className="text-emerald-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] uppercase tracking-wider font-semibold text-emerald-800">Verified Account Name</p>
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">Name Matches</span>
                  </div>
                  <p className="text-base font-bold text-emerald-950 font-mono mt-0.5">{accountName}</p>
                  <p className="text-[11px] text-emerald-700 mt-1">Confirmed with Paystack & verified against registered database.</p>
                </div>
              </div>
            )}

            {/* Verification Error Box */}
            {verificationError && (
              <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5 text-xs text-red-700 animate-in fade-in">
                <AlertCircle size={17} className="text-red-500 shrink-0 mt-0.5" />
                <span className="font-medium leading-relaxed">{verificationError}</span>
              </div>
            )}
            
            <div className="flex gap-3 pt-2">
              {user?.bankName && user?.accountNumber && (
                <button
                  type="button"
                  onClick={() => setIsEditingBank(false)}
                  className="px-5 py-3.5 border border-gray-300 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              )}
              <button 
                type="submit" 
                disabled={isSaving || !isAccountVerified}
                className="flex-1 bg-[#004d25] hover:bg-[#006331] text-white font-bold py-3.5 px-4 rounded-xl transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2 cursor-pointer"
              >
                {isSaving ? <Loader2 className="animate-spin" size={20} /> : <CheckCircle size={20} />}
                <span>Save Bank Details</span>
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Non-Central Bank: Top 3 Cards for Agent Earnings & Account */}
          {!isCentralBank && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Card 1: Role Stipend Allowance */}
              <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-2xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Election Day Stipend</span>
                  <span className={cn(
                    "text-[10px] font-bold px-2 py-0.5 rounded-full uppercase",
                    myEligibility.eligible ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                  )}>
                    {myEligibility.eligible ? "Eligible" : "Pending"}
                  </span>
                </div>
                <p className="font-mono text-2xl font-bold text-gray-900">
                  ₦{(user?.role === 'lga_admin' ? allocations.lga : user?.role === 'ward_admin' ? allocations.ward : allocations.pu).toLocaleString('en-NG')}
                </p>
                <p className="text-xs text-gray-500 truncate">{myEligibility.text}</p>
              </div>

              {/* Card 2: WhatsApp Canvassing Rewards */}
              <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-2xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">WhatsApp Canvassing</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase bg-emerald-100 text-emerald-800">
                    Active
                  </span>
                </div>
                <p className="font-mono text-2xl font-bold text-emerald-900">
                  ₦{myWhatsAppEarnings.toLocaleString('en-NG')}
                </p>
                <p className="text-xs text-gray-500">Voter flyer outreach & group canvassing rewards</p>
              </div>

              {/* Card 3: Payout Account & Status */}
              <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-2xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Payout Account</span>
                  <button
                    type="button"
                    onClick={() => setIsEditingBank(true)}
                    className="text-xs text-[#004d25] font-semibold hover:underline cursor-pointer"
                  >
                    Edit
                  </button>
                </div>
                <p className="font-mono text-base font-bold text-gray-900 truncate">
                  {user?.bankName ? `${user.bankName} ••••${user?.accountNumber?.slice(-4)}` : 'No Account Set'}
                </p>
                <p className="text-xs text-gray-500 truncate">
                  {user?.accountName || 'Click edit to configure bank account'}
                </p>
              </div>
            </div>
          )}

          {/* For PU Agents: Incoming Earnings Activity & Breakdown */}
          {user.role === 'pu_agent' && (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-2xs overflow-hidden">
              <div className="p-5 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div>
                  <h3 className="font-bold text-gray-900 text-base flex items-center gap-2">
                    <Receipt size={18} className="text-[#004d25]" />
                    <span>Earnings & Allowance Stream</span>
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Live ledger of campaign stipends, canvassing tasks, and task credits as they come in.
                  </p>
                </div>
                <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live Earnings Stream
                </span>
              </div>

              {((myEligibility.eligible || user.paymentStatus === 'paid') || (myWhatsAppEarnings > 0) || myWithdrawalRequested) ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50/80 border-b border-gray-100 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                        <th className="py-3 px-5">Earning Description / Task</th>
                        <th className="py-3 px-4">Category</th>
                        <th className="py-3 px-4">Requirement / Trigger</th>
                        <th className="py-3 px-4">Payout Status</th>
                        <th className="py-3 px-5 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-sm">
                      {/* Item 1: Election Day Stipend (Shown when eligible or paid) */}
                      {(myEligibility.eligible || user.paymentStatus === 'paid') && (
                        <tr className="hover:bg-gray-50/60 transition-colors">
                          <td className="py-4 px-5">
                            <div className="font-bold text-gray-900">Election Day Duty Stipend</div>
                            <div className="text-xs text-gray-500 mt-0.5">Official Polling Unit agent accreditation & election day duty</div>
                          </td>
                          <td className="py-4 px-4">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                              Polling Unit Duty
                            </span>
                          </td>
                          <td className="py-4 px-4">
                            <div className="text-xs font-medium">
                              <span className="text-emerald-700 flex items-center gap-1">
                                <CheckCircle size={14} className="text-emerald-600" />
                                EC8A Result Uploaded & Approved
                              </span>
                            </div>
                          </td>
                          <td className="py-4 px-4">
                            <span className={cn(
                              "inline-flex items-center text-[11px] font-bold px-2.5 py-0.5 rounded-full uppercase",
                              user.paymentStatus === 'paid'
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            )}>
                              {user.paymentStatus === 'paid' ? 'Disbursed' : 'Ready for Payout'}
                            </span>
                          </td>
                          <td className="py-4 px-5 text-right font-mono font-bold text-gray-900">
                            ₦{allocations.pu.toLocaleString('en-NG')}
                          </td>
                        </tr>
                      )}

                      {/* Item 2: WhatsApp Canvassing (Shown when agent has earned from canvassing) */}
                      {myWhatsAppEarnings > 0 && (
                        <tr className="hover:bg-gray-50/60 transition-colors">
                          <td className="py-4 px-5">
                            <div className="font-bold text-gray-900">WhatsApp Canvassing & Flyer Outreach</div>
                            <div className="text-xs text-gray-500 mt-0.5">Automated voter mobilization, campaign message delivery & flyer shares</div>
                          </td>
                          <td className="py-4 px-4">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-100">
                              Digital Canvassing
                            </span>
                          </td>
                          <td className="py-4 px-4">
                            <div className="text-xs font-medium text-gray-600">
                              Completed voter flyer outreach deliveries
                            </div>
                          </td>
                          <td className="py-4 px-4">
                            <span className="inline-flex items-center text-[11px] font-bold px-2.5 py-0.5 rounded-full uppercase bg-emerald-100 text-emerald-800">
                              Credited
                            </span>
                          </td>
                          <td className="py-4 px-5 text-right font-mono font-bold text-emerald-900">
                            ₦{myWhatsAppEarnings.toLocaleString('en-NG')}
                          </td>
                        </tr>
                      )}

                      {/* Item 3: Withdrawal record if requested */}
                      {myWithdrawalRequested && (
                        <tr className="bg-amber-50/30 hover:bg-amber-50/50 transition-colors">
                          <td className="py-4 px-5">
                            <div className="font-bold text-gray-900">Payout Request to Bank</div>
                            <div className="text-xs text-gray-500 mt-0.5">
                              Transfer to {user.bankName ? `${user.bankName} (••••${user.accountNumber?.slice(-4)})` : 'Bank Account'}
                            </div>
                          </td>
                          <td className="py-4 px-4">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-purple-50 text-purple-700 border border-purple-100">
                              Withdrawal
                            </span>
                          </td>
                          <td className="py-4 px-4">
                            <div className="text-xs font-medium text-gray-600">
                              State Treasury clearance & Paystack transfer
                            </div>
                          </td>
                          <td className="py-4 px-4">
                            <span className="inline-flex items-center text-[11px] font-bold px-2.5 py-0.5 rounded-full uppercase bg-amber-100 text-amber-800">
                              Processing
                            </span>
                          </td>
                          <td className="py-4 px-5 text-right font-mono font-bold text-amber-800">
                            -₦{((myEligibility.eligible ? allocations.pu : 0) + (myWhatsAppEarnings || 0)).toLocaleString('en-NG')}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-14 text-center px-4 space-y-2">
                  <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mx-auto text-gray-400 border border-gray-100">
                    <Receipt size={22} />
                  </div>
                  <p className="text-sm font-bold text-gray-800">No Earnings Recorded Yet</p>
                  <p className="text-xs text-gray-500 max-w-sm mx-auto">
                    Your income streams will appear here as they are credited. Complete voter outreach tasks or upload election day unit results to start earning.
                  </p>
                </div>
              )}

              {/* Bottom footer summary */}
              <div className="p-4 bg-gray-50/70 border-t border-gray-100 flex flex-col sm:flex-row justify-between items-center gap-3 text-xs text-gray-600">
                <span>
                  Showing <strong>{((myEligibility.eligible || user.paymentStatus === 'paid') ? 1 : 0) + (myWhatsAppEarnings > 0 ? 1 : 0) + (myWithdrawalRequested ? 1 : 0)}</strong> incoming earnings streams
                </span>
                <div className="flex items-center gap-2 font-medium">
                  <span>Available Balance:</span>
                  <span className="font-mono text-gray-900 font-bold text-sm">
                    ₦{((myEligibility.eligible ? allocations.pu : 0) + (myWhatsAppEarnings || 0)).toLocaleString('en-NG')}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Sub-Agent Payouts / Dashboard */}
          {user.role !== 'pu_agent' && (
            <div className="flex flex-col h-[700px] w-full">
              <div className="bg-white rounded-t-2xl border-x border-t border-gray-200 p-5 pb-0 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">
                    {isStateAdmin ? "State Disbursement Dashboard" : "Sub-Agent Payment Status"}
                  </h2>
                  <p className="text-sm text-gray-500">
                    {isStateAdmin ? "Review requests and disburse funds via Paystack." : "Monitor the payout status of agents under your jurisdiction."}
                  </p>
                </div>
                
                {isStateAdmin && (
                  <button 
                    onClick={handleAutoPayAll}
                    disabled={isAutoPaying || filteredAgents.filter(a => a.isEligible && a.paymentStatus !== 'paid').length === 0}
                    className="bg-[#d4af37] text-[#004d25] hover:bg-[#c19b2e] px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isAutoPaying ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
                    Auto-Pay {activeTab.split('_')[0].toUpperCase()}s
                  </button>
                )}
              </div>

              {/* Tabs */}
              <div className="bg-white border-x border-b border-gray-200 px-5 pt-4">
                <div className="flex gap-6 border-b border-gray-200">
                  {['lga_admin', 'ward_admin', 'pu_agent'].map((role) => {
                    // Hide tabs above the user's role
                    if (user.role === 'lga_admin' && role === 'lga_admin') return null;
                    if (user.role === 'ward_admin' && (role === 'lga_admin' || role === 'ward_admin')) return null;
                    
                    const label = role === 'lga_admin' ? 'LGA Coordinators' : role === 'ward_admin' ? 'Ward Officers' : 'PU Agents';
                    const isActive = activeTab === role;
                    return (
                      <button
                        key={role}
                        onClick={() => setActiveTab(role as any)}
                        className={cn(
                          "pb-3 text-sm font-semibold transition-colors relative",
                          isActive ? "text-[#004d25]" : "text-gray-500 hover:text-gray-800"
                        )}
                      >
                        {label}
                        {isActive && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-[#004d25] rounded-t-full" />}
                      </button>
                    );
                  })}
                </div>
              </div>
              
              <div className="bg-white rounded-b-2xl border-x border-b border-gray-200 flex-1 overflow-hidden flex flex-col">
                <div className="flex-1 overflow-y-auto p-0">
                  {loadingAgents ? (
                    <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-3">
                      <Loader2 className="animate-spin text-[#d4af37]" size={32} />
                      <p>Loading agent records...</p>
                    </div>
                  ) : filteredAgents.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-gray-400 p-8 text-center space-y-3">
                      <Filter size={48} className="text-gray-200" />
                      <p className="text-lg font-medium text-gray-900">No agents found</p>
                      <p className="max-w-xs text-sm">There are no {activeTab.replace('_', ' ')}s in your jurisdiction yet.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {filteredAgents.map(agent => (
                        <div key={agent.id} className="p-5 hover:bg-gray-50 transition-colors flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
                          <div className="flex gap-4">
                            <div className="w-10 h-10 rounded-full bg-green-100 text-[#004d25] flex items-center justify-center font-bold text-sm shrink-0">
                              {agent.name.substring(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                                {agent.name}
                                {agent.withdrawalRequested && agent.paymentStatus !== 'paid' && (
                                  <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-bold uppercase">Requested</span>
                                )}
                              </h4>
                              <div className="flex items-center gap-3 mt-1">
                                {agent.isEligible ? (
                                  <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                                    <CheckCircle size={12} /> Conditions Met
                                  </span>
                                ) : (
                                  <span className="text-xs text-amber-600 font-medium flex items-center gap-1">
                                    <Clock size={12} /> Pending Uploads
                                  </span>
                                )}
                              </div>
                              {agent.role === 'pu_agent' && agent.results && agent.results.length > 0 && (
                                <div className="mt-3 text-xs bg-gray-50 border border-gray-200 rounded-lg p-3 w-full sm:min-w-[250px]">
                                  <p className="font-semibold text-gray-700 mb-1.5 flex items-center gap-1"><CheckCircle size={12} className="text-green-600"/> Uploaded Result Summary</p>
                                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-gray-600 mb-2">
                                    <div>PDP: <span className="font-bold">{agent.results[0].results_json?.political_party_results?.find((p: any) => p.party === 'PDP')?.votes_in_figures || 0}</span></div>
                                    <div>APC: <span className="font-bold">{agent.results[0].results_json?.political_party_results?.find((p: any) => p.party === 'APC')?.votes_in_figures || 0}</span></div>
                                    <div>LP: <span className="font-bold">{agent.results[0].results_json?.political_party_results?.find((p: any) => p.party === 'LP')?.votes_in_figures || 0}</span></div>
                                    <div>NNPP: <span className="font-bold">{agent.results[0].results_json?.political_party_results?.find((p: any) => p.party === 'NNPP')?.votes_in_figures || 0}</span></div>
                                  </div>
                                  {agent.results[0].image_url && (
                                    <a href={agent.results[0].image_url} target="_blank" rel="noopener noreferrer" className="text-[#004d25] hover:text-[#006331] hover:underline inline-flex items-center gap-1 font-medium bg-green-50 px-2 py-1 rounded">
                                      View Result Image ↗
                                    </a>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                          
                          <div className="flex flex-col sm:items-end w-full sm:w-auto mt-2 sm:mt-0 gap-2">
                            {agent.bankName && agent.accountNumber ? (
                              <div className="text-sm text-gray-600 font-mono flex items-center gap-2">
                                <Landmark size={14} className="text-gray-400" />
                                {agent.bankName} ••••{agent.accountNumber.slice(-4)}
                              </div>
                            ) : (
                              <div className="text-sm text-gray-400 italic">No bank details</div>
                            )}
                            
                            {/* Actions or Status */}
                            {isStateAdmin ? (
                              <button
                                onClick={() => handlePayAgent(agent.id)}
                                disabled={
                                  payingAgentId === agent.id || 
                                  agent.paymentStatus === 'paid' || 
                                  !agent.isEligible || 
                                  !agent.bankName
                                }
                                className={cn(
                                  "px-4 py-1.5 rounded-lg font-semibold text-sm transition-all flex items-center justify-center gap-2 min-w-[120px]",
                                  agent.paymentStatus === 'paid'
                                    ? "bg-green-50 text-green-600 border border-green-200 cursor-not-allowed"
                                    : !agent.isEligible || !agent.bankName
                                    ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                                    : "bg-[#004d25] text-white hover:bg-[#006331] shadow-sm cursor-pointer"
                                )}
                              >
                                {payingAgentId === agent.id ? (
                                  <Loader2 className="animate-spin" size={16} />
                                ) : agent.paymentStatus === 'paid' ? (
                                  <>
                                    <CheckCircle size={16} /> Paid
                                  </>
                                ) : (
                                  <>
                                    Pay (Paystack) <ChevronRight size={16} />
                                  </>
                                )}
                              </button>
                            ) : (
                              // LGA / Ward View Only
                              <div className={cn(
                                "px-3 py-1.5 rounded-lg font-semibold text-sm flex items-center gap-2",
                                agent.paymentStatus === 'paid' ? "bg-green-50 text-green-700 border border-green-200" : "bg-gray-100 text-gray-600 border border-gray-200"
                              )}>
                                {agent.paymentStatus === 'paid' ? <><CheckCircle size={14} /> Disbursed</> : <><Clock size={14} /> Unpaid</>}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Allocation Modal */}
      {showAllocationModal && isCentralBank && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="p-6 bg-[#004d25] text-white flex justify-between items-center relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-10 -mt-10" />
              <h3 className="font-bold text-lg flex items-center gap-2 relative z-10">
                <Landmark size={20} className="text-[#d4af37]" />
                Treasury Allocations
              </h3>
              <button onClick={() => setShowAllocationModal(false)} className="text-white/70 hover:text-white transition-colors relative z-10">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-500 mb-6">Configure the default payout amounts for each agent level. These amounts will be deducted from the Central Treasury upon payment.</p>
              
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">LGA Coordinator Payout</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">₦</span>
                  <input 
                    type="number" 
                    value={allocations.lga}
                    onChange={(e) => setAllocations(prev => ({...prev, lga: Number(e.target.value)}))}
                    className="w-full border border-gray-300 rounded-lg py-2 pl-8 pr-4 font-semibold focus:ring-2 focus:ring-[#004d25] focus:border-[#004d25] outline-none"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Ward Officer Payout</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">₦</span>
                  <input 
                    type="number" 
                    value={allocations.ward}
                    onChange={(e) => setAllocations(prev => ({...prev, ward: Number(e.target.value)}))}
                    className="w-full border border-gray-300 rounded-lg py-2 pl-8 pr-4 font-semibold focus:ring-2 focus:ring-[#004d25] focus:border-[#004d25] outline-none"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">PU Agent Payout</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">₦</span>
                  <input 
                    type="number" 
                    value={allocations.pu}
                    onChange={(e) => setAllocations(prev => ({...prev, pu: Number(e.target.value)}))}
                    className="w-full border border-gray-300 rounded-lg py-2 pl-8 pr-4 font-semibold focus:ring-2 focus:ring-[#004d25] focus:border-[#004d25] outline-none"
                  />
                </div>
              </div>

              {/* Dynamic Projection Simulation */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mt-4 text-sm">
                <p className="font-bold text-gray-700 mb-3 flex items-center gap-2">
                  <Wallet size={16} className="text-[#d4af37]" />
                  Projected Disbursement Cost
                </p>
                <div className="space-y-1.5 text-gray-600 mb-3 border-b border-gray-200 pb-3">
                  <div className="flex justify-between">
                    <span>{stateCounts.lga.toLocaleString()} LGA × ₦{allocations.lga.toLocaleString('en-NG')}</span>
                    <span className="font-semibold">₦{(stateCounts.lga * allocations.lga).toLocaleString('en-NG')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{stateCounts.ward.toLocaleString()} Ward × ₦{allocations.ward.toLocaleString('en-NG')}</span>
                    <span className="font-semibold">₦{(stateCounts.ward * allocations.ward).toLocaleString('en-NG')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{stateCounts.pu.toLocaleString()} PU × ₦{allocations.pu.toLocaleString('en-NG')}</span>
                    <span className="font-semibold">₦{(stateCounts.pu * allocations.pu).toLocaleString('en-NG')}</span>
                  </div>
                  <div className="flex justify-between pt-1 mt-1 border-t border-gray-200">
                    <span className="text-gray-500">Agent Subtotal</span>
                    <span className="font-semibold">₦{agentSubtotal.toLocaleString('en-NG')}</span>
                  </div>
                  <div className="flex justify-between text-amber-700 bg-amber-50 -mx-1 px-1 py-0.5 rounded">
                    <span>+ Gateway Fee (2% Paystack)</span>
                    <span className="font-semibold">₦{gatewayFee.toLocaleString('en-NG')}</span>
                  </div>
                </div>
                <div className="flex justify-between font-bold text-gray-900 text-base">
                  <span>Total Required:</span>
                  <span className={cn(
                    projectedTotal > treasuryBalance ? 'text-red-600' : 'text-[#004d25]'
                  )}>
                    ₦{projectedTotal.toLocaleString('en-NG')}
                  </span>
                </div>
                {projectedTotal > treasuryBalance && (
                  <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                    <AlertCircle size={11} /> Exceeds treasury balance by ₦{(projectedTotal - treasuryBalance).toLocaleString('en-NG')}
                  </p>
                )}
              </div>

              {/* Batch Allocation File Attachment */}
              <div className="pt-2">
                <FileUpload
                  label="Batch Payout Schedule & Approval Docs"
                  description="Attach allocation sheets (.xlsx, .csv) or official authorization letters (.pdf, .docx)"
                  value={adminBatchDocs}
                  onChange={setAdminBatchDocs}
                  allowedExtensions={['xlsx', 'xls', 'csv', 'pdf', 'docx', 'doc']}
                  maxFiles={3}
                />
              </div>

              <div className="pt-4 border-t border-gray-100 mt-6">
                <button 
                  onClick={async () => {
                    if (!user?.stateId) return;
                    const { error } = await supabase.from('treasury_allocations').upsert({
                      state_id: user.stateId,
                      lga_payout: allocations.lga,
                      ward_payout: allocations.ward,
                      pu_payout: allocations.pu,
                      allocated_total: projectedTotal,
                      updated_at: new Date().toISOString(),
                      updated_by: user.id,
                    }, { onConflict: 'state_id' });
                    if (error) {
                      toast.error('Failed to save allocations.');
                    } else {
                      setAllocatedAmount(projectedTotal);
                      toast.success('Allocations saved and persisted!');
                      setShowAllocationModal(false);
                    }
                  }}
                  className="w-full bg-[#004d25] text-white font-bold py-3 rounded-lg hover:bg-[#003d1e] transition-colors"
                >
                  Save Allocations
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
