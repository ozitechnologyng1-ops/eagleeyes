import React, { useState, useEffect } from 'react';
import { useApp, roleHierarchy, Agent, Location, Role } from '../context/AppContext';
import { 
  Users, Target, UploadCloud, MapPin, Activity, CheckCircle, Smartphone, Camera, 
  FileText, PieChart as PieChartIcon, ChevronRight, UserPlus, AlertTriangle, 
  CheckCircle2, XCircle, Search, ChevronDown, ChevronUp, UserCheck, UserX, Shield, 
  Phone, Layers, Loader2, MessageSquare, Bot, QrCode, DollarSign, Send, RefreshCw,
  Copy, Check, MessageCircle
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LabelList } from 'recharts';
import { useNavigate } from 'react-router-dom';
import { cn, getFriendlyErrorMessage } from '../lib/utils';
import ResultFilters from '../components/ResultFilters';
import AgentModal from '../components/AgentModal';
import toast from 'react-hot-toast';
import { greenApiService, WhatsAppInstance } from '../lib/greenApi';

import { supabase } from '../lib/supabase';

export default function Dashboard() {
  const { 
    user, stats, agents, locations, getDescendantLocations, voters, totalVotersCount, 
    electionResults, voterPuFilter, setVoterPuFilter, addAgent, updateAgent 
  } = useApp();
  const [activeTab, setActiveTab] = useState<'canvassing' | 'elections'>('canvassing');

  // Agent Modal & quick assign state
  const [isAgentModalOpen, setIsAgentModalOpen] = useState(false);
  const [agentModalLocation, setAgentModalLocation] = useState<Location | null>(null);
  const [agentModalInitialData, setAgentModalInitialData] = useState<Partial<Agent> | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleSaveAgent = async (agentData: Partial<Agent>) => {
    try {
      if (agentModalInitialData?.id) {
        await updateAgent(agentModalInitialData.id, agentData);
        toast.success('Agent updated successfully');
      } else {
        await addAgent(agentData);
        toast.success('Agent registered successfully');
      }
      setIsAgentModalOpen(false);
      setRefreshTrigger(prev => prev + 1);
    } catch (err: any) {
      toast.error(getFriendlyErrorMessage(err));
    }
  };

  if (!user) return null;

  const allowedLocations = getDescendantLocations(user.locationId);
  const allowedLocationIds = allowedLocations.map(l => l.id);
  const visibleAgents = agents.filter(a => 
    allowedLocationIds.includes(a.locationId) && 
    roleHierarchy[a.role] < roleHierarchy[user.role]
  );  return (
    <div className="space-y-6">
      <DashboardHeader 
        user={user} 
        locations={locations} 
        onOpenRegisterAgent={() => {
          setAgentModalLocation(null);
          setAgentModalInitialData(null);
          setIsAgentModalOpen(true);
        }}
      />

      {/* Jurisdiction Deployment Summary based on user level */}
      <JurisdictionDeploymentSummary
        user={user}
        locations={locations}
        onAddAgent={(loc, targetRole) => {
          setAgentModalLocation(loc);
          setAgentModalInitialData({ role: targetRole });
          setIsAgentModalOpen(true);
        }}
        onEditAgent={(agent) => {
          setAgentModalLocation(null);
          setAgentModalInitialData(agent);
          setIsAgentModalOpen(true);
        }}
        refreshTrigger={refreshTrigger}
      />

      {(user.role === 'pu_agent' || user.role === 'ward_admin') && (
        <AgentQuickActions user={user} locations={locations} />
      )}
      
      {user.role !== 'pu_agent' && user.role !== 'ward_admin' && (
        <div className="flex border-b border-gray-200">
          <button 
            onClick={() => setActiveTab('canvassing')}
            className={cn("px-6 py-3 text-sm font-medium border-b-2 transition-colors cursor-pointer", activeTab === 'canvassing' ? "border-[#004d25] text-[#004d25]" : "border-transparent text-gray-500 hover:text-gray-700")}
          >
            Canvassing Overview
          </button>
          <button 
            onClick={() => setActiveTab('elections')}
            className={cn("px-6 py-3 text-sm font-medium border-b-2 transition-colors cursor-pointer", activeTab === 'elections' ? "border-[#004d25] text-[#004d25]" : "border-transparent text-gray-500 hover:text-gray-700")}
          >
            Election Results
          </button>
        </div>
      )}

      {activeTab === 'canvassing' ? (
        <CanvassingDashboard stats={stats} agents={visibleAgents} locations={allowedLocations} user={user} voters={voters} totalVotersCount={totalVotersCount} />
      ) : user.role === 'national_admin' ? (
        <>
          <NationalDashboard stats={stats} />
          <ElectionsDashboard stats={stats} voters={voters} totalVotersCount={totalVotersCount} electionResults={electionResults} user={user} locations={locations} />
        </>
      ) : (
        <ElectionsDashboard stats={stats} voters={voters} totalVotersCount={totalVotersCount} electionResults={electionResults} user={user} locations={locations} />
      )}

      {/* Register / Edit Agent Modal */}
      <AgentModal
        isOpen={isAgentModalOpen}
        onClose={() => {
          setIsAgentModalOpen(false);
          setAgentModalLocation(null);
          setAgentModalInitialData(null);
        }}
        onSave={handleSaveAgent}
        initialData={agentModalInitialData || undefined}
        fixedLocation={agentModalLocation || undefined}
        locations={locations}
        userRole={user.role}
      />
    </div>
  );
}

