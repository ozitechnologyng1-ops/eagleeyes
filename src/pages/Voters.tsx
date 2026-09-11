import React, { useState, useEffect } from 'react';
import { useApp, Voter, VoterNote } from '../context/AppContext';
import { Search, Filter, X, Check, UserCircle, ChevronLeft, ChevronRight, MessageCircle, MessageSquare, Phone, Save, Loader2, ChevronDown, ChevronUp, MapPin, Send, Image as ImageIcon, Edit3, Sparkles, RotateCcw, AlertTriangle } from 'lucide-react';
import { cn, getFriendlyErrorMessage } from '../lib/utils';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';
import { greenApiService } from '../lib/greenApi';

export default function Voters() {
  const { 
    user, voters, updateVoterDetails, logVoterContact, locations, 
    votersPage, isLoadingVoters, fetchVotersPage,
    voterLgaFilter, setVoterLgaFilter,
    voterWardFilter, setVoterWardFilter,
    voterPuFilter, setVoterPuFilter
  } = useApp();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedVoter, setSelectedVoter] = useState<Voter | null>(null);
  const [noteText, setNoteText] = useState('');
  const [showNoteSuccess, setShowNoteSuccess] = useState(false);

  // Jurisdiction filter options
  const [lgas, setLgas] = useState<{ id: number; name: string }[]>([]);
  const [wards, setWards] = useState<{ id: number; name: string }[]>([]);
  const [pollingUnits, setPollingUnits] = useState<{ id: number; name: string; puId?: string }[]>([]);

  // Selected filter values
  const [selectedLga, setSelectedLga] = useState<number | null>(() => {
    if (user?.role === 'lga_admin' || user?.role === 'ward_admin') return user.lgaId || null;
    return voterLgaFilter;
  });
  const [selectedWard, setSelectedWard] = useState<number | null>(() => {
    if (user?.role === 'ward_admin') return user.wardId || null;
    return voterWardFilter;
  });
  const [selectedPu, setSelectedPu] = useState<number | null>(() => {
    if (user?.role === 'pu_agent') return user.puId || user.lagosPollingUnitId || null;
    return voterPuFilter;
  });

  // Name lookup cache for Ward and PU
  const [wardNames, setWardNames] = useState<Record<number, string>>({});
  const [puNames, setPuNames] = useState<Record<number, string>>({});

  // 1. Fetch LGAs for State/National Admin
  useEffect(() => {
    if (!user) return;
    let query = supabase.from('local_governments').select('id, name');
    if (user.stateId) {
      query = query.eq('state_id', user.stateId);
    }
    query.order('name').then(({ data }) => {
      if (data) setLgas(data);
    });
  }, [user]);

  // 2. Fetch Wards based on selected LGA or user's assigned LGA
  useEffect(() => {
    if (!user) return;
    const effectiveLga = selectedLga || (user.role === 'lga_admin' || user.role === 'ward_admin' ? user.lgaId : null);

    if (effectiveLga) {
      supabase
        .from('wards')
        .select('id, name')
        .eq('localgovernment_id', effectiveLga)
        .order('name')
        .then(({ data }) => {
          if (data) {
            setWards(data);
            setWardNames(prev => {
              const updated = { ...prev };
              data.forEach((w: any) => { updated[w.id] = w.name; });
              return updated;
            });
          }
        });
    } else {
      setWards([]);
    }
  }, [user, selectedLga]);

  // 3. Fetch Polling Units based on selected Ward or user's assigned Ward
  useEffect(() => {
    if (!user) return;
    const effectiveWard = selectedWard || (user.role === 'ward_admin' ? user.wardId : null);

    if (effectiveWard) {
      supabase
        .from('polling_units')
        .select('id, name, puId')
        .eq('ward_id', effectiveWard)
        .order('name')
        .then(({ data }) => {
          if (data) {
            setPollingUnits(data);
            setPuNames(prev => {
              const updated = { ...prev };
              data.forEach((p: any) => { updated[p.id] = p.name; });
              return updated;
            });
          }
        });
    } else {
      setPollingUnits([]);
    }
  }, [user, selectedWard]);

  // 4. Batch resolve Ward and PU names for any displayed voters not in cache
  useEffect(() => {
    if (!voters || voters.length === 0) return;

    const missingWards = Array.from(new Set(
      voters
        .map(v => v.wardId)
        .filter((id): id is number => typeof id === 'number' && !wardNames[id])
    ));
    if (missingWards.length > 0) {
      supabase
        .from('wards')
        .select('id, name')
        .in('id', missingWards)
        .then(({ data }) => {
          if (data && data.length > 0) {
            setWardNames(prev => {
              const next = { ...prev };
              data.forEach((w: any) => { next[w.id] = w.name; });
              return next;
            });
          }
        });
    }

    const missingPus = Array.from(new Set(
      voters
        .map(v => v.puNumberId)
        .filter((id): id is number => typeof id === 'number' && !puNames[id])
    ));
    if (missingPus.length > 0) {
      supabase
        .from('polling_units')
        .select('id, name')
        .in('id', missingPus)
        .then(({ data }) => {
          if (data && data.length > 0) {
            setPuNames(prev => {
              const next = { ...prev };
              data.forEach((p: any) => { next[p.id] = p.name; });
              return next;
            });
          }
        });
    }
  }, [voters, wardNames, puNames]);

  // Filter change handlers
  const handleLgaChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value ? parseInt(e.target.value, 10) : null;
    setSelectedLga(val);
    setSelectedWard(null);
    setSelectedPu(null);
    setVoterLgaFilter(val);
    setVoterWardFilter(null);
    setVoterPuFilter(null);
    fetchVotersPage(1, { lgaId: val, wardId: null, puId: null });
  };

  const handleWardChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value ? parseInt(e.target.value, 10) : null;
    setSelectedWard(val);
    setSelectedPu(null);
    setVoterWardFilter(val);
    setVoterPuFilter(null);
    fetchVotersPage(1, { lgaId: selectedLga, wardId: val, puId: null });
  };

  const handlePuChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value ? parseInt(e.target.value, 10) : null;
    setSelectedPu(val);
    setVoterPuFilter(val);
    fetchVotersPage(1, { lgaId: selectedLga, wardId: selectedWard, puId: val });
  };

  // Helper to format shortened PU (first 8 letters) before the phone number
  const getShortPu8 = (voter: Voter) => {
    const rawPu = (voter.puNumberId && puNames[voter.puNumberId]) 
      ? puNames[voter.puNumberId] 
      : (voter.puId || 'PU');

    const cleanPu = rawPu.replace(/^[^a-zA-Z0-9]+/, '').trim();
    return cleanPu.slice(0, 8) || 'PU';
  };

  // Ensure currentVoter has resolved Ward and PU names in the details modal
  useEffect(() => {
    if (!selectedVoter) return;
    if (selectedVoter.wardId && !wardNames[selectedVoter.wardId]) {
      supabase.from('wards').select('id, name').eq('id', selectedVoter.wardId).single().then(({ data }) => {
        if (data) setWardNames(prev => ({ ...prev, [data.id]: data.name }));
      });
    }
    if (selectedVoter.puNumberId && !puNames[selectedVoter.puNumberId]) {
      supabase.from('polling_units').select('id, name').eq('id', selectedVoter.puNumberId).single().then(({ data }) => {
        if (data) setPuNames(prev => ({ ...prev, [data.id]: data.name }));
      });
    }
  }, [selectedVoter]);

  // Edit fields and notes view state
  const [selectedStatus, setSelectedStatus] = useState<Voter['status'] | null>(null);
  const [showNotesList, setShowNotesList] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // International phone formatter: 234... instead of 080.../070...
  const formatPhone = (phone?: string) => {
    if (!phone) return 'N/A';
    let clean = String(phone).replace(/\D/g, '');
    if (clean.startsWith('0') && clean.length === 11) {
      return '234' + clean.substring(1);
    } else if (!clean.startsWith('234') && clean.length === 10) {
      return '234' + clean;
    }
    return clean || phone;
  };

  const getFirstName = (fullName?: string) => {
    if (!fullName) return '';
    const parts = fullName.trim().split(/\s+/);
    return parts[0] || '';
  };

  // Track voters known to NOT be on WhatsApp
  const [notOnWaSet, setNotOnWaSet] = useState<Set<string>>(new Set());

  // Track voters confirmed to BE on WhatsApp via API check or sent messages
  const [confirmedOnWaSet, setConfirmedOnWaSet] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('eagleeye_confirmed_on_wa');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  const markVoterConfirmedOnWa = (voterId: string | number, phone?: string) => {
    setConfirmedOnWaSet(prev => {
      const next = new Set(prev);
      next.add(String(voterId));
      if (phone) next.add(formatPhone(phone));
      try {
        localStorage.setItem('eagleeye_confirmed_on_wa', JSON.stringify(Array.from(next)));
      } catch {}
      return next;
    });
  };

  const isVoterConfirmedOnWa = (voter: Voter) => {
    const p = formatPhone(voter.phone);
    return confirmedOnWaSet.has(String(voter.id)) || (voter.phone ? confirmedOnWaSet.has(p) : false);
  };

  useEffect(() => {
    // 1. Fetch voters verified NOT on WhatsApp
    supabase
      .from('whatsapp_outreach_queue')
      .select('voter_phone, voter_id')
      .eq('status', 'not_on_whatsapp')
      .then(({ data }) => {
        if (data) {
          const s = new Set<string>();
          data.forEach((d: any) => {
            if (d.voter_id) s.add(String(d.voter_id));
            if (d.voter_phone) {
              s.add(String(d.voter_phone));
              s.add(formatPhone(d.voter_phone));
            }
          });
          setNotOnWaSet(s);
        }
      });

    // 2. Fetch voters confirmed ON WhatsApp via delivery/read records
    supabase
      .from('whatsapp_outreach_queue')
      .select('voter_id, voter_phone, status')
      .in('status', ['sent', 'delivered', 'read', 'completed'])
      .then(({ data }) => {
        if (data && data.length > 0) {
          setConfirmedOnWaSet(prev => {
            const next = new Set(prev);
            data.forEach((d: any) => {
              if (d.voter_id) next.add(String(d.voter_id));
              if (d.voter_phone) next.add(formatPhone(d.voter_phone));
            });
            try {
              localStorage.setItem('eagleeye_confirmed_on_wa', JSON.stringify(Array.from(next)));
            } catch {}
            return next;
          });
        }
      });

    // 3. Fetch voters who have active WhatsApp conversations
    supabase
      .from('whatsapp_conversations')
      .select('voter_id, voter_phone')
      .then(({ data }) => {
        if (data && data.length > 0) {
          setConfirmedOnWaSet(prev => {
            const next = new Set(prev);
            data.forEach((d: any) => {
              if (d.voter_id) next.add(String(d.voter_id));
              if (d.voter_phone) next.add(formatPhone(d.voter_phone));
            });
            try {
              localStorage.setItem('eagleeye_confirmed_on_wa', JSON.stringify(Array.from(next)));
            } catch {}
            return next;
          });
        }
      });

    // 4. Fetch voters who have sent or received WhatsApp messages
    supabase
      .from('whatsapp_messages')
      .select('chat_id')
      .then(({ data }) => {
        if (data && data.length > 0) {
          setConfirmedOnWaSet(prev => {
            const next = new Set(prev);
            data.forEach((d: any) => {
              if (d.chat_id) {
                const phoneOnly = d.chat_id.split('@')[0];
                next.add(phoneOnly);
                next.add(formatPhone(phoneOnly));
              }
            });
            try {
              localStorage.setItem('eagleeye_confirmed_on_wa', JSON.stringify(Array.from(next)));
            } catch {}
            return next;
          });
        }
      });
  }, []);

  const isVoterNotOnWa = (voter: Voter) => {
    if (isVoterConfirmedOnWa(voter)) return false;
    const p = formatPhone(voter.phone);
    return notOnWaSet.has(String(voter.id)) || (voter.phone ? (notOnWaSet.has(p) || notOnWaSet.has(voter.phone)) : false);
  };

  // Agent Custom Outreach Message Template
  const defaultTemplate = 'Hello {{voter_firstname}}! The time for real change and good governance is now. I am {{agent_firstname}}, reaching out directly from our ADC grassroots campaign here in {{ward_name}}. Together, we are building a state that works for every citizen—better jobs, quality healthcare, improved schools, and genuine security in our communities. Check out our candidate\'s official plan attached. Are you ready to make your vote count? Reply to join the movement!';
  
  const [customTemplate, setCustomTemplate] = useState<string>(() => {
    if (!user?.id) return '';
    const saved = localStorage.getItem(`eagleeye_agent_template_${user.id}`);
    if (saved && (saved.includes('Test message template') || saved.startsWith('Test message'))) {
      localStorage.removeItem(`eagleeye_agent_template_${user.id}`);
      return '';
    }
    return saved || '';
  });
  const [customFormat, setCustomFormat] = useState<'image_and_text' | 'text_only'>(() => {
    return (user?.id && (localStorage.getItem(`eagleeye_agent_format_${user.id}`) as any)) || 'image_and_text';
  });
  const [stateTemplate, setStateTemplate] = useState<string>('');
  const [stateConfig, setStateConfig] = useState<any>(null);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [tempTemplate, setTempTemplate] = useState('');
  const [tempFormat, setTempFormat] = useState<'image_and_text' | 'text_only'>('image_and_text');

  // Canvassed tracking & Reach/Stance filters
  const [voterReachFilter, setVoterReachFilter] = useState<'all' | 'on_whatsapp' | 'not_whatsapp' | 'canvassed'>('all');
  const [voterStanceFilter, setVoterStanceFilter] = useState<'all' | 'ADC Supporter' | 'Undecided' | 'Opposition'>('all');
  const [canvassedSet, setCanvassedSet] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('eagleeye_canvassed_voters');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  const markVoterCanvassed = (voterId: string | number, phone?: string) => {
    setCanvassedSet(prev => {
      const next = new Set(prev);
      next.add(String(voterId));
      if (phone) next.add(formatPhone(phone));
      try {
        localStorage.setItem('eagleeye_canvassed_voters', JSON.stringify(Array.from(next)));
      } catch {}
      return next;
    });
  };

  useEffect(() => {
    // Pre-load canvassed records from outreach queue where messages have been processed
    supabase
      .from('whatsapp_outreach_queue')
      .select('voter_id, voter_phone, status')
      .in('status', ['sent', 'delivered', 'read', 'completed'])
      .then(({ data }) => {
        if (data && data.length > 0) {
          setCanvassedSet(prev => {
            const next = new Set(prev);
            data.forEach((d: any) => {
              if (d.voter_id) next.add(String(d.voter_id));
              if (d.voter_phone) next.add(formatPhone(d.voter_phone));
            });
            try {
              localStorage.setItem('eagleeye_canvassed_voters', JSON.stringify(Array.from(next)));
            } catch {}
            return next;
          });
        }
      });
  }, []);

  // WhatsApp Send/Preview Confirmation Modal state
  const [confirmWaVoter, setConfirmWaVoter] = useState<Voter | null>(null);
  const [waModalMessage, setWaModalMessage] = useState<string>('');

  useEffect(() => {
    if (user?.stateId) {
      greenApiService.getConfig(user.stateId).then(cfg => {
        if (cfg) {
          setStateConfig(cfg);
          if (cfg.default_message_template) {
            setStateTemplate(cfg.default_message_template);
          }
        }
      });
    }
  }, [user?.stateId]);

  const getFormattedOutreachMessage = (voterName: string, wardId?: number) => {
    let rawTpl = customTemplate.trim() || stateTemplate.trim() || defaultTemplate;
    if (rawTpl.includes('Test message template')) {
      rawTpl = defaultTemplate;
    }
    const wardName = (wardId && wardNames[wardId]) || 'your Ward';
    const voterFirstName = getFirstName(voterName) || 'Voter';
    const agentFirstName = (user as any)?.firstName || getFirstName(user?.name) || 'Field Agent';

    return rawTpl
      // First name tags
      .replace(/\{\{voter_firstt?name\}\}/gi, voterFirstName)
      .replace(/\{\{voter_first_name\}\}/gi, voterFirstName)
      .replace(/\{\{agent_firstt?name\}\}/gi, agentFirstName)
      .replace(/\{\{agent_first_name\}\}/gi, agentFirstName)
      // Full name tags
      .replace(/\{\{voter_name\}\}/gi, voterName || 'Voter')
      .replace(/\{\{agent_name\}\}/gi, user?.name || 'Field Agent')
      .replace(/\{\{ward_name\}\}/gi, wardName);
  };

  const getWhatsAppLink = (phone: string, name: string, wardId?: number, overrideMsg?: string) => {
    const cleaned = formatPhone(phone);
    const message = overrideMsg || getFormattedOutreachMessage(name, wardId);
    return `https://wa.me/${cleaned}?text=${encodeURIComponent(message)}`;
  };

  // Call Voter & earn bounty
  const handleCallVoter = async (voter: Voter, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!voter.phone) return;
    const cleanPhone = formatPhone(voter.phone);
    const earnAmount = Number(stateConfig?.earning_per_call ?? 20);

    logVoterContact(voter.id, 'call');
    markVoterCanvassed(voter.id, voter.phone);

    // Trigger phone dialer
    window.location.href = `tel:${cleanPhone}`;

    if (user?.id) {
      try {
        await supabase.functions.invoke('whatsapp-admin', {
          body: {
            action: 'creditOutreachEarning',
            agentId: user.id,
            type: 'call',
            voterId: voter.id,
            voterPhone: cleanPhone,
            voterName: voter.name
          }
        });
        toast.success(`Call logged! (+₦${earnAmount} earned)`);
      } catch (err) {
        console.error('Failed to credit call earning:', err);
      }
    }
  };

  // Sort & filter voters by search term, stance, and reach status
  const filteredVoters = voters
    .filter(v => {
      const matchSearch = (v.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
        (v.phone || '').toLowerCase().includes(searchTerm.toLowerCase());
      if (!matchSearch) return false;

      // Stance Filter: All / Supporters / Undecided / Opposition
      if (voterStanceFilter !== 'all') {
        if (v.status !== voterStanceFilter) return false;
      }

      // Reach Filter: All / On WhatsApp / Not on WhatsApp / Canvassed
      // Only returns voters whose WhatsApp presence has been verified via API
      if (voterReachFilter === 'on_whatsapp') {
        return isVoterConfirmedOnWa(v);
      }
      if (voterReachFilter === 'not_whatsapp') {
        return isVoterNotOnWa(v);
      }
      if (voterReachFilter === 'canvassed') {
        const isCanvassed = canvassedSet.has(String(v.id)) ||
          Boolean(v.phone && canvassedSet.has(formatPhone(v.phone))) ||
          Boolean(v.contactHistory && v.contactHistory.length > 0) ||
          Boolean(v.notes && v.notes.length > 0);
        return isCanvassed;
      }
      return true;
    })
    .sort((a, b) => {
      const aNotOnWa = isVoterNotOnWa(a);
      const bNotOnWa = isVoterNotOnWa(b);
      if (aNotOnWa !== bNotOnWa) {
        return aNotOnWa ? 1 : -1;
      }
      return (a.name || '').localeCompare(b.name || '');
    });

  const currentVoter = selectedVoter ? voters.find(v => String(v.id) === String(selectedVoter.id)) || selectedVoter : null;

  const handleSelectVoter = (voter: Voter) => {
    setSelectedVoter(voter);
    setSelectedStatus(voter.status);
    setNoteText('');
    setShowNoteSuccess(false);
    setShowNotesList(false);
  };

  const handleSaveChanges = async () => {
    if (!currentVoter) return;
    setIsSaving(true);
    try {
      const updates: Partial<Voter> = {};
      if (selectedStatus && selectedStatus !== currentVoter.status) {
        updates.status = selectedStatus;
      }
      if (noteText.trim()) {
        const newNote: VoterNote = {
          text: noteText.trim(),
          agentId: user?.id || 'unknown',
          agentName: user?.name || 'Unknown Agent',
          createdAt: new Date().toISOString()
        };
        updates.notes = [...(currentVoter.notes || []), newNote];
      }

      if (Object.keys(updates).length > 0) {
        await updateVoterDetails(currentVoter.id, updates);
        setNoteText('');
        setShowNoteSuccess(true);
        setTimeout(() => setShowNoteSuccess(false), 3000);
      }
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  const [sendingVoterId, setSendingVoterId] = useState<string | number | null>(null);
  const [hasWaInstance, setHasWaInstance] = useState<boolean>(false);

  useEffect(() => {
    if (user?.id) {
      greenApiService.getAgentInstance(user.id).then(inst => {
        setHasWaInstance(inst?.wa_state === 'authorized');
      });
    }
  }, [user?.id]);

  const handleOpenWaModal = (voter: Voter, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setConfirmWaVoter(voter);
    setWaModalMessage(getFormattedOutreachMessage(voter.name, voter.wardId));
  };

  const handleDirectSendFlyer = async (voter: Voter, customMsgText?: string) => {
    if (!user) return;

    const formattedMessage = customMsgText || getFormattedOutreachMessage(voter.name, voter.wardId);
    const cleanPhone = formatPhone(voter.phone);
    const manualWaBounty = Number(stateConfig?.earning_per_manual_wa || 15);

    // If agent WhatsApp instance is not connected/authorized, open wa.me on phone & award manual WA earning
    if (!hasWaInstance) {
      logVoterContact(voter.id, 'whatsapp');
      markVoterCanvassed(voter.id, voter.phone);
      markVoterConfirmedOnWa(voter.id, voter.phone);

      const waUrl = getWhatsAppLink(voter.phone, voter.name, voter.wardId, formattedMessage);
      window.open(waUrl, '_blank');

      try {
        const numericVoterId = voter.id ? parseInt(String(voter.id).replace(/\D/g, ''), 10) : null;
        await supabase.functions.invoke('whatsapp-admin', {
          body: {
            action: 'creditOutreachEarning',
            agentId: user.id,
            type: 'manual_wa',
            voterId: Number.isFinite(numericVoterId) ? numericVoterId : null,
            voterPhone: cleanPhone,
            voterName: voter.name
          }
        });
        toast.success(`WhatsApp link opened! (+₦${manualWaBounty} earned)`);
      } catch (e) {
        console.error('Failed to credit manual wa earning:', e);
      }
      return;
    }

    setSendingVoterId(voter.id);
    const toastId = toast.loading(`Sending campaign outreach to ${voter.name}...`);
    try {
      const res = await greenApiService.sendFlyer(user.id, cleanPhone, voter.name, voter.id, formattedMessage);
      if (res?.notOnWhatsapp) {
        toast.error(`${voter.name} is not registered on WhatsApp`, { id: toastId });
        setNotOnWaSet(prev => {
          const next = new Set(prev);
          next.add(String(voter.id));
          next.add(cleanPhone);
          if (voter.phone) next.add(voter.phone);
          return next;
        });
      } else {
        const earned = res.earned || stateConfig?.earning_per_chat || 50;
        toast.success(`Campaign outreach sent to ${voter.name}! (+₦${earned})`, { id: toastId });
        markVoterConfirmedOnWa(voter.id, voter.phone);
        setNotOnWaSet(prev => {
          const next = new Set(prev);
          next.delete(String(voter.id));
          next.delete(cleanPhone);
          if (voter.phone) next.delete(voter.phone);
          return next;
        });
        logVoterContact(voter.id, 'whatsapp');
        markVoterCanvassed(voter.id, voter.phone);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to dispatch WhatsApp flyer', { id: toastId });
    } finally {
      setSendingVoterId(null);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ADC Supporter': return 'bg-green-100 text-green-800 border-green-200';
      case 'Opposition': return 'bg-red-100 text-red-800 border-red-200';
      case 'Undecided': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'Unreachable': return 'bg-gray-100 text-gray-800 border-gray-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStateName = (stateId?: number | null) => {
    if (!stateId) return '';
    const stateLoc = locations.find(l => l.id === `state_${stateId}`);
    return stateLoc ? ` • ${stateLoc.name} State` : '';
  };

  return (
    <div className="h-full flex flex-col relative">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Voter Register</h1>
          <p className="text-gray-500 dark:text-gray-400">Manage and update voter canvassing status</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setTempTemplate(customTemplate || stateTemplate || defaultTemplate);
            setIsTemplateModalOpen(true);
          }}
          className="px-3.5 py-2 bg-white dark:bg-gray-800 border border-emerald-600/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 text-xs font-semibold rounded-lg flex items-center gap-2 shadow-xs transition self-start sm:self-auto cursor-pointer"
          title="Customize your personal outreach message format"
        >
          <Edit3 size={15} className="text-emerald-600" />
          <span>My Outreach Message</span>
          {customTemplate && (
            <span className="w-2 h-2 rounded-full bg-emerald-500" title="Personalized template active" />
          )}
        </button>
      </div>

      {/* Jurisdiction Filters (LGA, Ward, PU) */}
      {user?.role !== 'pu_agent' && (
        <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-gray-200 shadow-xs mb-4">
          <div className="flex items-center gap-2 mb-2.5 pb-2 border-b border-gray-100">
            <MapPin size={15} className="text-[#004d25]" />
            <span className="text-xs font-bold text-gray-800 uppercase tracking-wider">
              Jurisdiction Filters
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* LGA Filter (State & National Admins) */}
            <div>
              <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                Local Government (LGA)
              </label>
              {user?.role === 'national_admin' || user?.role === 'state_admin' ? (
                <select
                  value={selectedLga || ''}
                  onChange={handleLgaChange}
                  className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-700 bg-white focus:ring-2 focus:ring-[#004d25] focus:outline-none"
                >
                  <option value="">All LGAs</option>
                  {lgas.map(lga => (
                    <option key={lga.id} value={lga.id}>{lga.name}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  disabled
                  value={user?.locationName || 'Assigned LGA'}
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-500 bg-gray-50 cursor-not-allowed"
                />
              )}
            </div>

            {/* Ward Filter */}
            <div>
              <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                Ward
              </label>
              {user?.role === 'ward_admin' ? (
                <input
                  type="text"
                  disabled
                  value={user?.locationName || 'Assigned Ward'}
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-500 bg-gray-50 cursor-not-allowed"
                />
              ) : (
                <select
                  value={selectedWard || ''}
                  onChange={handleWardChange}
                  disabled={!selectedLga && user?.role !== 'lga_admin'}
                  className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-700 bg-white focus:ring-2 focus:ring-[#004d25] focus:outline-none disabled:bg-gray-50 disabled:text-gray-400"
                >
                  <option value="">All Wards</option>
                  {wards.map(ward => (
                    <option key={ward.id} value={ward.id}>{ward.name}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Polling Unit Filter */}
            <div>
              <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                Polling Unit (PU)
              </label>
              <select
                value={selectedPu || ''}
                onChange={handlePuChange}
                disabled={!selectedWard && user?.role !== 'ward_admin'}
                className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-700 bg-white focus:ring-2 focus:ring-[#004d25] focus:outline-none disabled:bg-gray-50 disabled:text-gray-400"
              >
                <option value="">All Polling Units</option>
                {pollingUnits.map(pu => (
                  <option key={pu.id} value={pu.id}>
                    {pu.name} {pu.puId ? `(${pu.puId})` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Search Bar & Reach/Stance Filters */}
      <div className="flex flex-col lg:flex-row gap-2.5 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input 
            type="text" 
            placeholder="Search by Name or Phone..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#004d25] focus:border-transparent text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Stance Dropdown */}
          <select
            value={voterStanceFilter}
            onChange={(e) => setVoterStanceFilter(e.target.value as any)}
            className="px-3 py-2 text-xs font-semibold rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:ring-2 focus:ring-[#004d25] outline-none cursor-pointer shadow-2xs"
          >
            <option value="all">All Stances</option>
            <option value="ADC Supporter">Supporters</option>
            <option value="Undecided">Undecided</option>
            <option value="Opposition">Opposition</option>
          </select>

          {/* Reach Dropdown */}
          <select
            value={voterReachFilter}
            onChange={(e) => setVoterReachFilter(e.target.value as any)}
            className="px-3 py-2 text-xs font-semibold rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:ring-2 focus:ring-[#004d25] outline-none cursor-pointer shadow-2xs"
          >
            <option value="all">All Voters</option>
            <option value="on_whatsapp">On WhatsApp</option>
            <option value="not_whatsapp">Not on WhatsApp</option>
            <option value="canvassed">Canvassed</option>
          </select>
        </div>
      </div>

      <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
        <div className="overflow-y-auto flex-1">
          {filteredVoters.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-center p-8">
              <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center text-gray-300 mb-4">
                <UserCircle size={32} />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-1">No voters found</h3>
              <p className="text-gray-500">
                {searchTerm ? 'No voters match your search criteria.' : 'Voters to be added soon.'}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {filteredVoters.map(voter => {
                const shortPu8 = getShortPu8(voter);
                return (
                  <li 
                    key={voter.id} 
                    onClick={() => handleSelectVoter(voter)}
                    className="p-4 hover:bg-gray-50 cursor-pointer flex items-center justify-between transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-gray-400 overflow-hidden">
                        {voter.image ? (
                          <img src={voter.image} alt={voter.name} className="w-full h-full object-cover" />
                        ) : (
                          <UserCircle size={24} />
                        )}
                      </div>
                      <div>
                        <h4 className="font-semibold text-gray-900">
                          {voter.name}
                        </h4>
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className="text-xs text-gray-500 font-mono">{formatPhone(voter.phone)}</p>
                          {isVoterNotOnWa(voter) && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 px-1.5 py-0.2 rounded">
                              Not on WhatsApp
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 ml-auto">
                      {/* Do not render Undecided status pill; only render if defined and NOT Undecided */}
                      {voter.status && voter.status !== 'Undecided' && (
                        <span className={cn("px-2.5 py-1 rounded-full text-xs font-medium border whitespace-nowrap", getStatusColor(voter.status))}>
                          {voter.status}
                        </span>
                      )}

                      {/* Action Icons: Aligned to Far Right */}
                      {voter.phone && (
                        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                          {/* WhatsApp Outreach */}
                          {!(hasWaInstance && isVoterNotOnWa(voter)) && (
                            <button 
                              type="button"
                              title={
                                hasWaInstance 
                                  ? `Dispatch Campaign Flyer & Message (+₦${stateConfig?.earning_per_chat || 50})` 
                                  : `Open WhatsApp on phone (+₦${stateConfig?.earning_per_manual_wa || 15})`
                              }
                              onClick={(e) => handleOpenWaModal(voter, e)}
                              disabled={sendingVoterId === voter.id}
                              className={cn(
                                "p-1.5 rounded-full transition-colors disabled:opacity-50 cursor-pointer",
                                isVoterNotOnWa(voter)
                                  ? "hover:bg-amber-50 text-amber-500 hover:text-amber-700"
                                  : "hover:bg-green-50 text-green-600"
                              )}
                            >
                              {sendingVoterId === voter.id ? (
                                <Loader2 size={18} className="animate-spin text-green-600" />
                              ) : (
                                <MessageCircle size={18} />
                              )}
                            </button>
                          )}

                          {/* Call Voter */}
                          <button 
                            type="button"
                            title={`Call Voter (+₦${stateConfig?.earning_per_call || 20} bounty)`}
                            onClick={(e) => handleCallVoter(voter, e)}
                            className="p-1.5 rounded-full hover:bg-emerald-50 text-emerald-700 dark:text-emerald-400 transition-colors cursor-pointer"
                          >
                            <Phone size={18} />
                          </button>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="p-4 border-t border-gray-100 text-sm text-gray-500 bg-gray-50 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            Showing {filteredVoters.length} voters {isLoadingVoters && <span className="ml-2 text-xs text-[#004d25] italic font-medium animate-pulse">Loading...</span>}
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => fetchVotersPage(votersPage - 1)}
              disabled={votersPage === 1 || isLoadingVoters}
              className="p-1.5 border border-gray-300 rounded hover:bg-white disabled:opacity-50 transition-colors"
              title="Previous Page"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="font-medium text-gray-700 bg-white px-3 py-1 rounded border border-gray-200">Page {votersPage}</span>
            <button 
              onClick={() => fetchVotersPage(votersPage + 1)}
              disabled={voters.length < 500 || isLoadingVoters}
              className="p-1.5 border border-gray-300 rounded hover:bg-white disabled:opacity-50 transition-colors"
              title="Next Page"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Side Drawer / Modal for Voter Details */}
        {currentVoter && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm transition-opacity" onClick={() => setSelectedVoter(null)} />
          <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col transform transition-transform duration-300 translate-x-0">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-[#004d25] text-white">
              <h3 className="font-bold text-lg">Voter Details</h3>
              <button onClick={() => setSelectedVoter(null)} className="p-1 hover:bg-[#006331] rounded-full">
                <X size={24} />
              </button>
            </div>
            
            <div className="p-6 flex-1 overflow-y-auto">
              <div className="text-center mb-6">
                <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center text-gray-400 mx-auto mb-3 overflow-hidden">
                  {currentVoter.image ? (
                    <img src={currentVoter.image} alt={currentVoter.name} className="w-full h-full object-cover" />
                  ) : (
                    <UserCircle size={48} />
                  )}
                </div>
                <h2 className="text-2xl font-bold text-gray-900">
                  {currentVoter.name}
                </h2>
                <p className="text-xs text-emerald-800 font-medium mt-1">
                  {wardNames[currentVoter.wardId || 0] ? `${wardNames[currentVoter.wardId || 0]} • ` : ''}
                  {puNames[currentVoter.puNumberId || 0] || currentVoter.puId || currentVoter.vin}
                </p>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                    <span className="text-gray-500 text-xs block mb-1">Ward</span>
                    <span className="font-semibold text-gray-900 text-xs block break-words" title={wardNames[currentVoter.wardId || 0] || 'Ward'}>
                      {wardNames[currentVoter.wardId || 0] || (currentVoter.wardId ? `Ward ${currentVoter.wardId}` : 'N/A')}
                    </span>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                    <span className="text-gray-500 text-xs block mb-1">Polling Unit (PU)</span>
                    <span className="font-semibold text-gray-900 text-xs block break-words" title={puNames[currentVoter.puNumberId || 0] || currentVoter.puId || 'PU'}>
                      {puNames[currentVoter.puNumberId || 0] || currentVoter.puId || 'N/A'}
                    </span>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                    <span className="text-gray-500 text-xs block mb-1">PU Code / VIN</span>
                    <span className="font-semibold text-gray-900 text-xs block">
                      {currentVoter.puId || currentVoter.vin || 'N/A'}
                    </span>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                    <span className="text-gray-500 text-xs block mb-1">Phone Number</span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-semibold text-gray-900 text-xs block font-mono">
                        {formatPhone(currentVoter.phone)}
                      </span>
                      {isVoterNotOnWa(currentVoter) && (
                        <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1 rounded">
                          Not on WhatsApp
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                    <span className="text-gray-500 text-xs block mb-1">Date of Birth</span>
                    <span className="font-semibold text-gray-900 text-xs block">
                      {currentVoter.dob || 'N/A'}
                    </span>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                    <span className="text-gray-500 text-xs block mb-1">Location ID</span>
                    <span className="font-semibold text-gray-900 text-xs block">
                      {currentVoter.locationId || 'N/A'}
                    </span>
                  </div>
                </div>

                {/* Official Campaign Outreach Box */}
                {currentVoter.phone && (
                  <div className={cn(
                    "p-3.5 border rounded-xl space-y-2.5",
                    isVoterNotOnWa(currentVoter)
                      ? "bg-amber-50/70 border-amber-200 text-amber-900"
                      : "bg-emerald-50 border-emerald-200 text-emerald-900"
                  )}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                        {hasWaInstance && isVoterNotOnWa(currentVoter) ? (
                          <>
                            <Phone size={14} className="text-amber-700" />
                            Direct Phone Outreach
                          </>
                        ) : (
                          <>
                            <MessageSquare size={14} className={isVoterNotOnWa(currentVoter) ? "text-amber-700" : "text-emerald-700"} />
                            {hasWaInstance ? "WhatsApp Campaign Flyer" : "Direct WhatsApp (wa.me)"}
                          </>
                        )}
                      </span>
                      <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                        +₦{hasWaInstance && isVoterNotOnWa(currentVoter) 
                          ? (stateConfig?.earning_per_call || 20) 
                          : hasWaInstance 
                          ? (stateConfig?.earning_per_chat || 50) 
                          : (stateConfig?.earning_per_manual_wa || 15)} Earned
                      </span>
                    </div>
                    <p className="text-xs text-emerald-800">
                      {hasWaInstance && isVoterNotOnWa(currentVoter)
                        ? "This voter is verified not on WhatsApp. Call the voter directly from your phone to canvass and earn your outreach reward."
                        : hasWaInstance
                        ? "Dispatches your state candidate flyer with personalized voter message directly from your phone."
                        : "Opens WhatsApp directly on your phone via wa.me link with your custom outreach message prefilled."}
                    </p>
                    
                    {hasWaInstance && isVoterNotOnWa(currentVoter) ? (
                      <button
                        type="button"
                        onClick={() => handleCallVoter(currentVoter)}
                        className="w-full py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-lg shadow-sm flex items-center justify-center gap-2 transition cursor-pointer"
                      >
                        <Phone size={14} />
                        <span>Call Voter Directly (+₦{stateConfig?.earning_per_call || 20})</span>
                      </button>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={sendingVoterId === currentVoter.id}
                          onClick={() => handleOpenWaModal(currentVoter)}
                          className={cn(
                            "flex-1 py-2.5 text-white text-xs font-semibold rounded-lg shadow-sm flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-60",
                            isVoterNotOnWa(currentVoter)
                              ? "bg-amber-600 hover:bg-amber-700"
                              : "bg-[#004d25] hover:bg-[#006331]"
                          )}
                        >
                          {hasWaInstance ? <Send size={14} /> : <MessageCircle size={14} />}
                          <span>{hasWaInstance ? "WhatsApp Outreach" : "Open in WhatsApp"}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCallVoter(currentVoter)}
                          className="px-3 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-semibold rounded-lg flex items-center justify-center gap-1 transition cursor-pointer"
                          title="Call voter directly"
                        >
                          <Phone size={14} />
                          <span>Call</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <h4 className="font-semibold text-gray-900 mb-3">Update Status</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {(['ADC Supporter', 'Opposition', 'Undecided', 'Unreachable'] as const).map((status) => (
                      <button
                        key={status}
                        onClick={() => setSelectedStatus(status)}
                        className={cn(
                          "p-3 rounded-lg border text-sm font-medium flex items-center justify-between transition-all cursor-pointer",
                          selectedStatus === status 
                            ? getStatusColor(status) + " ring-2 ring-offset-1"
                            : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                        )}
                      >
                        {status}
                        {selectedStatus === status && <Check size={16} />}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="border-t border-gray-100 pt-4">
                  <button
                    onClick={() => setShowNotesList(!showNotesList)}
                    className="w-full flex items-center justify-between py-2 text-gray-700 hover:text-gray-900 font-semibold transition-colors focus:outline-none cursor-pointer"
                  >
                    <span>Voter Notes ({currentVoter.notes?.length || 0})</span>
                    {showNotesList ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </button>
                  
                  {showNotesList && (
                    <div className="mt-2 mb-4 space-y-3 max-h-48 overflow-y-auto">
                      {(!currentVoter.notes || currentVoter.notes.length === 0) && (
                        <p className="text-sm text-gray-500 italic py-2">No notes added yet.</p>
                      )}
                      {currentVoter.notes?.map((n, i) => (
                        <div key={i} className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                          <p className="text-sm text-gray-800 mb-2">{n.text}</p>
                          <div className="flex items-center justify-between text-xs text-gray-500 font-medium">
                            <span>{n.agentName}</span>
                            <span>{new Date(n.createdAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="mt-4">
                    <h4 className="font-semibold text-gray-900 mb-2">Write a New Note</h4>
                    <textarea 
                      className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-[#004d25] focus:border-transparent outline-none"
                      rows={3}
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      placeholder="Add key insights, canvassing records, or special details here..."
                    ></textarea>
                    {showNoteSuccess && (
                      <p className="text-xs text-green-600 mt-1 flex items-center gap-1 font-medium animate-pulse">
                        <Check size={14} /> Changes saved successfully!
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
            
            <div className="p-4 border-t border-gray-100 bg-gray-50 flex gap-3">
              <button 
                onClick={handleSaveChanges} 
                disabled={isSaving || (selectedStatus === currentVoter.status && !noteText.trim())}
                className="flex-1 bg-[#004d25] text-white font-semibold py-3 rounded-lg hover:bg-[#006331] transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="animate-spin" size={18} />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Save size={18} />
                    <span>Save Changes</span>
                  </>
                )}
              </button>
              <button 
                onClick={() => {
                  setSelectedVoter(null);
                  setNoteText('');
                  setShowNoteSuccess(false);
                }}
                disabled={isSaving}
                className="flex-1 bg-gray-200 text-gray-700 font-semibold py-3 rounded-lg hover:bg-gray-300 transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Personalized Outreach Message Customizer Modal */}
      {isTemplateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white dark:bg-gray-900 rounded-2xl max-w-lg w-full border border-gray-200 dark:border-gray-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 bg-gradient-to-r from-[#004d25] to-[#006331] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Edit3 size={18} />
                <h3 className="font-bold text-base">Personalize Outreach Message</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsTemplateModalOpen(false)}
                className="p-1 hover:bg-white/20 rounded-full transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Customize the message that will be sent to voters alongside your candidate campaign flyer, or prefilled in WhatsApp (wa.me) links.
              </p>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Outreach Format
                </label>
                <select
                  value={tempFormat}
                  onChange={(e) => setTempFormat(e.target.value as any)}
                  className="w-full text-xs sm:text-sm p-2.5 border border-gray-300 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="image_and_text">Image & Text (Candidate Campaign Flyer + Message)</option>
                  <option value="text_only">Text Message Only (Direct Message)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  Insert Dynamic Placeholder Chips
                </label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: 'Voter First Name', tag: '{{voter_firstname}}' },
                    { label: 'Agent First Name', tag: '{{agent_firstname}}' },
                    { label: 'Ward Name', tag: '{{ward_name}}' },
                    { label: 'Voter Full Name', tag: '{{voter_name}}' },
                    { label: 'Agent Full Name', tag: '{{agent_name}}' },
                  ].map(chip => (
                    <button
                      key={chip.tag}
                      type="button"
                      onClick={() => setTempTemplate(prev => `${prev} ${chip.tag}`.trim())}
                      className="text-[11px] font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 px-2.5 py-1 rounded-full cursor-pointer transition"
                    >
                      + {chip.label} <code className="opacity-70 text-[10px]">{chip.tag}</code>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Message Content
                </label>
                <textarea
                  rows={4}
                  value={tempTemplate}
                  onChange={(e) => setTempTemplate(e.target.value)}
                  placeholder="e.g. Hello {{voter_firstname}}, I am {{agent_firstname}}..."
                  className="w-full text-xs sm:text-sm p-3 border border-gray-300 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500 font-sans"
                />
              </div>

              {/* Real-time Preview */}
              <div className="p-3 bg-gray-50 dark:bg-gray-800/60 rounded-xl border border-gray-200 dark:border-gray-700/60 space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 block">
                  Live Preview {tempFormat === 'image_and_text' && '• Attached to Campaign Flyer'}
                </span>

                {tempFormat === 'image_and_text' && stateConfig?.default_flyer_url && (
                  <div className="flex items-center gap-3 p-2 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
                    <img 
                      src={stateConfig.default_flyer_url} 
                      alt="Campaign Flyer" 
                      className="w-16 h-16 object-cover rounded-md border border-gray-200 shrink-0" 
                    />
                    <div className="text-xs text-gray-500 space-y-0.5">
                      <p className="font-semibold text-gray-800 dark:text-gray-200">Official State Campaign Flyer</p>
                      <p className="text-[11px] text-gray-500">Will be sent as the header image with your message below as the caption.</p>
                    </div>
                  </div>
                )}

                <p className="text-xs text-gray-800 dark:text-gray-200 italic whitespace-pre-wrap bg-white dark:bg-gray-900 p-2.5 rounded-lg border border-gray-100 dark:border-gray-800">
                  {tempTemplate
                    .replace(/\{\{voter_firstt?name\}\}/gi, 'Adewale')
                    .replace(/\{\{voter_first_name\}\}/gi, 'Adewale')
                    .replace(/\{\{agent_firstt?name\}\}/gi, (user as any)?.firstName || getFirstName(user?.name) || 'Musa')
                    .replace(/\{\{agent_first_name\}\}/gi, (user as any)?.firstName || getFirstName(user?.name) || 'Musa')
                    .replace(/\{\{voter_name\}\}/gi, 'Adewale Johnson')
                    .replace(/\{\{agent_name\}\}/gi, user?.name || 'Agent Musa')
                    .replace(/\{\{ward_name\}\}/gi, 'Ward 01 (Central)') || '(Type your message template above to see live preview)'}
                </p>
              </div>
            </div>

            <div className="px-5 py-3.5 bg-gray-50 dark:bg-gray-800/40 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  setTempTemplate(stateTemplate || defaultTemplate);
                  setTempFormat('image_and_text');
                }}
                className="text-xs text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 underline cursor-pointer"
              >
                Reset to Default
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsTemplateModalOpen(false)}
                  className="px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const finalVal = tempTemplate.trim();
                    setCustomTemplate(finalVal);
                    setCustomFormat(tempFormat);
                    if (user?.id) {
                      if (finalVal) {
                        localStorage.setItem(`eagleeye_agent_template_${user.id}`, finalVal);
                      } else {
                        localStorage.removeItem(`eagleeye_agent_template_${user.id}`);
                      }
                      localStorage.setItem(`eagleeye_agent_format_${user.id}`, tempFormat);
                    }
                    setIsTemplateModalOpen(false);
                    toast.success('Outreach message template updated!');
                  }}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-[#004d25] hover:bg-[#006331] rounded-lg shadow-xs cursor-pointer transition"
                >
                  Save Template
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* WhatsApp Message Confirmation & Edit Modal */}
      {confirmWaVoter && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white dark:bg-gray-900 rounded-2xl max-w-lg w-full border border-gray-200 dark:border-gray-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 bg-gradient-to-r from-[#004d25] to-[#006331] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageCircle size={18} />
                <h3 className="font-bold text-base">Confirm WhatsApp Outreach</h3>
              </div>
              <button
                type="button"
                onClick={() => setConfirmWaVoter(null)}
                className="p-1 hover:bg-white/20 rounded-full transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700">
                <div>
                  <span className="text-[10px] text-gray-400 uppercase font-semibold block">Target Voter</span>
                  <p className="text-sm font-bold text-gray-900 dark:text-white">{confirmWaVoter.name}</p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-gray-400 uppercase font-semibold block">Phone Number</span>
                  <p className="text-xs font-mono font-bold text-gray-900 dark:text-white">{formatPhone(confirmWaVoter.phone)}</p>
                </div>
              </div>

              {/* Campaign Flyer Asset Preview */}
              {stateConfig?.default_flyer_url && (
                <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                      <ImageIcon size={14} className="text-[#004d25]" />
                      Attached Campaign Flyer (Image + Caption)
                    </span>
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 px-2 py-0.5 rounded-full font-bold">
                      State Flyer
                    </span>
                  </div>
                  <div className="flex gap-3 items-center">
                    <img
                      src={stateConfig.default_flyer_url}
                      alt="Campaign Flyer"
                      className="w-16 h-16 object-cover rounded-lg border border-gray-200 shadow-2xs shrink-0"
                    />
                    <div className="text-xs text-gray-500 space-y-1">
                      <p className="font-semibold text-gray-800 dark:text-gray-200">
                        Official Campaign Flyer
                      </p>
                      <p className="text-[11px] text-gray-600 dark:text-gray-400">
                        {hasWaInstance 
                          ? 'This flyer image will be delivered directly with the message below as its caption.'
                          : 'Notice: WhatsApp line not connected. Opening WhatsApp directly on your phone (wa.me) transfers text message only (URL protocol cannot auto-attach media).'}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Message / Caption to Send
                </label>
                <textarea
                  rows={4}
                  value={waModalMessage}
                  onChange={(e) => setWaModalMessage(e.target.value)}
                  className="w-full text-xs sm:text-sm p-3 border border-gray-300 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500 font-sans"
                />
              </div>

              {/* Status Note & Reward */}
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 rounded-xl flex items-center justify-between">
                <div className="space-y-0.5">
                  <p className="text-xs font-semibold text-emerald-900 dark:text-emerald-200">
                    {hasWaInstance ? 'Official Campaign WhatsApp Instance Active' : 'Direct Phone WhatsApp (wa.me)'}
                  </p>
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-300">
                    {hasWaInstance
                      ? 'Dispatches candidate flyer with personalized caption directly from your assigned line.'
                      : 'Opens WhatsApp on your device with this prefilled message.'}
                  </p>
                </div>
                <span className="text-xs bg-emerald-200/80 dark:bg-emerald-900 text-emerald-900 dark:text-emerald-100 font-bold px-2.5 py-1 rounded-full shrink-0">
                  +₦{hasWaInstance ? (stateConfig?.earning_per_chat || 50) : (stateConfig?.earning_per_manual_wa || 15)}
                </span>
              </div>
            </div>

            <div className="px-5 py-3.5 bg-gray-50 dark:bg-gray-800/40 border-t border-gray-100 dark:border-gray-800 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmWaVoter(null)}
                className="px-3.5 py-2 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={sendingVoterId === confirmWaVoter.id}
                onClick={async () => {
                  const targetVoter = confirmWaVoter;
                  const finalMsg = waModalMessage;
                  setConfirmWaVoter(null);
                  await handleDirectSendFlyer(targetVoter, finalMsg);
                }}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#004d25] hover:bg-[#006331] rounded-lg shadow-xs flex items-center gap-2 cursor-pointer transition disabled:opacity-60"
              >
                {sendingVoterId === confirmWaVoter.id ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Sending...</span>
                  </>
                ) : (
                  <>
                    <Send size={14} />
                    <span>
                      {hasWaInstance 
                        ? `Send Flyer (+₦${stateConfig?.earning_per_chat || 50})`
                        : `Open WhatsApp (+₦${stateConfig?.earning_per_manual_wa || 15})`}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
