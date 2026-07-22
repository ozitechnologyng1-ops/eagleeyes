import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';
import { Wallet, Landmark, CreditCard, CheckCircle, Clock, ChevronRight, Loader2, AlertCircle, Building2, Send, Filter, Settings, X, FileText, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '../lib/utils';
import FileUpload, { UploadedFile } from '../components/FileUpload';

export default function Payment() {
  const { user, updateUser, stats } = useApp();
  
  const [bankName, setBankName] = useState(user?.bankName || '');
  const [accountName, setAccountName] = useState(user?.accountName || '');
  const [accountNumber, setAccountNumber] = useState(user?.accountNumber || '');
  
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
                ? (myEligible ? "Unit Results Uploaded" : "Pending Unit Uploads") 
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

  const handleSaveBankDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bankName || !accountName || !accountNumber) {
      toast.error('Please fill in all bank details');
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
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Payments & Remuneration</h1>
          <p className="text-gray-500 mt-1">Manage disbursements, track eligibility, and request withdrawals.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          {/* Top-Right Upload Button - Always visible regardless of banking setup */}
          <button
            type="button"
            onClick={() => setShowUploadModal(true)}
            className="bg-[#004d25] hover:bg-[#003d1e] text-white px-4 py-2.5 rounded-xl shadow-md flex items-center gap-2 text-sm font-bold transition-all cursor-pointer border border-green-800"
          >
            <Upload size={18} className="text-[#d4af37]" />
            <span>Upload Documents</span>
            {uploadedModalDocs.length > 0 && (
              <span className="bg-[#d4af37] text-[#004d25] text-xs px-2 py-0.5 rounded-full font-extrabold ml-1">
                {uploadedModalDocs.length}
              </span>
            )}
          </button>

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
              <label className="block text-sm font-semibold text-gray-700 mb-1">Bank Name</label>
              <input 
                type="text" 
                placeholder="e.g. Access Bank, GTBank" 
                value={bankName}
                onChange={e => setBankName(e.target.value)}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#004d25] focus:border-transparent transition-all outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Account Name</label>
              <input 
                type="text" 
                placeholder="e.g. John Doe" 
                value={accountName}
                onChange={e => setAccountName(e.target.value)}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#004d25] focus:border-transparent transition-all outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Account Number</label>
              <input 
                type="text" 
                placeholder="10 digit account number" 
                value={accountNumber}
                onChange={e => setAccountNumber(e.target.value)}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#004d25] focus:border-transparent transition-all outline-none font-mono"
              />
            </div>
            
            <button 
              type="submit" 
              disabled={isSaving}
              className="w-full bg-[#004d25] hover:bg-[#006331] text-white font-bold py-3.5 px-4 rounded-xl transition-all shadow-md hover:shadow-lg disabled:opacity-70 flex justify-center items-center gap-2 mt-4"
            >
              {isSaving ? <Loader2 className="animate-spin" size={20} /> : <CheckCircle size={20} />}
              <span>Save Details & Continue</span>
            </button>
          </form>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Bank Details & My Status */}
          {!isCentralBank && (
          <div className="lg:col-span-1 space-y-6">
            {/* My Bank Details Card */}
            <div className="bg-gradient-to-br from-[#004d25] to-[#002a14] rounded-2xl p-6 text-white shadow-xl relative overflow-hidden group">
              <div className="absolute -right-10 -top-10 w-40 h-40 bg-white/5 rounded-full blur-2xl group-hover:bg-white/10 transition-all duration-500" />
              <div className="absolute -left-10 -bottom-10 w-32 h-32 bg-[#d4af37]/20 rounded-full blur-xl group-hover:bg-[#d4af37]/30 transition-all duration-500" />
              
              <div className="relative z-10">
                <div className="flex justify-between items-center mb-8">
                  <span className="text-green-100 font-medium tracking-wide flex items-center gap-2">
                    <Wallet size={18} className="text-[#d4af37]" />
                    My Account
                  </span>
                  <button 
                    onClick={() => setIsEditingBank(true)}
                    className="text-xs bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-full transition-colors backdrop-blur-sm font-medium"
                  >
                    Edit
                  </button>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <p className="text-green-200/60 text-[10px] font-bold uppercase tracking-widest mb-1">Account Number</p>
                    <p className="font-mono text-2xl tracking-widest text-white drop-shadow-sm">{user.accountNumber}</p>
                  </div>
                  <div className="flex justify-between items-end border-t border-white/10 pt-4 mt-2">
                    <div>
                      <p className="text-green-200/60 text-[10px] font-bold uppercase tracking-widest mb-1">Account Name</p>
                      <p className="font-semibold text-sm truncate max-w-[150px]">{user.accountName}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-green-200/60 text-[10px] font-bold uppercase tracking-widest mb-1">Bank</p>
                      <p className="font-bold text-[#d4af37] text-sm truncate max-w-[100px]">{user.bankName}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* My Withdrawal Status */}
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-[#d4af37]" />
              <h3 className="font-bold text-gray-900 mb-2 flex items-center gap-2">
                <CreditCard size={18} className="text-[#004d25]" />
                My Payout Status
              </h3>
              
              <div className="bg-gray-50 rounded-xl p-4 mb-4 border border-gray-100">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-gray-600">Condition:</span>
                  {myEligibility.eligible ? (
                    <span className="text-xs font-bold text-green-600 bg-green-100 px-2 py-1 rounded flex items-center gap-1">
                      <CheckCircle size={12} /> Satisfied
                    </span>
                  ) : (
                    <span className="text-xs font-bold text-amber-600 bg-amber-100 px-2 py-1 rounded flex items-center gap-1">
                      <Clock size={12} /> Pending
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 italic mb-3">{myEligibility.text}</p>
                
                {user?.role === 'pu_agent' && myResults.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <p className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1"><CheckCircle size={12} className="text-green-600"/> My Uploaded Result Summary</p>
                    <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs text-gray-600 mb-2">
                      <div>PDP: <span className="font-bold text-gray-900">{myResults[0].results_json?.political_party_results?.find((p: any) => p.party === 'PDP')?.votes_in_figures || 0}</span></div>
                      <div>APC: <span className="font-bold text-gray-900">{myResults[0].results_json?.political_party_results?.find((p: any) => p.party === 'APC')?.votes_in_figures || 0}</span></div>
                      <div>LP: <span className="font-bold text-gray-900">{myResults[0].results_json?.political_party_results?.find((p: any) => p.party === 'LP')?.votes_in_figures || 0}</span></div>
                      <div>NNPP: <span className="font-bold text-gray-900">{myResults[0].results_json?.political_party_results?.find((p: any) => p.party === 'NNPP')?.votes_in_figures || 0}</span></div>
                    </div>
                    {myResults[0].image_url && (
                      <a href={myResults[0].image_url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-[#004d25] hover:text-[#006331] hover:underline inline-flex items-center gap-1 font-bold bg-green-50 px-2 py-1 rounded border border-green-100">
                        View Uploaded Image ↗
                      </a>
                    )}
                  </div>
                )}
              </div>

              {/* Supporting Document Upload Feature */}
              <div className="mb-4 pt-3 border-t border-gray-100">
                <FileUpload
                  label="Supporting Documents"
                  description="Upload ID proof, payment voucher (PDF, DOCX) or bank statement (PDF, Excel)"
                  value={myDocuments}
                  onChange={setMyDocuments}
                  allowedExtensions={['pdf', 'xlsx', 'xls', 'docx', 'doc', 'csv']}
                  maxFiles={3}
                />
              </div>

              <button
                onClick={handleRequestWithdrawal}
                disabled={!myEligibility.eligible || myWithdrawalRequested}
                className={cn(
                  "w-full py-3 rounded-xl font-bold text-sm transition-all flex justify-center items-center gap-2 cursor-pointer",
                  myWithdrawalRequested 
                    ? "bg-gray-100 text-gray-400 cursor-not-allowed" 
                    : myEligibility.eligible
                    ? "bg-[#004d25] hover:bg-[#006331] text-white shadow-md hover:shadow-lg"
                    : "bg-gray-100 text-gray-400 cursor-not-allowed"
                )}
              >
                {myWithdrawalRequested ? "Withdrawal Requested" : "Request Withdrawal"}
              </button>
            </div>
          </div>
          )}

          {/* Right Column: Sub-Agent Payouts / Dashboard */}
          {user.role !== 'pu_agent' && (
            <div className={cn("flex flex-col h-[700px]", isCentralBank ? "lg:col-span-3" : "lg:col-span-2")}>
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

      {/* Upload Popout Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 border border-gray-100">
            <div className="p-5 bg-gradient-to-r from-[#004d25] to-[#00381b] text-white flex justify-between items-center relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-10 -mt-10" />
              <h3 className="font-bold text-lg flex items-center gap-2 relative z-10">
                <Upload size={20} className="text-[#d4af37]" />
                Upload Payment Documents
              </h3>
              <button 
                type="button"
                onClick={() => setShowUploadModal(false)} 
                className="text-white/70 hover:text-white transition-colors relative z-10 cursor-pointer p-1.5 rounded-lg hover:bg-white/10"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-600">
                Upload any supporting payment verification documents, receipts, bank statements (PDF, Excel), or vouchers (DOCX).
              </p>

              <FileUpload
                label="Payment & Supporting Documents"
                description="Supports PDF (.pdf), Excel (.xlsx, .csv), and Word (.docx) up to 10MB"
                value={uploadedModalDocs}
                onChange={(newFiles) => {
                  setUploadedModalDocs(newFiles);
                  setMyDocuments(newFiles);
                }}
                allowedExtensions={['pdf', 'xlsx', 'xls', 'docx', 'doc', 'csv', 'png', 'jpg']}
                maxFiles={10}
              />

              <div className="pt-4 border-t border-gray-100 flex justify-end items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="px-5 py-2.5 rounded-xl font-bold text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors cursor-pointer border border-gray-200"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (uploadedModalDocs.length === 0) {
                      toast.error('Please attach at least one file before uploading');
                      return;
                    }
                    setShowUploadModal(false);
                    toast.success(`Successfully uploaded ${uploadedModalDocs.length} document(s)`);
                  }}
                  className="px-5 py-2.5 rounded-xl font-bold text-sm bg-[#004d25] hover:bg-[#00381b] text-white shadow-md hover:shadow-lg transition-all flex items-center gap-2 cursor-pointer"
                >
                  <Upload size={16} className="text-[#d4af37]" />
                  <span>Upload ({uploadedModalDocs.length})</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
