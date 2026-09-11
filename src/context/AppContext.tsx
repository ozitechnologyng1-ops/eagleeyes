import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { VISION_AI_PROMPT } from '../lib/prompts';
import toast from 'react-hot-toast';
import { getFriendlyErrorMessage } from '../lib/utils';

export type Role = 'national_admin' | 'state_admin' | 'lga_admin' | 'ward_admin' | 'pu_agent';

export const roleHierarchy: Record<Role, number> = {
  national_admin: 4,
  state_admin: 3,
  lga_admin: 2,
  ward_admin: 1,
  pu_agent: 0
};
export type LocationType = 'national' | 'state' | 'lga' | 'ward' | 'pu';
export type ElectionGroup = 'national' | 'state';

export interface Location {
  id: string;
  type: LocationType;
  name: string;
  parentId: string | null;
  code?: string;
  address?: string;
}

export interface User {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  role: Role;
  phone: string;
  locationId: string;
  locationName?: string;
  // Jurisdiction IDs for scoped hierarchy views
  stateId?: number | null;
  lgaId?: number | null;
  wardId?: number | null;
  puId?: number | null;
  lagosPollingUnitId?: number | null;
  picture?: string;
  bankName?: string;
  accountName?: string;
  accountNumber?: string;
}

export interface Agent {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  role: Role;
  status: 'active' | 'suspended' | 'revoked';
  locationId: string;
  phone: string;
  bankName?: string;
  accountName?: string;
  accountNumber?: string;
  picture?: string;
  stateId?: number | null;
  lgaId?: number | null;
  wardId?: number | null;
  puId?: number | null;
  lagosPollingUnitId?: number | null;
  password?: string;
}

export interface CoverageStat {
  covered: number;
  total: number;
}

export interface DeploymentStats {
  state?: CoverageStat;
  lga?: CoverageStat;
  ward?: CoverageStat;
  pu?: CoverageStat;
}

export interface VoterNote {
  text: string;
  agentId: string;
  agentName: string;
  createdAt: string;
}

export interface Voter {
  id: string;
  name: string;
  vin?: string;
  puId?: string;
  phone?: string;
  dob?: string;
  image?: string;
  status: 'ADC Supporter' | 'Undecided' | 'Opposition' | 'Unreachable';
  locationId: string; // PU id
  stateId?: number | null;
  lgaId?: number | null;
  wardId?: number | null;
  puNumberId?: number | null;
  notes?: VoterNote[];
  contact_logs?: {
    type: 'whatsapp' | 'sms' | 'call';
    agentId: string;
    agentName: string;
    timestamp: string;
  }[];
}

interface AppState {
  user: User | null;
  locations: Location[];
  agents: Agent[];
  voters: Voter[];
  stats: {
    canvassing: {
      canvassed: number;
      target: number;
      stances: { name: string; count: number }[];
    };
    agents: {
      total: number;
      active: number;
      byRole: Record<string, number>;
    };
    elections: Record<string, {
      registeredVoters: number;
      accreditedVoters: number;
      validVotes: number;
      voidVotes: number;
      totalVotes: number;
      partyResults: { name: string; votes: number }[];
    }>;
    uploadProgress: number;
    deployment?: DeploymentStats;
  };
  isMockMode: boolean;
  activeElectionGroup: ElectionGroup;
  totalVotersCount: number;
  electionResults: Record<string, any>;
  login: (phone: string, password: string) => Promise<void>;
  logout: () => void;
  updateUser: (updates: Partial<User>) => void;
  updateVoterStatus: (id: string, status: Voter['status']) => void;
  updateVoterDetails: (id: string, updates: Partial<Voter>) => Promise<void>;
  logVoterContact: (id: string, type: 'whatsapp' | 'sms' | 'call') => Promise<void>;
  addVoterNote: (id: string, text: string) => Promise<void>;
  submitResult: (puId: string, electionId: string, data: any, imageFile: File | null) => Promise<void>;
  addAgent: (agent: Omit<Agent, 'id'>) => Promise<void>;
  updateAgent: (id: string, updates: Partial<Agent>) => Promise<void>;
  updateAgentStatus: (id: string, status: Agent['status']) => Promise<void>;
  addLocation: (location: Omit<Location, 'id'>) => void;
  updateLocation: (id: string, updates: Partial<Location>) => void;
  getDescendantLocations: (locationId: string) => Location[];
  analyzeResultImage: (file: File) => Promise<{ results: any; ai_used?: string }>;
  votersPage: number;
  isLoadingVoters: boolean;
  fetchVotersPage: (page: number, filters?: { lgaId?: number | null; wardId?: number | null; puId?: number | null }) => Promise<void>;
  voterLgaFilter: number | null;
  setVoterLgaFilter: (lgaId: number | null) => void;
  voterWardFilter: number | null;
  setVoterWardFilter: (wardId: number | null) => void;
  voterPuFilter: number | null;
  setVoterPuFilter: (puId: number | null) => void;
}

