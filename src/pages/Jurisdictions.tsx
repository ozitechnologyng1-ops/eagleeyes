import React, { useState, useEffect, useCallback } from 'react';
import { useApp, Location, LocationType, Agent, Role, roleHierarchy } from '../context/AppContext';
import {
  Map, ChevronRight, ChevronDown,
  UserPlus, User, Shield, Loader2
} from 'lucide-react';
import { cn } from '../lib/utils';
import AgentModal from '../components/AgentModal';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';

/* ─── helpers ─────────────────────────────────────────────────────── */
const typeLabel: Record<string, string> = {
  state: 'State', lga: 'LGA', ward: 'Ward', pu: 'Polling Unit',
};

const typeBadge: Record<string, string> = {
  state: 'bg-green-50 text-green-700',
  lga:   'bg-blue-50 text-blue-600',
  ward:  'bg-purple-50 text-purple-600',
  pu:    'bg-orange-50 text-orange-600',
};

const statusDot: Record<string, string> = {
  active: 'bg-green-500', suspended: 'bg-yellow-500', revoked: 'bg-red-500',
};

/** Which child table and filter column a given type expands into */
const childConfig: Partial<Record<LocationType, { table: string; filterCol: string; idPrefix: string; childType: LocationType }>> = {
  state: { table: 'local_governments', filterCol: 'state_id',          idPrefix: 'lga',  childType: 'lga'  },
  lga:   { table: 'wards',             filterCol: 'localgovernment_id', idPrefix: 'ward', childType: 'ward' },
  ward:  { table: 'polling_units',     filterCol: 'ward_id',            idPrefix: 'pu',   childType: 'pu'   },
};

/** Extract pure numeric id from a prefixed string like 'lga_5' → 5 */
const numId = (prefixedId: string) => parseInt(prefixedId.split('_').pop() || '0') || 0;

/* ─── Lazy Tree Node ─────────────────────────────────────────────── */
interface NodeProps {
  location: Location;
  userRole: Role;
  /** IDs the current user owns — used to restrict "add child" actions */
  userStateId?: number | null;
  userLgaId?: number | null;
  userWardId?: number | null;
  onAddAgent: (loc: Location) => void;
  onEditAgent: (agent: Agent) => void;
  depth?: number;
  isLagos?: boolean;
  refreshKey?: number;
}

