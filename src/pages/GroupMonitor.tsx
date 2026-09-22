import React, { useState, useEffect, useMemo } from 'react';
import { 
  Users, MessageSquare, Shield, AlertTriangle, CheckCircle, 
  RefreshCw, Bot, Phone, Search, ChevronRight, ArrowLeft,
  Power, Check, X, Filter, Sparkles, Clock
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useApp } from '../context/AppContext';
import { greenApiService, GroupMonitor as IGroupMonitor, GroupMessage } from '../lib/greenApi';

export const GroupMonitor: React.FC = () => {
  const { user } = useApp();
  const stateId = user?.stateId || 24;

  const [monitors, setMonitors] = useState<IGroupMonitor[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<IGroupMonitor | null>(null);
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [monitorPhone, setMonitorPhone] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'active' | 'paused'>('all');
  const [bulkLoading, setBulkLoading] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    loadMonitors();
  }, [stateId]);

  const loadMonitors = async () => {
    setLoading(true);
    try {
      const [grps, insts] = await Promise.all([
        greenApiService.getGroupMonitors(stateId),
        greenApiService.getInstances(stateId)
      ]);
      setMonitors(grps);

      const gmInst = insts.find(i => i.instance_type === 'group_monitor' && i.wa_state === 'authorized');
      if (gmInst?.phone_number) {
        setMonitorPhone(gmInst.phone_number);
      }
    } catch (err: any) {
      toast.error('Failed to load group monitors');
    } finally {
      setLoading(false);
    }
  };

  const loadGroupMessages = async (group: IGroupMonitor) => {
    setSelectedGroup(group);
    setLoadingMessages(true);
    try {
      const msgs = await greenApiService.getGroupMessages(group.id, 60);
      setMessages(msgs);
    } catch (err: any) {
      toast.error('Failed to load group messages');
    } finally {
      setLoadingMessages(false);
    }
  };

  const toggleAi = async (groupId: string, current: boolean) => {
    setTogglingId(groupId);
    try {
      await greenApiService.toggleGroupAi(groupId, !current);
      toast.success(!current ? 'AI Defense activated for group' : 'AI Defense turned OFF for group');
      setMonitors(prev => prev.map(m => m.id === groupId ? { ...m, ai_enabled: !current } : m));
      if (selectedGroup && selectedGroup.id === groupId) {
        setSelectedGroup(prev => prev ? { ...prev, ai_enabled: !current } : null);
      }
    } catch (err: any) {
      toast.error('Failed to toggle AI state');
    } finally {
      setTogglingId(null);
    }
  };

  const handleBulkToggle = async (enabled: boolean) => {
    if (monitors.length === 0) return;
    setBulkLoading(true);
    try {
      await greenApiService.bulkToggleGroupAi(stateId, enabled);
      toast.success(enabled ? 'AI Defense activated for all groups' : 'AI Defense turned OFF for all groups');
      setMonitors(prev => prev.map(m => ({ ...m, ai_enabled: enabled })));
      if (selectedGroup) {
        setSelectedGroup(prev => prev ? { ...prev, ai_enabled: enabled } : null);
      }
    } catch (err: any) {
      toast.error('Failed to update groups AI status');
    } finally {
      setBulkLoading(false);
    }
  };

  const activeCount = useMemo(() => monitors.filter(m => m.ai_enabled).length, [monitors]);
  const pausedCount = useMemo(() => monitors.filter(m => !m.ai_enabled).length, [monitors]);

  const filteredMonitors = useMemo(() => {
    return monitors.filter(m => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q || 
        (m.group_name || '').toLowerCase().includes(q) ||
        (m.group_chat_id || '').toLowerCase().includes(q) ||
        (m.added_by_agent?.name || '').toLowerCase().includes(q);
      
      if (!matchesSearch) return false;
      if (filterMode === 'active') return m.ai_enabled;
      if (filterMode === 'paused') return !m.ai_enabled;
      return true;
    });
  }, [monitors, searchQuery, filterMode]);

  const getCategoryBadge = (cat: string) => {
    switch (cat) {
      case 'attack':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700">ATTACK / SMEAR</span>;
      case 'negative':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700">CRITICISM</span>;
      case 'question':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700">INQUIRY / POLICY</span>;
      case 'positive':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700">ADC SUPPORT</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-600">GENERAL</span>;
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* State Agent Notice Banner */}
      <div className="p-4 bg-gradient-to-r from-emerald-600 to-teal-700 text-white rounded-xl shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            <h3 className="font-bold text-sm">State Political Group Intelligence Bot</h3>
            <span className="flex items-center gap-1 text-[11px] bg-white/20 px-2 py-0.5 rounded-full font-medium">
              <Clock className="h-3 w-3" /> 10-30s natural delay active
            </span>
          </div>
          <p className="text-xs text-emerald-100">
            {monitorPhone ? (
              <>
                Instruct field agents to add this WhatsApp number: <strong className="bg-white/20 px-1.5 py-0.5 rounded font-mono text-white">+{monitorPhone}</strong> into local campaign & political WhatsApp group chats.
              </>
            ) : (
              'Connect a Group Monitor WhatsApp number in the WhatsApp Config tab to activate automated group intelligence.'
            )}
          </p>
        </div>
        <button
          onClick={loadMonitors}
          className="self-start md:self-auto px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh Groups
        </button>
      </div>

      {selectedGroup ? (
        /* DETAIL VIEW: Single Group Messages & AI Log */
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-white p-4 rounded-xl border border-gray-200 shadow-xs gap-3">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSelectedGroup(null)}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition cursor-pointer shrink-0"
              >
                <ArrowLeft className="h-5 w-5 text-gray-600" />
              </button>
              <div>
                <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <Users className="h-4 w-4 text-[#004d25]" />
                  {selectedGroup.group_name || 'WhatsApp Group'}
                </h2>
                <p className="text-xs text-gray-500">
                  Added by: <span className="font-semibold text-gray-700">{selectedGroup.added_by_agent?.name || 'Field Agent'}</span> • ID: <span className="font-mono text-[11px]">{selectedGroup.group_chat_id}</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 self-end sm:self-auto">
              <span className="text-xs text-gray-500">
                Replies Today: <strong className="text-[#004d25]">{selectedGroup.ai_responses_today || 0}</strong>
              </span>
              <button
                onClick={() => toggleAi(selectedGroup.id, selectedGroup.ai_enabled)}
                disabled={togglingId === selectedGroup.id}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 shadow-2xs ${
                  selectedGroup.ai_enabled
                    ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                <Power className="h-3.5 w-3.5" />
                {togglingId === selectedGroup.id 
                  ? 'Updating...' 
                  : selectedGroup.ai_enabled ? 'AI Defense ON' : 'AI Defense OFF'}
              </button>
            </div>
          </div>

          {/* AI Status Alert Banner */}
          {!selectedGroup.ai_enabled && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between text-xs text-amber-800 gap-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                <span>AI response is currently <strong>turned OFF</strong> for this group. Incoming discussions are monitored and recorded without automated replies.</span>
              </div>
              <button
                onClick={() => toggleAi(selectedGroup.id, false)}
                disabled={togglingId === selectedGroup.id}
                className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold shrink-0 cursor-pointer transition"
              >
                Turn AI ON
              </button>
            </div>
          )}

          {/* Group Messages Stream */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-xs p-4 space-y-4 max-h-[650px] overflow-y-auto">
            {loadingMessages ? (
              <div className="text-center py-12 text-gray-400">Loading messages...</div>
            ) : messages.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm">No recorded discussions yet for this group.</div>
            ) : (
              messages.map(msg => (
                <div key={msg.id} className="p-3 bg-gray-50 rounded-lg space-y-2 border border-gray-100">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900">{msg.sender_name || 'Participant'}</span>
                      <span className="text-[10px] text-gray-400 font-mono">({msg.sender_phone})</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {getCategoryBadge(msg.ai_category)}
                      <span className="text-[11px] text-gray-400">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>

                  <p className="text-xs text-gray-800">{msg.message_text}</p>

                  {/* AI Response (if bot responded to this message) */}
                  {msg.ai_responded && (
                    <div className="mt-2 p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg space-y-1">
                      <p className="text-[11px] font-bold text-[#004d25] flex items-center gap-1">
                        <Bot className="h-3 w-3" /> Candidate Defense Bot Reply:
                      </p>
                      <p className="text-xs text-emerald-950 italic">
                        "{msg.ai_response_text}"
                      </p>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        /* GRID VIEW: All Monitored Groups */
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <Users className="h-5 w-5 text-[#004d25]" />
                Monitored Political Communities ({monitors.length})
              </h2>
              <p className="text-xs text-gray-500">
                Toggle AI defense on or off individually for any group, or control all groups in bulk.
              </p>
            </div>

            {/* Bulk Controls */}
            {monitors.length > 0 && (
              <div className="flex items-center gap-2 self-start md:self-auto">
                <button
                  onClick={() => handleBulkToggle(true)}
                  disabled={bulkLoading || activeCount === monitors.length}
                  className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-semibold flex items-center gap-1 transition disabled:opacity-50 cursor-pointer"
                  title="Enable AI automated defense replies for all groups"
                >
                  <Power className="h-3.5 w-3.5 text-emerald-600" />
                  Turn All ON
                </button>
                <button
                  onClick={() => handleBulkToggle(false)}
                  disabled={bulkLoading || pausedCount === monitors.length}
                  className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300 rounded-lg text-xs font-semibold flex items-center gap-1 transition disabled:opacity-50 cursor-pointer"
                  title="Turn off AI automated replies for all groups (passive monitoring only)"
                >
                  <Power className="h-3.5 w-3.5 text-gray-500" />
                  Turn All OFF
                </button>
              </div>
            )}
          </div>

          {/* Search and Filters Bar */}
          {monitors.length > 0 && (
            <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search groups by name, chat ID, or added agent..."
                  className="w-full pl-9 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs bg-gray-50 focus:bg-white focus:ring-2 focus:ring-[#004d25] outline-none text-gray-900"
                />
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer text-xs"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Status Filter Chips */}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setFilterMode('all')}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
                    filterMode === 'all'
                      ? 'bg-[#004d25] text-white shadow-2xs'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  All ({monitors.length})
                </button>
                <button
                  onClick={() => setFilterMode('active')}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
                    filterMode === 'active'
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  AI Active ({activeCount})
                </button>
                <button
                  onClick={() => setFilterMode('paused')}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
                    filterMode === 'paused'
                      ? 'bg-gray-700 text-white shadow-2xs'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-200'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-gray-400" />
                  AI OFF ({pausedCount})
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="text-center py-12 text-gray-400">Loading groups...</div>
          ) : monitors.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-xl border border-gray-200 text-gray-500 shadow-xs">
              <Users className="h-10 w-10 mx-auto text-gray-400 mb-2" />
              <p className="font-semibold text-gray-700">No Groups Linked Yet</p>
              <p className="text-xs text-gray-400 max-w-sm mx-auto mt-1">
                Tell your ward coordinators and PU agents to add the State Monitor number to their WhatsApp groups.
              </p>
            </div>
          ) : filteredMonitors.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-gray-200 text-gray-500 text-sm">
              No groups match your current search or filter criteria.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredMonitors.map(m => (
                <div
                  key={m.id}
                  onClick={() => loadGroupMessages(m)}
                  className="bg-white p-5 rounded-xl border border-gray-200 hover:border-[#004d25] cursor-pointer transition shadow-xs space-y-3 relative group flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-gray-900 text-sm hover:text-[#004d25] truncate" title={m.group_name}>
                          {m.group_name || 'Political Group'}
                        </h3>
                        <p className="text-[11px] text-gray-400 font-mono mt-0.5">{m.participant_count || 0} participants</p>
                      </div>

                      {/* Interactive Per-Group Toggle Button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleAi(m.id, m.ai_enabled);
                        }}
                        disabled={togglingId === m.id}
                        title={m.ai_enabled ? "Click to turn OFF AI response for this group" : "Click to turn ON AI response for this group"}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-2xs shrink-0 ${
                          m.ai_enabled
                            ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200 border border-emerald-300'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-300'
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full ${m.ai_enabled ? 'bg-emerald-600 animate-pulse' : 'bg-gray-400'}`} />
                        {togglingId === m.id ? '...' : m.ai_enabled ? 'AI ON' : 'AI OFF'}
                      </button>
                    </div>

                    <div className="text-xs text-gray-500 pt-3 mt-3 border-t border-gray-100 space-y-1">
                      <p className="truncate">Added by: <span className="font-semibold text-gray-700">{m.added_by_agent?.name || 'Field Agent'}</span></p>
                      <p>Replies Today: <span className="font-semibold text-[#004d25]">{m.ai_responses_today || 0}</span></p>
                      <p className="text-[10px] text-gray-400 font-mono truncate">ID: {m.group_chat_id}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-gray-50 mt-2">
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                      m.ai_enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {m.ai_enabled ? 'AI Responding (10-30s delay)' : 'AI Off (Passive Log)'}
                    </span>
                    <span className="text-xs font-semibold text-[#004d25] flex items-center gap-0.5 group-hover:translate-x-0.5 transition">
                      Logs <ChevronRight className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
