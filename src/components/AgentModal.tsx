import React, { useState, useEffect } from 'react';
import { useApp, Agent, Location, Role } from '../context/AppContext';
import { X, Upload, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';

interface AgentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (agent: Partial<Agent>) => void;
  initialData?: Partial<Agent>;
  fixedLocation?: Location;
  locations: Location[];
  userRole: Role;
}

export default function AgentModal({ isOpen, onClose, onSave, initialData, fixedLocation, locations, userRole }: AgentModalProps) {
  const { user } = useApp();
  const [tab, setTab] = useState<'personal' | 'jurisdiction'>('personal');
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState<Partial<Agent>>({
    firstName: '',
    lastName: '',
    phone: '',
    picture: '',
    bankName: '',
    accountName: '',
    accountNumber: '',
    locationId: '',
    role: 'pu_agent'
  });

  useEffect(() => {
    if (isOpen) {
      let defaultLocId = '';
      if (initialData?.locationId) {
        defaultLocId = initialData.locationId;
      } else if (fixedLocation?.id) {
        defaultLocId = fixedLocation.id;
      } else if (user) {
        defaultLocId = user.puId ? `pu_${user.puId}`
                     : user.wardId ? `ward_${user.wardId}`
                     : user.lgaId ? `lga_${user.lgaId}`
                     : user.stateId ? `state_${user.stateId}` : '';
      }

      setForm({
        firstName: initialData?.firstName || '',
        lastName: initialData?.lastName || '',
        phone: initialData?.phone || '',
        picture: initialData?.picture || '',
        bankName: initialData?.bankName || '',
        accountName: initialData?.accountName || '',
        accountNumber: initialData?.accountNumber || '',
        locationId: defaultLocId,
        role: initialData?.role || 'pu_agent'
      });
      setTab('personal');
    }
  }, [isOpen, initialData, fixedLocation, user]);

  useEffect(() => {
    // Auto-fill account name if empty
    if (!form.accountName && (form.firstName || form.lastName)) {
      setForm(prev => ({ ...prev, accountName: `${prev.firstName || ''} ${prev.lastName || ''}`.trim() }));
    }
  }, [form.firstName, form.lastName]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    setIsSaving(true);
    try {
      const finalRole = (form.role || userRole) as Role;
      await onSave({
        ...form,
        name: `${form.firstName} ${form.lastName}`.trim(),
        role: finalRole,
        status: initialData?.status || 'active'
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-4 border-b border-gray-100 bg-[#004d25] text-white flex justify-between items-center">
          <div>
            <h3 className="font-bold text-lg">{initialData?.id ? 'Edit Agent' : 'Register Agent'}</h3>
            {fixedLocation && <p className="text-xs text-green-100">Assigning to {fixedLocation.name}</p>}
          </div>
          <button onClick={onClose} className="text-green-100 hover:text-white">
            <X size={20} />
          </button>
        </div>
        
        <div className="flex border-b border-gray-200">
          <button 
            type="button"
            onClick={() => setTab('personal')}
            className={cn("flex-1 py-3 text-sm font-medium text-center border-b-2 transition-colors", tab === 'personal' ? "border-[#004d25] text-[#004d25]" : "border-transparent text-gray-500 hover:text-gray-700")}
          >
            Personal
          </button>
          <button 
            type="button"
            onClick={() => setTab('jurisdiction')}
            className={cn("flex-1 py-3 text-sm font-medium text-center border-b-2 transition-colors", tab === 'jurisdiction' ? "border-[#004d25] text-[#004d25]" : "border-transparent text-gray-500 hover:text-gray-700")}
          >
            Jurisdiction
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          {tab === 'personal' ? (
            <div className="space-y-4">
              <div className="flex justify-center mb-4">
                <div className="relative">
                  <div className="w-24 h-24 rounded-full bg-gray-100 border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden">
                    {form.picture ? (
                      <img src={form.picture} alt="Profile" className="w-full h-full object-cover" />
                    ) : (
                      <Upload className="text-gray-400" size={24} />
                    )}
                  </div>
                  <label className="absolute bottom-0 right-0 bg-[#004d25] text-white p-1.5 rounded-full cursor-pointer hover:bg-[#006331] shadow-sm">
                    <Upload size={14} />
                    <input 
                      type="file" 
                      accept="image/*" 
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          const reader = new FileReader();
                          reader.onload = (e) => setForm({...form, picture: e.target?.result as string});
                          reader.readAsDataURL(e.target.files[0]);
                        }
                      }}
                    />
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                  <input required type="text" value={form.firstName} onChange={e => setForm({...form, firstName: e.target.value})} className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-[#004d25]" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                  <input required type="text" value={form.lastName} onChange={e => setForm({...form, lastName: e.target.value})} className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-[#004d25]" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                <input required type="tel" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-[#004d25]" />
              </div>
              
              <div className="pt-4 flex justify-end">
                <button type="button" onClick={() => setTab('jurisdiction')} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">
                  Next: Jurisdiction
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <JurisdictionSelector 
                locations={locations} 
                selectedLocationId={form.locationId || ''} 
                onChange={(id, details) => setForm({...form, locationId: id, ...details})} 
                fixedLocation={fixedLocation}
                user={user}
              />
              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setTab('personal')} className="px-4 py-2 border rounded-lg hover:bg-gray-50 cursor-pointer">Back</button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 px-4 py-2 bg-[#004d25] text-white rounded-lg hover:bg-[#006331] disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2 transition-colors"
                >
                  {isSaving ? (
                    <><Loader2 size={16} className="animate-spin" /> {initialData?.id ? 'Saving...' : 'Registering...'}</>
                  ) : (
                    initialData?.id ? 'Save Changes' : 'Register Agent'
                  )}
                </button>
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

import { supabase } from '../lib/supabase';

function JurisdictionSelector({ locations, selectedLocationId, onChange, fixedLocation, user }: { locations: Location[], selectedLocationId: string, onChange: (id: string, details: any) => void, fixedLocation?: Location, user: any }) {
  const [states, setStates] = useState<any[]>([]);
  const [lgas, setLgas] = useState<any[]>([]);
  const [wards, setWards] = useState<any[]>([]);
  const [pus, setPus] = useState<any[]>([]);

  const [selectedState, setSelectedState] = useState('');
  const [selectedLga, setSelectedLga] = useState('');
  const [selectedWard, setSelectedWard] = useState('');
  const [selectedPu, setSelectedPu] = useState('');
  const [loading, setLoading] = useState(false);

  // Initialize data
  useEffect(() => {
    supabase.from('states').select('id,name').order('name').then(({ data }) => setStates(data || []));
  }, []);

  // When selectedLocationId changes externally (or initially), try to reconstruct the path
  useEffect(() => {
    if (!selectedLocationId) return;
    
    // If it's a fixed location from the tree, we still want to resolve its parents
    // to populate the locked dropdowns.
    
    // We would need to resolve the path if not provided by predefined fields,
    // but in many cases selectedLocationId is set from the top down.
    // Setting up the initial path perfectly would require reverse lookups:
    const resolvePath = async () => {
      let st = '', lg = '', wd = '', pu = '';
      if (selectedLocationId.startsWith('state_')) st = selectedLocationId.replace('state_', '');
      else if (selectedLocationId.startsWith('lga_')) {
        lg = selectedLocationId.replace('lga_', '');
        const isLagosLGA = user?.stateId === 24 || (parseInt(lg) <= 20);
        const table = isLagosLGA ? 'local_governments_lagos' : 'local_governments';
        const { data } = await supabase.from(table).select('state_id').eq('id', lg).single();
        if (data) st = data.state_id?.toString() || '';
      }
      else if (selectedLocationId.startsWith('ward_')) {
        wd = selectedLocationId.replace('ward_', '');
        const isLagosWard = user?.stateId === 24 || (parseInt(wd) < 1000);
        if (isLagosWard) {
          const { data: wData } = await supabase.from('wards_lagos').select('localgovernment_lagos_id').eq('id', wd).single();
          if (wData?.localgovernment_lagos_id) {
            lg = wData.localgovernment_lagos_id.toString();
            st = '24';
          }
        } else {
          const { data: wData } = await supabase.from('wards').select('localgovernment_id').eq('id', wd).single();
          if (wData?.localgovernment_id) {
            lg = wData.localgovernment_id.toString();
            const { data: lData } = await supabase.from('local_governments').select('state_id').eq('id', lg).single();
            if (lData) st = lData.state_id?.toString() || '';
          }
        }
      }
      else if (selectedLocationId.startsWith('pu_')) {
        pu = selectedLocationId.replace('pu_', '');
        const { data: lagosPu } = await supabase.from('polling_units_lagos').select('id, ward_id, localgovernment_id').eq('id', pu).single();
        if (lagosPu) {
          pu = lagosPu.id.toString();
          wd = lagosPu.ward_id.toString();
          lg = lagosPu.localgovernment_id.toString();
          st = '24';
        } else {
          const { data: pData } = await supabase.from('polling_units').select('ward_id').eq('id', pu).single();
          if (pData?.ward_id) {
            wd = pData.ward_id.toString();
            const { data: wData } = await supabase.from('wards').select('localgovernment_id').eq('id', wd).single();
            if (wData?.localgovernment_id) {
              lg = wData.localgovernment_id.toString();
              const { data: lData } = await supabase.from('local_governments').select('state_id').eq('id', lg).single();
              if (lData) st = lData.state_id?.toString() || '';
            }
          }
        }
      }
      
      setSelectedState(st);
      const isLagos = st === '24' || user?.stateId === 24;
      if (st) {
        const table = isLagos ? 'local_governments_lagos' : 'local_governments';
        supabase.from(table).select('id,name').eq('state_id', st).order('name').then(res => setLgas(res.data || []));
      }
      setSelectedLga(lg);
      if (lg) {
        const table = isLagos ? 'wards_lagos' : 'wards';
        const filterCol = isLagos ? 'localgovernment_lagos_id' : 'localgovernment_id';
        supabase.from(table).select('id,name').eq(filterCol, lg).order('name').then(res => setWards(res.data || []));
      }
      setSelectedWard(wd);
      if (wd) {
        const table = isLagos ? 'polling_units_lagos' : 'polling_units';
        supabase.from(table).select('id,name').eq('ward_id', wd).order('name').then(res => setPus(res.data || []));
      }
      setSelectedPu(pu);

      // CRITICAL: Sync the resolved hierarchy back to the parent form
      onChange(selectedLocationId, {
        stateId: st ? parseInt(st) : null,
        lgaId: lg ? parseInt(lg) : null,
        wardId: wd ? parseInt(wd) : null,
        puId: pu ? parseInt(pu) : null
      });
    };

    resolvePath();
  }, [selectedLocationId, fixedLocation]);

  const isLagos = selectedState === '24' || user?.stateId === 24;

  const handleStateChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSelectedState(val);
    setSelectedLga('');
    setSelectedWard('');
    setSelectedPu('');
    setLgas([]); setWards([]); setPus([]);
    onChange(val ? `state_${val}` : '', {
      stateId: val ? parseInt(val) : null,
      lgaId: null,
      wardId: null,
      puId: null
    });
    
    if (val) {
      setLoading(true);
      const table = val === '24' ? 'local_governments_lagos' : 'local_governments';
      const { data } = await supabase.from(table).select('id,name').eq('state_id', val).order('name');
      setLgas(data || []);
      setLoading(false);
    }
  };

  const handleLgaChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSelectedLga(val);
    setSelectedWard('');
    setSelectedPu('');
    setWards([]); setPus([]);
    onChange(val ? `lga_${val}` : (selectedState ? `state_${selectedState}` : ''), {
      stateId: selectedState ? parseInt(selectedState) : null,
      lgaId: val ? parseInt(val) : null,
      wardId: null,
      puId: null
    });
    
    if (val) {
      setLoading(true);
      const table = isLagos ? 'wards_lagos' : 'wards';
      const filterCol = isLagos ? 'localgovernment_lagos_id' : 'localgovernment_id';
      const { data } = await supabase.from(table).select('id,name').eq(filterCol, val).order('name');
      setWards(data || []);
      setLoading(false);
    }
  };

  const handleWardChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSelectedWard(val);
    setSelectedPu('');
    setPus([]);
    onChange(val ? `ward_${val}` : (selectedLga ? `lga_${selectedLga}` : ''), {
      stateId: selectedState ? parseInt(selectedState) : null,
      lgaId: selectedLga ? parseInt(selectedLga) : null,
      wardId: val ? parseInt(val) : null,
      puId: null
    });
    
    if (val) {
      setLoading(true);
      const table = isLagos ? 'polling_units_lagos' : 'polling_units';
      const { data } = await supabase.from(table).select('id,name').eq('ward_id', val).order('name');
      setPus(data || []);
      setLoading(false);
    }
  };

  const handlePuChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSelectedPu(val);
    onChange(val ? `pu_${val}` : (selectedWard ? `ward_${selectedWard}` : ''), {
      stateId: selectedState ? parseInt(selectedState) : null,
      lgaId: selectedLga ? parseInt(selectedLga) : null,
      wardId: selectedWard ? parseInt(selectedWard) : null,
      puId: val ? parseInt(val) : null
    });
  };

  const levelPriority = { 'national': 4, 'state': 3, 'lga': 2, 'ward': 1, 'pu': 0 };
  const fixedLevel = fixedLocation ? levelPriority[fixedLocation.type as keyof typeof levelPriority] : -1;

  const isStateDisabled = (fixedLevel >= 3) || (!!user?.stateId && user?.role !== 'national_admin');
  const isLgaDisabled = (fixedLevel >= 2) || (isStateDisabled && !!user?.lgaId && ['lga_admin', 'ward_admin', 'pu_agent'].includes(user?.role));
  const isWardDisabled = (fixedLevel >= 1) || (isLgaDisabled && !!user?.wardId && ['ward_admin', 'pu_agent'].includes(user?.role));
  const isPuDisabled = (fixedLevel >= 0) || (isWardDisabled && !!user?.puId && user?.role === 'pu_agent');

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
        <select value={selectedState} onChange={handleStateChange} disabled={isStateDisabled} className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-[#004d25] disabled:bg-gray-100 disabled:text-gray-500">
          <option value="">Select State...</option>
          {states.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </div>

      {(lgas.length > 0 || isStateDisabled) && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">LGA (Optional)</label>
          <select value={selectedLga} onChange={handleLgaChange} disabled={isLgaDisabled} className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-[#004d25] disabled:bg-gray-100 disabled:text-gray-500">
            <option value="">Select LGA...</option>
            {lgas.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
      )}

      {(wards.length > 0 || isLgaDisabled) && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Ward (Optional)</label>
          <select value={selectedWard} onChange={handleWardChange} disabled={isWardDisabled} className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-[#004d25] disabled:bg-gray-100 disabled:text-gray-500">
            <option value="">Select Ward...</option>
            {wards.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
      )}

      {(pus.length > 0 || isWardDisabled) && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Polling Unit (Optional)</label>
          <select value={selectedPu} onChange={handlePuChange} disabled={isPuDisabled} className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-[#004d25] disabled:bg-gray-100 disabled:text-gray-500">
            <option value="">Select PU...</option>
            {pus.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}
