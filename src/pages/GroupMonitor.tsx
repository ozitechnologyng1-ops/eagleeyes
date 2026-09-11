import React, { useState, useEffect } from 'react';
import { 
  Users, MessageSquare, Shield, AlertTriangle, CheckCircle, 
  RefreshCw, Bot, Phone, Search, ChevronRight, ArrowLeft 
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
    try {
      await greenApiService.toggleGroupAi(groupId, !current);
      toast.success(!current ? 'AI Defense activated for group' : 'AI Defense paused');
      setMonitors(prev => prev.map(m => m.id === groupId ? { ...m, ai_enabled: !current } : m));
      if (selectedGroup && selectedGroup.id === groupId) {
        setSelectedGroup(prev => prev ? { ...prev, ai_enabled: !current } : null);
      }
    } catch (err: any) {
      toast.error('Failed to toggle AI state');
    }
  };

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
          <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSelectedGroup(null)}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition cursor-pointer"
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

            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-500">
                AI Replies Today: <strong className="text-[#004d25]">{selectedGroup.ai_responses_today || 0}</strong>
              </span>
              <button
                onClick={() => toggleAi(selectedGroup.id, selectedGroup.ai_enabled)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  selectedGroup.ai_enabled
                    ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {selectedGroup.ai_enabled ? '✓ AI Defense Active' : '⏸ AI Paused'}
              </button>
            </div>
          </div>

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

                  {/* AI Reponse (if bot responded to this message) */}
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
        <div>
          <h2 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Users className="h-5 w-5 text-[#004d25]" />
            Monitored Political Communities ({monitors.length})
          </h2>

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
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {monitors.map(m => (
                <div
                  key={m.id}
                  onClick={() => loadGroupMessages(m)}
                  className="bg-white p-5 rounded-xl border border-gray-200 hover:border-[#004d25] cursor-pointer transition shadow-xs space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-gray-900 text-sm hover:text-[#004d25]">{m.group_name || 'Political Group'}</h3>
                      <p className="text-[11px] text-gray-400 font-mono mt-0.5">{m.participant_count || 0} participants</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                      m.ai_enabled ? 'bg-emerald-100 text-[#004d25]' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {m.ai_enabled ? 'AI Defense' : 'Monitor Only'}
                    </span>
                  </div>

                  <div className="text-xs text-gray-500 pt-2 border-t border-gray-100 space-y-1">
                    <p>Added by: <span className="font-semibold text-gray-700">{m.added_by_agent?.name || 'Field Agent'}</span></p>
                    <p>Bot Replies Today: <span className="font-semibold text-[#004d25]">{m.ai_responses_today || 0}</span></p>
                  </div>

                  <div className="flex justify-end pt-1">
                    <span className="text-xs font-semibold text-[#004d25] flex items-center gap-1">
                      View Messages & AI Logs <ChevronRight className="h-3.5 w-3.5" />
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
