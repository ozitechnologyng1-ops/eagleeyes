import React, { useState } from 'react';
import { useApp, roleHierarchy } from '../context/AppContext';
import { Users, Target, UploadCloud, MapPin, Activity, CheckCircle, Smartphone, Camera, FileText, PieChart as PieChartIcon, ChevronRight } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LabelList } from 'recharts';
import { useNavigate } from 'react-router-dom';
import { cn } from '../lib/utils';
import ResultFilters from '../components/ResultFilters';

import { supabase } from '../lib/supabase';

export default function Dashboard() {
  const { user, stats, agents, locations, getDescendantLocations, voters, totalVotersCount, electionResults, voterPuFilter, setVoterPuFilter } = useApp();
  const [activeTab, setActiveTab] = useState<'canvassing' | 'elections'>('canvassing');
  const [wardAgents, setWardAgents] = useState<any[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string>('');

  React.useEffect(() => {
    if (user?.role === 'ward_admin' && user?.wardId) {
      supabase
        .from('agents')
        .select('id, name, phone, polling_units_id')
        .eq('wards_id', user.wardId)
        .eq('role', 'pu_agent')
        .then(({ data }) => {
          const list = data || [];
          setWardAgents(list);
          if (list.length > 0) {
            if (!voterPuFilter) {
              setVoterPuFilter(list[0].polling_units_id);
              setSelectedAgent(list[0].id);
            } else {
              const matching = list.find(a => a.polling_units_id === voterPuFilter);
              if (matching) setSelectedAgent(matching.id);
            }
          }
        });
    }
  }, [user, voterPuFilter, setVoterPuFilter]);

  if (!user) return null;

  const allowedLocations = getDescendantLocations(user.locationId);
  const allowedLocationIds = allowedLocations.map(l => l.id);
  const visibleAgents = agents.filter(a => 
    allowedLocationIds.includes(a.locationId) && 
    roleHierarchy[a.role] < roleHierarchy[user.role]
  );


  return (
    <div className="space-y-6">
      <DashboardHeader user={user} locations={locations} />
      
      {user.role === 'ward_admin' && wardAgents.length > 0 && (
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-sm font-semibold text-[#004d25] uppercase tracking-wider">Agent Monitoring</h2>
            <p className="text-xs text-gray-400">Select a polling unit agent in your ward to monitor their canvassing progress</p>
          </div>
          <select 
            value={selectedAgent} 
            onChange={(e) => {
              const val = e.target.value;
              setSelectedAgent(val);
              const agent = wardAgents.find(a => a.id === val);
              if (agent) {
                setVoterPuFilter(agent.polling_units_id);
              }
            }} 
            className="w-full sm:w-72 border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-[#004d25] font-medium text-gray-700 bg-white"
          >
            {wardAgents.map(a => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.phone})
              </option>
            ))}
          </select>
        </div>
      )}
      
      {(user.role === 'pu_agent' || user.role === 'ward_admin') && (
        <AgentQuickActions user={user} locations={locations} />
      )}
      
      <div className="flex border-b border-gray-200">
        <button 
          onClick={() => setActiveTab('canvassing')}
          className={cn("px-6 py-3 text-sm font-medium border-b-2 transition-colors", activeTab === 'canvassing' ? "border-[#004d25] text-[#004d25]" : "border-transparent text-gray-500 hover:text-gray-700")}
        >
          Canvassing Overview
        </button>
        <button 
          onClick={() => setActiveTab('elections')}
          className={cn("px-6 py-3 text-sm font-medium border-b-2 transition-colors", activeTab === 'elections' ? "border-[#004d25] text-[#004d25]" : "border-transparent text-gray-500 hover:text-gray-700")}
        >
          Election Results
        </button>
      </div>

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
    </div>
  );
}

function DashboardHeader({ user, locations }: any) {
  const { isMockMode, toggleMockMode } = useApp();
  const locationName = user.locationName || locations.find((l: any) => l.id === user.locationId)?.name || 'National';
  
  return (
    <div className="flex justify-between items-center">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {user.role === 'national_admin' ? 'National Headquarters' : `${locationName} Dashboard`}
        </h1>
        <p className="text-gray-500">
          {user.role === 'national_admin' ? 'Nigeria Overview' : 'Jurisdiction Overview'}
        </p>
      </div>
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
  const COLORS = ['#004d25', '#d4af37', '#e11d48', '#6b7280'];
  const { canvassing } = stats;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <StatCard title="Voters" value={totalVotersCount > 0 ? totalVotersCount.toLocaleString() : '0'} icon={Users} colorClass="bg-blue-50 text-blue-600" />
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
  
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <button 
        onClick={() => navigate('/voters')}
        className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4 hover:bg-green-50 transition-colors group"
      >
        <div className="p-3 bg-green-100 rounded-lg text-[#004d25] group-hover:bg-[#004d25] group-hover:text-white transition-colors">
          <Users size={24} />
        </div>
        <div className="text-left">
          <h3 className="font-bold text-gray-900">Voter Canvassing</h3>
          <p className="text-xs text-gray-500">Update status for {puName}</p>
        </div>
      </button>

      <button 
        onClick={() => navigate('/capture')}
        className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4 hover:bg-green-50 transition-colors group"
      >
        <div className="p-3 bg-[#d4af37]/20 rounded-lg text-[#004d25] group-hover:bg-[#004d25] group-hover:text-white transition-colors">
          <Camera size={24} />
        </div>
        <div className="text-left">
          <h3 className="font-bold text-gray-900">Upload Result</h3>
          <p className="text-xs text-gray-500">AI-powered EC8A capture</p>
        </div>
      </button>
    </div>
  );
}