const AppContext = createContext<AppState | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const SESSION_DURATION_MS = 20 * 60 * 1000; // 20 minutes

  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('eagleeye_user');
    const timestamp = localStorage.getItem('eagleeye_last_active') || localStorage.getItem('eagleeye_login_time');
    if (saved && timestamp && Date.now() - parseInt(timestamp, 10) < SESSION_DURATION_MS) {
      return JSON.parse(saved);
    }
    localStorage.removeItem('eagleeye_user');
    localStorage.removeItem('eagleeye_login_time');
    localStorage.removeItem('eagleeye_last_active');
    return null;
  });
  
  const [totalVotersCount, setTotalVotersCount] = useState<number>(0);
  const [votersPage, setVotersPage] = useState<number>(1);
  const [isLoadingVoters, setIsLoadingVoters] = useState<boolean>(false);
  const [voterLgaFilter, setVoterLgaFilter] = useState<number | null>(null);
  const [voterWardFilter, setVoterWardFilter] = useState<number | null>(null);
  const [voterPuFilter, setVoterPuFilter] = useState<number | null>(null);
  const [locations, setLocations] = useState<Location[]>([
    { id: 'nat1', type: 'national', name: 'Nigeria', parentId: null }
  ]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [voters, setVoters] = useState<Voter[]>([]);
  const [isMockMode, setIsMockMode] = useState(false);
  const [activeElectionGroup, setActiveElectionGroup] = useState<ElectionGroup>('national');
  const [electionResults, setElectionResults] = useState<any[]>([]);
  const [stats, setStats] = useState<AppState['stats']>({
    canvassing: {
      canvassed: 1250430,
      target: 2000000,
      stances: [
        { name: 'ADC Supporter', count: 450300 },
        { name: 'Undecided', count: 320500 },
        { name: 'Opposition', count: 280200 },
        { name: 'Unreachable', count: 199430 },
      ]
    },
    agents: {
      total: 0,
      active: 0,
      byRole: {}
    },
    deployment: {
      lga: { covered: 0, total: 0 },
      ward: { covered: 0, total: 0 },
      pu: { covered: 0, total: 0 }
    },
    elections: {
      presidential: { registeredVoters: 0, accreditedVoters: 6543210, validVotes: 420000, voidVotes: 15000, totalVotes: 435000, partyResults: [
          { name: 'ADC', votes: 150000 },
          { name: 'APC', votes: 120000 },
          { name: 'PDP', votes: 90000 },
          { name: 'LP',  votes: 40000 },
          { name: 'NNPP',votes: 10000 },
          { name: 'SDP', votes: 5000 },
          { name: 'APGA',votes: 2000 },
          { name: 'ZLP', votes: 1500 },
          { name: 'YPP', votes: 1000 },
          { name: 'PRP', votes: 500 },
        ]
      },
      senate: { registeredVoters: 0, accreditedVoters: 6543210, validVotes: 410000, voidVotes: 18000, totalVotes: 428000, partyResults: [
          { name: 'ADC', votes: 160000 },
          { name: 'APC', votes: 110000 },
          { name: 'PDP', votes: 85000 },
          { name: 'LP',  votes: 35000 },
          { name: 'NNPP',votes: 12000 },
          { name: 'SDP', votes: 4000 },
          { name: 'APGA',votes: 2000 },
          { name: 'ZLP', votes: 1000 },
          { name: 'YPP', votes: 500 },
          { name: 'PRP', votes: 500 },
        ]
      },
      house: { registeredVoters: 0, accreditedVoters: 6543210, validVotes: 405000, voidVotes: 12000, totalVotes: 417000, partyResults: [
          { name: 'ADC', votes: 155000 },
          { name: 'APC', votes: 115000 },
          { name: 'PDP', votes: 80000 },
          { name: 'LP',  votes: 38000 },
          { name: 'NNPP',votes: 11000 },
          { name: 'SDP', votes: 3000 },
          { name: 'APGA',votes: 2000 },
          { name: 'ZLP', votes: 1000 },
          { name: 'YPP', votes: 500 },
          { name: 'PRP', votes: 500 },
        ]
      },
      governorship: { registeredVoters: 0, accreditedVoters: 6543210, validVotes: 0, voidVotes: 0, totalVotes: 0, partyResults: [] },
      state_house:  { registeredVoters: 0, accreditedVoters: 6543210, validVotes: 0, voidVotes: 0, totalVotes: 0, partyResults: [] }
    },
    uploadProgress: 45
  });

  const refreshElectionStats = React.useCallback(async () => {
    try {
      // Revert to simple select because DB schema lacks foreign keys for joined lookup
      const { data: resultsData, error } = await supabase
        .from('election_results')
        .select('*');

      if (error) throw error;
      
      const results = resultsData || [];
      
      // Secondary lookup for names to handle large dataset/no FK limitations
      const lgaIds = Array.from(new Set(results.map(r => r.local_governments_id).filter(Boolean)));
      const wardIds = Array.from(new Set(results.map(r => r.wards_id).filter(Boolean)));
      const puIds = Array.from(new Set(results.map(r => r.polling_units_id).filter(Boolean)));
      
      const [{ data: lgaNames }, { data: wardNames }, { data: puNames }] = await Promise.all([
        lgaIds.length ? supabase.from('local_governments').select('id, name').in('id', lgaIds) : Promise.resolve({ data: [] }),
        wardIds.length ? supabase.from('wards').select('id, name').in('id', wardIds) : Promise.resolve({ data: [] }),
        puIds.length ? supabase.from('polling_units').select('id, name').in('id', puIds) : Promise.resolve({ data: [] })
      ]);

      // Flatten the data with names
      const flattenedResults = results.map(r => ({
        ...r,
        lga_name: lgaNames?.find(l => String(l.id) === String(r.local_governments_id))?.name,
        ward_name: wardNames?.find(w => String(w.id) === String(r.wards_id))?.name,
        pu_name: puNames?.find(p => String(p.id) === String(r.polling_units_id))?.name
      }));

      setElectionResults(flattenedResults);

      const aggregated: AppState['stats']['elections'] = {
        presidential: { registeredVoters: 0, accreditedVoters: 0, validVotes: 0, voidVotes: 0, totalVotes: 0, partyResults: [] },
        senate:       { registeredVoters: 0, accreditedVoters: 0, validVotes: 0, voidVotes: 0, totalVotes: 0, partyResults: [] },
        house:        { registeredVoters: 0, accreditedVoters: 0, validVotes: 0, voidVotes: 0, totalVotes: 0, partyResults: [] },
        governorship: { registeredVoters: 0, accreditedVoters: 0, validVotes: 0, voidVotes: 0, totalVotes: 0, partyResults: [] },
        state_house:  { registeredVoters: 0, accreditedVoters: 0, validVotes: 0, voidVotes: 0, totalVotes: 0, partyResults: [] },
      };

      resultsData?.forEach((row: any) => {
        const type = row.election_type as keyof typeof aggregated;
        if (!aggregated[type]) return;

        const resJson = row.results_json || {};
        aggregated[type].registeredVoters += (resJson.number_of_voters_on_register || 0);
        aggregated[type].accreditedVoters += (resJson.number_of_accredited_voters || 0);
        aggregated[type].validVotes += (row.total_valid || 0);
        aggregated[type].voidVotes += (row.total_rejected || 0);
        aggregated[type].totalVotes += (row.total_cast || 0);

        // Aggregate party results
        const parties = resJson.political_party_results || [];
        parties.forEach((p: any) => {
          const partyName = (p.party || '').toUpperCase();
          if (!partyName) return;
          
          let partyEntry = aggregated[type].partyResults.find(pr => pr.name === partyName);
          if (partyEntry) {
            partyEntry.votes += (p.votes_in_figures || 0);
          } else {
            aggregated[type].partyResults.push({ name: partyName, votes: p.votes_in_figures || 0 });
          }
        });
      });

      // Sort party results by votes descending
      Object.keys(aggregated).forEach(key => {
        aggregated[key as keyof typeof aggregated].partyResults.sort((a, b) => b.votes - a.votes);
      });

      setStats(prev => ({ ...prev, elections: aggregated }));
    } catch (err) {
      console.error("❌ Failed to refresh election stats", err);
    }
  }, [user]);

  const refreshAgentStats = React.useCallback(async () => {
    try {
      const roles: Role[] = ['national_admin', 'state_admin', 'lga_admin', 'ward_admin', 'pu_agent'];
      const byRole: Record<string, number> = {};
      let total = 0;
      let active = 0;

      // We run parallel count queries to get accurate totals per role within jurisdiction
      const countPromises = roles.map(async (role) => {
        let query = supabase
          .from('agents')
          .select('*', { count: 'exact', head: true })
          .eq('role', role);

        if (user) {
          // Strict hierarchy: An admin only sees counts for roles BELOW them
          if (roleHierarchy[role] >= roleHierarchy[user.role]) {
            return { role, count: 0, activeCount: 0 };
          }

          if (user.role === 'state_admin' && user.stateId) {
            query = query.eq('state_id', user.stateId);
          } else if (user.role === 'lga_admin' && user.lgaId) {
            query = query.eq('local_governments_id', user.lgaId);
          } else if (user.role === 'ward_admin' && user.wardId) {
            query = query.eq('wards_id', user.wardId);
          } else if (user.role === 'pu_agent' && user.puId) {
            query = query.eq('polling_units_id', user.puId);
          }
        }

        const { count } = await query;
        const { count: actCount } = await query.eq('status', 'Active');
        
        return { role, count: count || 0, activeCount: actCount || 0 };
      });

      const results = await Promise.all(countPromises);
      
      results.forEach(r => {
        byRole[r.role] = r.count;
        total += r.count;
        active += r.activeCount;
      });

      setStats(prev => ({ 
        ...prev, 
        agents: { total, active, byRole } 
      }));
    } catch (err) {
      console.error("❌ Failed to refresh agent stats", err);
    }
  }, [user]);

  const refreshDeploymentStats = React.useCallback(async () => {
    if (!user) return;
    try {
      const depStats: DeploymentStats = {};

      // ─── Query Helpers ──────────────────────────────────────────────
      const getCoverage = async (sourceTable: string, agentRole: Role, filterKey: string, filterVal: any, distinctCol: string, agentFilterKeyOverride?: string) => {
        const { count: total } = await supabase.from(sourceTable).select('*', { count: 'exact', head: true }).eq(filterKey, filterVal);
        const agentKey = agentFilterKeyOverride || filterKey;
        const { data: cov } = await supabase.from('agents').select(distinctCol).eq(agentKey, filterVal).not(distinctCol, 'is', null);
        const unique = new Set(cov?.map(d => d[distinctCol]));
        return { covered: unique.size, total: total || 0 };
      };

      // ─── Scoped Logic ──────────────────────────────────────────────
      if (user.role === 'national_admin') {
        const { count: sTotal } = await supabase.from('states').select('*', { count: 'exact', head: true });
        const { data: sCov } = await supabase.from('agents').select('state_id').not('state_id', 'is', null);
        depStats.state = { covered: new Set(sCov?.map(d => d.state_id)).size, total: sTotal || 0 };
      }

      if (user.stateId) {
        if (roleHierarchy[user.role] >= roleHierarchy['state_admin']) {
          depStats.lga = await getCoverage('local_governments', 'lga_admin', 'state_id', user.stateId, 'local_governments_id');
        }
        if (roleHierarchy[user.role] >= roleHierarchy['state_admin'] || user.lgaId) {
          const filterKey = user.lgaId ? 'localgovernment_id' : 'state_id';
          const agentKey = user.lgaId ? 'local_governments_id' : 'state_id';
          const filterVal = user.lgaId || user.stateId;
          depStats.ward = await getCoverage('wards', 'ward_admin', filterKey, filterVal, 'wards_id', agentKey);
        }
        if (roleHierarchy[user.role] >= roleHierarchy['state_admin'] || user.wardId || user.lgaId) {
          const filterKey = user.wardId ? 'ward_id' : user.lgaId ? 'localgovernment_id' : 'state_id';
          const agentKey = user.wardId ? 'wards_id' : user.lgaId ? 'local_governments_id' : 'state_id';
          const filterVal = user.wardId || user.lgaId || user.stateId;
          depStats.pu = await getCoverage('polling_units', 'pu_agent', filterKey, filterVal, 'polling_units_id', agentKey);
        }
      }

      setStats(prev => ({ ...prev, deployment: depStats }));
    } catch (err) {
      console.error('❌ Failed to calculate deployment stats', err);
    }
  }, [user]);

  // Syncing with user headers is now fully handled in the custom fetch client configuration in supabase.ts

  useEffect(() => {
    refreshElectionStats();
    refreshAgentStats();
    refreshDeploymentStats();
  }, [refreshElectionStats, refreshAgentStats, refreshDeploymentStats]);

  useEffect(() => {
    let interval: any;
    if (user) {
      interval = setInterval(() => {
        const timestamp = localStorage.getItem('eagleeye_login_time');
        if (timestamp && Date.now() - parseInt(timestamp) >= SESSION_DURATION_MS) {
          setUser(null);
          localStorage.removeItem('eagleeye_user');
          localStorage.removeItem('eagleeye_login_time');
          // Force redirect to login — session expired
          window.location.href = '/login';
        }
      }, 30000); // check every 30 seconds
    }
    return () => clearInterval(interval);
  }, [user]);

  const fetchVotersPage = React.useCallback(async (
    page: number, 
    customFilters?: { lgaId?: number | null; wardId?: number | null; puId?: number | null }
  ) => {
    setIsLoadingVoters(true);
    setVotersPage(page);
    try {
      const pageSize = 500;
      const start = (page - 1) * pageSize;
      const end = start + pageSize - 1;

      let votersQuery = supabase.from('voters').select('*', { count: 'exact' });

      const activePu = customFilters?.puId !== undefined ? customFilters.puId : voterPuFilter;
      const activeWard = customFilters?.wardId !== undefined ? customFilters.wardId : voterWardFilter;
      const activeLga = customFilters?.lgaId !== undefined ? customFilters.lgaId : voterLgaFilter;

      if (user?.role === 'pu_agent' && (user?.lagosPollingUnitId || user?.puId)) {
        votersQuery = votersQuery.eq('pollingunit_lagos_id', user.lagosPollingUnitId || user.puId);
      } else if (activePu) {
        votersQuery = votersQuery.eq('pollingunit_lagos_id', activePu);
      } else if (activeWard || (user?.role === 'ward_admin' && user?.wardId)) {
        votersQuery = votersQuery.eq('ward_lagos_id', activeWard || user?.wardId);
      } else if (activeLga || (user?.role === 'lga_admin' && user?.lgaId)) {
        votersQuery = votersQuery.eq('localgovernment_lagos_id', activeLga || user?.lgaId);
      } else if (user?.stateId) {
        votersQuery = votersQuery.eq('state_id', user.stateId);
      }
      
      const { data: votersData, error: votersError } = await votersQuery.range(start, end);
      if (votersError) {
        console.error('Voters query error:', votersError.message, votersError.details, votersError.hint);
      }
      
      if (votersData && votersData.length > 0) {
        setVoters(votersData.map((v: any) => ({
           id: String(v.id),
           name: `${v.first_name || ''} ${v.last_name || ''}`.trim() || 'Unknown',
           vin: v.puid || '',
           puId: v.puid || '',
           phone: v.phone_number,
           dob: v.dob,
           image: v.image || '',
           status: (v.status || 'Undecided') as Voter['status'],
           locationId: `pu_${v.pollingunit_lagos_id || v.pollingunit_id || ''}` || 'nat1',
           stateId: v.state_id,
           lgaId: v.localgovernment_lagos_id || v.localgovernment_id || null,
           wardId: v.ward_lagos_id || v.ward_id || null,
           puNumberId: v.pollingunit_lagos_id || v.pollingunit_id || null,
           notes: v.notes || [],
           contact_logs: v.contact_logs || [],
        })));
      } else {
        setVoters([]);
      }
    } catch (err) {
      console.error("Failed to fetch voters", err);
    } finally {
      setIsLoadingVoters(false);
    }
  }, [user?.stateId, user?.role, user?.lagosPollingUnitId, user?.puId, user?.lgaId, user?.wardId, voterPuFilter, voterWardFilter, voterLgaFilter]);

  useEffect(() => {
    const fetchSupabaseData = async () => {
      try {
        /* 
         Note: We no longer fetch all agents on boot to prevent performance issues with large datasets.
         Counts are now handled by refreshAgentStats(), and lists are fetched on-demand in the UI components.
        */

        // ── Geographic hierarchy ──────────────────────────────────────
        const nationalNode: Location = { id: 'nat1', type: 'national', name: 'Nigeria', parentId: null };
        const geoLocations: Location[] = [nationalNode];

        // 1. Try dedicated geographic tables first
        const { data: statesData } = await supabase.from('states').select('*');
        if (statesData && statesData.length > 0) {
          statesData.forEach((s: any) => {
            geoLocations.push({ id: `state_${s.id}`, type: 'state', name: s.name, parentId: 'nat1' });
          });
        }

        const { data: lgData } = await supabase.from('local_governments').select('id,name,state_id');
        if (lgData && lgData.length > 0) {
          lgData.forEach((l: any) => {
            geoLocations.push({ id: `lga_${l.id}`, type: 'lga', name: l.name, parentId: `state_${l.state_id}` });
          });
        }

        // Wards and polling_units are loaded lazily per node click in Jurisdictions.tsx
        // to avoid loading 127k+ records into browser memory on boot

        setLocations(geoLocations);

        // ── Voters (lightweight: skip full load for performance, count via RPC) ──
        await fetchVotersPage(1);

        // ── Exact voter count via Postgres RPC ──────────────────────────
        // Build scoped RPC params based on role hierarchy
        const rpcParams: Record<string, any> = {};
        if (user?.role === 'pu_agent' && (user?.lagosPollingUnitId || user?.puId)) {
          rpcParams.p_polling_unit_lagos_id = user.lagosPollingUnitId || user.puId;
        } else if (voterPuFilter) {
          rpcParams.p_polling_unit_lagos_id = voterPuFilter;
        } else if (voterWardFilter || (user?.role === 'ward_admin' && user?.wardId)) {
          rpcParams.p_ward_id = voterWardFilter || user?.wardId;
        } else if (voterLgaFilter || (user?.role === 'lga_admin' && user?.lgaId)) {
          rpcParams.p_lga_id = voterLgaFilter || user?.lgaId;
        } else if (user?.stateId) {
          rpcParams.p_state_id = user.stateId;
        }

        const { data: countData, error: countErr } = await supabase.rpc('get_voters_count', rpcParams);
        let currentTarget = 0;
        if (!countErr && countData !== null) {
          currentTarget = countData as number;
          setTotalVotersCount(currentTarget);
        }

        const { data: stanceData, error: stanceErr } = await supabase.rpc('get_voter_status_counts', rpcParams);
        if (!stanceErr && stanceData) {
          const stances = [
            { name: 'ADC Supporter', count: 0 },
            { name: 'Undecided', count: 0 },
            { name: 'Opposition', count: 0 },
            { name: 'Unreachable', count: 0 }
          ];
          stanceData.forEach((row: any) => {
            const index = stances.findIndex(s => s.name === row.status);
            if (index !== -1) stances[index].count = Number(row.count);
          });
          
          const { data: canvassedCountData } = await supabase.rpc('get_canvassed_voters_count', rpcParams);
          const canvassed = canvassedCountData !== null ? Number(canvassedCountData) : 0;
          
          setStats(prev => ({
            ...prev,
            canvassing: {
              canvassed,
              target: currentTarget || prev.canvassing.target,
              stances
            }
          }));
        }
      } catch (err) {
        console.error("Failed to load Supabase data", err);
      }
    };
    fetchSupabaseData();
  }, [user?.id, user?.stateId, user?.lagosPollingUnitId, voterPuFilter]);

  const toggleMockMode = () => setIsMockMode(!isMockMode);
  const endAllMockElections = () => setIsMockMode(false);

  /** SHA-256 hex of a string using the Web Crypto API */
  const sha256Hex = async (text: string): Promise<string> => {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  };

  const login = async (phone: string, password: string) => {
    // TODO: re-enable when enforcing password
    // const meetsRules =
    //   password.length >= 8 &&
    //   /[A-Z]/.test(password) &&
    //   /[a-z]/.test(password) &&
    //   /\d/.test(password);
    // if (!meetsRules) {
    //   throw new Error('Password must be at least 8 characters with uppercase, lowercase, and a number.');
    // }

    // Temporarily set phone header in sessionStorage for initial query to pass RLS policy before login is finalized
    sessionStorage.setItem('temp_login_phone', phone);

    let agentData: any = null;
    let error: any = null;
    try {
      const res = await supabase
        .from('agents')
        .select('*')
        .eq('phone', phone)
        .single();
      agentData = res.data;
      error = res.error;
    } finally {
      sessionStorage.removeItem('temp_login_phone');
    }

    if (error || !agentData) {
      console.error("Login database error details:", error);
      throw new Error('Agent not found. Check your phone number.');
    }

    // Password check: if the agent has a stored hash, verify it. Old accounts without a hash bypass this check.
    if (agentData.password_hash) {
      const hash = await sha256Hex(password);
      if (hash !== agentData.password_hash) {
        throw new Error('Incorrect password. Please try again.');
      }
    }

    // TODO: re-enable status checks
    // if (agentData.status && agentData.status.toLowerCase() === 'suspended') {
    //   throw new Error('Your account has been suspended. Contact your administrator.');
    // }
    // if (agentData.status && agentData.status.toLowerCase() === 'revoked') {
    //   throw new Error('Your account has been revoked. Contact your administrator.');
    // }

    // Build locationId from the most specific jurisdiction available
    let locationId = 'nat1';
    let locationName = 'Nigeria';
    const isLagos = agentData.state_id === 24;
    
    if (agentData.polling_units_id) {
      locationId = `pu_${agentData.polling_units_id}`;
      const table = isLagos ? 'polling_units_lagos' : 'polling_units';
      const { data } = await supabase.from(table).select('name').eq('id', agentData.polling_units_id).single();
      if (data) locationName = data.name;
    }
    else if (agentData.wards_id) {
      locationId = `ward_${agentData.wards_id}`;
      const table = isLagos ? 'wards_lagos' : 'wards';
      const { data } = await supabase.from(table).select('name').eq('id', agentData.wards_id).single();
      if (data) locationName = data.name;
    }
    else if (agentData.local_governments_id) {
      locationId = `lga_${agentData.local_governments_id}`;
      const table = isLagos ? 'local_governments_lagos' : 'local_governments';
      const { data } = await supabase.from(table).select('name').eq('id', agentData.local_governments_id).single();
      if (data) locationName = data.name;
    }
    else if (agentData.state_id) {
      locationId = `state_${agentData.state_id}`;
      const { data } = await supabase.from('states').select('name').eq('id', agentData.state_id).single();
      if (data) locationName = data.name;
    }
    else if (agentData.jurisdiction_id) {
      locationId = agentData.jurisdiction_id;
    }

    const loggedInUser = {
      id: agentData.id,
      name: agentData.name,
      firstName: agentData.first_name || agentData.name.split(' ')[0],
      lastName: agentData.last_name || agentData.name.split(' ').slice(1).join(' ') || '',
      role: agentData.role as Role,
      phone: agentData.phone,
      locationId,
      locationName,
      // Store raw IDs for jurisdiction scoping
      stateId: agentData.state_id ?? null,
      lgaId: agentData.local_governments_id ?? null,
      wardId: agentData.wards_id ?? null,
      puId: agentData.polling_units_id ?? null,
      lagosPollingUnitId: agentData.pollingunit_lagos_id ?? null,
      picture: agentData.profile_picture_url || undefined,
      bankName: agentData.bank_name || undefined,
      accountName: agentData.account_name || undefined,
      accountNumber: agentData.account_number || undefined,
    };
    
    setUser(loggedInUser);
    localStorage.setItem('eagleeye_user', JSON.stringify(loggedInUser));
    const nowStr = Date.now().toString();
    localStorage.setItem('eagleeye_login_time', nowStr);
    localStorage.setItem('eagleeye_last_active', nowStr);
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('eagleeye_user');
    localStorage.removeItem('eagleeye_login_time');
    localStorage.removeItem('eagleeye_last_active');
  };

  // Rolling session inactivity watcher
  useEffect(() => {
    if (!user) return;

    let lastUpdate = Date.now();

    const handleUserActivity = () => {
      const now = Date.now();
      if (now - lastUpdate > 15000) {
        lastUpdate = now;
        localStorage.setItem('eagleeye_last_active', now.toString());
      }
    };

    const activityEvents = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    activityEvents.forEach(evt => window.addEventListener(evt, handleUserActivity, { passive: true }));

    // Check inactivity periodically
    const timer = setInterval(() => {
      const activeTimestamp = localStorage.getItem('eagleeye_last_active') || localStorage.getItem('eagleeye_login_time');
      if (activeTimestamp) {
        const idleDuration = Date.now() - parseInt(activeTimestamp, 10);
        if (idleDuration >= SESSION_DURATION_MS) {
          logout();
          toast.error('Session expired due to inactivity. Please log in again.', { id: 'session-timeout' });
        }
      }
    }, 10000);

    return () => {
      activityEvents.forEach(evt => window.removeEventListener(evt, handleUserActivity));
      clearInterval(timer);
    };
  }, [user]);

  const updateUser = async (updates: Partial<User>) => {
    if (user) {
      const newUser = { ...user, ...updates };
      setUser(newUser);
      localStorage.setItem('eagleeye_user', JSON.stringify(newUser));
      try {
        await supabase.from('agents').update({
           first_name: updates.firstName,
           last_name: updates.lastName,
           phone: updates.phone,
           profile_picture_url: updates.picture,
           bank_name: updates.bankName,
           account_name: updates.accountName,
           account_number: updates.accountNumber
        }).eq('id', user.id);
      } catch (err) {
        console.error('Failed to update agent profile in db', err);
      }
    }
  };

  const buildScopedRpcParams = (): Record<string, any> => {
    if (user?.role === 'pu_agent' && (user?.lagosPollingUnitId || user?.puId)) {
      return { p_polling_unit_lagos_id: user.lagosPollingUnitId || user.puId };
    } else if (voterPuFilter) {
      return { p_polling_unit_lagos_id: voterPuFilter };
    } else if (voterWardFilter || (user?.role === 'ward_admin' && user?.wardId)) {
      return { p_ward_id: voterWardFilter || user?.wardId };
    } else if (voterLgaFilter || (user?.role === 'lga_admin' && user?.lgaId)) {
      return { p_lga_id: voterLgaFilter || user?.lgaId };
    } else if (user?.stateId) {
      return { p_state_id: user.stateId };
    }
    return {};
  };

  const updateVoterStatus = async (id: string, status: Voter['status']) => {
    setVoters(prev => prev.map(v => String(v.id) === String(id) ? { ...v, status } : v));
    
    try {
      await supabase.from('voters').update({ status }).eq('id', id);
      const rpcParams = buildScopedRpcParams();
      const { data: stanceData } = await supabase.rpc('get_voter_status_counts', rpcParams);
      if (stanceData) {
        const stances = [
          { name: 'ADC Supporter', count: 0 },
          { name: 'Undecided', count: 0 },
          { name: 'Opposition', count: 0 },
          { name: 'Unreachable', count: 0 }
        ];
        let canvassed = 0;
        stanceData.forEach((row: any) => {
          const index = stances.findIndex(s => s.name === row.status);
          if (index !== -1) stances[index].count = Number(row.count);
          if (row.status !== 'Undecided') canvassed += Number(row.count);
        });
        
        setStats(prev => ({
          ...prev,
          canvassing: {
            ...prev.canvassing,
            canvassed,
            stances
          }
        }));
      }
    } catch (err) {
      console.error('Failed to update voter status', err);
    }
  };

  const updateVoterDetails = async (id: string, updates: Partial<Voter>) => {
    setVoters(prev => prev.map(v => String(v.id) === String(id) ? { ...v, ...updates } : v));

    try {
      const payload: any = {};
      if (updates.name !== undefined) {
        const parts = updates.name.trim().split(/\s+/);
        payload.first_name = parts[0] || '';
        payload.last_name = parts.slice(1).join(' ') || '';
      }
      if (updates.phone !== undefined) {
        payload.phone_number = updates.phone;
      }
      if (updates.dob !== undefined) {
        payload.dob = updates.dob;
      }
      if (updates.puId !== undefined) {
        payload.puid = updates.puId;
      }
      if (updates.status !== undefined) {
        payload.status = updates.status;
      }
      if (updates.notes !== undefined) {
        payload.notes = updates.notes;
      }

      if (Object.keys(payload).length > 0) {
        const { error } = await supabase.from('voters').update(payload).eq('id', parseInt(id, 10));
        if (error) throw error;
        
        // If status changed, refresh the stats
        if (updates.status !== undefined) {
          const rpcParams = buildScopedRpcParams();
          const { data: stanceData } = await supabase.rpc('get_voter_status_counts', rpcParams);
          if (stanceData) {
            const stances = [
              { name: 'ADC Supporter', count: 0 },
              { name: 'Undecided', count: 0 },
              { name: 'Opposition', count: 0 },
              { name: 'Unreachable', count: 0 }
            ];
            stanceData.forEach((row: any) => {
              const index = stances.findIndex(s => s.name === row.status);
              if (index !== -1) stances[index].count = Number(row.count);
            });
            
            const { data: canvassedCountData } = await supabase.rpc('get_canvassed_voters_count', rpcParams);
            const canvassed = canvassedCountData !== null ? Number(canvassedCountData) : 0;
            
            setStats(prev => ({
              ...prev,
              canvassing: {
                ...prev.canvassing,
                canvassed,
                stances
              }
            }));
          }
        }
      }
    } catch (err) {
      console.error('Failed to update voter details', err);
      // Revert local state to keep sync
      await fetchVotersPage(votersPage);
      throw err;
    }
  };

  const logVoterContact = async (id: string, type: 'whatsapp' | 'sms' | 'call') => {
    if (!user) return;
    const newLog = {
      type,
      agentId: user.id,
      agentName: user.name,
      timestamp: new Date().toISOString()
    };

    setVoters(prev => prev.map(v => {
      if (String(v.id) === String(id)) {
        const logs = v.contact_logs || [];
        return {
          ...v,
          contact_logs: [...logs, newLog]
        };
      }
      return v;
    }));

    try {
      const { data: voterData } = await supabase
        .from('voters')
        .select('contact_logs')
        .eq('id', parseInt(id, 10))
        .single();
        
      const currentLogs = voterData?.contact_logs || [];
      const updatedLogs = [...currentLogs, newLog];

      const { error } = await supabase
        .from('voters')
        .update({ contact_logs: updatedLogs })
        .eq('id', parseInt(id, 10));

      if (error) throw error;

      // Refresh stats
      const rpcParams = buildScopedRpcParams();
      const { data: canvassedCountData } = await supabase.rpc('get_canvassed_voters_count', rpcParams);
      const canvassed = canvassedCountData !== null ? Number(canvassedCountData) : 0;

      setStats(prev => ({
        ...prev,
        canvassing: {
          ...prev.canvassing,
          canvassed
        }
      }));
    } catch (err) {
      console.error('Failed to log voter contact:', err);
    }
  };

  const addVoterNote = async (id: string, text: string) => {
    if (!user) return;
    const newNote: VoterNote = {
      text,
      agentId: user.id,
      agentName: user.name,
      createdAt: new Date().toISOString()
    };
    
    setVoters(prev => prev.map(v => {
      if (String(v.id) === String(id)) {
        return { ...v, notes: [...(v.notes || []), newNote] };
      }
      return v;
    }));

    try {
      const targetVoter = voters.find(v => String(v.id) === String(id));
      const updatedNotes = [...(targetVoter?.notes || []), newNote];
      const { error } = await supabase.from('voters').update({ notes: updatedNotes }).eq('id', id);
      if (error) throw error;
    } catch (err) {
      console.error('Failed to add note', err);
      // Revert optimistic update
      setVoters(prev => prev.map(v => {
        if (String(v.id) === String(id)) {
          const target = prev.find(pv => String(pv.id) === String(id));
          return { ...v, notes: target?.notes?.filter(n => n.createdAt !== newNote.createdAt) || [] };
        }
        return v;
      }));
      throw err;
    }
  };

  const submitResult = async (puId: string, electionId: string, data: any, imageFile: File | null) => {
    try {
      setStats(prev => ({ ...prev, uploadProgress: 10 }));
      
      let imageUrl = null;
      if (imageFile) {
        setStats(prev => ({ ...prev, uploadProgress: 30 }));
        const fileExt = imageFile.name.split('.').pop();
        const fileName = `${puId}-${electionId}-${Math.random().toString(36).substring(2, 10)}.${fileExt}`;
        const filePath = `results/${electionId}/${fileName}`;
        
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('election-results')
          .upload(filePath, imageFile);
          
        if (uploadError) {
          throw uploadError;
        }
        
        const { data: publicUrlData } = supabase.storage
          .from('election-results')
          .getPublicUrl(filePath);
          
        imageUrl = publicUrlData.publicUrl;
      }
      
      setStats(prev => ({ ...prev, uploadProgress: 60 }));

      // Follow the db column name patterns strictly
      const insertData = {
        polling_units_id: puId,
        election_type: electionId,
        results_json: data,
        total_valid: data.number_of_valid_votes,
        total_rejected: data.number_of_rejected_ballots,
        total_cast: data.total_votes_cast,
        image_url: imageUrl,
        agent_id: user?.id,
        tags: data.tags || [],
        status: data.status || 'verified',
        state_id: user?.stateId,
        local_governments_id: data.local_government || user?.lgaId,
        wards_id: user?.wardId
      };

      const { error } = await supabase.from('election_results').insert(insertData);
      
      if (error) {
        throw error;
      }

      await refreshElectionStats();
      setStats(prev => ({ ...prev, uploadProgress: 100 }));
    } catch (error) {
      console.error('Error submitting result:', error);
      throw error;
    }
  };

  const analyzeResultImage = async (file: File): Promise<{ results: any; ai_used?: string }> => {
    try {
      const fileToBase64 = async (f: File) => {
        return new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64Data = (reader.result as string).split(',')[1];
            resolve(base64Data);
          };
          reader.readAsDataURL(f);
        });
      };

      const imageBase64 = await fileToBase64(file);

      const { data, error } = await supabase.functions.invoke('analyze-result', {
        body: {
          imageBase64,
          mimeType: file.type,
          promptText: VISION_AI_PROMPT
        }
      });

      if (error) {
        // supabase-js hides the actual Edge Function response body inside the error.context if it's a 4xx error.
        let errMsg = error.message;
        
        // Try to dig out the JSON { error: "msg" } we threw from Edge Function
        if (error.context && typeof error.context.json === 'function') {
           try {
             const errData = await error.context.json();
             if (errData.error) errMsg = errData.error;
           } catch(e) {}
        }
        throw new Error(errMsg || 'Edge Function failure');
      }

      return { results: data.results, ai_used: data.ai_used };
    } catch (err: any) {
      console.error("AI Analysis failed:", err);
      throw err;
    }
  };

  const addAgent = async (agent: Omit<Agent, 'id'>) => {
    const locId = agent.locationId || '';
    
    // Use IDs from agent object (modal state) or parse from locId, forcing integer type conversion
    let stateId = agent.stateId ? parseInt(String(agent.stateId), 10) : (locId.startsWith('state_') ? parseInt(locId.replace('state_', ''), 10) : null);
    let lgaId = agent.lgaId ? parseInt(String(agent.lgaId), 10) : (locId.startsWith('lga_') ? parseInt(locId.replace('lga_', ''), 10) : null);
    let wardId = agent.wardId ? parseInt(String(agent.wardId), 10) : (locId.startsWith('ward_') ? parseInt(locId.replace('ward_', ''), 10) : null);
    let puId = agent.puId ? parseInt(String(agent.puId), 10) : (locId.startsWith('pu_') ? parseInt(locId.replace('pu_', ''), 10) : null);

    // Resolve parents from locations context if still missing
    const resolveParents = (targetId: string) => {
      let current = locations.find(l => l.id === targetId);
      while (current && current.parentId) {
        const pid = current.parentId;
        if (pid.startsWith('state_') && !stateId) stateId = parseInt(pid.replace('state_', ''));
        if (pid.startsWith('lga_') && !lgaId) lgaId = parseInt(pid.replace('lga_', ''));
        if (pid.startsWith('ward_') && !wardId) wardId = parseInt(pid.replace('ward_', ''));
        current = locations.find(l => l.id === pid);
      }
    };
    if (locId) resolveParents(locId);

    const jurisdictionType = locId.startsWith('pu_') ? 'pu' : 
                             locId.startsWith('ward_') ? 'ward' :
                             locId.startsWith('lga_') ? 'lga' :
                             locId.startsWith('state_') ? 'state' : 'national';

    // Build DB record
    const dbRecord: any = {
      name: agent.name || `${agent.firstName || ''} ${agent.lastName || ''}`.trim(),
      first_name: agent.firstName || null,
      last_name: agent.lastName || null,
      phone: agent.phone,
      role: agent.role,
      status: 'Active',
      jurisdiction_type: jurisdictionType,
      jurisdiction_id: locId,
      profile_picture_url: agent.picture || null,
      bank_name: agent.bankName || null,
      account_name: agent.accountName || null,
      account_number: agent.accountNumber || null,
      state_id: stateId,
      local_governments_id: lgaId,
      wards_id: wardId,
      polling_units_id: puId,
    };

    if (agent.password) {
      dbRecord.password_hash = await sha256Hex(agent.password);
    }

    // Auto-resolve pollingunit_lagos_id for pu_agents by matching puId text
    let lagosPollingUnitId: number | null = null;
    if (puId) {
      if (stateId === 24) {
        lagosPollingUnitId = puId;
      } else {
        try {
          const { data: puData } = await supabase
            .from('polling_units')
            .select('"puId"')
            .eq('id', puId)
            .single();
          if (puData?.puId) {
            const { data: lagosData } = await supabase
              .from('polling_units_lagos')
              .select('id')
              .eq('puId', puData.puId)
              .single();
            if (lagosData?.id) lagosPollingUnitId = lagosData.id;
          }
        } catch (_) {}
      }
      if (lagosPollingUnitId) dbRecord.pollingunit_lagos_id = lagosPollingUnitId;
    }

    try {
      const { data, error } = await supabase.from('agents').insert([dbRecord]).select().single();
      if (error) throw new Error(getFriendlyErrorMessage(error));
      
      await refreshDeploymentStats();
      
      // Add to local state with server-assigned id
      setAgents(prev => [...prev, {
        ...agent,
        id: data.id,
        status: 'active',
        locationId: locId,
        stateId,
        lgaId,
        wardId,
        puId,
        lagosPollingUnitId,
      }]);
    } catch (err: any) {
      console.error('Failed to add agent:', err);
      throw err;
    }
  };

  const updateAgent = async (id: string, updates: Partial<Agent>) => {
    setAgents(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a));
    try {
      const payload: any = {};
      if (updates.name !== undefined) payload.name = updates.name;
      if (updates.firstName !== undefined) payload.first_name = updates.firstName;
      if (updates.lastName !== undefined) payload.last_name = updates.lastName;
      if (updates.phone !== undefined) payload.phone = updates.phone;
      if (updates.role !== undefined) payload.role = updates.role;
      if (updates.status !== undefined) {
        payload.status = updates.status.charAt(0).toUpperCase() + updates.status.slice(1);
      }
      if (updates.picture !== undefined) payload.profile_picture_url = updates.picture;
      if (updates.bankName !== undefined) payload.bank_name = updates.bankName;
      if (updates.accountName !== undefined) payload.account_name = updates.accountName;
      if (updates.accountNumber !== undefined) payload.account_number = updates.accountNumber;
      if (updates.password) {
        payload.password_hash = await sha256Hex(updates.password);
      }

      if (Object.keys(payload).length > 0) {
        const { error } = await supabase.from('agents').update(payload).eq('id', id);
        if (error) throw new Error(getFriendlyErrorMessage(error));
      }
    } catch (err) {
      console.error('Failed to update agent in db', err);
      throw err;
    }
  };

  const updateAgentStatus = async (id: string, status: Agent['status']) => {
    setAgents(prev => prev.map(a => a.id === id ? { ...a, status } : a));
    try {
      const dbStatus = status.charAt(0).toUpperCase() + status.slice(1);
      const { error } = await supabase.from('agents').update({ status: dbStatus }).eq('id', id);
      if (error) throw error;
    } catch (err) {
      console.error('Failed to update agent status in db', err);
      throw err;
    }
  };

  const addLocation = (location: Omit<Location, 'id'>) => {
    setLocations(prev => [...prev, { ...location, id: 'loc_' + Math.random().toString(36).substr(2, 9) }]);
  };

  const updateLocation = (id: string, updates: Partial<Location>) => {
    setLocations(prev => prev.map(l => l.id === id ? { ...l, ...updates } : l));
  };

  const getDescendantLocations = (startLocationId: string): Location[] => {
    const result: Location[] = [];
    const queue = [startLocationId];
    
    // Include the start location itself
    const startLoc = locations.find(l => l.id === startLocationId);
    if (startLoc) result.push(startLoc);

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const children = locations.filter(l => l.parentId === currentId);
      result.push(...children);
      queue.push(...children.map(c => c.id));
    }
    return result;
  };

  return (
    <AppContext.Provider value={{ 
      user, locations, agents, voters, stats, isMockMode, activeElectionGroup, totalVotersCount, electionResults,
      votersPage, isLoadingVoters, fetchVotersPage,
      voterLgaFilter, setVoterLgaFilter, voterWardFilter, setVoterWardFilter, voterPuFilter, setVoterPuFilter,
      login, logout, updateUser, updateVoterStatus, updateVoterDetails, logVoterContact, addVoterNote, submitResult, toggleMockMode, endAllMockElections, setActiveElectionGroup,
      addAgent, updateAgent, updateAgentStatus, addLocation, updateLocation, getDescendantLocations, analyzeResultImage
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}

