import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';
import { MessageSquare, Users, Wallet, Send, AlertCircle, CheckCircle, Phone, TrendingUp } from 'lucide-react';
import { cn } from '../lib/utils';

const SMS_COST_PER_UNIT = 11; // ₦11 per SMS (updated rate)
const SMS_PAGES = 1; // 1 page = 160 chars

export default function Sms() {
  const { user, totalVotersCount } = useApp();
  const [voterCount, setVoterCount] = useState(0);
  const [allocation, setAllocation] = useState<{allocated_total: number} | null>(null);
  
  const costPerSms = SMS_COST_PER_UNIT;
  const smsPages = SMS_PAGES;
  const totalSentCount = 3; // Simulated count of sent SMS
  const totalSentNaira = totalSentCount * costPerSms;

  const [campaigns, setCampaigns] = useState([
    { id: 'otp-1', name: 'Agent OTP Verification', recipients: 1, status: 'sent', date: 'Real-time', cost: 11, type: 'OTP', code: '346867' },
    { id: 'otp-2', name: 'Agent OTP Verification', recipients: 1, status: 'sent', date: 'Real-time', cost: 11, type: 'OTP', code: '582914' },
    { id: 'otp-3', name: 'Agent OTP Verification', recipients: 1, status: 'sent', date: 'Real-time', cost: 11, type: 'OTP', code: '719385' },
  ]);

  useEffect(() => {
    const fetchData = async () => {
      if (!user?.stateId) {
        setVoterCount(totalVotersCount || 0);
        return;
      }

      const stateId = user.stateId;
      const [{ count }, { data: allocData }] = await Promise.all([
        supabase.from('voters').select('*', { count: 'exact', head: true }).eq('state_id', stateId),
        supabase.from('treasury_allocations').select('allocated_total').eq('state_id', stateId).maybeSingle()
      ]);

      const c = count || 0;
      setVoterCount(c);
      setAllocation(allocData);
      
      setCampaigns(prev => prev.map(cam => {
        if (cam.id.startsWith('otp')) {
          return { ...cam, cost: cam.recipients * costPerSms };
        }
        return { ...cam, recipients: c, cost: c * costPerSms * smsPages };
      }));
    };
    fetchData();
  }, [user?.stateId, totalVotersCount]);

  const totalAllocated = allocation?.allocated_total || 5000000;
  const totalLeft = Math.max(0, totalAllocated - totalSentNaira);
  const totalCampaignCost = campaigns.reduce((sum, c) => sum + c.cost, 0);

  const fmt = (n: number) => `₦${n.toLocaleString('en-NG', { minimumFractionDigits: 0 })}`;

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className='p-4'>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">SMS & OTP Tracking</h1>
          <p className="text-gray-500 mt-1">Monitor outreach spend, OTP services, and budget utilization.</p>
        </div>
        <div className="hidden bg-[#004d25] text-white px-5 py-2.5 rounded-xl shadow-md  items-center gap-3">
          <div className="w-10 h-10 bg-green-900/50 rounded-full flex items-center justify-center">
             <MessageSquare size={20} className="text-[#d4af37]" />
          </div>
          {/* <div>
            <p className="text-xs text-green-200 uppercase tracking-wider font-semibold">Total Voters Reach</p>
            <p className="font-mono text-xl font-bold">{voterCount.toLocaleString()}</p>
          </div> */}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
          <p className="text-gray-400 text-[10px] uppercase tracking-widest font-bold mb-1 flex items-center gap-1">
             <Wallet size={12} className="text-[#004d25]" /> Wallet Balance
          </p>
          {/* <p className="text-3xl font-bold text-gray-900 font-mono">{fmt(totalLeft)}</p> */}
           <p className="text-3xl font-bold text-gray-900 font-mono">₦77</p>
          <p className="text-[10px] text-green-600 font-medium mt-1">Available for sends</p>
        </div>
        
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
          <p className="text-gray-400 text-[10px] uppercase tracking-widest font-bold mb-1 flex items-center gap-1">
             <Send size={12} className="text-blue-600" /> Total SMS Sent
          </p>
          <div className="flex items-baseline gap-2">
            <p className="text-3xl font-bold text-gray-900 font-mono">{fmt(totalSentNaira)}</p>
            <span className="text-sm font-semibold text-gray-500">({totalSentCount.toLocaleString()} SMS)</span>
          </div>
          <p className="text-[10px] text-blue-600 font-medium mt-1">Sent SMS Cost</p>
        </div>
      </div>

      {/* Campaign & Service List */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center">
          <h2 className="font-bold text-gray-900 flex items-center gap-2">
            <MessageSquare size={18} className="text-[#004d25]" />
            Active & Planned Services (Activity Log)
          </h2>
          <span className="text-xs font-bold text-gray-400 bg-gray-100 px-3 py-1 rounded-full text-nowrap">
            {campaigns.length} items
          </span>
        </div>
        <div className="divide-y divide-gray-50">
          {campaigns.map((cam, idx) => (
            <div key={`${cam.id}-${idx}`} className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-gray-50 transition-colors">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className={cn(
                    'text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide',
                    cam.status === 'sent' ? 'bg-green-100 text-green-700' :
                    cam.status === 'yet to send' ? 'bg-amber-100 text-amber-700' :
                    'bg-gray-100 text-gray-500'
                  )}>
                    {cam.status}
                  </span>
                  <p className="font-semibold text-gray-900 text-sm">{cam.name}</p>
                  <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-bold uppercase">{cam.type}</span>
                </div>
                <p className="text-xs text-gray-400">
                   {cam.id.startsWith('otp') ? `Here is your OTP code to verify your agent login ${cam.code || '346867'}. Expires in 10 minutes` : `Scheduled: ${cam.date} · ${cam.recipients.toLocaleString()} recipients`}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs text-gray-400 mb-0.5"> Cost</p>
                <p className="font-bold text-[#004d25] font-mono text-sm">{fmt(cam.cost)}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Footer summary */}
        {/* <div className="p-5 bg-gray-50 border-t border-gray-100 flex justify-between items-center">
          <p className="text-sm text-gray-500 font-medium">Total projected spend across all campaigns & services</p>
          <p className="font-bold text-gray-900 font-mono text-lg">{fmt(totalCampaignCost)}</p>
        </div> */}
      </div>

      {/* Disclaimer */}
      <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-800">
        <AlertCircle size={18} className="shrink-0 mt-0.5 text-blue-600" />
        <p>
          <strong>Automatic Budgeting:</strong> SMS costs are deducted from the state's treasury allocation. 
          Ensure your "Wallet Balance" covers the planned campaigns.
          Current rate is locked at <strong>₦11.00/SMS</strong>.
        </p>
      </div>
    </div>
  );
}