function DashboardHeader({ user, locations, onOpenRegisterAgent }: any) {
  const { isMockMode, toggleMockMode } = useApp();
  const locationName = user.locationName || locations.find((l: any) => l.id === user.locationId)?.name || 'National';
  const [pathParts, setPathParts] = useState<string[]>([]);
  const [isPathExpanded, setIsPathExpanded] = useState(false);

  useEffect(() => {
    if (!user) return;
    let isCancelled = false;

    async function resolvePath() {
      const parts: string[] = [];

      if (user.role === 'national_admin') {
        setPathParts(['Nigeria']);
        return;
      }

      // 1. State
      let stateName = locations.find((l: any) => l.id === `state_${user.stateId}`)?.name;
      if (!stateName && user.stateId) {
        const { data } = await supabase.from('states').select('name').eq('id', user.stateId).single();
        if (data) stateName = data.name;
      }
      if (stateName) parts.push(`${stateName} State`);

      // 2. LGA
      if (user.lgaId) {
        let lgaName = locations.find((l: any) => l.id === `lga_${user.lgaId}`)?.name;
        if (!lgaName) {
          const { data } = await supabase.from('local_governments').select('name').eq('id', user.lgaId).single();
          if (data) lgaName = data.name;
        }
        if (lgaName) parts.push(`${lgaName} LGA`);
      }

      // 3. Ward
      if (user.wardId) {
        let wardName = user.role === 'ward_admin' ? user.locationName : null;
        if (!wardName) {
          const { data } = await supabase.from('wards').select('name').eq('id', user.wardId).single();
          if (data) wardName = data.name;
        }
        if (wardName) parts.push(wardName.toLowerCase().includes('ward') ? wardName : `${wardName} Ward`);
      }

      // 4. Polling Unit
      if (user.role === 'pu_agent' || user.puId) {
        let puName = user.role === 'pu_agent' ? user.locationName : null;
        const puTargetId = user.puId;
        if (!puName && puTargetId) {
          const { data } = await supabase.from('polling_units').select('name').eq('id', puTargetId).single();
          if (data) puName = data.name;
        }
        if (puName) parts.push(`${puName} PU`);
      }

      if (!isCancelled) {
        setPathParts(parts);
      }
    }

    resolvePath();
    return () => { isCancelled = true; };
  }, [user, locations]);

  return (
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-2xl border border-gray-100 shadow-xs">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {user.role === 'national_admin' ? 'National Headquarters' : `${locationName} Dashboard`}
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {user.role === 'national_admin' ? 'Nigeria Overview' : `${user.role.replace('_', ' ').toUpperCase()} • Jurisdiction Overview`}
        </p>
        {user.role === 'pu_agent' && (
          <p className="text-xs text-gray-500 mt-1">
            You are registered as the primary polling unit agent for this location.
          </p>
        )}
        {pathParts.length > 0 && (
          <div className="flex items-center gap-1.5 text-[11px] text-gray-500 flex-wrap mt-2 pt-1 border-t border-gray-100">
            <MapPin size={12} className="text-[#004d25] shrink-0" />
            <span className="font-semibold text-gray-700">Jurisdiction:</span>
            {pathParts.length <= 2 || isPathExpanded ? (
              <>
                {pathParts.map((part, i) => (
                  <React.Fragment key={i}>
                    {i > 0 && <span className="text-gray-300">/</span>}
                    <span className="text-gray-600 font-medium">{part}</span>
                  </React.Fragment>
                ))}
                {pathParts.length > 2 && (
                  <button
                    type="button"
                    onClick={() => setIsPathExpanded(false)}
                    className="text-[10px] text-[#004d25] hover:underline ml-1 font-semibold cursor-pointer"
                  >
                    (less)
                  </button>
                )}
              </>
            ) : (
              <>
                <span className="text-gray-400">... /</span>
                <span className="text-gray-600 font-medium">{pathParts[pathParts.length - 2]}</span>
                <span className="text-gray-300">/</span>
                <span className="text-gray-600 font-medium">{pathParts[pathParts.length - 1]}</span>
                <button
                  type="button"
                  onClick={() => setIsPathExpanded(true)}
                  className="text-[10px] text-[#004d25] hover:underline ml-1 font-semibold cursor-pointer"
                >
                  (full path)
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {user.role !== 'pu_agent' && (
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onOpenRegisterAgent}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#004d25] hover:bg-[#006331] text-white text-sm font-semibold rounded-xl shadow-xs transition-all cursor-pointer"
          >
            <UserPlus size={17} />
            <span>Register Agent</span>
          </button>
        </div>
      )}
    </div>
  );
}


function StatCard({ title, value, icon: Icon, subtitle, colorClass }: any) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex items-start gap-4">
      <div className={`p-3 rounded-lg ${colorClass}`}>
        <Icon size={24} />
      </div>
      <div>
        <p className="text-sm font-medium text-gray-500">{title}</p>
        <h3 className="text-2xl font-bold text-gray-900 mt-1">{value}</h3>
        {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
      </div>
    </div>
  );
}

function NationalDashboard({ stats }: any) {
  const { activeElectionGroup, setActiveElectionGroup, endAllMockElections, isMockMode } = useApp();
  const [confirmPhase, setConfirmPhase] = useState<any>(null);

  const handlePhaseChange = (phase: any) => {
    if (phase !== activeElectionGroup) {
      setConfirmPhase(phase);
    }
  };

  const confirmPhaseChange = () => {
    if (confirmPhase) {
      setActiveElectionGroup(confirmPhase);
      setConfirmPhase(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Global Election Controls</h2>
        <div className="flex flex-col md:flex-row gap-6 justify-between items-start md:items-center">
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">Active Election Phase</h3>
            <div className="flex gap-2">
              <button 
                onClick={() => handlePhaseChange('national')}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-medium transition-colors", 
                  activeElectionGroup === 'national' ? "bg-[#004d25] text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                )}
              >
                National (Presidential, Senate, House)
              </button>
              <button 
                onClick={() => handlePhaseChange('state')}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-medium transition-colors", 
                  activeElectionGroup === 'state' ? "bg-[#004d25] text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                )}
              >
                State (Governorship, State House)
              </button>
            </div>
          </div>
        </div>
      </div>

      {confirmPhase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setConfirmPhase(null)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Confirm Phase Change</h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to switch the active election phase to <strong>{confirmPhase === 'national' ? 'National' : 'State'}</strong>? This will change the available elections for result capture across the platform.
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => setConfirmPhase(null)}
                className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50 font-medium"
              >
                Cancel
              </button>
              <button 
                onClick={confirmPhaseChange}
                className="flex-1 px-4 py-2 bg-[#004d25] text-white rounded-lg hover:bg-[#006331] font-medium"
              >
                Yes, Switch
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CanvassingDashboard({ stats, agents, locations, user, voters, totalVotersCount }: any) {
  const navigate = useNavigate();
  const COLORS = ['#004d25', '#d4af37', '#e11d48', '#6b7280'];
  const { canvassing } = stats;
  const isAgent = user?.role === 'pu_agent' || user?.role === 'ward_admin';
  const votersHeading = user?.role === 'ward_admin' 
    ? "Voters in your Ward" 
    : user?.role === 'pu_agent' 
    ? "Voters in your Polling Unit" 
    : "Total Registered Voters";

  const listHeading = user?.role === 'ward_admin' 
    ? "Voters in your Ward" 
    : user?.role === 'pu_agent' 
    ? "Voters in your Polling Unit" 
    : "Voters in your PU / Ward";

  const getVoterStatusBadge = (status: string) => {
    switch (status) {
      case 'ADC Supporter': return 'bg-green-100 text-green-800 border-green-200';
      case 'Opposition': return 'bg-red-100 text-red-800 border-red-200';
      case 'Undecided': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'Unreachable': return 'bg-gray-100 text-gray-800 border-gray-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  if (isAgent) {
    return (
      <div className="space-y-4">
        {/* Mini List of 5 Target Voters for Quick Canvassing */}
        <div className="bg-white rounded-xl shadow-xs border border-gray-200 overflow-hidden">
          <div className="p-3 sm:p-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm sm:text-base font-bold text-gray-900 flex items-center gap-2">
              <Users className="text-[#004d25]" size={18} />
              <span>{listHeading}</span>
            </h3>
            <button
              onClick={() => navigate('/voters')}
              className="text-xs font-semibold text-[#004d25] hover:text-[#006331] flex items-center gap-1 cursor-pointer"
            >
              <span>View More</span>
              <ChevronRight size={14} />
            </button>
          </div>

          <div className="divide-y divide-gray-100">
            {(!voters || voters.length === 0) ? (
              <div className="p-6 text-center text-gray-500 text-xs">
                No voters loaded yet. Click 'View More' to explore the register.
              </div>
            ) : (
              voters.slice(0, 5).map((voter: any) => {
                let cleanPhone = String(voter.phone || '').replace(/\D/g, '');
                if (cleanPhone.startsWith('0') && cleanPhone.length === 11) {
                  cleanPhone = '234' + cleanPhone.substring(1);
                } else if (!cleanPhone.startsWith('234') && cleanPhone.length === 10) {
                  cleanPhone = '234' + cleanPhone;
                }

                const voterFirstName = (voter.name || '').trim().split(/\s+/)[0] || 'Voter';
                const agentFirstName = (user as any)?.firstName || (user?.name || '').trim().split(/\s+/)[0] || 'Field Agent';
                const defaultOutreachText = `Hello ${voterFirstName}! The time for real change and good governance is now. I am ${agentFirstName}, reaching out directly from our ADC grassroots campaign. Are you ready to make your vote count? Reply to join the movement!`;

                return (
                  <div key={voter.id} className="p-3 sm:p-4 flex items-center justify-between hover:bg-gray-50 transition">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-emerald-50 text-[#004d25] flex items-center justify-center font-bold text-xs">
                        {(voter.name || 'V')[0].toUpperCase()}
                      </div>
                      <div>
                        <h4 className="font-semibold text-xs sm:text-sm text-gray-900">{voter.name}</h4>
                        <p className="text-[11px] text-gray-500 font-mono mt-0.5">{cleanPhone || 'No Phone'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                        {cleanPhone ? (
                          <>
                            <a
                              href={`https://wa.me/${cleanPhone}?text=${encodeURIComponent(defaultOutreachText)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="WhatsApp Voter"
                              className="p-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 transition flex items-center justify-center"
                            >
                              <MessageCircle size={15} />
                            </a>
                            <a
                              href={`tel:+${cleanPhone}`}
                              title="Call Voter"
                              className="p-2 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 transition flex items-center justify-center"
                            >
                              <Phone size={15} />
                            </a>
                          </>
                        ) : (
                          <button
                            onClick={() => navigate('/voters')}
                            title="View in voter register"
                            className="p-2 rounded-lg bg-gray-100 text-gray-400 hover:text-gray-600 transition"
                          >
                            <ChevronRight size={15} />
                          </button>
                        )}
                      </div>
                    </div>
                );
              })
            )}
          </div>
        </div>

        {/* 2 Stat Cards directly under the list */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <StatCard title={votersHeading} value={totalVotersCount > 0 ? totalVotersCount.toLocaleString() : '0'} icon={Users} colorClass="bg-blue-50 text-blue-600" />
          <StatCard title="Voters Canvassed" value={canvassing.canvassed.toLocaleString()} subtitle={`${Math.round((canvassing.canvassed / (canvassing.target || 1)) * 100)}% of target`} icon={Target} colorClass="bg-green-50 text-green-600" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <StatCard title={votersHeading} value={totalVotersCount > 0 ? totalVotersCount.toLocaleString() : '0'} icon={Users} colorClass="bg-blue-50 text-blue-600" />
        <StatCard title="Voters Canvassed" value={canvassing.canvassed.toLocaleString()} subtitle={`${Math.round((canvassing.canvassed / (canvassing.target || 1)) * 100)}% of target`} icon={Target} colorClass="bg-green-50 text-green-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-semibold mb-4">Voter Stances</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={canvassing.stances}
                  cx="50%"
                  cy="50%"
                  innerRadius={80}
                  outerRadius={120}
                  paddingAngle={5}
                  dataKey="count"
                >
                  {canvassing.stances.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => value.toLocaleString()} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap justify-center gap-4 mt-4">
            {canvassing.stances.map((stance: any, index: number) => (
              <div key={stance.name} className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                <span className="text-sm text-gray-600">{stance.name}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-semibold mb-4">Canvassing Progress</h3>
          <div className="flex flex-col items-center justify-center h-80 space-y-4">
            <div className="relative w-48 h-48">
              <svg className="w-full h-full transform -rotate-90">
                <circle cx="96" cy="96" r="88" className="stroke-current text-gray-100" strokeWidth="16" fill="none" />
                <circle 
                  cx="96" cy="96" r="88" 
                  className="stroke-current text-[#004d25]" 
                  strokeWidth="16" fill="none" 
                  strokeDasharray={`${2 * Math.PI * 88}`}
                  strokeDashoffset={`${2 * Math.PI * 88 * (1 - canvassing.canvassed / canvassing.target)}`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-bold text-gray-900">{Math.round((canvassing.canvassed / canvassing.target) * 100)}%</span>
                <span className="text-sm text-gray-500">of Target</span>
              </div>
            </div>
            <div className="text-center">
              <p className="text-gray-600">Target: <span className="font-bold text-gray-900">{canvassing.target.toLocaleString()}</span></p>
              <p className="text-gray-600">Achieved: <span className="font-bold text-[#004d25]">{canvassing.canvassed.toLocaleString()}</span></p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
function ElectionsDashboard({ stats, voters, totalVotersCount, electionResults, user, locations }: any) {
  const [selectedElection, setSelectedElection] = React.useState<string>('presidential');
  const [filters, setFilters] = React.useState<any>({});
  const [chartTab, setChartTab] = React.useState<'parties' | 'geography'>('parties');
  const [showAllParties, setShowAllParties] = React.useState(false);
  const [showAllGeo, setShowAllGeo] = React.useState(false);
  const [showControls, setShowControls] = React.useState(true);
  
  // Auto-hide controls timer
  React.useEffect(() => {
    if (showControls) {
      const timer = setTimeout(() => setShowControls(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [showControls, chartTab, filters]);

  // Smart Discovery: If the current election type has no data but another one does, auto-switch
  React.useEffect(() => {
    if ((electionResults || []).length > 0) {
      const currentHasData = electionResults.some((r: any) => r.election_type === selectedElection);
      if (!currentHasData) {
        const typesWithData = Array.from(new Set(electionResults.map((r: any) => r.election_type)));
        if (typesWithData.length > 0) {
          setSelectedElection(typesWithData[0] as string);
        }
      }
    }
  }, [electionResults]);

  const { dataSet, electionData } = React.useMemo(() => {
    // 1. Filter by election type
    let data = (electionResults || []).filter((r: any) => r.election_type === selectedElection);
    
    // 2. Filter by location hierarchy
    if (filters.puId) {
      data = data.filter((r: any) => r.polling_units_id == filters.puId);
    } else if (filters.wardId) {
      data = data.filter((r: any) => r.wards_id == filters.wardId);
    } else if (filters.lgaId) {
      // Smart matching for LGA: Match by ID OR by direct name (to handle legacy data mismatches like ID 15)
      data = data.filter((r: any) => 
        r.local_governments_id == filters.lgaId || 
        (r.results_json?.local_government_area && 
         r.results_json.local_government_area.toLowerCase().includes('osofe') && 
         filters.lgaId == 512)
      );
    } else if (filters.stateId) {
      data = data.filter((r: any) => r.state_id == filters.stateId);
    }

    // 3. Aggregate Party Results
    const aggregated = {
      registeredVoters: 0,
      accreditedVoters: 0,
      validVotes: 0,
      voidVotes: 0,
      totalVotes: 0,
      partyResults: [] as { name: string; votes: number }[]
    };

    data.forEach((row: any) => {
      const resJson = row.results_json || {};
      aggregated.registeredVoters += (resJson.number_of_voters_on_register || 0);
      aggregated.accreditedVoters += (resJson.number_of_accredited_voters || 0);
      aggregated.validVotes += (row.total_valid || 0);
      aggregated.voidVotes += (row.total_rejected || 0);
      aggregated.totalVotes += (row.total_cast || 0);

      const parties = resJson.political_party_results || [];
      parties.forEach((p: any) => {
        const partyName = (p.party || '').trim().toUpperCase();
        if (!partyName) return;
        let partyEntry = aggregated.partyResults.find(pr => pr.name === partyName);
        if (partyEntry) {
          partyEntry.votes += (p.votes_in_figures || 0);
        } else {
          aggregated.partyResults.push({ name: partyName, votes: p.votes_in_figures || 0 });
        }
      });
    });

    aggregated.partyResults.sort((a, b) => b.votes - a.votes);
    
    // Sort and store total parties for the toggle count
    const totalParties = aggregated.partyResults.length;
    
    // Use fallback for national/global view if no real data yet
    let finalElectionData = aggregated;
    if (data.length === 0 && Object.keys(filters).length === 0) {
      finalElectionData = stats.elections[selectedElection];
    }

    return { dataSet: data, electionData: finalElectionData };
  }, [electionResults, selectedElection, filters, stats.elections]);

  const nestedComparisonData = React.useMemo(() => {
    if (dataSet.length === 0) return [];
    
    const groups: Record<string, { name: string, votes: number }> = {};
    const isLgaSelected = !!filters.lgaId;
    const isWardSelected = !!filters.wardId;
    
    dataSet.forEach((row: any) => {
      // Determine drill-down level: LGA -> Ward -> PU
      let id, name;
      
      if (isWardSelected) {
        id = row.polling_units_id;
        name = row.pu_name || row.results_json?.polling_unit || (id ? (String(id).startsWith('PU') || String(id).includes('-') ? id : `PU ${id}`) : 'Unspecified PU');
      } else if (isLgaSelected) {
        id = row.wards_id;
        name = row.ward_name || row.results_json?.ward || (id ? `Ward ${id}` : 'Unspecified Ward');
      } else {
        id = row.local_governments_id;
        name = row.lga_name || row.results_json?.local_government_area || (id ? `LGA ${id}` : 'Unassigned LGA');
      }
      
      // Use a consistent key for empty IDs to group them together
      const groupKey = id || 'unassigned';
      
      if (!groups[groupKey]) {
        groups[groupKey] = { name, votes: 0 };
      }
      groups[groupKey].votes += (row.total_cast || 0);
    });

    const totalGeoCount = Object.keys(groups).length;
    return Object.values(groups).sort((a, b) => b.votes - a.votes);
  }, [dataSet, filters.lgaId, filters.wardId]);

  const COLORS = ['#004d25', '#d4af37', '#e11d48', '#2563eb', '#16a34a', '#d97706', '#9333ea', '#0891b2', '#4f46e5', '#be123c'];

  const availableElections = ['presidential', 'senate', 'house', 'governorship', 'state_house'];

  return (
    <div className="space-y-6">
      <ResultFilters user={user} locations={locations} onFilterChange={setFilters} />

      <div className="flex gap-2 overflow-x-auto pb-2">
        {availableElections.map(election => (
          <button
            key={election}
            onClick={() => setSelectedElection(election)}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors",
              selectedElection === election ? "bg-[#004d25] text-white" : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
            )}
          >
            {election.charAt(0).toUpperCase() + election.slice(1)} Election
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard title="Registered Voters" value={electionData.registeredVoters.toLocaleString()} icon={Users} colorClass="bg-pink-50 text-pink-600" />
        <StatCard title="Accredited Voters" value={electionData.accreditedVoters.toLocaleString()} icon={Users} colorClass="bg-blue-50 text-blue-600" />
        <StatCard title="Total Votes Cast" value={electionData.totalVotes.toLocaleString()} icon={UploadCloud} colorClass="bg-purple-50 text-purple-600" />
        <StatCard title="Valid Votes" value={electionData.validVotes.toLocaleString()} icon={CheckCircle} colorClass="bg-green-50 text-green-600" />
        <StatCard title="Void/Rejected" value={electionData.voidVotes.toLocaleString()} icon={FileText} colorClass="bg-red-50 text-red-600" />
      </div>

      {/* Navigation Breadcrumb - Scrollable on mobile */}
      <div className="flex items-center gap-2 mb-4 text-[10px] sm:text-xs font-medium overflow-x-auto whitespace-nowrap pb-1 no-scrollbar">
        <span 
          onClick={() => setFilters({})}
          className="text-gray-400 shrink-0 cursor-pointer hover:text-[#004d25] hover:underline"
        >
          National
        </span>
        {filters.stateId && (
          <div className="flex items-center gap-2 shrink-0">
            <ChevronRight size={12} className="text-gray-300" />
            <span 
              onClick={() => setFilters({ stateId: filters.stateId })}
              className="text-[#004d25] cursor-pointer hover:underline"
            >
              {locations.find(l => l.id == `state_${filters.stateId}` || l.id == filters.stateId)?.name || 'State'}
            </span>
          </div>
        )}
        {filters.lgaId && (
          <div className="flex items-center gap-2 shrink-0">
            <ChevronRight size={12} className="text-gray-300" />
            <span 
              onClick={() => setFilters({ stateId: filters.stateId, lgaId: filters.lgaId })}
              className="text-[#004d25] cursor-pointer hover:underline"
            >
              {locations.find(l => l.id == `lga_${filters.lgaId}` || l.id == filters.lgaId)?.name || 'LGA'}
            </span>
          </div>
        )}
        {filters.wardId && (
          <div className="flex items-center gap-2 shrink-0">
            <ChevronRight size={12} className="text-gray-300" />
            <span 
              onClick={() => setFilters({ stateId: filters.stateId, lgaId: filters.lgaId, wardId: filters.wardId })}
              className="text-[#004d25] cursor-pointer hover:underline"
            >
              {locations.find(l => l.id == `ward_${filters.wardId}` || l.id == filters.wardId)?.name || 'Ward'}
            </span>
          </div>
        )}
        {filters.puId && (
          <div className="flex items-center gap-2 shrink-0">
            <ChevronRight size={12} className="text-gray-300" />
            <span className="text-[#004d25]">
              {locations.find(l => l.id == `pu_${filters.puId}` || l.id == filters.puId)?.name || 'PU'}
            </span>
          </div>
        )}
      </div>

      <div className="bg-white p-4 sm:p-6 md:p-8 rounded-2xl shadow-sm border border-gray-100 transition-all hover:shadow-md relative group"
           onMouseMove={() => setShowControls(true)}>
        
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-6">
          <div className="w-full md:pr-48">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg sm:text-xl font-bold text-gray-900 leading-tight">
                {chartTab === 'parties' 
                  ? (showAllParties ? `All ${electionData.partyResults.length} Parties` : 'Top 10 Parties Performance')
                  : (showAllGeo ? `All ${nestedComparisonData.length} ${filters.wardId ? 'Polling Units' : filters.lgaId ? 'Wards' : 'LGAs'}` : `Top 15 ${filters.wardId ? 'Polling Units' : filters.lgaId ? 'Wards' : 'LGAs'} Performance`)}
              </h3>
              {/* Badge for mobile - inside title row */}
              <div className="md:hidden">
                <div className="bg-green-50 px-2 py-0.5 rounded-full text-[#004d25] text-[9px] font-bold ring-1 ring-[#004d25]/10 flex items-center gap-1">
                  <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                  Live
                </div>
              </div>
            </div>
            <p className="text-xs sm:text-sm text-gray-500 line-clamp-2">
              {chartTab === 'parties' 
                ? `Detailed results for ${selectedElection.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')} Election`
                : filters.wardId ? 'Comparison of voter turnout across polling units' : filters.lgaId ? 'Distribution of votes across wards' : 'Top performing local government areas'}
            </p>
          </div>

          {/* Controls - Responsive grid/row */}
          <div className={cn(
            "flex flex-col sm:flex-row gap-3 w-full md:w-auto md:absolute md:top-6 md:right-8 transition-all duration-500 z-20",
            showControls ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1 md:pointer-events-none"
          )}>
            <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-full sm:w-auto">
              <button 
                onClick={() => setChartTab('parties')}
                className={cn(
                  "flex-1 sm:px-3 py-1.5 text-[10px] sm:text-xs font-bold rounded-md transition-all whitespace-nowrap",
                  chartTab === 'parties' ? "bg-white text-[#004d25] shadow-sm" : "text-gray-500 hover:text-gray-700"
                )}
              >
                By Party
              </button>
              <button 
                onClick={() => setChartTab('geography')}
                className={cn(
                  "flex-1 sm:px-3 py-1.5 text-[10px] sm:text-xs font-bold rounded-md transition-all whitespace-nowrap",
                  chartTab === 'geography' ? "bg-white text-[#004d25] shadow-sm" : "text-gray-500 hover:text-gray-700"
                )}
              >
                By Geography
              </button>
            </div>

            {/* Toggle All Parties/Geo */}
            {chartTab === 'parties' && electionData.partyResults.length > 10 && (
              <button 
                onClick={() => setShowAllParties(!showAllParties)}
                className="px-3 py-1.5 text-[10px] sm:text-xs font-bold rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 flex items-center gap-1.5 transition-all shadow-sm"
              >
                {showAllParties ? 'Show Top 10' : `Show All ${electionData.partyResults.length} Parties`}
              </button>
            )}

            {chartTab === 'geography' && nestedComparisonData.length > 15 && (
              <button 
                onClick={() => setShowAllGeo(!showAllGeo)}
                className="px-3 py-1.5 text-[10px] sm:text-xs font-bold rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 flex items-center gap-1.5 transition-all shadow-sm"
              >
                {showAllGeo ? 'Show Top 15' : `Show All ${nestedComparisonData.length} ${filters.wardId ? 'PUs' : filters.lgaId ? 'Wards' : 'LGAs'}`}
              </button>
            )}
            
            {/* Desktop-only secondary badge */}
            <div className="hidden md:flex bg-green-50 px-3 py-1.5 rounded-lg text-[#004d25] text-[10px] font-bold ring-1 ring-[#004d25]/10 items-center gap-1.5">
              <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
              Live Results
            </div>
          </div>
        </div>
        
        <div 
          className="transition-all duration-500 overflow-hidden min-w-0 w-full" 
          style={{ 
            minHeight: '400px',
            height: (chartTab === 'parties' && showAllParties) || (chartTab === 'geography' && showAllGeo) 
              ? `${Math.max(400, (chartTab === 'parties' ? electionData.partyResults.length : nestedComparisonData.length) * 45)}px` 
              : '400px' 
          }}
        >
          {chartTab === 'parties' ? (
            electionData.partyResults.length > 0 ? (
              <ResponsiveContainer width="99%" height="100%" debounce={50} minWidth={0}>
                <BarChart 
                  data={showAllParties ? electionData.partyResults : electionData.partyResults.slice(0, 10)} 
                  layout="vertical" 
                  margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
                  barGap={0}
                >
                  <defs>
                    {COLORS.map((color, index) => (
                      <linearGradient key={`grad-${index}`} id={`colorGrad-${index}`} x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor={color} stopOpacity={0.8}/>
                        <stop offset="100%" stopColor={color} stopOpacity={1}/>
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f3f4f6" />
                  <XAxis type="number" hide />
                  <YAxis 
                    dataKey="name" 
                    type="category" 
                    width={60}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fontWeight: 700, fill: '#1f2937' }}
                  />
                  <Tooltip 
                    cursor={{ fill: '#f9fafb' }}
                    contentStyle={{ 
                      borderRadius: '12px', 
                      border: 'none', 
                      boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                      padding: '8px'
                    }}
                    itemStyle={{ fontSize: '12px', fontWeight: 600 }}
                    formatter={(value: number) => [value.toLocaleString(), 'Total Votes']} 
                  />
                  <Bar 
                    dataKey="votes" 
                    name="Votes" 
                    radius={[0, 4, 4, 0]} 
                    barSize={24}
                    animationDuration={1500}
                  >
                    {electionData.partyResults.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={`url(#colorGrad-${index % COLORS.length})`} />
                    ))}
                    <LabelList 
                      dataKey="votes" 
                      position="right" 
                      formatter={(v: number) => v >= 1000 ? `${(v/1000).toFixed(1)}k` : v.toLocaleString()} 
                      className="fill-gray-600 text-[10px] font-bold"
                      offset={10}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-gray-400">
                <FileText size={48} className="mb-4 opacity-20" />
                <p className="text-lg font-medium">No results received yet</p>
                <p className="text-sm">Check back later or select a different jurisdiction</p>
              </div>
            )
          ) : (
            nestedComparisonData.length > 0 ? (
              <ResponsiveContainer width="99%" height="100%" debounce={50} minWidth={0}>
                <BarChart 
                  data={showAllGeo ? nestedComparisonData : nestedComparisonData.slice(0, 15)} 
                  layout={showAllGeo ? "vertical" : "horizontal"}
                  margin={{ top: 20, right: 30, left: showAllGeo ? 0 : 20, bottom: showAllGeo ? 5 : 60 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={!showAllGeo} horizontal={showAllGeo} stroke="#f3f4f6" />
                  {showAllGeo ? (
                    <>
                      <XAxis type="number" hide />
                      <YAxis 
                        dataKey="name" 
                        type="category" 
                        width={80}
                        tick={{ fontSize: 10, fontWeight: 700 }}
                        axisLine={false}
                        tickLine={false}
                      />
                    </>
                  ) : (
                    <>
                      <XAxis 
                        dataKey="name" 
                        angle={-45} 
                        textAnchor="end" 
                        interval={0} 
                        height={70}
                        tick={{ fontSize: 10, fontWeight: 600, fill: '#4b5563' }}
                      />
                      <YAxis 
                        width={35}
                        tick={{ fontSize: 10 }}
                        tickFormatter={(v) => {
                          if (v >= 1000000) return `${(v/1000000).toFixed(1)}M`;
                          if (v >= 1000) return `${(v/1000).toFixed(1)}k`;
                          return v;
                        }} 
                      />
                    </>
                  )}
                  <Tooltip 
                    cursor={{ fill: '#f9fafb' }}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    formatter={(value: number) => [value.toLocaleString(), 'Votes Cast']} 
                  />
                  <Bar 
                    dataKey="votes" 
                    fill="#004d25" 
                    radius={showAllGeo ? [0, 4, 4, 0] : [4, 4, 0, 0]} 
                    barSize={24}
                    layout={showAllGeo ? "vertical" : "horizontal"}
                    animationDuration={2000}
                  >
                    <LabelList 
                      dataKey="votes" 
                      position={showAllGeo ? "right" : "top"} 
                      formatter={(v: number) => {
                        if (v >= 1000000) return `${(v/1000000).toFixed(1)}M`;
                        if (v >= 1000) return `${(v/1000).toFixed(1)}k`;
                        return v.toLocaleString();
                      }}
                      className="fill-gray-500 text-[10px] font-bold"
                      offset={10}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-gray-400">
                <MapPin size={48} className="mb-4 opacity-20" />
                <p className="text-lg font-medium">No geographic data available</p>
                <p className="text-sm">LGAs will appear here as results are uploaded</p>
              </div>
            )
          )}
        </div>
      </div>

      {/* Detailed Hierarchical Results Table */}
      <DetailedResultsTable dataSet={dataSet} filters={filters} locations={locations} />
    </div>
  );
}

function DetailedResultsTable({ dataSet, filters, locations }: any) {
  const [activeTab, setActiveTab] = React.useState<'location' | 'party'>('location');

  const tableData = React.useMemo(() => {
    const isLgaSelected = !!filters.lgaId;
    const isWardSelected = !!filters.wardId;
    
    const rows: Record<string, any> = {};
    
    dataSet.forEach((row: any) => {
      let id, name;
      if (isWardSelected) {
        id = row.polling_units_id;
        name = row.pu_name || row.results_json?.polling_unit || (id ? (String(id).startsWith('PU') || String(id).includes('-') ? id : `PU ${id}`) : 'Unspecified PU');
      } else if (isLgaSelected) {
        id = row.wards_id;
        name = row.ward_name || row.results_json?.ward || (id ? `Ward ${id}` : 'Unspecified Ward');
      } else {
        id = row.local_governments_id;
        name = row.lga_name || row.results_json?.local_government_area || (id ? `LGA ${id}` : 'Unassigned LGA');
      }
      
      const groupKey = id || 'unassigned';
      
      if (!rows[groupKey]) {
        rows[groupKey] = {
          id: groupKey,
          name,
          registered: 0,
          accredited: 0,
          valid: 0,
          totalCast: 0,
          parties: {} as Record<string, number>
        };
      }
      
      const resJson = row.results_json || {};
      rows[groupKey].registered += (resJson.number_of_voters_on_register || 0);
      rows[groupKey].accredited += (resJson.number_of_accredited_voters || 0);
      rows[groupKey].valid += (row.total_valid || 0);
      rows[groupKey].totalCast += (row.total_cast || 0);
      
      // Track lead party from political_party_results array (standard)
      const partyResults = resJson.political_party_results || [];
      if (Array.isArray(partyResults)) {
        partyResults.forEach((p: any) => {
          const party = (p.party || '').toUpperCase();
          if (party) {
            rows[groupKey].parties[party] = (rows[groupKey].parties[party] || 0) + (p.votes_in_figures || 0);
          }
        });
      }
      // Fallback for legacy party_results object if any
      else if (resJson.party_results) {
        Object.entries(resJson.party_results).forEach(([party, votes]: [string, any]) => {
          rows[groupKey].parties[party.toUpperCase()] = (rows[groupKey].parties[party.toUpperCase()] || 0) + (parseInt(votes) || 0);
        });
      }
    });
    
    return Object.values(rows).map(row => {
      const parties = Object.entries(row.parties || {}).sort((a, b) => (b[1] as number) - (a[1] as number));
      return {
        ...row,
        leadParty: parties.length > 0 ? parties[0][0] : 'N/A',
        leadVotes: parties.length > 0 ? parties[0][1] : 0
      };
    }).sort((a, b) => b.totalCast - a.totalCast);
  }, [dataSet, filters]);

  const partyData = React.useMemo(() => {
    const parties: Record<string, number> = {};
    let totalVotesCast = 0;
    
    dataSet.forEach((row: any) => {
      const resJson = row.results_json || {};
      totalVotesCast += (row.total_cast || 0);
      
      const partyResults = resJson.political_party_results || [];
      if (Array.isArray(partyResults)) {
        partyResults.forEach((p: any) => {
          const party = (p.party || '').toUpperCase();
          if (party) {
            parties[party] = (parties[party] || 0) + (p.votes_in_figures || 0);
          }
        });
      } else if (resJson.party_results) {
        Object.entries(resJson.party_results).forEach(([party, votes]: [string, any]) => {
          parties[party.toUpperCase()] = (parties[party.toUpperCase()] || 0) + (parseInt(votes) || 0);
        });
      }
    });

    return Object.entries(parties)
      .map(([name, votes]) => ({ name, votes, totalCast: totalVotesCast }))
      .sort((a, b) => b.votes - a.votes);
  }, [dataSet]);

  if (tableData.length === 0 && partyData.length === 0) return null;

  return (
    <div className="mt-8 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-8 py-5 border-b border-gray-50 flex flex-col sm:flex-row justify-between items-start sm:items-center bg-gray-50/50 gap-4">
        <div>
          <h4 className="font-bold text-gray-900">Jurisdiction Breakdown</h4>
          <p className="text-xs text-gray-500">Detailed metrics for the current selection</p>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="relative flex bg-gray-200/50 p-1 rounded-lg w-full sm:w-64">
            <div 
              className="absolute top-1 bottom-1 w-[calc(50%-4px)] bg-white rounded-md shadow-sm transition-transform duration-300 ease-in-out"
              style={{
                transform: activeTab === 'location' ? 'translateX(0)' : 'translateX(100%)',
                left: '4px'
              }}
            />
            <button 
              onClick={() => setActiveTab('location')}
              className={cn(
                "relative z-10 flex-1 px-3 py-1.5 text-[10px] sm:text-xs font-bold transition-colors whitespace-nowrap",
                activeTab === 'location' ? "text-[#004d25]" : "text-gray-500 hover:text-gray-700"
              )}
            >
              By Location
            </button>
            <button 
              onClick={() => setActiveTab('party')}
              className={cn(
                "relative z-10 flex-1 px-3 py-1.5 text-[10px] sm:text-xs font-bold transition-colors whitespace-nowrap",
                activeTab === 'party' ? "text-[#004d25]" : "text-gray-500 hover:text-gray-700"
              )}
            >
              By Party
            </button>
          </div>

          <div className="text-[10px] font-bold text-[#004d25] uppercase tracking-widest bg-green-100 px-2 py-1 rounded hidden sm:block">
            {filters.wardId ? 'Polling Units' : filters.lgaId ? 'Wards' : 'Local Governments'}
          </div>
        </div>
      </div>
      <div className="overflow-x-auto min-h-[300px]">
        {activeTab === 'location' ? (
          <table key="location-table" className="w-full text-left animate-in fade-in slide-in-from-bottom-4 duration-500">
            <thead>
              <tr className="text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-50">
                <th className="px-8 py-4">Name</th>
                <th className="px-4 py-4 text-right">Registered</th>
                <th className="px-4 py-4 text-right">Accredited</th>
                <th className="px-4 py-4 text-right">Total Cast</th>
                <th className="px-8 py-4 text-right">Leading Party</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {tableData.map((row: any) => (
                <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-8 py-4">
                    <div className="font-bold text-gray-900">{row.name}</div>
                    <div className="text-[10px] text-gray-400">ID: {row.id}</div>
                  </td>
                  <td className="px-4 py-4 text-right font-medium text-gray-600">
                    {row.registered.toLocaleString()}
                  </td>
                  <td className="px-4 py-4 text-right font-medium text-gray-600">
                    {row.accredited.toLocaleString()}
                  </td>
                  <td className="px-4 py-4 text-right">
                    <div className="font-bold text-[#004d25]">{row.totalCast.toLocaleString()}</div>
                    <div className="text-[10px] text-gray-400">{((row.accredited / (row.registered || 1)) * 100).toFixed(1)}% Turnout</div>
                  </td>
                  <td className="px-8 py-4 text-right">
                    <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-gray-100 text-[11px] font-bold text-gray-700">
                      <span className="w-2 h-2 rounded-full bg-[#d4af37]" />
                      {row.leadParty}
                      <span className="text-gray-400 ml-1 font-normal">({row.leadVotes.toLocaleString()})</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table key="party-table" className="w-full text-left animate-in fade-in slide-in-from-bottom-4 duration-500">
            <thead>
              <tr className="text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-50">
                <th className="px-8 py-4">Party</th>
                <th className="px-4 py-4 text-right">Total Votes</th>
                <th className="px-8 py-4 text-right">% of Total Cast</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {partyData.map((row: any) => (
                <tr key={row.name} className="hover:bg-gray-50 transition-colors">
                  <td className="px-8 py-4">
                    <div className="inline-flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-[#004d25]" />
                      <span className="font-bold text-gray-900">{row.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <div className="font-bold text-[#004d25]">{row.votes.toLocaleString()}</div>
                  </td>
                  <td className="px-8 py-4 text-right font-medium text-gray-600">
                    {row.totalCast > 0 ? ((row.votes / row.totalCast) * 100).toFixed(1) : 0}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function AgentQuickActions({ user, locations }: any) {
  const navigate = useNavigate();
  const puName = user?.locationName || locations.find((l: any) => l.id === user?.locationId)?.name || 'Jurisdiction';
  const stateId = user?.stateId || 24;

  const [waInstance, setWaInstance] = useState<WhatsAppInstance | null>(null);
  const [groupMonitorPhone, setGroupMonitorPhone] = useState<string | null>(null);
  const [groupBounty, setGroupBounty] = useState(100);
  const [chatEarning, setChatEarning] = useState(50);
  const [isConnectOpen, setIsConnectOpen] = useState(false);
  const [connectMethod, setConnectMethod] = useState<'qr' | 'phone'>('qr');
  const [qrData, setQrData] = useState<string | null>(null);
  const [authCode, setAuthCode] = useState<string | null>(null);
  const [phoneInput, setPhoneInput] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [isRequestingCode, setIsRequestingCode] = useState(false);
  const [standbyInst, setStandbyInst] = useState<WhatsAppInstance | null>(null);

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    toast.success('Pairing code copied to clipboard!');
    setTimeout(() => setCopiedCode(false), 2000);
  };

  useEffect(() => {
    // Check if agent already has an assigned instance
    greenApiService.getAgentInstance(user.id).then(inst => {
      setWaInstance(inst);
    });

    // Fetch state config for group monitor and earnings
    greenApiService.getConfig(stateId).then(cfg => {
      if (cfg) {
        setGroupBounty(cfg.earning_per_group_add || 100);
        setChatEarning(cfg.earning_per_chat || 50);
      }
    });

    // Check state's group monitor number
    greenApiService.getInstances(stateId).then(insts => {
      const gm = insts.find(i => i.instance_type === 'group_monitor' && i.wa_state === 'authorized');
      if (gm?.phone_number) {
        setGroupMonitorPhone(gm.phone_number);
      }
    });
  }, [user.id, stateId]);

  const handleOpenConnect = async () => {
    setIsConnectOpen(true);
    setQrData(null);
    setAuthCode(null);
    setConnectMethod('qr');
    setPhoneInput(user?.phone || '');
    try {
      const inst = waInstance || await greenApiService.getStandbyInstance(stateId);
      if (inst) {
        setStandbyInst(inst);
        const qr = await greenApiService.getQRCode(inst.id);
        if (qr?.message) setQrData(qr.message);
      }
    } catch (e) {
      console.error('Failed to init WA connect:', e);
    }
  };

  const handleGetAuthCode = async () => {
    const target = waInstance || standbyInst;
    if (!target || !phoneInput) {
      toast.error('Please enter a WhatsApp phone number');
      return;
    }
    setIsRequestingCode(true);
    const toastId = toast.loading('Requesting pairing code from WhatsApp...');
    try {
      const res = await greenApiService.getAuthCode(target.id, phoneInput);
      if (res?.code) {
        setAuthCode(res.code);
        toast.success('Code generated! Enter this code in WhatsApp.', { id: toastId });
      } else {
        toast.error('Could not generate pairing code', { id: toastId });
      }
    } catch (err: any) {
      toast.error(err.message || 'Pairing code error', { id: toastId });
    } finally {
      setIsRequestingCode(false);
    }
  };

  const handleVerifyDevice = async () => {
    const target = waInstance || standbyInst;
    if (!target) return;
    setIsChecking(true);
    const t = toast.loading('Verifying WhatsApp connection...');
    try {
      const res = await greenApiService.checkInstanceState(target.id);
      if (res.waState === 'authorized') {
        await greenApiService.assignInstance(target.id, user.id);
        setWaInstance({ ...target, wa_state: 'authorized', assigned_agent_id: user.id });
        setIsConnectOpen(false);
        toast.success('WhatsApp connected successfully!', { id: t });
      } else {
        toast('Status is: ' + res.waState, { icon: 'ℹ️', id: t });
      }
    } catch (e: any) {
      toast.error(e.message, { id: t });
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* WhatsApp Status Card - Hidden when connected */}
      {waInstance?.wa_state !== 'authorized' && (
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-100 text-amber-800">
              <MessageSquare size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-sm text-gray-900">Agent WhatsApp Outreach</h4>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                  ○ Not Linked
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                Connect your WhatsApp to earn ₦{chatEarning} per voter chat and send official flyers
              </p>
            </div>
          </div>

          <div>
            <button
              onClick={handleOpenConnect}
              className="w-full sm:w-auto px-4 py-2 bg-[#004d25] hover:bg-[#006331] text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer"
            >
              <QrCode size={14} />
              <span>Connect WhatsApp</span>
            </button>
          </div>
        </div>
      )}

      {/* Group Monitor Notice for Field Operatives */}
      {groupMonitorPhone && (
        <div className="p-4 bg-gradient-to-r from-teal-50 to-emerald-50 border border-emerald-200 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
          <p className="text-xs text-emerald-800">
            Add our State Group Monitor AI number <strong className="font-mono bg-white px-1.5 py-0.5 rounded border border-emerald-300">+{groupMonitorPhone}</strong> into your community, ward, and political WhatsApp group chats. You will be credited ₦{groupBounty} per group!
          </p>
          <button
            onClick={() => {
              navigator.clipboard.writeText(`+${groupMonitorPhone}`);
              toast.success('Group monitor number copied to clipboard!');
            }}
            className="shrink-0 px-3 py-1.5 bg-[#004d25] hover:bg-[#00381b] text-white text-xs font-semibold rounded-lg transition cursor-pointer"
          >
            Copy Number
          </button>
        </div>
      )}

      {/* Connect Modal for Dashboard */}
      {isConnectOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl p-6 border border-gray-200 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                <QrCode size={18} className="text-[#004d25]" />
                Connect WhatsApp Device
              </h3>
              <button onClick={() => setIsConnectOpen(false)} className="text-gray-400 hover:text-gray-600 cursor-pointer">✕</button>
            </div>

            {/* Method Tabs */}
            <div className="flex border-b border-gray-200">
              <button
                type="button"
                onClick={() => setConnectMethod('qr')}
                className={`flex-1 py-2 text-xs font-semibold border-b-2 transition cursor-pointer ${
                  connectMethod === 'qr'
                    ? 'border-[#004d25] text-[#004d25]'
                    : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}
              >
                Scan QR Code
              </button>
              <button
                type="button"
                onClick={() => setConnectMethod('phone')}
                className={`flex-1 py-2 text-xs font-semibold border-b-2 transition cursor-pointer ${
                  connectMethod === 'phone'
                    ? 'border-[#004d25] text-[#004d25]'
                    : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}
              >
                Phone Number
              </button>
            </div>

            {connectMethod === 'qr' ? (
              <div className="text-center space-y-3">
                <p className="text-xs text-gray-500">Open WhatsApp &gt; Linked Devices &gt; Link a Device and scan:</p>
                {qrData ? (
                  <div className="p-2 bg-white border border-gray-200 rounded-xl inline-block shadow-xs">
                    <img src={`data:image/png;base64,${qrData}`} alt="QR" className="w-48 h-48 mx-auto" />
                  </div>
                ) : (
                  <div className="w-48 h-48 border-2 border-dashed border-gray-300 rounded-xl mx-auto flex items-center justify-center text-xs text-gray-400">
                    <RefreshCw size={18} className="animate-spin text-[#004d25] mr-2" /> Loading QR...
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-gray-500">
                  Enter your WhatsApp phone number to receive an 8-character pairing code:
                </p>
                <div className="flex gap-2">
                  <input
                    type="tel"
                    value={phoneInput}
                    onChange={e => setPhoneInput(e.target.value)}
                    placeholder="e.g. 08123456789"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-xs bg-gray-50 text-gray-900 focus:bg-white focus:ring-2 focus:ring-[#004d25] outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleGetAuthCode}
                    disabled={isRequestingCode || !phoneInput}
                    className="px-3 py-2 bg-[#004d25] text-white rounded-lg text-xs font-semibold hover:bg-[#00381b] disabled:opacity-50 transition cursor-pointer"
                  >
                    {isRequestingCode ? <RefreshCw size={12} className="animate-spin" /> : 'Get Code'}
                  </button>
                </div>

                {authCode && (
                  <div 
                    onClick={() => handleCopyCode(authCode)}
                    className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-center space-y-1.5 cursor-pointer hover:bg-emerald-100/70 transition group"
                    title="Click to copy pairing code"
                  >
                    <div className="flex items-center justify-between text-[11px] text-gray-500">
                      <span>Enter this code into WhatsApp:</span>
                      <span className="flex items-center gap-1 text-[#004d25] font-medium">
                        {copiedCode ? <Check size={12} /> : <Copy size={12} className="group-hover:scale-110 transition" />}
                        {copiedCode ? 'Copied' : 'Copy'}
                      </span>
                    </div>
                    <p className="text-xl font-bold font-mono tracking-widest text-[#004d25] select-all">{authCode}</p>
                  </div>
                )}
              </div>
            )}

            <div className="pt-2 border-t border-gray-100">
              <button
                onClick={handleVerifyDevice}
                disabled={isChecking}
                className="w-full py-2.5 bg-[#004d25] hover:bg-[#00381b] text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 shadow-xs transition disabled:opacity-50 cursor-pointer"
              >
                {isChecking ? <RefreshCw size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                <span>Verify Connection</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function JurisdictionDeploymentSummary({ user, locations, onAddAgent, onEditAgent, refreshTrigger }: {
  user: any;
  locations: Location[];
  onAddAgent: (loc: Location, targetRole: Role) => void;
  onEditAgent: (agent: Partial<Agent>) => void;
  refreshTrigger: number;
}) {
  const [viewLevel, setViewLevel] = useState<'lga' | 'ward' | 'pu'>(() => {
    if (user.role === 'ward_admin') return 'pu';
    if (user.role === 'lga_admin') return 'ward';
    return 'lga';
  });

  const [lgaList, setLgaList] = useState<{ id: number; name: string }[]>([]);
  const [wardList, setWardList] = useState<{ id: number; name: string }[]>([]);
  const [selectedLgaFilter, setSelectedLgaFilter] = useState<number | null>(() => {
    if (user.role === 'lga_admin' || user.role === 'ward_admin') return user.lgaId || null;
    return null;
  });
  const [selectedWardFilter, setSelectedWardFilter] = useState<number | null>(() => {
    if (user.role === 'ward_admin') return user.wardId || null;
    return null;
  });

  const [exactMetrics, setExactMetrics] = useState<{
    total: number;
    assigned: number;
    vacant: number;
    coveragePercent: number;
  }>({ total: 0, assigned: 0, vacant: 0, coveragePercent: 0 });

  const [loading, setLoading] = useState(true);
  const [subUnits, setSubUnits] = useState<{ id: string; name: string; numId: number }[]>([]);
  const [unitAgents, setUnitAgents] = useState<any[]>([]);
  const [activeListTab, setActiveListTab] = useState<'vacant' | 'assigned'>('vacant');
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch LGAs for State/National admin
  useEffect(() => {
    if (!user) return;
    let q = supabase.from('local_governments').select('id, name');
    if (user.stateId) {
      q = q.eq('state_id', user.stateId);
    }
    q.order('name').then(({ data }) => {
      if (data) setLgaList(data.map((l: any) => ({ id: l.id, name: l.name || `LGA #${l.id}` })));
    });
  }, [user]);

  // Fetch Wards when selected LGA changes
  useEffect(() => {
    const effectiveLga = selectedLgaFilter || (user.role === 'lga_admin' || user.role === 'ward_admin' ? user.lgaId : null);
    if (!effectiveLga) {
      setWardList([]);
      return;
    }
    supabase
      .from('wards')
      .select('id, name')
      .eq('localgovernment_id', effectiveLga)
      .order('name')
      .then(({ data }) => {
        if (data) setWardList(data.map((w: any) => ({ id: w.id, name: w.name || `Ward #${w.id}` })));
      });
  }, [selectedLgaFilter, user]);

  React.useEffect(() => {
    let isCancelled = false;

    async function fetchDeployment() {
      setLoading(true);
      try {
        const table = (user.role === 'ward_admin' || viewLevel === 'pu')
          ? 'polling_units'
          : (user.role === 'lga_admin' || viewLevel === 'ward')
          ? 'wards'
          : 'local_governments';

        const effectiveWard = selectedWardFilter || user.wardId;
        const effectiveLga = selectedLgaFilter || user.lgaId;
        const targetRole: Role = viewLevel === 'pu' ? 'pu_agent' : viewLevel === 'ward' ? 'ward_admin' : 'lga_admin';

        // 1. Exact count of total units from Postgres
        let countQ = supabase.from(table).select('*', { count: 'exact', head: true });
        if (effectiveWard) {
          countQ = countQ.eq('ward_id', effectiveWard);
        } else if (effectiveLga) {
          countQ = countQ.eq('localgovernment_id', effectiveLga);
        } else if (user.stateId) {
          countQ = countQ.eq('state_id', user.stateId);
        }

        // 2. Exact assigned agents from Postgres
        let agentsQ = supabase.from('agents').select('*').eq('role', targetRole);
        if (effectiveWard) {
          agentsQ = agentsQ.eq('wards_id', effectiveWard);
        } else if (effectiveLga) {
          agentsQ = agentsQ.eq('local_governments_id', effectiveLga);
        } else if (user.stateId) {
          agentsQ = agentsQ.eq('state_id', user.stateId);
        }

        // 3. Units for display list (capped at 500 for high performance)
        let unitsQ = supabase.from(table).select('id, name');
        if (effectiveWard) {
          unitsQ = unitsQ.eq('ward_id', effectiveWard);
        } else if (effectiveLga) {
          unitsQ = unitsQ.eq('localgovernment_id', effectiveLga);
        } else if (user.stateId) {
          unitsQ = unitsQ.eq('state_id', user.stateId);
        }

        const [countRes, agentsRes, unitsRes] = await Promise.all([
          countQ,
          agentsQ,
          unitsQ.order('name').limit(500)
        ]);

        if (!isCancelled) {
          const totalUnitsCount = countRes.count || 0;
          const agents = agentsRes.data || [];
          setUnitAgents(agents);

          let uniqueAssignedUnitsCount = 0;
          if (viewLevel === 'pu') {
            const set = new Set(agents.map((a: any) => a.polling_units_id).filter(Boolean));
            uniqueAssignedUnitsCount = set.size;
          } else if (viewLevel === 'ward') {
            const set = new Set(agents.map((a: any) => a.wards_id).filter(Boolean));
            uniqueAssignedUnitsCount = set.size;
          } else {
            const set = new Set(agents.map((a: any) => a.local_governments_id).filter(Boolean));
            uniqueAssignedUnitsCount = set.size;
          }

          const assignedUnitsCount = uniqueAssignedUnitsCount;
          const vacantUnitsCount = Math.max(0, totalUnitsCount - assignedUnitsCount);
          const rate = totalUnitsCount > 0 ? Math.round((assignedUnitsCount / totalUnitsCount) * 100) : 0;

          setExactMetrics({
            total: totalUnitsCount,
            assigned: assignedUnitsCount,
            vacant: vacantUnitsCount,
            coveragePercent: rate
          });

          const prefix = viewLevel === 'pu' ? 'pu' : viewLevel === 'ward' ? 'ward' : 'lga';
          const defaultLabel = viewLevel === 'pu' ? 'Polling Unit' : viewLevel === 'ward' ? 'Ward' : 'LGA';
          const units = (unitsRes.data || []).map((u: any) => ({
            id: `${prefix}_${u.id}`,
            name: u.name || `${defaultLabel} #${u.id}`,
            numId: u.id
          }));
          setSubUnits(units);
        }
      } catch (err) {
        console.error('Failed to load deployment summary:', err);
      } finally {
        if (!isCancelled) setLoading(false);
      }
    }

    fetchDeployment();
    return () => { isCancelled = true; };
  }, [user, refreshTrigger, viewLevel, selectedLgaFilter, selectedWardFilter]);

  if (user.role === 'pu_agent') {
    return null;
  }

  // Figure out child target type and role
  const childTypeLabel = 
    viewLevel === 'pu' ? 'Polling Unit' :
    viewLevel === 'ward' ? 'Ward' :
    viewLevel === 'lga' ? 'LGA' : 'State';

  const targetChildRole: Role = 
    viewLevel === 'pu' ? 'pu_agent' :
    viewLevel === 'ward' ? 'ward_admin' :
    viewLevel === 'lga' ? 'lga_admin' : 'state_admin';

  // Match subUnits with agents
  const assignedList: { unit: { id: string; name: string; numId: number }; agent: any }[] = [];
  const vacantList: { id: string; name: string; numId: number }[] = [];

  subUnits.forEach(unit => {
    let matchAgent: any = null;
    if (viewLevel === 'pu') {
      matchAgent = unitAgents.find(a => a.polling_units_id === unit.numId || a.jurisdiction_id === unit.id);
    } else if (viewLevel === 'ward') {
      matchAgent = unitAgents.find(a => a.wards_id === unit.numId || a.jurisdiction_id === unit.id);
    } else if (viewLevel === 'lga') {
      matchAgent = unitAgents.find(a => a.local_governments_id === unit.numId || a.jurisdiction_id === unit.id);
    } else {
      matchAgent = unitAgents.find(a => a.state_id === unit.numId || a.jurisdiction_id === unit.id);
    }

    if (matchAgent) {
      assignedList.push({ unit, agent: matchAgent });
    } else {
      vacantList.push(unit);
    }
  });

  // Filtered lists for search
  const q = (searchQuery || '').toLowerCase();
  const filteredVacant = vacantList.filter(u => (u.name || '').toLowerCase().includes(q));
  const filteredAssigned = assignedList.filter(item => 
    (item.unit?.name || '').toLowerCase().includes(q) || 
    (item.agent?.name || '').toLowerCase().includes(q) ||
    Boolean(item.agent?.phone && item.agent.phone.includes(searchQuery))
  );

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-xs space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-2 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-50 text-[#004d25] flex items-center justify-center font-bold">
            <Layers size={20} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              {childTypeLabel}s Agent Deployment Summary
            </h2>
            <p className="text-xs text-gray-500">
              Coverage & agent appointment status across your {childTypeLabel.toLowerCase()}s
            </p>
          </div>
        </div>

        {exactMetrics.vacant > 0 && (
          <span className="text-xs font-semibold px-3 py-1 bg-amber-50 border border-amber-200 text-amber-800 rounded-full flex items-center gap-1.5 animate-pulse">
            <AlertTriangle size={13} className="text-amber-600" />
            {exactMetrics.vacant.toLocaleString()} {childTypeLabel}{exactMetrics.vacant > 1 ? 's' : ''} Need Agent Assignment
          </span>
        )}
      </div>

      {/* Jurisdiction Filters: Level, LGA, Ward */}
      {(user.role === 'state_admin' || user.role === 'national_admin' || user.role === 'lga_admin') && (
        <div className="flex flex-wrap items-center gap-3 p-3 bg-gray-50/80 rounded-xl border border-gray-100">
          {/* Level Filter */}
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-gray-600">Level:</label>
            <select
              value={viewLevel}
              onChange={(e) => {
                const nextLevel = e.target.value as any;
                setViewLevel(nextLevel);
              }}
              className="text-xs border border-gray-300 rounded-lg px-2.5 py-1.5 font-bold text-gray-800 bg-white focus:ring-2 focus:ring-[#004d25] outline-none cursor-pointer"
            >
              {(user.role === 'state_admin' || user.role === 'national_admin') && (
                <option value="lga">LGAs (LGA Admins)</option>
              )}
              <option value="ward">Wards (Ward Admins)</option>
              <option value="pu">Polling Units (PU Agents)</option>
            </select>
          </div>

          {/* LGA Filter */}
          {(user.role === 'state_admin' || user.role === 'national_admin') && (
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-gray-600">LGA:</label>
              <select
                value={selectedLgaFilter || ''}
                onChange={(e) => {
                  const val = e.target.value ? Number(e.target.value) : null;
                  setSelectedLgaFilter(val);
                  setSelectedWardFilter(null);
                }}
                className="text-xs border border-gray-300 rounded-lg px-2.5 py-1.5 font-medium text-gray-800 bg-white focus:ring-2 focus:ring-[#004d25] outline-none cursor-pointer"
              >
                <option value="">All LGAs in State</option>
                {lgaList.map(lga => (
                  <option key={lga.id} value={lga.id}>{lga.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Ward Filter */}
          {(viewLevel === 'ward' || viewLevel === 'pu') && (selectedLgaFilter || user.role === 'lga_admin') && (
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-gray-600">Ward:</label>
              <select
                value={selectedWardFilter || ''}
                onChange={(e) => setSelectedWardFilter(e.target.value ? Number(e.target.value) : null)}
                className="text-xs border border-gray-300 rounded-lg px-2.5 py-1.5 font-medium text-gray-800 bg-white focus:ring-2 focus:ring-[#004d25] outline-none cursor-pointer"
              >
                <option value="">All Wards in LGA</option>
                {wardList.map(w => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {/* Metrics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-gray-50/80 p-4 rounded-xl border border-gray-100">
          <span className="text-xs text-gray-500 font-medium">Total {childTypeLabel}s</span>
          <p className="text-2xl font-bold text-gray-900 mt-1">{exactMetrics.total.toLocaleString()}</p>
        </div>

        <div className="bg-emerald-50/70 p-4 rounded-xl border border-emerald-100/80">
          <span className="text-xs text-emerald-800 font-medium flex items-center gap-1">
            <UserCheck size={14} className="text-emerald-600" /> Assigned
          </span>
          <p className="text-2xl font-bold text-emerald-900 mt-1">{exactMetrics.assigned.toLocaleString()}</p>
        </div>

        <div className={cn(
          "p-4 rounded-xl border transition-colors",
          exactMetrics.vacant > 0 ? "bg-amber-50/80 border-amber-200/70" : "bg-gray-50 border-gray-100"
        )}>
          <span className={cn(
            "text-xs font-medium flex items-center gap-1",
            exactMetrics.vacant > 0 ? "text-amber-800" : "text-gray-500"
          )}>
            <UserX size={14} className={exactMetrics.vacant > 0 ? "text-amber-600" : "text-gray-400"} /> Vacant
          </span>
          <p className={cn(
            "text-2xl font-bold mt-1",
            exactMetrics.vacant > 0 ? "text-amber-900" : "text-gray-700"
          )}>{exactMetrics.vacant.toLocaleString()}</p>
        </div>

        <div className="bg-blue-50/70 p-4 rounded-xl border border-blue-100/80">
          <span className="text-xs text-blue-800 font-medium">Deployment Rate</span>
          <p className="text-2xl font-bold text-blue-900 mt-1">{exactMetrics.coveragePercent}%</p>
        </div>
      </div>

      {/* View Switcher & Search */}
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 pt-2">
        <div className="flex gap-2 p-1 bg-gray-100 rounded-xl">
          <button
            type="button"
            onClick={() => setActiveListTab('vacant')}
            className={cn(
              "px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5",
              activeListTab === 'vacant' 
                ? "bg-white text-amber-900 shadow-xs" 
                : "text-gray-600 hover:text-gray-900"
            )}
          >
            <AlertTriangle size={14} className={activeListTab === 'vacant' ? "text-amber-600" : "text-gray-400"} />
            <span>Vacant {childTypeLabel}s ({exactMetrics.vacant.toLocaleString()})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveListTab('assigned')}
            className={cn(
              "px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5",
              activeListTab === 'assigned' 
                ? "bg-white text-[#004d25] shadow-xs" 
                : "text-gray-600 hover:text-gray-900"
            )}
          >
            <CheckCircle2 size={14} className={activeListTab === 'assigned' ? "text-[#004d25]" : "text-gray-400"} />
            <span>Assigned Agents ({exactMetrics.assigned.toLocaleString()})</span>
          </button>
        </div>

        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder={`Search ${childTypeLabel.toLowerCase()}s or agents...`}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full sm:w-64 pl-9 pr-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#004d25] outline-none"
          />
        </div>
      </div>

      {/* Lists */}
      {loading ? (
        <div className="py-12 flex justify-center items-center text-sm text-gray-400">
          <Loader2 className="animate-spin mr-2" size={18} />
          Loading deployment records...
        </div>
      ) : activeListTab === 'vacant' ? (
        vacantList.length === 0 ? (
          <div className="p-8 text-center bg-emerald-50/50 rounded-xl border border-emerald-100 flex flex-col items-center gap-2">
            <CheckCircle2 size={32} className="text-emerald-600" />
            <h4 className="font-bold text-emerald-900 text-sm">100% Coverage Reached!</h4>
            <p className="text-xs text-emerald-700">All {childTypeLabel.toLowerCase()}s under your jurisdiction have assigned agents.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden max-h-80 overflow-y-auto">
            {filteredVacant.map(unit => (
              <div key={unit.id} className="p-3.5 hover:bg-amber-50/30 flex items-center justify-between gap-4 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-xs shrink-0">
                    <UserX size={15} />
                  </div>
                  <div>
                    <h5 className="font-bold text-sm text-gray-900">{unit.name}</h5>
                    <span className="text-[11px] text-gray-400">ID: #{unit.numId} • No agent assigned</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onAddAgent({
                    id: unit.id,
                    name: unit.name,
                    type: (viewLevel === 'pu' ? 'polling_unit' : viewLevel === 'ward' ? 'ward' : 'lga') as any,
                    parentId: user.locationId
                  }, targetChildRole)}
                  className="px-3.5 py-1.5 bg-[#004d25] hover:bg-[#006331] text-white text-xs font-bold rounded-lg transition-all shadow-xs flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  <UserPlus size={14} />
                  <span>Assign Agent</span>
                </button>
              </div>
            ))}
          </div>
        )
      ) : (
        assignedList.length === 0 ? (
          <div className="p-8 text-center bg-gray-50 rounded-xl border border-gray-100 text-gray-500 text-xs">
            No assigned agents found yet. Click &quot;Register Agent&quot; above to appoint agents.
          </div>
        ) : (
          <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden max-h-80 overflow-y-auto">
            {filteredAssigned.map(({ unit, agent }) => (
              <div key={unit.id} className="p-3.5 hover:bg-gray-50/80 flex items-center justify-between gap-4 transition-colors">
                <div className="flex items-center gap-3">
                  {agent.profile_picture_url ? (
                    <img src={agent.profile_picture_url} alt={agent.name} className="w-9 h-9 rounded-full object-cover border border-gray-200 shrink-0" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-emerald-100 text-[#004d25] flex items-center justify-center font-bold text-xs shrink-0">
                      {agent.name ? agent.name.charAt(0).toUpperCase() : 'A'}
                    </div>
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <h5 className="font-bold text-sm text-gray-900">{agent.name}</h5>
                      <span className="text-[10px] bg-emerald-100 text-emerald-800 font-semibold px-2 py-0.2 rounded-full">
                        {agent.role.replace('_', ' ').toUpperCase()}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-gray-500 mt-0.5">
                      <span className="font-medium text-gray-700">{unit.name}</span>
                      {agent.phone && (
                        <span className="flex items-center gap-1 text-gray-400">
                          <Phone size={11} /> {agent.phone}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onEditAgent({
                    id: agent.id,
                    name: agent.name,
                    firstName: agent.first_name,
                    lastName: agent.last_name,
                    phone: agent.phone,
                    role: agent.role,
                    picture: agent.profile_picture_url,
                    bankName: agent.bank_name,
                    accountName: agent.account_name,
                    accountNumber: agent.account_number,
                    locationId: unit.id,
                    status: agent.status
                  })}
                  className="px-3 py-1.5 border border-gray-200 hover:bg-gray-100 text-gray-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer shrink-0"
                >
                  Edit Agent
                </button>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
