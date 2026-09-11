import React, { useState, useEffect } from 'react';
import { 
  MessageSquare, Settings, Database, DollarSign, Server, Users, 
  Upload, QrCode, Phone, CheckCircle2, AlertCircle, RefreshCw, 
  Trash2, Plus, ExternalLink, Shield, Send, Image, Video, Eye,
  Copy, Check, FileText
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useApp } from '../context/AppContext';
import { greenApiService, WhatsAppStateConfig, WhatsAppInstance, KnowledgeEntry, GroupMonitor } from '../lib/greenApi';
import { supabase } from '../lib/supabase';

export const WhatsAppConfig: React.FC = () => {
  const { user } = useApp();
  const stateId = user?.stateId || 24; // Default to Lagos (24) or user's assigned state

  const [activeTab, setActiveTab] = useState<'settings' | 'ai' | 'earnings' | 'pool' | 'groups'>('settings');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // State config
  const [config, setConfig] = useState<Partial<WhatsAppStateConfig> & {
    default_message_format?: 'image_and_text' | 'text_only';
    earning_per_manual_wa?: number;
    earning_per_call?: number;
  }>({
    state_id: stateId,
    green_api_partner_token: '',
    default_flyer_url: '',
    default_flyer_type: 'image',
    default_message_format: 'image_and_text',
    default_message_template: 'Hello {{voter_name}}, this is {{agent_name}} from the ADC EagleEye team in {{ward_name}}. We would love to hear your thoughts and feedback!',
    daily_outreach_max: 10,
    auto_outreach_enabled: true,
    message_interval_minutes: 180,
    earning_per_chat: 50,
    earning_per_manual_wa: 15,
    earning_per_call: 20,
    earning_per_conversion: 200,
    earning_per_group_add: 100,
    group_ai_response_frequency: 3,
    ai_provider: 'gemini',
    ai_model: 'gemini-2.0-flash',
    ai_api_key: '',
    group_ai_system_prompt: 'You are a respectful, knowledgeable, and articulate community representative for the ADC candidate. Defend candidate policies factually using verified manifesto data, correct misconceptions, maintain a peaceful tone, and avoid hostile or aggressive debates.'
  });

  // Instances & Pool
  const [instances, setInstances] = useState<WhatsAppInstance[]>([]);
  const [poolStatus, setPoolStatus] = useState({ standby: 0, assigned: 0, groupMonitors: 0, total: 0, needsReplenish: true });
  const [agentsMap, setAgentsMap] = useState<Record<string, { name: string; phone?: string; ward?: string }>>({});

  // Knowledge base
  const [knowledgeList, setKnowledgeList] = useState<KnowledgeEntry[]>([]);
  const [kbTitle, setKbTitle] = useState('');
  const [kbContent, setKbContent] = useState('');
  const [kbType, setKbType] = useState('policy');
  const [kbImage, setKbImage] = useState('');
  const [kbDocUrl, setKbDocUrl] = useState('');
  const [kbDocName, setKbDocName] = useState('');
  const [kbCaption, setKbCaption] = useState('');
  const [uploadingKb, setUploadingKb] = useState(false);
  const [uploadingKbImage, setUploadingKbImage] = useState(false);
  const [uploadingKbDoc, setUploadingKbDoc] = useState(false);

  // Group monitors
  const [monitors, setMonitors] = useState<GroupMonitor[]>([]);

  // Modals / Connect flow
  const [connectingInstance, setConnectingInstance] = useState<WhatsAppInstance | null>(null);
  const [qrCodeData, setQrCodeData] = useState<string | null>(null);
  const [authCode, setAuthCode] = useState<string | null>(null);
  const [pairingPhone, setPairingPhone] = useState('');
  const [connectMethod, setConnectMethod] = useState<'qr' | 'phone'>('qr');
  const [copiedCode, setCopiedCode] = useState(false);

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    toast.success('Pairing code copied to clipboard!');
    setTimeout(() => setCopiedCode(false), 2000);
  };

  useEffect(() => {
    loadData();
  }, [stateId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [cfg, insts, pStatus, kbs, grps] = await Promise.all([
        greenApiService.getConfig(stateId),
        greenApiService.getInstances(stateId),
        greenApiService.getPoolStatus(stateId),
        greenApiService.getKnowledgeEntries(stateId),
        greenApiService.getGroupMonitors(stateId)
      ]);

      if (cfg) setConfig(cfg);
      setInstances(insts);
      setPoolStatus(pStatus);
      setKnowledgeList(kbs);
      setMonitors(grps);

      // Fetch agent profiles for assigned instances
      const { data: ags } = await supabase
        .from('agents')
        .select('id, name, phone, wards_id');
      if (ags) {
        const map: Record<string, { name: string; phone?: string; ward?: string }> = {};
        ags.forEach((a: any) => {
          map[a.id] = { name: a.name, phone: a.phone, ward: a.wards_id ? `Ward ${a.wards_id}` : undefined };
        });
        setAgentsMap(map);
      }
    } catch (err: any) {
      console.error('Error loading WhatsApp configuration:', err);
      toast.error('Failed to load WhatsApp configuration');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveConfig = async () => {
    setSaving(true);
    try {
      const saved = await greenApiService.saveConfig(stateId, config);
      if (saved) {
        setConfig(prev => ({ ...prev, ...saved }));
      }
      toast.success('WhatsApp state configuration saved successfully');
    } catch (err: any) {
      toast.error(err.message || 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  // Flyer Upload Handler
  const handleFlyerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isVideo = file.type.startsWith('video');
    const toastId = toast.loading('Uploading flyer asset...');

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `state_${stateId}_flyer_${Date.now()}.${fileExt}`;
      const filePath = `flyers/${fileName}`;

      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from('election-results')
        .upload(filePath, file, { upsert: true });

      if (uploadErr) throw uploadErr;

      const { data: publicUrlData } = supabase.storage
        .from('election-results')
        .getPublicUrl(filePath);

      setConfig(prev => ({
        ...prev,
        default_flyer_url: publicUrlData.publicUrl,
        default_flyer_type: isVideo ? 'video' : 'image'
      }));

      toast.success('Flyer uploaded and linked!', { id: toastId });
    } catch (err: any) {
      toast.error(`Upload failed: ${err.message}`, { id: toastId });
    }
  };

  // Create Instance
  const handleCreateInstance = async (type: 'agent' | 'group_monitor') => {
    const toastId = toast.loading(`Creating ${type === 'group_monitor' ? 'Group Monitor' : 'Agent'} instance...`);
    try {
      const newInst = await greenApiService.createInstance(stateId, type);
      toast.success('Instance created in standby pool!', { id: toastId });
      loadData();
      if (type === 'group_monitor') {
        openConnectModal(newInst);
      }
    } catch (err: any) {
      toast.error(err.message || 'Instance creation failed', { id: toastId });
    }
  };

  // Connect / Pair Instance Modal
  const openConnectModal = async (inst: WhatsAppInstance) => {
    setConnectingInstance(inst);
    setQrCodeData(null);
    setAuthCode(null);
    setConnectMethod('qr');

    try {
      const qrRes = await greenApiService.getQRCode(inst.id);
      if (qrRes?.message) {
        setQrCodeData(qrRes.message);
      }
    } catch (e) {
      console.error('Failed to get QR:', e);
    }
  };

  const handleGetAuthCode = async () => {
    if (!connectingInstance || !pairingPhone) {
      toast.error('Please enter a WhatsApp phone number');
      return;
    }
    const toastId = toast.loading('Requesting pairing code from WhatsApp...');
    try {
      const res = await greenApiService.getAuthCode(connectingInstance.id, pairingPhone);
      if (res?.code) {
        setAuthCode(res.code);
        toast.success('Code generated! Enter this code in WhatsApp.', { id: toastId });
      } else {
        toast.error('Could not generate pairing code', { id: toastId });
      }
    } catch (err: any) {
      toast.error(err.message || 'Pairing code error', { id: toastId });
    }
  };

  const handleCheckAuthStatus = async () => {
    if (!connectingInstance) return;
    const toastId = toast.loading('Checking authorization status...');
    try {
      const res = await greenApiService.checkInstanceState(connectingInstance.id);
      if (res.waState === 'authorized') {
        toast.success(`WhatsApp successfully connected! (${res.phoneNumber || 'Authorized'})`, { id: toastId });
        setConnectingInstance(null);
        loadData();
      } else {
        toast('Status is currently: ' + res.waState, { icon: 'ℹ️', id: toastId });
      }
    } catch (err: any) {
      toast.error(err.message, { id: toastId });
    }
  };

  const handleKbImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file (PNG, JPG, WEBP, etc.)');
      return;
    }

    setUploadingKbImage(true);
    const toastId = toast.loading(`Uploading image ${file.name}...`);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `kb_img_${stateId}_${Date.now()}.${fileExt}`;
      const filePath = `knowledge/${fileName}`;

      const { error: uploadErr } = await supabase.storage
        .from('election-results')
        .upload(filePath, file, { upsert: true });

      if (uploadErr) throw uploadErr;

      const { data: publicUrlData } = supabase.storage
        .from('election-results')
        .getPublicUrl(filePath);

      setKbImage(publicUrlData.publicUrl);
      toast.success(`Image attached!`, { id: toastId });
    } catch (err: any) {
      toast.error(`Image upload failed: ${err.message}`, { id: toastId });
    } finally {
      setUploadingKbImage(false);
    }
  };

  const handleKbDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const MAX_DOC_SIZE = 15 * 1024 * 1024; // 15MB
    if (file.size > MAX_DOC_SIZE) {
      toast.error(`File size exceeds 15MB limit (${(file.size / (1024 * 1024)).toFixed(1)}MB)`);
      return;
    }

    setUploadingKbDoc(true);
    const toastId = toast.loading(`Uploading document ${file.name}...`);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `kb_doc_${stateId}_${Date.now()}.${fileExt}`;
      const filePath = `knowledge/${fileName}`;

      const { error: uploadErr } = await supabase.storage
        .from('election-results')
        .upload(filePath, file, { upsert: true });

      if (uploadErr) throw uploadErr;

      const { data: publicUrlData } = supabase.storage
        .from('election-results')
        .getPublicUrl(filePath);

      setKbDocUrl(publicUrlData.publicUrl);
      setKbDocName(file.name);
      toast.success(`${file.name} attached!`, { id: toastId });
    } catch (err: any) {
      toast.error(`Upload failed: ${err.message}`, { id: toastId });
    } finally {
      setUploadingKbDoc(false);
    }
  };

  // Knowledge Base Add
  const handleAddKnowledge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kbTitle || !kbContent) {
      toast.error('Please provide a title and content');
      return;
    }

    setUploadingKb(true);
    const toastId = toast.loading('Vectorizing and storing knowledge chunk...');
    try {
      await greenApiService.uploadKnowledge(stateId, kbTitle, kbContent, kbType, kbImage, kbCaption, kbDocUrl, kbDocName);
      toast.success('Candidate knowledge chunk added to AI knowledge base!', { id: toastId });
      setKbTitle('');
      setKbContent('');
      setKbType('policy');
      setKbImage('');
      setKbDocUrl('');
      setKbDocName('');
      setKbCaption('');
      const updated = await greenApiService.getKnowledgeEntries(stateId);
      setKnowledgeList(updated);
    } catch (err: any) {
      toast.error(err.message || 'Failed to upload knowledge chunk', { id: toastId });
    } finally {
      setUploadingKb(false);
    }
  };

  const handleDeleteKnowledge = async (id: string) => {
    if (!confirm('Are you sure you want to delete this knowledge entry?')) return;
    try {
      await greenApiService.deleteKnowledgeEntry(id);
      toast.success('Deleted');
      setKnowledgeList(prev => prev.filter(k => k.id !== id));
    } catch (err: any) {
      toast.error('Failed to delete');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#004d25]"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 flex items-center gap-2">
            <MessageSquare className="h-7 w-7 text-[#004d25]" />
            WhatsApp Outreach & AI Command Center
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Configure Green API instances, agent outreach rules, RAG candidate knowledge, and group chat defense.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            className="p-2 border border-gray-300 rounded-lg hover:bg-gray-100 transition cursor-pointer"
            title="Refresh Data"
          >
            <RefreshCw className="h-4 w-4 text-gray-600" />
          </button>
          <button
            onClick={handleSaveConfig}
            disabled={saving}
            className="px-4 py-2 bg-[#004d25] hover:bg-[#00381b] text-white rounded-lg font-medium flex items-center gap-2 shadow-xs transition cursor-pointer disabled:opacity-50"
          >
            {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Save Configuration
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex overflow-x-auto border-b border-gray-200 gap-2">
        <button
          onClick={() => setActiveTab('settings')}
          className={`px-4 py-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition cursor-pointer ${
            activeTab === 'settings'
              ? 'border-[#004d25] text-[#004d25]'
              : 'border-transparent text-gray-500 hover:text-gray-800'
          }`}
        >
          <Settings className="h-4 w-4" />
          General & Flyer
        </button>

        <button
          onClick={() => setActiveTab('ai')}
          className={`px-4 py-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition cursor-pointer ${
            activeTab === 'ai'
              ? 'border-[#004d25] text-[#004d25]'
              : 'border-transparent text-gray-500 hover:text-gray-800'
          }`}
        >
          <Database className="h-4 w-4" />
          AI & Candidate Knowledge (RAG)
        </button>

        <button
          onClick={() => setActiveTab('earnings')}
          className={`px-4 py-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition cursor-pointer ${
            activeTab === 'earnings'
              ? 'border-[#004d25] text-[#004d25]'
              : 'border-transparent text-gray-500 hover:text-gray-800'
          }`}
        >
          <DollarSign className="h-4 w-4" />
          Earnings & Incentives
        </button>

        <button
          onClick={() => setActiveTab('pool')}
          className={`px-4 py-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition cursor-pointer ${
            activeTab === 'pool'
              ? 'border-[#004d25] text-[#004d25]'
              : 'border-transparent text-gray-500 hover:text-gray-800'
          }`}
        >
          <Server className="h-4 w-4" />
          Instance Pool ({poolStatus.standby} Ready)
        </button>

        <button
          onClick={() => setActiveTab('groups')}
          className={`px-4 py-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition cursor-pointer ${
            activeTab === 'groups'
              ? 'border-[#004d25] text-[#004d25]'
              : 'border-transparent text-gray-500 hover:text-gray-800'
          }`}
        >
          <Users className="h-4 w-4" />
          Monitored Groups ({monitors.length})
        </button>
      </div>

      {/* TAB 1: General & Flyer Settings */}
      {activeTab === 'settings' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column: Partner Token & Flyer */}
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-xs space-y-4">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Shield className="h-5 w-5 text-[#004d25]" />
                Green API Partner Credentials
              </h2>
              <p className="text-xs text-gray-500">
                Enter your state-specific Green API Partner Token to allow programmatic creation and assignment of WhatsApp instances.
              </p>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1">
                  Partner Token (gac.xxxx...)
                </label>
                <input
                  type="text"
                  value={config.green_api_partner_token || ''}
                  onChange={e => setConfig({ ...config, green_api_partner_token: e.target.value })}
                  placeholder="gac.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50 text-gray-900 font-mono focus:bg-white focus:ring-2 focus:ring-[#004d25] outline-none"
                />
              </div>
            </div>

            {/* Message Format Selection */}
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-xs space-y-4">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Settings className="h-5 w-5 text-[#004d25]" />
                Default Outreach Message Format
              </h2>
              <p className="text-xs text-gray-500">
                Choose whether outreach dispatches a campaign image/flyer with text caption, or sends plain text messages only.
              </p>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1">
                  Format Type
                </label>
                <select
                  value={config.default_message_format || 'image_and_text'}
                  onChange={e => setConfig({ ...config, default_message_format: e.target.value as any })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50 text-gray-900 focus:bg-white focus:ring-2 focus:ring-[#004d25] outline-none cursor-pointer"
                >
                  <option value="image_and_text">Image and Text Message (State Flyer with Personalized Caption)</option>
                  <option value="text_only">Text Message Only (Direct WhatsApp Text / SMS style)</option>
                </select>
              </div>
            </div>

            {/* Campaign Flyer Asset */}
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-xs space-y-4">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Image className="h-5 w-5 text-[#004d25]" />
                Central Campaign Flyer (Image or Video)
              </h2>
              <p className="text-xs text-gray-500">
                {config.default_message_format === 'text_only' 
                  ? 'Optional: Uploaded media will only be used when an agent specifically selects Image mode.'
                  : 'Uploaded media is automatically attached to automated and manual voter outreach messages.'}
              </p>

              <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center hover:border-emerald-500 transition">
                {config.default_flyer_url ? (
                  <div className="space-y-3">
                    {config.default_flyer_type === 'video' ? (
                      <video src={config.default_flyer_url} controls className="max-h-48 mx-auto rounded-lg shadow-sm" />
                    ) : (
                      <img src={config.default_flyer_url} alt="Campaign Flyer" className="max-h-48 mx-auto rounded-lg shadow-sm object-contain" />
                    )}
                    <p className="text-xs text-[#004d25] font-semibold">✓ Flyer asset linked</p>
                    <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-xs rounded-lg font-medium text-gray-700 transition">
                      <Upload className="h-3.5 w-3.5" />
                      Replace Asset
                      <input type="file" accept="image/*,video/*" onChange={handleFlyerUpload} className="hidden" />
                    </label>
                  </div>
                ) : (
                  <div>
                    <Upload className="h-8 w-8 mx-auto text-gray-400 mb-2" />
                    <p className="text-sm font-medium text-gray-700">Upload Campaign Flyer</p>
                    <p className="text-xs text-gray-500 mt-1">PNG, JPG, MP4 up to 50MB</p>
                    <label className="mt-3 cursor-pointer inline-flex items-center gap-1.5 px-4 py-2 bg-[#004d25] hover:bg-[#00381b] text-xs rounded-lg font-medium text-white transition">
                      Browse File
                      <input type="file" accept="image/*,video/*" onChange={handleFlyerUpload} className="hidden" />
                    </label>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Template & Schedule Limits */}
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-xs space-y-4">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Send className="h-5 w-5 text-[#004d25]" />
                Voter Message Template
              </h2>
              <p className="text-xs text-gray-500">
                Use dynamic tokens: <code className="bg-gray-100 px-1 py-0.5 rounded text-[#004d25] font-mono font-bold">&#123;&#123;voter_name&#125;&#125;</code>, <code className="bg-gray-100 px-1 py-0.5 rounded text-[#004d25] font-mono font-bold">&#123;&#123;agent_name&#125;&#125;</code>, <code className="bg-gray-100 px-1 py-0.5 rounded text-[#004d25] font-mono font-bold">&#123;&#123;ward_name&#125;&#125;</code>.
              </p>

              <textarea
                rows={4}
                value={config.default_message_template || ''}
                onChange={e => setConfig({ ...config, default_message_template: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50 text-gray-900 focus:bg-white focus:ring-2 focus:ring-[#004d25] outline-none"
                placeholder="Enter default outreach message..."
              />

              {/* Live Preview */}
              <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-lg">
                <p className="text-xs font-semibold text-[#004d25] uppercase tracking-wider mb-1 flex items-center gap-1">
                  <Eye className="h-3.5 w-3.5" /> Sample Voter Preview
                </p>
                <p className="text-xs text-gray-700 italic">
                  "{config.default_message_template
                    ?.replace(/\{\{voter_name\}\}/g, 'Babatunde Adeyemi')
                    ?.replace(/\{\{agent_name\}\}/g, user?.name || 'Sunday Okafor')
                    ?.replace(/\{\{ward_name\}\}/g, 'Ward 04 Alimosho')}"
                </p>
              </div>
            </div>

            {/* Anti-Ban Automation Controls */}
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-xs space-y-4">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Shield className="h-5 w-5 text-[#004d25]" />
                Anti-Ban Safeguards & Limits
              </h2>

              <div className="flex items-center justify-between py-2 border-b border-gray-100">
                <div>
                  <p className="text-sm font-medium text-gray-900">Automated Daily Outreach</p>
                  <p className="text-xs text-gray-500">Enable scheduled background messaging for all active agents</p>
                </div>
                <input
                  type="checkbox"
                  checked={config.auto_outreach_enabled}
                  onChange={e => setConfig({ ...config, auto_outreach_enabled: e.target.checked })}
                  className="h-5 w-5 accent-[#004d25] rounded cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs font-semibold text-gray-700 mb-1">
                  <span>Max Daily Outreach Per Agent</span>
                  <span className="text-[#004d25] font-bold">{config.daily_outreach_max} voters/day</span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={25}
                  step={1}
                  value={config.daily_outreach_max || 10}
                  onChange={e => setConfig({ ...config, daily_outreach_max: parseInt(e.target.value, 10) })}
                  className="w-full accent-[#004d25] cursor-pointer"
                />
                <p className="text-[11px] text-gray-500 mt-1">Agents can reduce their personal target on their dashboard, but cannot exceed this state maximum.</p>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1">
                  Distribution Interval Between Messages
                </label>
                <select
                  value={config.message_interval_minutes || 180}
                  onChange={e => setConfig({ ...config, message_interval_minutes: parseInt(e.target.value, 10) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50 text-gray-900 focus:bg-white focus:ring-2 focus:ring-[#004d25] outline-none cursor-pointer"
                >
                  <option value={60}>Every 1 hour</option>
                  <option value={120}>Every 2 hours</option>
                  <option value={180}>Every 3 hours (Recommended for Anti-Ban)</option>
                  <option value={240}>Every 4 hours</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: AI & Candidate Knowledge Base */}
      {activeTab === 'ai' && (
        <div className="space-y-6">
          {/* AI Model Config Card */}
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-xs space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Database className="h-5 w-5 text-[#004d25]" />
              State AI Engine & Provider
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1">
                  AI Provider
                </label>
                <select
                  value={config.ai_provider || 'gemini'}
                  onChange={e => setConfig({ ...config, ai_provider: e.target.value as any })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50 text-gray-900 focus:bg-white focus:ring-2 focus:ring-[#004d25] outline-none cursor-pointer"
                >
                  <option value="gemini">Google Gemini</option>
                  <option value="openai">OpenAI (ChatGPT)</option>
                  <option value="groq">Groq Llama 3.3</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1">
                  Model Name
                </label>
                <input
                  type="text"
                  value={config.ai_model || 'gemini-2.0-flash'}
                  onChange={e => setConfig({ ...config, ai_model: e.target.value })}
                  placeholder="e.g. gemini-2.0-flash or gpt-4o-mini"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50 text-gray-900 focus:bg-white focus:ring-2 focus:ring-[#004d25] outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1">
                  API Key
                </label>
                <input
                  type="password"
                  value={config.ai_api_key || ''}
                  onChange={e => setConfig({ ...config, ai_api_key: e.target.value })}
                  placeholder="AI Provider API Key"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50 text-gray-900 font-mono focus:bg-white focus:ring-2 focus:ring-[#004d25] outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1">
                Group AI Representative System Persona
              </label>
              <textarea
                rows={3}
                value={config.group_ai_system_prompt || ''}
                onChange={e => setConfig({ ...config, group_ai_system_prompt: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50 text-gray-900 focus:bg-white focus:ring-2 focus:ring-[#004d25] outline-none"
                placeholder="Persona prompt for defending the candidate in group chats..."
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1">
                Group AI Response Frequency (0 = Monitoring Only)
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={0}
                  max={20}
                  value={config.group_ai_response_frequency ?? 3}
                  onChange={e => setConfig({ ...config, group_ai_response_frequency: parseInt(e.target.value, 10) || 0 })}
                  className="w-32 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50 text-gray-900 focus:bg-white focus:ring-2 focus:ring-[#004d25] outline-none"
                />
                <span className="text-xs text-gray-500">
                  {config.group_ai_response_frequency === 0
                    ? '⚠️ Bot responses disabled. AI will strictly monitor, categorize, and extract intelligence without replying.'
                    : `Maximum ${config.group_ai_response_frequency} automated replies per hour per group.`}
                </span>
              </div>
            </div>
          </div>

          {/* Candidate Knowledge Base Ingestion Card */}
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-xs space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Plus className="h-5 w-5 text-[#004d25]" />
              Add Knowledge Section (Policies, Talking Points, FAQs)
            </h2>
            <p className="text-xs text-gray-500">
              Add verified candidate policies, talking points, and campaign facts. Each entry is vector-indexed for instant semantic retrieval during chat responses and group debates.
            </p>

            <form onSubmit={handleAddKnowledge} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Section Title</label>
                  <input
                    type="text"
                    value={kbTitle}
                    onChange={e => setKbTitle(e.target.value)}
                    placeholder="e.g. Health Reform, Job Creation, Free Maternity"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50 text-gray-900 focus:bg-white focus:ring-2 focus:ring-[#004d25] outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Category</label>
                  <select
                    value={kbType}
                    onChange={e => setKbType(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50 text-gray-900 focus:bg-white focus:ring-2 focus:ring-[#004d25] outline-none cursor-pointer"
                  >
                    <option value="policy">Policy / Governance</option>
                    <option value="bio">Candidate Biography</option>
                    <option value="talking_point">Campaign Talking Point</option>
                    <option value="faq">Opponent Misconception / FAQ</option>
                  </select>
                </div>
              </div>

              {/* Two Separate Uploaders: Image vs Manifesto/Media Document */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 1. Image Attachment */}
                <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
                      <Image className="h-4 w-4 text-[#004d25]" />
                      Candidate Image / Flyer (Optional)
                    </label>
                    {kbImage && (
                      <button
                        type="button"
                        onClick={() => setKbImage('')}
                        className="text-red-500 hover:text-red-700 text-xs flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="h-3 w-3" /> Remove
                      </button>
                    )}
                  </div>
                  {kbImage ? (
                    <div className="relative rounded-lg overflow-hidden border border-emerald-300 bg-emerald-50 h-28 flex items-center justify-center">
                      <img src={kbImage} alt="Preview" className="h-full w-full object-contain" />
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center p-4 border border-dashed border-gray-300 rounded-lg text-xs text-gray-600 hover:border-[#004d25] hover:text-[#004d25] cursor-pointer bg-white transition text-center h-28">
                      <Upload className="h-5 w-5 mb-1 text-gray-400" />
                      <span>{uploadingKbImage ? 'Uploading Image...' : 'Click to Upload Image'}</span>
                      <span className="text-[10px] text-gray-400 mt-0.5">PNG, JPG, WEBP previewable</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleKbImageUpload}
                        className="hidden"
                        disabled={uploadingKbImage}
                      />
                    </label>
                  )}
                </div>

                {/* 2. Manifesto / Document / Media Attachment (Max 15MB) */}
                <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
                      <FileText className="h-4 w-4 text-[#004d25]" />
                      Manifesto Document / Media (Max 15MB)
                    </label>
                    {kbDocUrl && (
                      <button
                        type="button"
                        onClick={() => { setKbDocUrl(''); setKbDocName(''); }}
                        className="text-red-500 hover:text-red-700 text-xs flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="h-3 w-3" /> Remove
                      </button>
                    )}
                  </div>
                  {kbDocUrl ? (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between h-28">
                      <div className="flex items-center gap-3 overflow-hidden">
                        <FileText className="h-8 w-8 text-[#004d25] shrink-0" />
                        <div className="overflow-hidden">
                          <p className="font-semibold text-gray-800 text-xs truncate max-w-[200px]">{kbDocName || 'Attached Document'}</p>
                          <a
                            href={kbDocUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] text-[#004d25] hover:underline flex items-center gap-1 mt-1 font-medium"
                          >
                            <ExternalLink className="h-3 w-3" /> View file
                          </a>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center p-4 border border-dashed border-gray-300 rounded-lg text-xs text-gray-600 hover:border-[#004d25] hover:text-[#004d25] cursor-pointer bg-white transition text-center h-28">
                      <Upload className="h-5 w-5 mb-1 text-gray-400" />
                      <span>{uploadingKbDoc ? 'Uploading Document...' : 'Upload Manifesto / Document / Video'}</span>
                      <span className="text-[10px] text-gray-400 mt-0.5">PDF, DOCX, Video, Audio (Max 15MB)</span>
                      <input
                        type="file"
                        accept=".pdf,.doc,.docx,.txt,video/*,audio/*"
                        onChange={handleKbDocUpload}
                        className="hidden"
                        disabled={uploadingKbDoc}
                      />
                    </label>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Detailed Content</label>
                <textarea
                  rows={4}
                  value={kbContent}
                  onChange={e => setKbContent(e.target.value)}
                  placeholder="Paste in-depth policy facts, budget numbers, past achievements, or specific candidate promises..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50 text-gray-900 focus:bg-white focus:ring-2 focus:ring-[#004d25] outline-none"
                  required
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={uploadingKb}
                  className="px-4 py-2 bg-[#004d25] hover:bg-[#00381b] text-white rounded-lg text-sm font-medium flex items-center gap-2 transition cursor-pointer disabled:opacity-50"
                >
                  {uploadingKb ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Vectorize & Save Knowledge
                </button>
              </div>
            </form>
          </div>

          {/* Stored Knowledge Items List */}
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-xs space-y-4">
            <h3 className="text-md font-semibold text-gray-900 flex items-center justify-between">
              <span>Verified Knowledge Base Chunks ({knowledgeList.length})</span>
            </h3>

            {knowledgeList.length === 0 ? (
              <p className="text-sm text-gray-500 italic">No knowledge base items added yet. Add candidate policies and talking points above.</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {knowledgeList.map(item => (
                  <div key={item.id} className="py-3 flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-medium">
                          {item.content_type}
                        </span>
                        <h4 className="text-sm font-semibold text-gray-900">{item.title}</h4>
                        {item.image_url && (
                          <a
                            href={item.image_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] text-[#004d25] hover:underline flex items-center gap-1 font-medium bg-gray-100 px-2 py-0.5 rounded"
                          >
                            <Image className="h-3 w-3" /> Image
                          </a>
                        )}
                        {item.doc_url && (
                          <a
                            href={item.doc_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] text-[#004d25] hover:underline flex items-center gap-1 font-medium bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded"
                          >
                            <FileText className="h-3 w-3" /> {item.doc_name || 'Manifesto / Document'}
                          </a>
                        )}
                      </div>
                      <p className="text-xs text-gray-600 line-clamp-2">{item.content}</p>
                    </div>

                    <button
                      onClick={() => handleDeleteKnowledge(item.id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 transition cursor-pointer"
                      title="Delete Entry"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: Earnings & Incentives */}
      {activeTab === 'earnings' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-xs space-y-2">
              <span className="text-xs font-semibold text-[#004d25] uppercase tracking-wider">Per Connected WhatsApp Outreach</span>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-2xl font-bold text-gray-900">₦</span>
                <input
                  type="number"
                  value={config.earning_per_chat || 50}
                  onChange={e => setConfig({ ...config, earning_per_chat: parseFloat(e.target.value) || 0 })}
                  className="w-full text-2xl font-bold px-2 py-1 border border-gray-300 rounded bg-gray-50 text-gray-900 focus:bg-white focus:ring-2 focus:ring-[#004d25] outline-none"
                />
              </div>
              <p className="text-xs text-gray-500">Credited when an agent with connected WhatsApp dispatches flyer & message to a verified voter.</p>
            </div>

            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-xs space-y-2">
              <span className="text-xs font-semibold text-[#004d25] uppercase tracking-wider">Direct WhatsApp (wa.me) Link Bounty</span>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-2xl font-bold text-gray-900">₦</span>
                <input
                  type="number"
                  value={config.earning_per_manual_wa ?? 15}
                  onChange={e => setConfig({ ...config, earning_per_manual_wa: parseFloat(e.target.value) || 0 })}
                  className="w-full text-2xl font-bold px-2 py-1 border border-gray-300 rounded bg-gray-50 text-gray-900 focus:bg-white focus:ring-2 focus:ring-[#004d25] outline-none"
                />
              </div>
              <p className="text-xs text-gray-500">Credited when an agent without connected WhatsApp opens the voter chat on their phone via wa.me link.</p>
            </div>

            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-xs space-y-2">
              <span className="text-xs font-semibold text-[#004d25] uppercase tracking-wider">Phone Call Voter Outreach</span>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-2xl font-bold text-gray-900">₦</span>
                <input
                  type="number"
                  value={config.earning_per_call ?? 20}
                  onChange={e => setConfig({ ...config, earning_per_call: parseFloat(e.target.value) || 0 })}
                  className="w-full text-2xl font-bold px-2 py-1 border border-gray-300 rounded bg-gray-50 text-gray-900 focus:bg-white focus:ring-2 focus:ring-[#004d25] outline-none"
                />
              </div>
              <p className="text-xs text-gray-500">Credited when an agent calls a voter (especially useful when voter is not registered on WhatsApp).</p>
            </div>

            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-xs space-y-2">
              <span className="text-xs font-semibold text-[#004d25] uppercase tracking-wider">Voter Conversion Bonus</span>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-2xl font-bold text-gray-900">₦</span>
                <input
                  type="number"
                  value={config.earning_per_conversion || 200}
                  onChange={e => setConfig({ ...config, earning_per_conversion: parseFloat(e.target.value) || 0 })}
                  className="w-full text-2xl font-bold px-2 py-1 border border-gray-300 rounded bg-gray-50 text-gray-900 focus:bg-white focus:ring-2 focus:ring-[#004d25] outline-none"
                />
              </div>
              <p className="text-xs text-gray-500">Rewarded when AI sentiment confirms the voter has converted to an active ADC supporter.</p>
            </div>

            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-xs space-y-2">
              <span className="text-xs font-semibold text-[#004d25] uppercase tracking-wider">Group Addition Bounty</span>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-2xl font-bold text-gray-900">₦</span>
                <input
                  type="number"
                  value={config.earning_per_group_add || 100}
                  onChange={e => setConfig({ ...config, earning_per_group_add: parseFloat(e.target.value) || 0 })}
                  className="w-full text-2xl font-bold px-2 py-1 border border-gray-300 rounded bg-gray-50 text-gray-900 focus:bg-white focus:ring-2 focus:ring-[#004d25] outline-none"
                />
              </div>
              <p className="text-xs text-gray-500">Rewarded when an agent adds the state Group Monitor WhatsApp number to a local political group.</p>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-xs space-y-3">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-[#004d25]" />
              Unified Treasury Payout Integration
            </h3>
            <p className="text-xs text-gray-500">
              All agent WhatsApp earnings directly populate each agent's unified wallet in the central Payment tab. Agents can withdraw both election verification earnings and WhatsApp canvassing rewards in a single Paystack bank payout.
            </p>
          </div>
        </div>
      )}

      {/* TAB 4: Instance Pool Management */}
      {activeTab === 'pool' && (
        <div className="space-y-6">
          {/* Status Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
              <p className="text-xs text-gray-500 uppercase font-semibold">Standby Pool (Buffer)</p>
              <p className={`text-2xl font-bold mt-1 ${poolStatus.standby < 2 ? 'text-amber-500' : 'text-[#004d25]'}`}>
                {poolStatus.standby} / min 2
              </p>
              <p className="text-[11px] text-gray-400 mt-1">Ready to assign immediately</p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
              <p className="text-xs text-gray-500 uppercase font-semibold">Assigned to Agents</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{poolStatus.assigned}</p>
              <p className="text-[11px] text-gray-400 mt-1">Active canvassing instances</p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
              <p className="text-xs text-gray-500 uppercase font-semibold">Group Monitors</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{poolStatus.groupMonitors}</p>
              <p className="text-[11px] text-gray-400 mt-1">Dedicated group AI monitors</p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs flex flex-col justify-center">
              <button
                onClick={() => handleCreateInstance('agent')}
                className="w-full py-2 bg-[#004d25] hover:bg-[#00381b] text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Agent Instance
              </button>
              <button
                onClick={() => handleCreateInstance('group_monitor')}
                className="w-full mt-2 py-2 border border-[#004d25] text-[#004d25] hover:bg-emerald-50 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Group Monitor
              </button>
            </div>
          </div>

          {/* Instances Table */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">All Provisioned WhatsApp Instances ({instances.length})</h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50 text-gray-500 uppercase font-semibold">
                  <tr>
                    <th className="px-6 py-3">Instance ID / Name</th>
                    <th className="px-6 py-3">Type</th>
                    <th className="px-6 py-3">Phone Number</th>
                    <th className="px-6 py-3">Assigned To</th>
                    <th className="px-6 py-3">Pool Status</th>
                    <th className="px-6 py-3">WA State</th>
                    <th className="px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {instances.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                        No WhatsApp instances provisioned yet. Click "Add Agent Instance" to start your pool.
                      </td>
                    </tr>
                  ) : (
                    instances.map(inst => (
                      <tr key={inst.id} className="hover:bg-gray-50/70 transition">
                        <td className="px-6 py-4 font-mono font-medium text-gray-900">
                          <div>{inst.name || `Instance #${inst.id_instance}`}</div>
                          <div className="text-[10px] text-gray-400 font-mono">ID: {inst.id_instance}</div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                            inst.instance_type === 'group_monitor'
                              ? 'bg-purple-100 text-purple-700'
                              : 'bg-blue-100 text-blue-700'
                          }`}>
                            {inst.instance_type === 'group_monitor' ? 'Group Monitor' : 'Agent'}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-mono text-gray-800">
                          {inst.phone_number ? `+${inst.phone_number}` : <span className="text-gray-400 italic">Not linked</span>}
                        </td>
                        <td className="px-6 py-4">
                          {inst.assigned_agent_id && agentsMap[inst.assigned_agent_id] ? (
                            <div>
                              <div className="font-semibold text-gray-900">
                                {agentsMap[inst.assigned_agent_id].name}
                              </div>
                              <div className="text-[10px] text-gray-500 font-mono">
                                {agentsMap[inst.assigned_agent_id].phone}
                                {agentsMap[inst.assigned_agent_id].ward && ` • ${agentsMap[inst.assigned_agent_id].ward}`}
                              </div>
                            </div>
                          ) : inst.assigned_agent_id ? (
                            <span className="font-mono text-gray-500 text-[11px]">Agent ID #{inst.assigned_agent_id}</span>
                          ) : (
                            <span className="text-gray-400 italic text-[11px]">Unassigned (Pool)</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                            inst.pool_status === 'standby' ? 'bg-amber-100 text-amber-700' :
                            inst.pool_status === 'assigned' ? 'bg-emerald-100 text-emerald-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            {inst.pool_status}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            inst.wa_state === 'authorized' ? 'bg-emerald-100 text-emerald-700' :
                            inst.wa_state === 'blocked' ? 'bg-red-100 text-red-700' :
                            'bg-gray-100 text-gray-500'
                          }`}>
                            {inst.wa_state}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => openConnectModal(inst)}
                            className="px-2.5 py-1 text-xs border border-gray-300 hover:bg-gray-100 rounded font-medium text-gray-700 transition cursor-pointer"
                          >
                            {inst.wa_state === 'authorized' ? 'Re-link / QR' : 'Connect'}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: Monitored Groups */}
      {activeTab === 'groups' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-xs space-y-2">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Users className="h-5 w-5 text-[#004d25]" />
              State Political WhatsApp Groups Monitor
            </h2>
            <p className="text-xs text-gray-500">
              When agents add your state's Group Monitor WhatsApp number to local community and political WhatsApp groups, they automatically appear here. The AI reads incoming messages, categorizes discussions, and defends candidate policies.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {monitors.length === 0 ? (
              <div className="col-span-3 text-center py-12 bg-white rounded-xl border border-gray-200 text-gray-500 text-sm">
                No WhatsApp groups monitored yet. Tell agents to add your Group Monitor number to political groups!
              </div>
            ) : (
              monitors.map(m => (
                <div key={m.id} className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-semibold text-gray-900 text-sm">{m.group_name || 'Political Group'}</h4>
                      <p className="text-xs text-gray-400">{m.participant_count || 0} participants</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                      m.ai_enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {m.ai_enabled ? 'AI Active' : 'AI Paused'}
                    </span>
                  </div>

                  <div className="text-xs text-gray-500 space-y-1 pt-2 border-t border-gray-100">
                    <p>Added by: <span className="font-semibold text-gray-700">{m.added_by_agent?.name || 'Field Agent'}</span></p>
                    <p>AI Replies Today: <span className="font-semibold text-[#004d25]">{m.ai_responses_today || 0}</span></p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* CONNECT / PAIRING MODAL */}
      {connectingInstance && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white w-full max-w-md rounded-2xl p-6 border border-gray-200 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <QrCode className="h-5 w-5 text-[#004d25]" />
                Connect WhatsApp Device
              </h3>
              <button onClick={() => setConnectingInstance(null)} className="text-gray-400 hover:text-gray-600 cursor-pointer">✕</button>
            </div>

            <div className="flex border-b border-gray-200">
              <button
                onClick={() => setConnectMethod('qr')}
                className={`flex-1 py-2 text-xs font-semibold border-b-2 cursor-pointer ${
                  connectMethod === 'qr' ? 'border-[#004d25] text-[#004d25]' : 'border-transparent text-gray-400'
                }`}
              >
                Scan QR Code
              </button>
              <button
                onClick={() => setConnectMethod('phone')}
                className={`flex-1 py-2 text-xs font-semibold border-b-2 cursor-pointer ${
                  connectMethod === 'phone' ? 'border-[#004d25] text-[#004d25]' : 'border-transparent text-gray-400'
                }`}
              >
                Link With Phone Number
              </button>
            </div>

            {connectMethod === 'qr' ? (
              <div className="text-center space-y-3">
                <p className="text-xs text-gray-500">Open WhatsApp on your phone &gt; Linked Devices &gt; Link a Device.</p>
                {qrCodeData ? (
                  <div className="p-3 bg-white border border-gray-200 rounded-xl inline-block shadow-xs">
                    <img src={`data:image/png;base64,${qrCodeData}`} alt="WhatsApp QR" className="w-56 h-56 mx-auto" />
                  </div>
                ) : (
                  <div className="w-56 h-56 border-2 border-dashed border-gray-300 rounded-xl mx-auto flex items-center justify-center">
                    <RefreshCw className="h-6 w-6 animate-spin text-[#004d25]" />
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-xs text-gray-500">
                  Enter your phone number to get an 8-character pairing code to enter on your phone.
                </p>
                <div className="flex gap-2">
                  <input
                    type="tel"
                    value={pairingPhone}
                    onChange={e => setPairingPhone(e.target.value)}
                    placeholder="e.g. 08012345678"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50 text-gray-900 focus:bg-white focus:ring-2 focus:ring-[#004d25] outline-none"
                  />
                  <button
                    onClick={handleGetAuthCode}
                    className="px-3 py-2 bg-[#004d25] text-white rounded-lg text-xs font-semibold hover:bg-[#00381b] transition cursor-pointer"
                  >
                    Get Code
                  </button>
                </div>

                {authCode && (
                  <div 
                    onClick={() => handleCopyCode(authCode)}
                    className="p-4 bg-emerald-50 border border-emerald-300 rounded-xl text-center space-y-1.5 cursor-pointer hover:bg-emerald-100/70 transition group"
                    title="Click to copy pairing code"
                  >
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>Enter this pairing code into WhatsApp:</span>
                      <span className="flex items-center gap-1 text-[#004d25] font-medium">
                        {copiedCode ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5 group-hover:scale-110 transition" />}
                        {copiedCode ? 'Copied' : 'Copy'}
                      </span>
                    </div>
                    <p className="text-2xl font-bold font-mono tracking-widest text-[#004d25] select-all">{authCode}</p>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-2 pt-2 border-t border-gray-100">
              <button
                onClick={handleCheckAuthStatus}
                className="flex-1 py-2.5 bg-[#004d25] hover:bg-[#00381b] text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <CheckCircle2 className="h-4 w-4" />
                Verify Connection Status
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
