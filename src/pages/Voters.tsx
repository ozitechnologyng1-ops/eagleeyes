import React, { useState, useEffect } from "react";
import { useApp, Voter, VoterNote, Agent } from "../context/AppContext";
import {
  Search,
  X,
  Check,
  UserCircle,
  UserPlus,
  ChevronLeft,
  ChevronRight,
  MessageCircle,
  MessageSquare,
  Phone,
  Save,
  Loader2,
  ChevronDown,
  ChevronUp,
  MapPin,
  Send,
  Image as ImageIcon,
  Edit3,
  Download,
  Eye,
  RefreshCw,
  Trash2,
  Zap,
  Users,
} from "lucide-react";
import { cn, getFriendlyErrorMessage } from "../lib/utils";
import { supabase } from "../lib/supabase";
import toast from "react-hot-toast";
import { greenApiService } from "../lib/greenApi";
import AgentModal from "../components/AgentModal";
import { formatVoterProgress } from "../lib/voterRegister";

import {
  // buildImageKitUrl,
  // getCachedImage,
  // setCachedImage,
  // enhanceImageViaCanvas,
  cleanupExpiredImages,
  clearAllImageCache,
} from "../lib/imageStorage";

export default function Voters() {
  const {
    user,
    voters,
    updateVoterDetails,
    logVoterContact,
    votersPage,
    isLoadingVoters,
    fetchVotersPage,
    voterStateFilter,
    setVoterStateFilter,
    voterLgaFilter,
    setVoterLgaFilter,
    voterWardFilter,
    setVoterWardFilter,
    voterPuFilter,
    setVoterPuFilter,
    voterTotalCount,
    voterLoadedCount,
    voterSearchLatencyMs,
    voterLoadError,
    isLoadingVoterCount,
    voterCountError,
    voterHasNextPage,
    addAgent,
  } = useApp();

  const isNationalOrStateAdmin = user?.role === "national_admin" || user?.role === "state_admin";
  const [showRegisterAgentModal, setShowRegisterAgentModal] = useState(false);
  const [registerAgentInitialData, setAgentInitialData] = useState<Partial<Agent> | null>(null);

  const handleOpenRegisterAsAgent = (voter: Voter, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!isNationalOrStateAdmin) {
      toast.error("Only state and national agents can register voters as agents.");
      return;
    }

    const rawName = (voter.name || "").trim();
    const nameParts = rawName ? rawName.split(/\s+/) : [];
    const firstName = nameParts[0] || "";
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "";

    // Normalize phone number to standard 11-digit Nigerian mobile format starting with 0
    let cleanPhone = (voter.phone || "").replace(/\D/g, "");
    if (cleanPhone.startsWith("234")) {
      cleanPhone = "0" + cleanPhone.slice(3);
    }
    if (cleanPhone.length > 0 && !cleanPhone.startsWith("0")) {
      cleanPhone = "0" + cleanPhone;
    }

    // Determine locationId from voter's jurisdiction hierarchy
    const locId = voter.puNumberId
      ? `pu_${voter.puNumberId}`
      : voter.wardId
        ? `ward_${voter.wardId}`
        : voter.lgaId
          ? `lga_${voter.lgaId}`
          : voter.stateId
            ? `state_${voter.stateId}`
            : user?.stateId
              ? `state_${user.stateId}`
              : "";

    setAgentInitialData({
      name: voter.name,
      firstName,
      lastName,
      phone: cleanPhone,
      picture: voter.image || "",
      locationId: locId,
      stateId: voter.stateId || user?.stateId || null,
      lgaId: voter.lgaId || null,
      wardId: voter.wardId || null,
      puId: voter.puNumberId || (voter.puId ? parseInt(voter.puId, 10) || null : null),
      role: "pu_agent",
    });
    setShowRegisterAgentModal(true);
  };

  const handleSaveAgentFromVoter = async (agentData: Partial<Agent>) => {
    try {
      await addAgent(agentData as Omit<Agent, "id">);
      toast.success(`${agentData.firstName || "Agent"} registered successfully as agent!`);
      setShowRegisterAgentModal(false);
      setAgentInitialData(null);
    } catch (err: any) {
      toast.error(getFriendlyErrorMessage(err) || "Failed to register agent");
      throw err;
    }
  };

  const [searchTerm, setSearchTerm] = useState("");
  const [voterStanceFilter, setVoterStanceFilter] = useState<
    "all" | "ADC Supporter" | "Undecided" | "Opposition"
  >("all");
  const [selectedVoter, setSelectedVoter] = useState<Voter | null>(null);
  const [noteText, setNoteText] = useState("");
  const [showNoteSuccess, setShowNoteSuccess] = useState(false);

  // Jurisdiction filter options
  const [states, setStates] = useState<{ id: number; name: string }[]>([]);
  const [lgas, setLgas] = useState<{ id: number; name: string }[]>([]);
  const [wards, setWards] = useState<{ id: number; name: string; ward_number?: string }[]>([]);
  const [pollingUnits, setPollingUnits] = useState<
    { id: number; name: string; puId?: string; no?: string | number }[]
  >([]);

  // Selected filter values
  const [selectedState, setSelectedState] = useState<number | null>(() => {
    if (user?.role === "state_admin") return user.stateId || null;
    return voterStateFilter;
  });
  const [selectedLga, setSelectedLga] = useState<number | null>(() => {
    if (user?.role === "lga_admin" || user?.role === "ward_admin") return user.lgaId || null;
    return voterLgaFilter;
  });
  const [selectedWard, setSelectedWard] = useState<number | null>(() => {
    if (user?.role === "ward_admin") return user.wardId || null;
    return voterWardFilter;
  });
  const [selectedPu, setSelectedPu] = useState<number | null>(() => {
    if (user?.role === "pu_agent") return user.puId || user.lagosPollingUnitId || null;
    return voterPuFilter;
  });

  // Sync state filter for national admin
  useEffect(() => {
    if (user?.role === "national_admin") {
      setSelectedState(voterStateFilter);
    }
  }, [voterStateFilter, user?.role]);

  // Load states for national admin
  useEffect(() => {
    if (user?.role === "national_admin") {
      supabase
        .from("states")
        .select("id, name")
        .order("name")
        .then(({ data }) => {
          if (data && data.length > 0) setStates(data);
        });
    }
  }, [user?.role]);

  // AI Refined Photo viewer & caching state (480px x 640px)
  const [photoViewerOpen, setPhotoViewerOpen] = useState(false);
  const [viewingVoter, setViewingVoter] = useState<Voter | null>(null);
  const [refinedPhoto, setRefinedPhoto] = useState<string | null>(null);
  const [isRefiningPhoto, setIsRefiningPhoto] = useState(false);
  const [showOriginalComparison, setShowOriginalComparison] = useState(false);

  // Auto-cleanup expired cached photos on mount (5 days TTL)
  useEffect(() => {
    cleanupExpiredImages();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(
      () => {
        void fetchVotersPage(1, {
          stateId: selectedState,
          lgaId: selectedLga,
          wardId: selectedWard,
          puId: selectedPu,
          puid: pollingUnits.find((pu) => pu.id === selectedPu)?.puId || null,
          searchTerm: searchTerm.trim() || null,
          signal: controller.signal,
          status: voterStanceFilter !== "all" ? voterStanceFilter : null,
        });
      },
      searchTerm.trim() ? 250 : 0,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    fetchVotersPage,
    searchTerm,
    voterStanceFilter,
    selectedState,
    selectedLga,
    selectedWard,
    selectedPu,
  ]);
  // Manual clear cache handler for development & testing
  const handleClearAllPhotoCache = () => {
    const removedCount = clearAllImageCache();
    setRefinedPhoto(null);
    toast.success(`Cleared ${removedCount} cached voter photos! Next click fetches fresh.`);
  };

  const handlePhotoClick = async (voter: Voter) => {
    if (!voter.image) {
      toast.error("No photo available for this voter.");
      return;
    }
    setViewingVoter(voter);
    setPhotoViewerOpen(true);
    setShowOriginalComparison(false);

    // Show main image directly (ImageKit advancement commented out for now)
    setRefinedPhoto(voter.image);
    setIsRefiningPhoto(false);

    /*
    // ImageKit image advancement commented out for now
    // 1. Check local cache (5 days)
    const cached = getCachedImage(voter.id);
    if (cached) {
      console.log("⚡ [Image Cache Hit] Loaded voter image from localStorage cache (5-day TTL):", {
        voterId: voter.id,
        voterName: voter.name,
      });
      setRefinedPhoto(cached);
      return;
    }

    // 2. Show original Supabase photo immediately
    setRefinedPhoto(voter.image);
    setIsRefiningPhoto(true);

    // 3. Test ImageKit pipeline with diagnostic logging
    const imageKitUrl = buildImageKitUrl(voter.image);
    console.log("🖼️ [ImageKit Test Request]:", {
      voterId: voter.id,
      voterName: voter.name,
      originalSupabaseUrl: voter.image,
      generatedImageKitUrl: imageKitUrl,
    });

    let imageKitWorking = false;
    try {
      const probeRes = await fetch(imageKitUrl, { method: "HEAD", mode: "cors" });
      if (probeRes.ok) {
        imageKitWorking = true;
        console.log(
          `✅ [ImageKit Success] ImageKit returned HTTP ${probeRes.status} for voter ${voter.id}`,
        );
      } else {
        console.warn(
          `⚠️ [ImageKit Failed] HTTP ${probeRes.status}: ImageKit could not resolve this photo path.`,
          {
            url: imageKitUrl,
            status: probeRes.status,
          },
        );
        toast.error(`ImageKit unreachable (HTTP ${probeRes.status}). Using fallback scale.`);
      }
    } catch (probeErr) {
      console.warn("⚠️ [ImageKit Network/CORS Error]:", probeErr);
      toast.error("ImageKit failed. Using fallback scale.");
    }

    try {
      if (imageKitWorking) {
        // Use full AI resolution directly from ImageKit
        setRefinedPhoto(imageKitUrl);
        setCachedImage(voter.id, imageKitUrl, imageKitUrl);
      } else {
        // Fallback: local canvas rescale of original
        const enhanced = await enhanceImageViaCanvas(voter.image, 480, 640);
        setCachedImage(voter.id, enhanced, voter.image);
        setRefinedPhoto(enhanced);
      }
    } catch (e: any) {
      console.warn("Fallback error, showing original:", e);
      setRefinedPhoto(voter.image);
    } finally {
      setIsRefiningPhoto(false);
    }
    */
  };

  const handleReEnhancePhoto = async () => {
    if (!viewingVoter || !viewingVoter.image) return;
    // Show main image directly (ImageKit advancement commented out for now)
    setRefinedPhoto(viewingVoter.image);
    setIsRefiningPhoto(false);
    toast.success("Showing main photo");

    /*
    // ImageKit image advancement commented out for now
    setIsRefiningPhoto(true);
    try {
      const enhanced = await enhanceImageViaCanvas(viewingVoter.image, 480, 640);
      setCachedImage(viewingVoter.id, enhanced, viewingVoter.image);
      setRefinedPhoto(enhanced);
      toast.success("Photo re-enhanced & cached for 5 days!");
    } catch (e: any) {
      console.error("Re-enhance error:", e);
      toast.error("Could not enhance photo.");
    } finally {
      setIsRefiningPhoto(false);
    }
    */
  };

  // Name lookup cache for Ward and PU
  const [wardNames, setWardNames] = useState<Record<number, string>>({});
  const [puNames, setPuNames] = useState<Record<number, string>>({});

  // 1. Fetch LGAs for State/National Admin
  useEffect(() => {
    if (!user) return;
    const effectiveState = selectedState || (user.role === "state_admin" ? user.stateId : null);
    if (!effectiveState && user.role !== "national_admin") return;
    let query = supabase.from("local_governments").select("id, name");
    if (effectiveState) {
      query = query.eq("state_id", effectiveState);
    }
    query.order("name").then(({ data }) => {
      if (data) setLgas(data);
      else setLgas([]);
    });
  }, [user, selectedState]);

  // 2. Fetch Wards based on selected LGA or user's assigned LGA
  useEffect(() => {
    if (!user) return;
    const effectiveLga =
      selectedLga || (user.role === "lga_admin" || user.role === "ward_admin" ? user.lgaId : null);

    if (effectiveLga) {
      supabase
        .from("wards")
        .select("id, name, ward_number")
        .eq("localgovernment_id", effectiveLga)
        .then(({ data }) => {
          if (data) {
            const sortedWards = [...data].sort((a: any, b: any) => {
              const numA = parseInt(a.ward_number || "", 10);
              const numB = parseInt(b.ward_number || "", 10);
              if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
              return (a.name || "").localeCompare(b.name || "");
            });
            setWards(sortedWards);
            setWardNames((prev) => {
              const updated = { ...prev };
              sortedWards.forEach((w: any) => {
                updated[w.id] = w.name;
              });
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
    const effectiveWard = selectedWard || (user.role === "ward_admin" ? user.wardId : null);

    if (effectiveWard) {
      supabase
        .from("polling_units")
        .select("id, name, puId, no")
        .eq("ward_id", effectiveWard)
        .then(({ data }) => {
          if (data) {
            const sortedPus = [...data].sort((a: any, b: any) => {
              const noA = parseInt(a.no || (a.puId ? a.puId.split("-").pop() : "") || "", 10);
              const noB = parseInt(b.no || (b.puId ? b.puId.split("-").pop() : "") || "", 10);
              if (!isNaN(noA) && !isNaN(noB)) return noA - noB;
              return (a.name || "").localeCompare(b.name || "");
            });
            setPollingUnits(sortedPus);
            setPuNames((prev) => {
              const updated = { ...prev };
              sortedPus.forEach((p: any) => {
                updated[p.id] = p.name;
              });
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

    const missingWards = Array.from(
      new Set(
        voters
          .map((v) => v.wardId)
          .filter((id): id is number => typeof id === "number" && !wardNames[id]),
      ),
    );
    if (missingWards.length > 0) {
      supabase
        .from("wards")
        .select("id, name")
        .in("id", missingWards)
        .then(({ data }) => {
          if (data && data.length > 0) {
            setWardNames((prev) => {
              const next = { ...prev };
              data.forEach((w: any) => {
                next[w.id] = w.name;
              });
              return next;
            });
          }
        });
    }

    const missingPus = Array.from(
      new Set(
        voters
          .map((v) => v.puNumberId)
          .filter((id): id is number => typeof id === "number" && !puNames[id]),
      ),
    );
    if (missingPus.length > 0) {
      supabase
        .from("polling_units")
        .select("id, name")
        .in("id", missingPus)
        .then(({ data }) => {
          if (data && data.length > 0) {
            setPuNames((prev) => {
              const next = { ...prev };
              data.forEach((p: any) => {
                next[p.id] = p.name;
              });
              return next;
            });
          }
        });
    }
  }, [voters, wardNames, puNames]);

  // Filter change handlers
  const handleStateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value ? parseInt(e.target.value, 10) : null;
    setSelectedState(val);
    setSelectedLga(null);
    setSelectedWard(null);
    setSelectedPu(null);
    setVoterStateFilter(val);
    setVoterLgaFilter(null);
    setVoterWardFilter(null);
    setVoterPuFilter(null);
  };

  const handleLgaChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value ? parseInt(e.target.value, 10) : null;
    setSelectedLga(val);
    setSelectedWard(null);
    setSelectedPu(null);
    setVoterLgaFilter(val);
    setVoterWardFilter(null);
    setVoterPuFilter(null);
  };

  const handleWardChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value ? parseInt(e.target.value, 10) : null;
    setSelectedWard(val);
    setSelectedPu(null);
    setVoterWardFilter(val);
    setVoterPuFilter(null);
  };

  const handlePuChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value ? parseInt(e.target.value, 10) : null;
    setSelectedPu(val);
    setVoterPuFilter(val);
  };

  // Ensure currentVoter has resolved Ward and PU names in the details modal
  useEffect(() => {
    if (!selectedVoter) return;
    if (selectedVoter.wardId && !wardNames[selectedVoter.wardId]) {
      supabase
        .from("wards")
        .select("id, name")
        .eq("id", selectedVoter.wardId)
        .single()
        .then(({ data }) => {
          if (data) setWardNames((prev) => ({ ...prev, [data.id]: data.name }));
        });
    }
    if (selectedVoter.puNumberId && !puNames[selectedVoter.puNumberId]) {
      supabase
        .from("polling_units")
        .select("id, name")
        .eq("id", selectedVoter.puNumberId)
        .single()
        .then(({ data }) => {
          if (data) setPuNames((prev) => ({ ...prev, [data.id]: data.name }));
        });
    }
  }, [selectedVoter]);

  // Edit fields and notes view state
  const [selectedStatus, setSelectedStatus] = useState<Voter["status"] | null>(null);
  const [showNotesList, setShowNotesList] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // International phone formatter: 234... instead of 080.../070... (for WhatsApp & APIs)
  const formatPhone = (phone?: string) => {
    if (!phone) return "N/A";
    let clean = String(phone).replace(/\D/g, "");
    if (clean.startsWith("0") && clean.length === 11) {
      return "234" + clean.substring(1);
    } else if (!clean.startsWith("234") && clean.length === 10) {
      return "234" + clean;
    }
    return clean || phone;
  };

  // Domestic phone formatter: convert 2348... to 08... for standard Nigerian phone calls
  const formatCallPhone = (phone?: string) => {
    if (!phone) return "";
    let clean = String(phone).replace(/\D/g, "");
    if (clean.startsWith("234") && clean.length >= 12) {
      return "0" + clean.slice(3);
    }
    if (clean.startsWith("0")) {
      return clean;
    }
    if (clean.length === 10) {
      return "0" + clean;
    }
    return clean;
  };

  // High-visibility formatted phone: e.g. 0816 024 8732
  const formatDisplayPhone = (phone?: string) => {
    const local = formatCallPhone(phone);
    if (local.length === 11) {
      return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
    }
    return local || phone || "";
  };

  const getFirstName = (fullName?: string) => {
    if (!fullName) return "";
    const parts = fullName.trim().split(/\s+/);
    return parts[0] || "";
  };

  // Track voters known to NOT be on WhatsApp
  const [notOnWaSet, setNotOnWaSet] = useState<Set<string>>(new Set());

  // Track voters confirmed to BE on WhatsApp via API check or sent messages
  const [confirmedOnWaSet, setConfirmedOnWaSet] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem("eagleeye_confirmed_on_wa");
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  const markVoterConfirmedOnWa = (voterId: string | number, phone?: string) => {
    setConfirmedOnWaSet((prev) => {
      const next = new Set(prev);
      next.add(String(voterId));
      if (phone) next.add(formatPhone(phone));
      try {
        localStorage.setItem("eagleeye_confirmed_on_wa", JSON.stringify(Array.from(next)));
      } catch {}
      return next;
    });
  };

  const isVoterConfirmedOnWa = (voter: Voter) => {
    const p = formatPhone(voter.phone);
    return (
      confirmedOnWaSet.has(String(voter.id)) || (voter.phone ? confirmedOnWaSet.has(p) : false)
    );
  };

  useEffect(() => {
    // 1. Fetch voters verified NOT on WhatsApp
    supabase
      .from("whatsapp_outreach_queue")
      .select("voter_phone, voter_id")
      .eq("status", "not_on_whatsapp")
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
      .from("whatsapp_outreach_queue")
      .select("voter_id, voter_phone, status")
      .in("status", ["sent", "delivered", "read", "completed"])
      .then(({ data }) => {
        if (data && data.length > 0) {
          setConfirmedOnWaSet((prev) => {
            const next = new Set(prev);
            data.forEach((d: any) => {
              if (d.voter_id) next.add(String(d.voter_id));
              if (d.voter_phone) next.add(formatPhone(d.voter_phone));
            });
            try {
              localStorage.setItem("eagleeye_confirmed_on_wa", JSON.stringify(Array.from(next)));
            } catch {}
            return next;
          });
        }
      });

    // 3. Fetch voters who have active WhatsApp conversations
    supabase
      .from("whatsapp_conversations")
      .select("voter_id, voter_phone")
      .then(({ data }) => {
        if (data && data.length > 0) {
          setConfirmedOnWaSet((prev) => {
            const next = new Set(prev);
            data.forEach((d: any) => {
              if (d.voter_id) next.add(String(d.voter_id));
              if (d.voter_phone) next.add(formatPhone(d.voter_phone));
            });
            try {
              localStorage.setItem("eagleeye_confirmed_on_wa", JSON.stringify(Array.from(next)));
            } catch {}
            return next;
          });
        }
      });

    // 4. Fetch voters who have sent or received WhatsApp messages
    supabase
      .from("whatsapp_messages")
      .select("chat_id")
      .then(({ data }) => {
        if (data && data.length > 0) {
          setConfirmedOnWaSet((prev) => {
            const next = new Set(prev);
            data.forEach((d: any) => {
              if (d.chat_id) {
                const phoneOnly = d.chat_id.split("@")[0];
                next.add(phoneOnly);
                next.add(formatPhone(phoneOnly));
              }
            });
            try {
              localStorage.setItem("eagleeye_confirmed_on_wa", JSON.stringify(Array.from(next)));
            } catch {}
            return next;
          });
        }
      });
  }, []);

  const isVoterNotOnWa = (voter: Voter) => {
    if (isVoterConfirmedOnWa(voter)) return false;
    const p = formatPhone(voter.phone);
    return (
      notOnWaSet.has(String(voter.id)) ||
      (voter.phone ? notOnWaSet.has(p) || notOnWaSet.has(voter.phone) : false)
    );
  };

  // Agent Custom Outreach Message Template
  const defaultTemplate =
    "Hello {{voter_firstname}}! The time for real change and good governance is now. I am {{agent_firstname}}, reaching out directly from our ADC grassroots campaign here in {{ward_name}}. Together, we are building a state that works for every citizen—better jobs, quality healthcare, improved schools, and genuine security in our communities. Check out our candidate's official plan attached. Are you ready to make your vote count? Reply to join the movement!";

  const [customTemplate, setCustomTemplate] = useState<string>(() => {
    if (!user?.id) return "";
    const saved = localStorage.getItem(`eagleeye_agent_template_${user.id}`);
    if (saved && (saved.includes("Test message template") || saved.startsWith("Test message"))) {
      localStorage.removeItem(`eagleeye_agent_template_${user.id}`);
      return "";
    }
    return saved || "";
  });
  const [, setCustomFormat] = useState<"image_and_text" | "text_only">(() => {
    return (
      (user?.id && (localStorage.getItem(`eagleeye_agent_format_${user.id}`) as any)) ||
      "image_and_text"
    );
  });
  const [stateTemplate, setStateTemplate] = useState<string>("");
  const [stateConfig, setStateConfig] = useState<any>(null);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [tempTemplate, setTempTemplate] = useState("");
  const [tempFormat, setTempFormat] = useState<"image_and_text" | "text_only">("image_and_text");

  // Canvassed tracking & Reach/Stance filters
  const [voterReachFilter, setVoterReachFilter] = useState<
    "all" | "on_whatsapp" | "not_whatsapp" | "canvassed"
  >("all");
  const [canvassedSet, setCanvassedSet] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem("eagleeye_canvassed_voters");
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  const markVoterCanvassed = (voterId: string | number, phone?: string) => {
    setCanvassedSet((prev) => {
      const next = new Set(prev);
      next.add(String(voterId));
      if (phone) next.add(formatPhone(phone));
      try {
        localStorage.setItem("eagleeye_canvassed_voters", JSON.stringify(Array.from(next)));
      } catch {}
      return next;
    });
  };

  useEffect(() => {
    // Pre-load canvassed records from outreach queue where messages have been processed
    supabase
      .from("whatsapp_outreach_queue")
      .select("voter_id, voter_phone, status")
      .in("status", ["sent", "delivered", "read", "completed"])
      .then(({ data }) => {
        if (data && data.length > 0) {
          setCanvassedSet((prev) => {
            const next = new Set(prev);
            data.forEach((d: any) => {
              if (d.voter_id) next.add(String(d.voter_id));
              if (d.voter_phone) next.add(formatPhone(d.voter_phone));
            });
            try {
              localStorage.setItem("eagleeye_canvassed_voters", JSON.stringify(Array.from(next)));
            } catch {}
            return next;
          });
        }
      });
  }, []);

  // WhatsApp Send/Preview Confirmation Modal state
  const [confirmWaVoter, setConfirmWaVoter] = useState<Voter | null>(null);
  const [waModalMessage, setWaModalMessage] = useState<string>("");

  useEffect(() => {
    if (user?.stateId) {
      Promise.resolve(
        greenApiService.getConfig(user.stateId).then((cfg) => {
          if (cfg) {
            setStateConfig(cfg);
            if (cfg.default_message_template) {
              setStateTemplate(cfg.default_message_template);
            }
          }
        }),
      ).catch((error: unknown) => console.error("Async operation failed in Voters", error));
    }
  }, [user?.stateId]);

  const getFormattedOutreachMessage = (voterName: string, wardId?: number | null) => {
    let rawTpl = customTemplate.trim() || stateTemplate.trim() || defaultTemplate;
    if (rawTpl.includes("Test message template")) {
      rawTpl = defaultTemplate;
    }
    const wardName = (wardId && wardNames[wardId]) || "your Ward";
    const voterFirstName = getFirstName(voterName) || "Voter";
    const agentFirstName = (user as any)?.firstName || getFirstName(user?.name) || "Field Agent";

    return (
      rawTpl
        // First name tags
        .replace(/\{\{voter_firstt?name\}\}/gi, voterFirstName)
        .replace(/\{\{voter_first_name\}\}/gi, voterFirstName)
        .replace(/\{\{agent_firstt?name\}\}/gi, agentFirstName)
        .replace(/\{\{agent_first_name\}\}/gi, agentFirstName)
        // Full name tags
        .replace(/\{\{voter_name\}\}/gi, voterName || "Voter")
        .replace(/\{\{agent_name\}\}/gi, user?.name || "Field Agent")
        .replace(/\{\{ward_name\}\}/gi, wardName)
    );
  };

  const getWhatsAppLink = (
    phone: string,
    name: string,
    wardId?: number | null,
    overrideMsg?: string,
  ) => {
    const cleaned = formatPhone(phone);
    const message = overrideMsg || getFormattedOutreachMessage(name, wardId);
    return `https://wa.me/${cleaned}?text=${encodeURIComponent(message)}`;
  };

  // Call Voter & earn bounty
  const handleCallVoter = async (voter: Voter, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!voter.phone) return;
    const dialPhone = formatCallPhone(voter.phone);
    const earnAmount = Number(stateConfig?.earning_per_call ?? 20);

    Promise.resolve(logVoterContact(voter.id, "call")).catch((error: unknown) =>
      console.error("Async operation failed in Voters", error),
    );
    markVoterCanvassed(voter.id, voter.phone);

    // Trigger phone dialer using domestic Nigerian format: 081...
    window.location.href = `tel:${dialPhone}`;

    if (user?.id) {
      try {
        await supabase.functions.invoke("whatsapp-admin", {
          body: {
            action: "creditOutreachEarning",
            agentId: user.id,
            type: "call",
            voterId: voter.id,
            voterPhone: dialPhone,
            voterName: voter.name,
          },
        });
        toast.success(`Call logged! (+₦${earnAmount} earned)`);
      } catch (err) {
        console.error("Failed to credit call earning:", err);
      }
    }
  };

  // Sort & filter voters by search term, stance, and reach status
  const voterProgress = formatVoterProgress(votersPage, voterLoadedCount, voterTotalCount);
  const voterCountText = isLoadingVoters
    ? "Loading voters…"
    : voterLoadError
      ? "Count unavailable"
      : voterTotalCount === null
        ? `${voterProgress} voters · ${isLoadingVoterCount ? "counting total…" : "total unavailable"}`
        : `${voterProgress} voters`;

  const filteredVoters = voters
    .filter((v) => {
      // Reach Filter: All / On WhatsApp / Not on WhatsApp / Canvassed
      // Only returns voters whose WhatsApp presence has been verified via API
      if (voterReachFilter === "on_whatsapp") {
        return isVoterConfirmedOnWa(v);
      }
      if (voterReachFilter === "not_whatsapp") {
        return isVoterNotOnWa(v);
      }
      if (voterReachFilter === "canvassed") {
        const isCanvassed =
          canvassedSet.has(String(v.id)) ||
          Boolean(v.phone && canvassedSet.has(formatPhone(v.phone))) ||
          Boolean(v.contact_logs && v.contact_logs.length > 0) ||
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
      return (a.name || "").localeCompare(b.name || "");
    });

  const currentVoter = selectedVoter
    ? voters.find((v) => String(v.id) === String(selectedVoter.id)) || selectedVoter
    : null;

  const handleSelectVoter = (voter: Voter) => {
    setSelectedVoter(voter);
    setSelectedStatus(voter.status);
    setNoteText("");
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
          agentId: user?.id || "unknown",
          agentName: user?.name || "Unknown Agent",
          createdAt: new Date().toISOString(),
        };
        updates.notes = [...(currentVoter.notes || []), newNote];
      }

      if (Object.keys(updates).length > 0) {
        await updateVoterDetails(currentVoter.id, updates);
        setNoteText("");
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
      Promise.resolve(
        greenApiService.getAgentInstance(user.id).then((inst) => {
          setHasWaInstance(inst?.wa_state === "authorized");
        }),
      ).catch((error: unknown) => console.error("Async operation failed in Voters", error));
    }
  }, [user?.id]);

  const handleOpenWaModal = (voter: Voter, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setConfirmWaVoter(voter);
    setWaModalMessage(getFormattedOutreachMessage(voter.name, voter.wardId));
  };

  const handleDirectSendFlyer = async (voter: Voter, customMsgText?: string) => {
    if (!user) return;
    if (!voter.phone) {
      toast.error("Voter has no phone number");
      return;
    }

    const formattedMessage = customMsgText || getFormattedOutreachMessage(voter.name, voter.wardId);
    const cleanPhone = formatPhone(voter.phone);
    const manualWaBounty = Number(stateConfig?.earning_per_manual_wa || 15);

    // If agent WhatsApp instance is not connected/authorized, open wa.me on phone & award manual WA earning
    if (!hasWaInstance) {
      Promise.resolve(logVoterContact(voter.id, "whatsapp")).catch((error: unknown) =>
        console.error("Async operation failed in Voters", error),
      );
      markVoterCanvassed(voter.id, voter.phone);
      markVoterConfirmedOnWa(voter.id, voter.phone);

      const waUrl = getWhatsAppLink(voter.phone, voter.name, voter.wardId, formattedMessage);
      window.open(waUrl, "_blank");

      try {
        const numericVoterId = voter.id ? parseInt(String(voter.id).replace(/\D/g, ""), 10) : null;
        await supabase.functions.invoke("whatsapp-admin", {
          body: {
            action: "creditOutreachEarning",
            agentId: user.id,
            type: "manual_wa",
            voterId: Number.isFinite(numericVoterId) ? numericVoterId : null,
            voterPhone: cleanPhone,
            voterName: voter.name,
          },
        });
        toast.success(`WhatsApp link opened! (+₦${manualWaBounty} earned)`);
      } catch (e) {
        console.error("Failed to credit manual wa earning:", e);
      }
      return;
    }

    setSendingVoterId(voter.id);
    const toastId = toast.loading(`Sending campaign outreach to ${voter.name}...`);
    try {
      const res = await greenApiService.sendFlyer(
        user.id,
        cleanPhone,
        voter.name,
        voter.id,
        formattedMessage,
      );
      if (res?.notOnWhatsapp) {
        toast.error(`${voter.name} is not registered on WhatsApp`, { id: toastId });
        setNotOnWaSet((prev) => {
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
        setNotOnWaSet((prev) => {
          const next = new Set(prev);
          next.delete(String(voter.id));
          next.delete(cleanPhone);
          if (voter.phone) next.delete(voter.phone);
          return next;
        });
        Promise.resolve(logVoterContact(voter.id, "whatsapp")).catch((error: unknown) =>
          console.error("Async operation failed in Voters", error),
        );
        markVoterCanvassed(voter.id, voter.phone);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to dispatch WhatsApp flyer", { id: toastId });
    } finally {
      setSendingVoterId(null);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "ADC Supporter":
        return "bg-green-100 text-green-800 border-green-200";
      case "Opposition":
        return "bg-red-100 text-red-800 border-red-200";
      case "Undecided":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "Unreachable":
        return "bg-gray-100 text-gray-800 border-gray-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  return (
    <div className="h-full flex flex-col relative">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Voter Register</h1>
          <p className="text-gray-500 dark:text-gray-400">
            Manage and update voter canvassing status
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
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
              <span
                className="w-2 h-2 rounded-full bg-emerald-500"
                title="Personalized template active"
              />
            )}
          </button>
          {import.meta.env.DEV && (
            <button
              type="button"
              onClick={handleClearAllPhotoCache}
              className="px-3.5 py-2 bg-white dark:bg-gray-800 border border-red-300 text-red-600 hover:bg-red-50 text-xs font-semibold rounded-lg flex items-center gap-2 shadow-xs transition cursor-pointer"
              title="Clear all cached voter photos from localStorage (dev only)"
            >
              <Trash2 size={15} />
              <span>Clear Cache</span>
            </button>
          )}
        </div>
      </div>

      {/* Jurisdiction Filters (LGA, Ward, PU) */}
      {user?.role !== "pu_agent" && (
        <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-gray-200 shadow-xs mb-4">
          <div className="flex items-center gap-2 mb-2.5 pb-2 border-b border-gray-100 flex-wrap justify-between">
            <div className="flex items-center gap-2">
              <MapPin size={15} className="text-[#004d25]" />
              <span className="text-xs font-bold text-gray-800 uppercase tracking-wider">
                Jurisdiction Filters
              </span>
            </div>
            {voterTotalCount !== null && voterTotalCount > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-[#004d25] border border-emerald-200 shadow-2xs">
                <Users size={12} />
                <span>
                  {selectedPu
                    ? `PU Total: ${voterCountText}`
                    : selectedWard
                      ? `Ward Total: ${voterCountText}`
                      : selectedLga
                        ? `LGA Total: ${voterCountText}`
                        : `State Total: ${voterCountText}`}
                </span>
              </span>
            )}
          </div>
          <div
            className={cn(
              "grid gap-3",
              user?.role === "national_admin"
                ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
                : "grid-cols-1 sm:grid-cols-3",
            )}
          >
            {/* State Filter (National Admin) */}
            {user?.role === "national_admin" && (
              <div>
                <label className="block text-[11px] font-semibold text-gray-600 mb-1">State</label>
                <select
                  value={selectedState || ""}
                  onChange={handleStateChange}
                  className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-700 bg-white focus:ring-2 focus:ring-[#004d25] focus:outline-none cursor-pointer"
                >
                  <option value="">All States</option>
                  {states.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* LGA Filter (State & National Admins) */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[11px] font-semibold text-gray-600">
                  Local Government (LGA)
                </label>
              </div>
              {user?.role === "national_admin" || user?.role === "state_admin" ? (
                <select
                  value={selectedLga || ""}
                  onChange={handleLgaChange}
                  className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-700 bg-white focus:ring-2 focus:ring-[#004d25] focus:outline-none"
                >
                  <option value="">All LGAs</option>
                  {lgas.map((lga) => (
                    <option key={lga.id} value={lga.id}>
                      {lga.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  disabled
                  value={user?.locationName || "Assigned LGA"}
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-500 bg-gray-50 cursor-not-allowed"
                />
              )}
              {selectedLga && !selectedWard && (
                <span className="mt-1.5 inline-flex text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                  {voterCountText}
                </span>
              )}
            </div>

            {/* Ward Filter */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[11px] font-semibold text-gray-600">Ward</label>
              </div>
              {user?.role === "ward_admin" ? (
                <input
                  type="text"
                  disabled
                  value={user?.locationName || "Assigned Ward"}
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-500 bg-gray-50 cursor-not-allowed"
                />
              ) : (
                <select
                  value={selectedWard || ""}
                  onChange={handleWardChange}
                  disabled={!selectedLga && user?.role !== "lga_admin"}
                  className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-700 bg-white focus:ring-2 focus:ring-[#004d25] focus:outline-none disabled:bg-gray-50 disabled:text-gray-400"
                >
                  <option value="">All Wards</option>
                  {wards.map((ward) => {
                    const wardNo = ward.ward_number
                      ? `${String(ward.ward_number).padStart(2, "0")} - `
                      : "";
                    return (
                      <option key={ward.id} value={ward.id}>
                        {wardNo}
                        {ward.name}
                      </option>
                    );
                  })}
                </select>
              )}
              {selectedWard && !selectedPu && (
                <span className="mt-1.5 inline-flex text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                  {voterCountText}
                </span>
              )}
            </div>

            {/* Polling Unit Filter */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[11px] font-semibold text-gray-600">
                  Polling Unit (PU)
                </label>
              </div>
              <select
                value={selectedPu || ""}
                onChange={handlePuChange}
                disabled={!selectedWard && user?.role !== "ward_admin"}
                className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-700 bg-white focus:ring-2 focus:ring-[#004d25] focus:outline-none disabled:bg-gray-50 disabled:text-gray-400"
              >
                <option value="">All Polling Units</option>
                {pollingUnits.map((pu) => {
                  const puNo = pu.no
                    ? String(pu.no).padStart(3, "0")
                    : pu.puId
                      ? pu.puId.split("-").pop()
                      : "";
                  const puLabel = puNo ? `${puNo} - ${pu.name}` : pu.name;
                  return (
                    <option key={pu.id} value={pu.id}>
                      {puLabel}
                    </option>
                  );
                })}
              </select>
              {selectedPu && (
                <span className="mt-1.5 inline-flex text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                  {voterCountText}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      <p className="mb-3 text-sm font-medium text-gray-700" role="status" aria-live="polite">
        {voterCountText}
        {voterCountError && !isLoadingVoters && !isLoadingVoterCount && (
          <button
            type="button"
            className="ml-2 text-xs text-[#004d25] underline cursor-pointer"
            onClick={() =>
              void fetchVotersPage(votersPage, {
                stateId: selectedState,
                lgaId: selectedLga,
                wardId: selectedWard,
                puId: selectedPu,
                puid: pollingUnits.find((pu) => pu.id === selectedPu)?.puId || null,
                searchTerm: searchTerm.trim() || null,
                status: voterStanceFilter !== "all" ? voterStanceFilter : null,
              })
            }
          >
            Retry total
          </button>
        )}
      </p>

      {/* Search Bar & Reach/Stance Filters */}
      <div className="flex flex-col lg:flex-row gap-2.5 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Search by Name or Phone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-32 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#004d25] focus:border-transparent text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          />
          {/* Subtle Latency HUD in search input */}
          <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center pointer-events-none">
            {isLoadingVoters ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-mono font-medium text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded">
                <Loader2 size={11} className="animate-spin text-emerald-600" />
                <span>searching...</span>
              </span>
            ) : voterSearchLatencyMs !== null ? (
              <span
                className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/50 px-2 py-0.5 rounded shadow-2xs"
                title="Time to load this voter page; the total is counted separately"
              >
                <Zap size={11} className="text-emerald-600 fill-emerald-600" />
                <span>result in {voterSearchLatencyMs} ms</span>
              </span>
            ) : null}
          </div>
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
          {isLoadingVoters ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[340px] text-center p-8">
              <div className="w-14 h-14 bg-emerald-50 rounded-full flex items-center justify-center text-[#004d25] mb-4">
                <Loader2 size={32} className="animate-spin text-[#004d25]" />
              </div>
              <h3 className="text-base font-semibold text-gray-900 mb-1">
                Loading Voter Records...
              </h3>
              <p className="text-xs text-gray-500 max-w-sm">
                Fetching voter data for your jurisdiction. Please wait a moment.
              </p>
            </div>
          ) : voterLoadError ? (
            <div
              className="flex flex-col items-center justify-center min-h-[300px] text-center p-8"
              role="alert"
            >
              <h3 className="text-lg font-medium text-gray-900 mb-2">Please try again</h3>
              <p className="text-sm text-gray-600 max-w-md">{voterLoadError.message}</p>
              <button
                type="button"
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#004d25] px-4 py-2 text-sm font-semibold text-white cursor-pointer"
                onClick={() =>
                  void fetchVotersPage(voterLoadError.page, {
                    stateId: selectedState,
                    lgaId: selectedLga,
                    wardId: selectedWard,
                    puId: selectedPu,
                    puid: pollingUnits.find((pu) => pu.id === selectedPu)?.puId || null,
                    searchTerm: searchTerm.trim() || null,
                    status: voterStanceFilter !== "all" ? voterStanceFilter : null,
                  })
                }
              >
                <RefreshCw size={16} /> Try again
              </button>
            </div>
          ) : filteredVoters.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-center p-8">
              <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center text-gray-300 mb-4">
                <UserCircle size={32} />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-1">No voters found</h3>
              <p className="text-gray-500">
                No voters match the selected filters. Try a different name or adjust the filters.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {filteredVoters.map((voter) => {
                return (
                  <li
                    key={voter.id}
                    onClick={() => handleSelectVoter(voter)}
                    className="p-4 hover:bg-gray-50 cursor-pointer flex items-center justify-between transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-gray-400 overflow-hidden">
                        {voter.image ? (
                          <img
                            src={voter.image}
                            alt={voter.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <UserCircle size={24} />
                        )}
                      </div>
                      <div>
                        <h4 className="font-semibold text-gray-900">{voter.name}</h4>
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className="text-xs text-gray-500 font-mono">
                            {formatPhone(voter.phone)}
                          </p>
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
                      {voter.status && voter.status !== "Undecided" && (
                        <span
                          className={cn(
                            "px-2.5 py-1 rounded-full text-xs font-medium border whitespace-nowrap",
                            getStatusColor(voter.status),
                          )}
                        >
                          {voter.status}
                        </span>
                      )}

                      {/* Action Icons: Aligned to Far Right */}
                      <div
                        className="flex items-center gap-1.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {/* Register Voter as Agent (State & National Admins only) */}
                        {isNationalOrStateAdmin && (
                          <button
                            type="button"
                            title={`Register ${voter.name} as Agent`}
                            onClick={(e) => handleOpenRegisterAsAgent(voter, e)}
                            className="p-1.5 rounded-full hover:bg-emerald-50 text-emerald-700 dark:text-emerald-400 transition-colors cursor-pointer"
                          >
                            <UserPlus size={18} />
                          </button>
                        )}

                        {voter.phone && (
                          <>
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
                                    : "hover:bg-green-50 text-green-600",
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
                          </>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="p-4 border-t border-gray-100 text-sm text-gray-500 bg-gray-50 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="font-medium text-gray-700 flex items-center gap-2">
            <span>{voterCountText}</span>
            {voterSearchLatencyMs !== null && (
              <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                <Zap size={11} className="text-emerald-600 fill-emerald-600" />
                <span>{voterSearchLatencyMs} ms</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                void fetchVotersPage(votersPage - 1, {
                  stateId: selectedState,
                  lgaId: selectedLga,
                  wardId: selectedWard,
                  puId: selectedPu,
                  puid: pollingUnits.find((pu) => pu.id === selectedPu)?.puId || null,
                  searchTerm: searchTerm.trim() || null,
                  status: voterStanceFilter !== "all" ? voterStanceFilter : null,
                });
              }}
              disabled={votersPage === 1 || isLoadingVoters || Boolean(voterLoadError)}
              className="p-1.5 border border-gray-300 rounded hover:bg-white disabled:opacity-50 transition-colors"
              title="Previous Page"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="font-medium text-gray-700 bg-white px-3 py-1 rounded border border-gray-200">
              Page {votersPage}
            </span>
            <button
              onClick={() => {
                void fetchVotersPage(votersPage + 1, {
                  stateId: selectedState,
                  lgaId: selectedLga,
                  wardId: selectedWard,
                  puId: selectedPu,
                  puid: pollingUnits.find((pu) => pu.id === selectedPu)?.puId || null,
                  searchTerm: searchTerm.trim() || null,
                  status: voterStanceFilter !== "all" ? voterStanceFilter : null,
                });
              }}
              disabled={!voterHasNextPage || isLoadingVoters || Boolean(voterLoadError)}
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
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm transition-opacity"
            onClick={() => setSelectedVoter(null)}
          />
          <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col transform transition-transform duration-300 translate-x-0">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-[#004d25] text-white">
              <h3 className="font-bold text-lg">Voter Details</h3>
              <button
                onClick={() => setSelectedVoter(null)}
                className="p-1 hover:bg-[#006331] rounded-full"
              >
                <X size={24} />
              </button>
            </div>

            <div className="p-6 flex-1 overflow-y-auto">
              <div className="text-center mb-6">
                {(() => {
                  const displayImg = currentVoter?.image;
                  return (
                    <div className="flex flex-col items-center">
                      <div
                        onClick={() => handlePhotoClick(currentVoter)}
                        className={cn(
                          "relative group w-24 h-24 rounded-full mx-auto mb-2 overflow-hidden ring-4 transition shadow-md bg-gray-100 flex items-center justify-center",
                          currentVoter.image
                            ? "cursor-pointer ring-emerald-500/25 hover:ring-emerald-600 hover:scale-105"
                            : "ring-gray-200",
                        )}
                        title={currentVoter.image ? "Click to view photo" : "No photo available"}
                      >
                        {displayImg ? (
                          <img
                            src={displayImg}
                            alt={currentVoter.name}
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                          />
                        ) : (
                          <UserCircle size={56} className="text-gray-400" />
                        )}
                      </div>

                      {currentVoter.image && (
                        <button
                          type="button"
                          onClick={() => handlePhotoClick(currentVoter)}
                          className="inline-flex items-center px-3 py-1 text-xs font-semibold rounded-full border transition cursor-pointer mb-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300"
                          title="View photo"
                        >
                          <span>View Photo</span>
                        </button>
                      )}
                    </div>
                  );
                })()}
                <h2 className="text-2xl font-bold text-gray-900">{currentVoter.name}</h2>
                {currentVoter.phone ? (
                  <div className="mt-2.5 inline-flex items-center justify-center gap-2 px-4 py-1.5 bg-emerald-50 border border-emerald-200 rounded-full shadow-xs">
                    <Phone size={16} className="text-emerald-700 shrink-0" />
                    <span className="text-lg sm:text-xl font-extrabold text-[#004d25] tracking-wider font-mono">
                      {formatDisplayPhone(currentVoter.phone)}
                    </span>
                    {isVoterNotOnWa(currentVoter) && (
                      <span className="text-[10px] font-bold text-amber-800 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-full uppercase tracking-wider">
                        No WA
                      </span>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 italic mt-1">No phone number</p>
                )}
              </div>

              <div className="space-y-4">
                {/* Official Campaign Outreach Box */}
                {currentVoter.phone && (
                  <div
                    className={cn(
                      "p-4 border rounded-2xl space-y-3",
                      isVoterNotOnWa(currentVoter)
                        ? "bg-amber-50/70 border-amber-200 text-amber-900"
                        : "bg-emerald-50/70 border-emerald-200 text-emerald-900",
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                        <MessageSquare
                          size={14}
                          className={
                            isVoterNotOnWa(currentVoter) ? "text-amber-700" : "text-emerald-700"
                          }
                        />
                        Campaign Outreach
                      </span>
                      <span className="text-[11px] bg-emerald-100 text-emerald-800 font-bold px-2.5 py-0.5 rounded-full">
                        +₦
                        {hasWaInstance
                          ? stateConfig?.earning_per_chat || 50
                          : stateConfig?.earning_per_manual_wa || 15}{" "}
                        Earned
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <button
                        type="button"
                        disabled={sendingVoterId === currentVoter.id}
                        onClick={() => handleOpenWaModal(currentVoter)}
                        className={cn(
                          "w-full py-3.5 px-4 text-white text-sm sm:text-base font-bold rounded-xl shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-98 disabled:opacity-60",
                          isVoterNotOnWa(currentVoter)
                            ? "bg-amber-600 hover:bg-amber-700"
                            : "bg-[#25D366] hover:bg-[#20ba59] shadow-emerald-500/20",
                        )}
                        title="WhatsApp chat with voter"
                      >
                        <MessageCircle size={20} className="shrink-0" />
                        <span>WhatsApp</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleCallVoter(currentVoter)}
                        className="w-full py-3.5 px-4 bg-[#004d25] hover:bg-[#006331] text-white text-sm sm:text-base font-bold rounded-xl shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-98 shadow-green-950/20"
                        title={`Call ${formatDisplayPhone(currentVoter.phone)} directly`}
                      >
                        <Phone size={20} className="shrink-0" />
                        <span>Call</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Register Voter as Agent Action (State & National Admins only) */}
                {isNationalOrStateAdmin && (
                  <div>
                    <button
                      type="button"
                      onClick={() => handleOpenRegisterAsAgent(currentVoter)}
                      className="w-full py-3 px-4 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-bold rounded-xl shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-98 shadow-emerald-700/20"
                      title="Register this voter as an election agent"
                    >
                      <UserPlus size={18} className="shrink-0" />
                      <span>Register Voter as Agent</span>
                    </button>
                  </div>
                )}

                <div>
                  <h4 className="font-semibold text-gray-900 mb-3">Update Status</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {(["ADC Supporter", "Opposition", "Undecided", "Unreachable"] as const).map(
                      (status) => (
                        <button
                          key={status}
                          onClick={() => setSelectedStatus(status)}
                          className={cn(
                            "p-3 rounded-lg border text-sm font-medium flex items-center justify-between transition-all cursor-pointer",
                            selectedStatus === status
                              ? getStatusColor(status) + " ring-2 ring-offset-1"
                              : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50",
                          )}
                        >
                          {status}
                          {selectedStatus === status && <Check size={16} />}
                        </button>
                      ),
                    )}
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
                  setNoteText("");
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
                Customize the message that will be sent to voters alongside your candidate campaign
                flyer, or prefilled in WhatsApp (wa.me) links.
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
                  <option value="image_and_text">
                    Image & Text (Candidate Campaign Flyer + Message)
                  </option>
                  <option value="text_only">Text Message Only (Direct Message)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  Insert Dynamic Placeholder Chips
                </label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: "Voter First Name", tag: "{{voter_firstname}}" },
                    { label: "Agent First Name", tag: "{{agent_firstname}}" },
                    { label: "Ward Name", tag: "{{ward_name}}" },
                    { label: "Voter Full Name", tag: "{{voter_name}}" },
                    { label: "Agent Full Name", tag: "{{agent_name}}" },
                  ].map((chip) => (
                    <button
                      key={chip.tag}
                      type="button"
                      onClick={() => setTempTemplate((prev) => `${prev} ${chip.tag}`.trim())}
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
                  Live Preview {tempFormat === "image_and_text" && "• Attached to Campaign Flyer"}
                </span>

                {tempFormat === "image_and_text" && stateConfig?.default_flyer_url && (
                  <div className="flex items-center gap-3 p-2 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
                    <img
                      src={stateConfig.default_flyer_url}
                      alt="Campaign Flyer"
                      className="w-16 h-16 object-cover rounded-md border border-gray-200 shrink-0"
                    />
                    <div className="text-xs text-gray-500 space-y-0.5">
                      <p className="font-semibold text-gray-800 dark:text-gray-200">
                        Official State Campaign Flyer
                      </p>
                      <p className="text-[11px] text-gray-500">
                        Will be sent as the header image with your message below as the caption.
                      </p>
                    </div>
                  </div>
                )}

                <p className="text-xs text-gray-800 dark:text-gray-200 italic whitespace-pre-wrap bg-white dark:bg-gray-900 p-2.5 rounded-lg border border-gray-100 dark:border-gray-800">
                  {tempTemplate
                    .replace(/\{\{voter_firstt?name\}\}/gi, "Adewale")
                    .replace(/\{\{voter_first_name\}\}/gi, "Adewale")
                    .replace(
                      /\{\{agent_firstt?name\}\}/gi,
                      (user as any)?.firstName || getFirstName(user?.name) || "Musa",
                    )
                    .replace(
                      /\{\{agent_first_name\}\}/gi,
                      (user as any)?.firstName || getFirstName(user?.name) || "Musa",
                    )
                    .replace(/\{\{voter_name\}\}/gi, "Adewale Johnson")
                    .replace(/\{\{agent_name\}\}/gi, user?.name || "Agent Musa")
                    .replace(/\{\{ward_name\}\}/gi, "Ward 01 (Central)") ||
                    "(Type your message template above to see live preview)"}
                </p>
              </div>
            </div>

            <div className="px-5 py-3.5 bg-gray-50 dark:bg-gray-800/40 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  setTempTemplate(stateTemplate || defaultTemplate);
                  setTempFormat("image_and_text");
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
                    toast.success("Outreach message template updated!");
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
                  <span className="text-[10px] text-gray-400 uppercase font-semibold block">
                    Target Voter
                  </span>
                  <p className="text-sm font-bold text-gray-900 dark:text-white">
                    {confirmWaVoter.name}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-gray-400 uppercase font-semibold block">
                    Phone Number
                  </span>
                  <p className="text-xs font-mono font-bold text-gray-900 dark:text-white">
                    {formatPhone(confirmWaVoter.phone)}
                  </p>
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
                          ? "This flyer image will be delivered directly with the message below as its caption."
                          : "Notice: WhatsApp line not connected. Opening WhatsApp directly on your phone (wa.me) transfers text message only (URL protocol cannot auto-attach media)."}
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
                    {hasWaInstance
                      ? "Official Campaign WhatsApp Instance Active"
                      : "Direct Phone WhatsApp (wa.me)"}
                  </p>
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-300">
                    {hasWaInstance
                      ? "Dispatches candidate flyer with personalized caption directly from your assigned line."
                      : "Opens WhatsApp on your device with this prefilled message."}
                  </p>
                </div>
                <span className="text-xs bg-emerald-200/80 dark:bg-emerald-900 text-emerald-900 dark:text-emerald-100 font-bold px-2.5 py-1 rounded-full shrink-0">
                  +₦
                  {hasWaInstance
                    ? stateConfig?.earning_per_chat || 50
                    : stateConfig?.earning_per_manual_wa || 15}
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
                        : `WhatsApp (+₦${stateConfig?.earning_per_manual_wa || 15})`}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 480px x 640px AI Refined Photo Viewer Modal */}
      {photoViewerOpen && viewingVoter && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden border border-gray-100 dark:border-gray-800 flex flex-col">
            {/* Header */}
            <div className="px-4 py-2.5 flex items-center justify-end">
              <button
                onClick={() => setPhotoViewerOpen(false)}
                className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full text-gray-500 hover:text-gray-900 dark:hover:text-white transition cursor-pointer"
                title="Close"
              >
                <X size={20} />
              </button>
            </div>

            {/* Photo Canvas Area (Fixed 480x640 portrait aspect ratio 3:4) */}
            <div className="p-4 sm:p-6 flex flex-col items-center bg-gray-50 dark:bg-gray-950">
              <div className="relative w-[270px] h-[360px] sm:w-[300px] sm:h-[400px] rounded-xl overflow-hidden shadow-xl border-2 border-emerald-500/30 bg-black flex items-center justify-center">
                {isRefiningPhoto ? (
                  <div className="flex flex-col items-center justify-center p-6 text-center text-white space-y-3">
                    <Loader2 size={36} className="animate-spin text-emerald-400" />
                    <p className="text-xs font-semibold text-emerald-100">Enhancing photo...</p>
                  </div>
                ) : (
                  <>
                    <img
                      src={
                        showOriginalComparison
                          ? viewingVoter.image
                          : refinedPhoto || viewingVoter.image
                      }
                      alt={viewingVoter.name}
                      className="w-full h-full object-cover transition duration-300"
                    />
                    {showOriginalComparison && (
                      <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-bold shadow-sm backdrop-blur-md flex items-center gap-1 bg-black/60 text-white">
                        <span>Original Low-Res</span>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Voter metadata pill */}
              <div className="mt-3 text-center">
                <h4 className="font-bold text-sm text-gray-900 dark:text-white">
                  {viewingVoter.name}
                </h4>
                <p className="text-xs text-gray-500 font-mono mt-0.5">
                  {viewingVoter.puId || viewingVoter.vin || "INEC Voter"}
                </p>
              </div>
            </div>

            {/* Actions Bar */}
            <div className="px-5 py-3.5 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between gap-2">
              <button
                type="button"
                onMouseDown={() => setShowOriginalComparison(true)}
                onMouseUp={() => setShowOriginalComparison(false)}
                onTouchStart={() => setShowOriginalComparison(true)}
                onTouchEnd={() => setShowOriginalComparison(false)}
                disabled={isRefiningPhoto}
                className="px-3 py-2 text-xs font-semibold text-gray-700 dark:text-gray-200 bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center gap-1.5 cursor-pointer select-none transition disabled:opacity-50"
                title="Hold to preview original photo"
              >
                <Eye size={14} />
                <span>Hold to Compare</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleReEnhancePhoto}
                  disabled={isRefiningPhoto}
                  className="px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 border border-emerald-300 rounded-lg flex items-center gap-1.5 cursor-pointer transition disabled:opacity-50"
                  title="Run enhancement pass again"
                >
                  <RefreshCw size={14} className={isRefiningPhoto ? "animate-spin" : ""} />
                  <span>Re-Refine</span>
                </button>

                {refinedPhoto && (
                  <a
                    href={refinedPhoto}
                    download={`voter_${(viewingVoter.name || "photo").replace(/\s+/g, "_")}_480x640.jpg`}
                    className="px-3.5 py-2 text-xs font-semibold text-white bg-[#004d25] hover:bg-[#006331] rounded-lg shadow-xs flex items-center gap-1.5 cursor-pointer transition"
                    title="Download 480x640 portrait"
                  >
                    <Download size={14} />
                    <span>Download</span>
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Register Voter as Agent Modal */}
      {isNationalOrStateAdmin && user && (
        <AgentModal
          isOpen={showRegisterAgentModal}
          onClose={() => {
            setShowRegisterAgentModal(false);
            setAgentInitialData(null);
          }}
          onSave={handleSaveAgentFromVoter}
          initialData={registerAgentInitialData || undefined}
          userRole={user.role}
        />
      )}
    </div>
  );
}
