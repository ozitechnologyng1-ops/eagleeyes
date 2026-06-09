import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Location, Role } from '../context/AppContext';
import { MapPin, Loader2, Search } from 'lucide-react';
import { cn } from '../lib/utils';

interface ResultFiltersProps {
  user: any;
  locations: Location[];
  onFilterChange: (filters: { stateId?: number; lgaId?: number; wardId?: number; puId?: number }) => void;
}

export default function ResultFilters({ user, locations, onFilterChange }: ResultFiltersProps) {
  const [selectedState, setSelectedState] = useState<number | null>(user?.stateId || null);
  const [selectedLga, setSelectedLga] = useState<number | null>(user?.lgaId || null);
  const [selectedWard, setSelectedWard] = useState<number | null>(user?.wardId || null);
  const [selectedPu, setSelectedPu] = useState<number | null>(user?.puId || null);

  const [lgas, setLgas] = useState<any[]>([]);
  const [wards, setWards] = useState<any[]>([]);
  const [pus, setPus] = useState<any[]>([]);

  const [loading, setLoading] = useState<Record<string, boolean>>({ lgas: false, wards: false, pus: false });

  // Initial load of LGAs if state is selected
  useEffect(() => {
    if (selectedState) {
      fetchLgas(selectedState);
    } else {
      setLgas([]);
      setSelectedLga(null);
    }
  }, [selectedState]);

  // Load Wards if LGA is selected
  useEffect(() => {
    if (selectedLga) {
      fetchWards(selectedLga);
    } else {
      setWards([]);
      setSelectedWard(null);
    }
  }, [selectedLga]);

  // Load PUs if Ward is selected
  useEffect(() => {
    if (selectedWard) {
      fetchPus(selectedWard);
    } else {
      setPus([]);
      setSelectedPu(null);
    }
  }, [selectedWard]);

  // Notify parent on any change
  useEffect(() => {
    onFilterChange({
      stateId: selectedState || undefined,
      lgaId: selectedLga || undefined,
      wardId: selectedWard || undefined,
      puId: selectedPu || undefined
    });
  }, [selectedState, selectedLga, selectedWard, selectedPu]);

  const fetchLgas = async (stateId: number) => {
    setLoading(prev => ({ ...prev, lgas: true }));
    const { data } = await supabase.from('local_governments').select('id, name').eq('state_id', stateId).order('name');
    setLgas(data || []);
    setLoading(prev => ({ ...prev, lgas: false }));
  };

  const fetchWards = async (lgaId: number) => {
    setLoading(prev => ({ ...prev, wards: true }));
    const { data } = await supabase.from('wards').select('id, name').eq('localgovernment_id', lgaId).order('name');
    setWards(data || []);
    setLoading(prev => ({ ...prev, wards: false }));
  };

  const fetchPus = async (wardId: number) => {
    setLoading(prev => ({ ...prev, pus: true }));
    const { data } = await supabase.from('polling_units').select('id, name').eq('ward_id', wardId).order('name');
    setPus(data || []);
    setLoading(prev => ({ ...prev, pus: false }));
  };

  const states = locations.filter(l => l.type === 'state').map(l => ({
    id: parseInt(l.id.replace('state_', '')),
    name: l.name
  })).sort((a, b) => a.name.localeCompare(b.name));

  const selectClasses = "w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#004d25] focus:outline-none transition-all hover:border-gray-300 disabled:bg-gray-50 disabled:text-gray-400";

  return (
    <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-6">
      <div className="flex items-center gap-2 mb-4 text-gray-700">
        <MapPin size={18} className="text-[#004d25]" />
        <h3 className="font-bold">Result Jurisdiction Filter</h3>
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* State Filter */}
        <div>
          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 px-1">State</label>
          <select 
            value={selectedState || ''} 
            onChange={(e) => {
              const val = e.target.value ? parseInt(e.target.value) : null;
              setSelectedState(val);
              setSelectedLga(null);
              setSelectedWard(null);
              setSelectedPu(null);
            }}
            disabled={user.role !== 'national_admin'}
            className={selectClasses}
          >
            <option value="">All States</option>
            {states.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        {/* LGA Filter */}
        <div className="relative">
          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 px-1">Local Government</label>
          <select 
            value={selectedLga || ''} 
            onChange={(e) => {
              const val = e.target.value ? parseInt(e.target.value) : null;
              setSelectedLga(val);
              setSelectedWard(null);
              setSelectedPu(null);
            }}
            disabled={!selectedState || (user.role !== 'national_admin' && user.role !== 'state_admin')}
            className={selectClasses}
          >
            <option value="">All LGAs</option>
            {lgas.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          {loading.lgas && <Loader2 size={14} className="absolute right-8 top-8 animate-spin text-gray-400" />}
        </div>

        {/* Ward Filter */}
        <div className="relative">
          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 px-1">Ward</label>
          <select 
            value={selectedWard || ''} 
            onChange={(e) => {
              const val = e.target.value ? parseInt(e.target.value) : null;
              setSelectedWard(val);
              setSelectedPu(null);
            }}
            disabled={!selectedLga || (user.role === 'ward_admin' || user.role === 'pu_agent')}
            className={selectClasses}
          >
            <option value="">All Wards</option>
            {wards.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          {loading.wards && <Loader2 size={14} className="absolute right-8 top-8 animate-spin text-gray-400" />}
        </div>

        {/* Polling Unit Filter */}
        <div className="relative">
          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 px-1">Polling Unit</label>
          <select 
            value={selectedPu || ''} 
            onChange={(e) => {
              const val = e.target.value ? parseInt(e.target.value) : null;
              setSelectedPu(val);
            }}
            disabled={!selectedWard || user.role === 'pu_agent'}
            className={selectClasses}
          >
            <option value="">All Polling Units</option>
            {pus.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {loading.pus && <Loader2 size={14} className="absolute right-8 top-8 animate-spin text-gray-400" />}
        </div>
      </div>
    </div>
  );
}