const TreeNode: React.FC<NodeProps> = ({
  location, userRole, userStateId, userLgaId, userWardId,
  onAddAgent, onEditAgent, depth = 0, isLagos: isLagosProp, refreshKey
}) => {
  const [open, setOpen] = useState(false);
  const [children, setChildren] = useState<Location[]>([]);
  const [nodeAgents, setNodeAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [agentsLoaded, setAgentsLoaded] = useState(false);
  const [coverage, setCoverage] = useState<{ covered: number; total: number } | null>(null);

  const isLagosNode = isLagosProp || location.id === 'state_24';

  // Pick Lagos-specific or national child config
  const lagosChildConfig: typeof childConfig = {
    state: { table: 'local_governments_lagos', filterCol: 'state_id',                idPrefix: 'lga',  childType: 'lga'  },
    lga:   { table: 'wards_lagos',             filterCol: 'localgovernment_lagos_id', idPrefix: 'ward', childType: 'ward' },
    ward:  { table: 'polling_units_lagos',     filterCol: 'ward_id',                  idPrefix: 'pu',   childType: 'pu'   },
  };
  const cfg = isLagosNode
    ? lagosChildConfig[location.type as LocationType]
    : childConfig[location.type as LocationType];
  const canExpand = !!cfg;

  const loadChildren = useCallback(async () => {
    if (loaded || !cfg) return;
    setLoading(true);
    try {
      const rawId = numId(location.id);
      const { data, error } = await supabase
        .from(cfg.table)
        .select('id,name')
        .eq(cfg.filterCol, rawId)
        .order('name')
        .limit(500);

      if (error) throw error;
      setChildren((data || []).map((r: any) => ({
        id: `${cfg.idPrefix}_${r.id}`,
        type: cfg.childType,
        name: r.name || `${typeLabel[cfg.childType]} ${r.id}`,
        parentId: location.id,
      })));
      setLoaded(true);
    } catch (err) {
      toast.error('Failed to fetch locations');
    } finally {
      setLoading(false);
    }
  }, [location.id, cfg, loaded]);

  const loadNodeAgents = useCallback(async (force = false) => {
    if (agentsLoaded && !force) return;
    try {
      const { data } = await supabase.from('agents').select('*').eq('jurisdiction_id', location.id);
      if (data) {
        setNodeAgents((data as any[]).map(a => ({
          id: a.id,
          name: a.name,
          firstName: a.first_name || (a.name ? a.name.split(' ')[0] : ''),
          lastName: a.last_name || (a.name ? a.name.split(' ').slice(1).join(' ') : ''),
          role: a.role as Role,
          status: (a.status || 'active').toLowerCase() as Agent['status'],
          locationId: location.id,
          phone: a.phone,
          picture: a.profile_picture_url || '',
          bankName: a.bank_name || '',
          accountName: a.account_name || '',
          accountNumber: a.account_number || '',
          stateId: a.state_id,
          lgaId: a.local_governments_id,
          wardId: a.wards_id,
          puId: a.polling_units_id,
          lagosPollingUnitId: a.pollingunit_lagos_id
        })).filter(a => roleHierarchy[a.role] < roleHierarchy[userRole]));
      }
      setAgentsLoaded(true);
    } catch (err) {
      console.error('Failed to load node agents', err);
    }
  }, [location.id, agentsLoaded, userRole]);

  useEffect(() => {
    if (open && agentsLoaded) {
      loadNodeAgents(true);
    }
  }, [refreshKey]);

  const loadCoverageStats = useCallback(async () => {
    if (!cfg || coverage) return;
    try {
      const rawId = numId(location.id);
      
      // Mappings for the 'agents' table specifically
      const agentFilterCol = location.type === 'state' ? 'state_id' : 
                             location.type === 'lga' ? 'local_governments_id' : 
                             location.type === 'ward' ? 'wards_id' : 'jurisdiction_id';
                             
      const agentDistinctCol = cfg.childType === 'lga' ? 'local_governments_id' : 
                               cfg.childType === 'ward' ? 'wards_id' : 'polling_units_id';
      
      // Denominator: Total child locations in geography tables
      const { count: total } = await supabase.from(cfg.table).select('*', { count: 'exact', head: true }).eq(cfg.filterCol, rawId);
      
      // Numerator: Unique child locations that have at least one agent
      const { data: covered } = await supabase.from('agents')
        .select(agentDistinctCol)
        .eq(agentFilterCol, rawId)
        .not(agentDistinctCol, 'is', null);
      
      const uniqueCovered = new Set((covered as any[] | null)?.map(d => d[agentDistinctCol]));
      setCoverage({ covered: uniqueCovered.size, total: total || 0 });
    } catch (err) {
      console.error('Failed to load coverage', err);
    }
  }, [location.id, location.type, cfg, coverage]);

  useEffect(() => {
    loadCoverageStats();
  }, [loadCoverageStats]);

  const toggle = async () => {
    if (!open) {
      if (!loaded) await loadChildren();
      if (!agentsLoaded) await loadNodeAgents();
    }
    setOpen(v => !v);
  };

  const hasContent = canExpand || nodeAgents.length > 0;

  return (
    <div className="border-b border-gray-100 last:border-0">
      <div className="flex items-center justify-between px-3 py-2.5 hover:bg-gray-50/70 transition-colors">
        <div
          className={cn('flex items-center gap-2 flex-1 min-w-0 select-none', hasContent && 'cursor-pointer')}
          onClick={hasContent ? toggle : undefined}
        >
          {/* Expand icon */}
          {loading     ? <Loader2 size={14} className="text-[#004d25] animate-spin shrink-0" /> :
           canExpand   ? (open
              ? <ChevronDown  size={14} className="text-gray-400 shrink-0" />
              : <ChevronRight size={14} className="text-gray-400 shrink-0" />)
                       : <span className="w-3.5 shrink-0" />}

          <span className="font-medium text-gray-900 text-sm truncate">{location.name}</span>

          {coverage && coverage.total > 0 && (
            <span 
              title={`Coverage: ${coverage.covered} of ${coverage.total} ${cfg?.childType === 'lga' ? 'LGAs' : cfg?.childType === 'ward' ? 'Wards' : 'Polling Units'} have assigned agents (${Math.round((coverage.covered / coverage.total) * 100)}%)`}
              className={cn(
                "text-[10px] px-1.5 py-0.5 rounded-full font-bold cursor-help",
                coverage.covered === coverage.total ? "bg-green-100 text-green-700" :
                coverage.covered > 0 ? "bg-yellow-100 text-yellow-700" :
                "bg-red-50 text-red-600"
              )}
            >
              {Math.round((coverage.covered / coverage.total) * 100)}%
            </span>
          )}

          {loaded && children.length > 0 && (
            <span className="text-[10px] text-gray-400 shrink-0">{children.length}</span>
          )}
          {nodeAgents.length > 0 && (
            <span className="text-[9px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded shrink-0 font-bold">
              {nodeAgents.length} agent{nodeAgents.length > 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0 ml-2">
          <button
            onClick={e => { e.stopPropagation(); onAddAgent(location); }}
            className="text-xs font-medium text-blue-600 hover:bg-blue-50 px-2 py-1 rounded-md flex items-center gap-1 transition-colors cursor-pointer"
          >
            <UserPlus size={12} /> Agent
          </button>
        </div>
      </div>
      
      {/* Percentage Progress Bar */}
      {coverage && coverage.total > 0 && (
        <div className="h-[2px] w-full bg-gray-50 overflow-hidden mt-[-2px]">
          <div 
            className={cn(
              "h-full transition-all duration-1000",
              coverage.covered === coverage.total ? "bg-green-500" :
              coverage.covered > 0 ? "bg-yellow-500" : "bg-red-200"
            )}
            style={{ width: `${(coverage.covered / coverage.total) * 100}%` }}
          />
        </div>
      )}

      {open && (
        <div className="pl-5 ml-3 border-l-2 border-gray-100">
          {/* Agents at this node */}
          {nodeAgents.length > 0 && (
            <div className="py-2 px-2 flex flex-wrap gap-1.5">
              {nodeAgents.map(a => (
                <button
                  key={a.id}
                  onClick={() => onEditAgent(a)}
                  className="flex items-center gap-2 bg-blue-50 text-blue-700 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-blue-100 hover:bg-blue-100 transition-colors cursor-pointer group shadow-xs"
                >
                  {a.picture ? (
                    <img 
                      src={a.picture} 
                      alt={a.name} 
                      className="w-5 h-5 rounded-full object-cover border border-blue-200 shrink-0" 
                    />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                      <User size={11} />
                    </div>
                  )}
                  <div className="flex flex-col items-start">
                    <span className="font-semibold">{a.name}</span>
                    <span className="text-[9px] opacity-70 group-hover:opacity-100">{a.role.replace(/_/g, ' ')}</span>
                  </div>
                  <span className={cn('w-1.5 h-1.5 rounded-full ml-0.5', statusDot[a.status] || 'bg-gray-400')} />
                </button>
              ))}
            </div>
          )}

          {/* Child nodes */}
          {children.length === 0 && loaded && (
            <p className="text-xs text-gray-400 py-2 px-3 italic">No {typeLabel[cfg?.childType || 'pu']}s found</p>
          )}
          {children.map(child => (
            <TreeNode
              key={child.id}
              location={child}
              userRole={userRole}
              userStateId={userStateId}
              userLgaId={userLgaId}
              userWardId={userWardId}
              onAddAgent={onAddAgent}
              onEditAgent={onEditAgent}
              depth={depth + 1}
              isLagos={isLagosNode}
              refreshKey={refreshKey}
            />
          ))}
        </div>
      )}
    </div>
  );
};

/* ─── Main Jurisdictions Page ─────────────────────────────────────── */
export default function Jurisdictions() {
  const { user, locations, agents, addAgent, updateAgent } = useApp();
  const [jurisdictionName, setJurisdictionName] = useState('');
  const [roots, setRoots] = useState<Location[]>([]);
  const [rootLoading, setRootLoading] = useState(true);
  const [agentRefreshKey, setAgentRefreshKey] = useState(0);

  const [addAgentLoc, setAddAgentLoc] = useState<Location | null>(null);
  const [editAgent, setEditAgent] = useState<Agent | null>(null);
  const [search, setSearch] = useState('');

  // Fetch the correct root level for this user based on role + stored IDs
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setRootLoading(true);

    async function fetchRoot() {
      try {
        let result: Location[] = [];

        if (user!.role === 'national_admin') {
          setJurisdictionName('Nigeria');
          const { data } = await supabase.from('states').select('id,name').order('name');
          result = (data || []).map((s: any) => ({ id: `state_${s.id}`, type: 'state', name: s.name, parentId: null }));
        } else if (user!.role === 'state_admin') {
          if (user!.stateId) {
            const { data: st } = await supabase.from('states').select('name').eq('id', user!.stateId).single();
            if (st) setJurisdictionName(st.name);
            const { data } = await supabase.from('local_governments').select('id,name,state_id').eq('state_id', user!.stateId).order('name');
            result = (data || []).map((lga: any) => ({ id: `lga_${lga.id}`, type: 'lga', name: lga.name, parentId: `state_${lga.state_id}` }));
          }
        } else if (user!.role === 'lga_admin') {
          if (user!.lgaId) {
            const { data: lg } = await supabase.from('local_governments').select('name').eq('id', user!.lgaId).single();
            if (lg) setJurisdictionName(lg.name);
            const { data } = await supabase.from('wards').select('id,name,localgovernment_id').eq('localgovernment_id', user!.lgaId).order('name');
            result = (data || []).map((ward: any) => ({ id: `ward_${ward.id}`, type: 'ward', name: ward.name, parentId: `lga_${ward.localgovernment_id}` }));
          }
        } else if (user!.role === 'ward_admin') {
          if (user!.wardId) {
            const { data: wr } = await supabase.from('wards').select('name').eq('id', user!.wardId).single();
            if (wr) setJurisdictionName(wr.name);
            const { data } = await supabase.from('polling_units').select('id,name,ward_id').eq('ward_id', user!.wardId).order('name');
            result = (data || []).map((pu: any) => ({ id: `pu_${pu.id}`, type: 'pu', name: pu.name, parentId: `ward_${pu.ward_id}` }));
          }
        } else if (user!.role === 'pu_agent') {
          if (user!.puId) {
            const { data } = await supabase.from('polling_units').select('id,name,ward_id').eq('id', user!.puId).single();
            if (data) {
              setJurisdictionName(data.name);
              result = [{ id: `pu_${data.id}`, type: 'pu', name: data.name, parentId: `ward_${data.ward_id}` }];
            }
          }
        }

        if (!cancelled) setRoots(result);
      } finally {
        if (!cancelled) setRootLoading(false);
      }
    }
    fetchRoot();
    return () => { cancelled = true; };
  }, [user?.id, user?.stateId, user?.lgaId, user?.wardId, user?.puId, user?.role]);

  if (!user) return null;

  const filteredRoots = search
    ? roots.filter(r => r.name.toLowerCase().includes(search.toLowerCase()))
    : roots;

  const roleLabel = user.role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const totalAgents = agents.length;
  const activeAgents = agents.filter(a => a.status === 'active').length;

  const handleSaveAgent = async (agentData: Partial<Agent>) => {
    try {
      if (editAgent) {
        await updateAgent(editAgent.id, agentData);
        toast.success('Agent updated');
      } else {
        await addAgent(agentData as Omit<Agent, 'id'>);
        toast.success('Agent registered successfully');
      }
      setAgentRefreshKey(k => k + 1);
      setAddAgentLoc(null);
      setEditAgent(null);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save agent');
    }
  };

  return (
    <div className="h-full flex flex-col max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Jurisdictions</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            <span className="font-semibold text-[#004d25]">{roleLabel}</span>
            {jurisdictionName && (
              <span className="text-gray-400"> — {jurisdictionName}</span>
            )}
          </p>
        </div>
        <div className="flex gap-2 text-sm">
          <span className="bg-purple-50 text-purple-700 px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5">
            <Shield size={12} /> {totalAgents} total
          </span>
          <span className="bg-green-50 text-green-700 px-3 py-1.5 rounded-lg font-medium">
            {activeAgents} active
          </span>
        </div>
      </div>

      {/* Search */}
      <div className="mb-3">
        <input
          type="text"
          placeholder="Search locations..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-[#004d25] focus:outline-none"
        />
      </div>

      {/* Tree */}
      <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
        <div className="overflow-y-auto flex-1">
          {rootLoading ? (
            <div className="flex items-center justify-center py-20 gap-3 text-gray-400">
              <Loader2 size={20} className="animate-spin" />
              <span className="text-sm">Loading your jurisdiction...</span>
            </div>
          ) : filteredRoots.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              <Map className="mx-auto h-12 w-12 text-gray-300 mb-3" />
              <p className="font-medium">
                {search ? `No results for "${search}"` : 'No jurisdiction assigned'}
              </p>
              <p className="text-xs mt-1 text-gray-400">
                Your account hasn't been assigned a state/LGA/ward yet.
                Ask a national admin to update your profile.
              </p>
            </div>
          ) : (
            filteredRoots.map(root => (
              <TreeNode
                key={root.id}
                location={root}
                userRole={user.role}
                userStateId={user.stateId}
                userLgaId={user.lgaId}
                userWardId={user.wardId}
                onAddAgent={loc => { setAddAgentLoc(loc); setEditAgent(null); }}
                onEditAgent={agent => { setEditAgent(agent); setAddAgentLoc(null); }}
                refreshKey={agentRefreshKey}
              />
            ))
          )}
        </div>
      </div>

      {/* Agent Modal */}
      <AgentModal
        isOpen={!!addAgentLoc || !!editAgent}
        onClose={() => { setAddAgentLoc(null); setEditAgent(null); }}
        onSave={handleSaveAgent}
        initialData={editAgent || undefined}
        fixedLocation={addAgentLoc || undefined}
        locations={locations}
        userRole={user.role}
      />
    </div>
  );
}
