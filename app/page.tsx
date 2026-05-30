"use client";
import React, { useState, useEffect, useRef } from 'react';
import { 
  Trophy, ChevronRight, PlayCircle, 
  FileText, RotateCcw, ArrowLeft, Lock, 
  X, Sparkles, Users, Download, 
  MegaphoneOff, PlusCircle, LogOut,
  Medal, History, Settings, Upload, Image as ImageIcon,
  Calendar, CheckCircle2, Edit3, Save, Share2
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '@/lib/supabase';

// --- INTERFACES ---
interface PlayerStats {
  name: string;
  played: number;
  points: number;
  wins: number;
  ties: number;
  losses: number;
}

interface SavedTournament {
  id: string;
  date: string;
  sport: string;
  winner: string;
  results: PlayerStats[];
  user_id?: string;
  event_date?: string;
  sport_type?: string;
  tournament_name?: string;
  player_count?: number;
  target_points?: number;
  leaderboard?: PlayerStats[];
  round_history?: RoundHistoryItem[];
}

interface MatchRecord {
  id: number;
  round: number;
  teamA: string[];
  teamB: string[];
  scoreA: string | number;
  scoreB: string | number;
}

interface RoundHistoryItem {
  round: number;
  matches: MatchRecord[];
}

export default function PadelAmericano() {
  // --- AUTH & SUBSCRIPTION STATE ---
  const [user, setUser] = useState<any>(null);
  const [isPremium, setIsPremium] = useState(false);
  const [customLogo, setCustomLogo] = useState<string | null>(null); 
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isUploading, setIsUploading] = useState(false); 
  const [showSettings, setShowSettings] = useState(false);

  // --- TOURNAMENT STATE ---
  const [step, setStep] = useState(1);
  // 1: Home/History, 2: Roster, 3: Match, 4: Results
  const [showHistory, setShowHistory] = useState(false);
  const [pastTournaments, setPastTournaments] = useState<SavedTournament[]>([]);
  const [round, setRound] = useState(1);
  const [sportType, setSportType] = useState<'Padel' | 'Pickleball'>('Padel');
  const [tournamentFormat, setTournamentFormat] = useState<'Americano' | 'Mexicano'>('Americano');
  const [playerCount, setPlayerCount] = useState(8);
  const [targetPoints, setTargetPoints] = useState(16);
  const [playerNames, setPlayerNames] = useState<string[]>(Array(16).fill(""));
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [roundHistory, setRoundHistory] = useState<RoundHistoryItem[]>([]); 
  const [leaderboard, setLeaderboard] = useState<PlayerStats[]>([]);
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'error'} | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [tournamentDate, setTournamentDate] = useState<string>("");
  const [isEditingHistory, setIsEditingHistory] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isReadOnlyShare, setIsReadOnlyShare] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const maxRounds = playerCount - 1;

  // --- CHECK FOR SHARED TOURNAMENT LINK & AUTH + RESTORE DRAFT ---
  useEffect(() => {
    const handleIncomingShareAndAuth = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const sharedTournamentId = urlParams.get('t');

      if (sharedTournamentId) {
        setIsLoadingAuth(true);
        try {
          const { data, error } = await supabase
            .from('tournament_history')
            .select('*')
            .eq('id', sharedTournamentId)
            .single();

          if (data) {
            const t = data as any;
            setLeaderboard(t.leaderboard || []); 
            setTournamentDate(t.event_date ? new Date(t.event_date).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' }) : ""); 
            setSportType(t.sport_type || 'Padel');
            setTournamentFormat(t.tournament_name || 'Americano');
            setPlayerCount(t.player_count || 8);
            setTargetPoints(t.target_points || 16);
            setRoundHistory(t.round_history || []);
            setRound((t.player_count || 8) - 1);
            setIsReadOnlyShare(true);
            setStep(4);
            setIsLoadingAuth(false);
            return;
          }
        } catch (err) {
          console.error("Failed to load shared tournament", err);
        }
      }

      try {
        const savedDraft = localStorage.getItem('padel_tournament_draft');
        if (savedDraft) {
          const draft = JSON.parse(savedDraft);
          if (draft.step > 1) {
            setStep(draft.step);
            setRound(draft.round);
            setSportType(draft.sportType);
            setTournamentFormat(draft.tournamentFormat);
            setPlayerCount(draft.playerCount);
            setTargetPoints(draft.targetPoints);
            setPlayerNames(draft.playerNames);
            setMatches(draft.matches);
            setRoundHistory(draft.roundHistory);
            setLeaderboard(draft.leaderboard);
            setTournamentDate(draft.tournamentDate);
            setIsEditingHistory(draft.isEditingHistory || false);
          }
        }
      } catch (e) {
        console.error("Failed to recover tournament draft from storage:", e);
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUser(session.user);
        await fetchProfile(session.user.id);
      }
      setIsLoadingAuth(false);
    };

    handleIncomingShareAndAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      else {
        setIsPremium(false);
        setCustomLogo(null);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // --- AUTOMATIC RUNTIME TRANSACTION DUMP LOOP ---
  useEffect(() => {
    if (step === 1 || isReadOnlyShare) return;

    const draftPayload = {
      step,
      round,
      sportType,
      tournamentFormat,
      playerCount,
      targetPoints,
      playerNames,
      matches,
      roundHistory,
      leaderboard,
      tournamentDate,
      isEditingHistory
    };
    localStorage.setItem('padel_tournament_draft', JSON.stringify(draftPayload));
  }, [step, round, sportType, tournamentFormat, playerCount, targetPoints, playerNames, matches, roundHistory, leaderboard, tournamentDate, isEditingHistory, isReadOnlyShare]);

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase.from('profiles').select('is_premium, custom_logo_url').eq('id', userId).single();
    if (data) {
      setIsPremium(data.is_premium);
      setCustomLogo(data.custom_logo_url);
    }
  };

  // --- HISTORY LOGIC ---
  const fetchHistory = async () => {
    if (!isPremium || !user) {
      setShowUpgradeModal(true);
      return;
    }
    
    const { data, error } = await supabase
      .from('tournament_history') 
      .select('*')
      .eq('user_id', user.id)
      .order('event_date', { ascending: false });

    if (error) {
      console.error("Fetch error:", error.message);
      setNotification({ message: "Could not load history", type: 'error' });
      setTimeout(() => setNotification(null), 3000);
    } else if (data) {
      setPastTournaments(data as SavedTournament[]);
    }
    
    setShowHistory(true);
  };

  const saveTournamentResults = async () => {
    if (!user) {
      setShowUpgradeModal(true);
      return;
    }
    
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('tournament_history') 
        .insert([{
          user_id: user.id,
          event_date: new Date().toISOString(), 
          sport_type: sportType, 
          tournament_name: tournamentFormat, 
          player_count: playerCount, 
          target_points: targetPoints, 
          leaderboard: leaderboard,
          round_history: roundHistory
        }]);

      if (error) throw error;
      setNotification({ message: `Tournament saved to history!`, type: 'success' });
      localStorage.removeItem('padel_tournament_draft');
    } catch (error: any) {
      setNotification({ message: "Error saving: " + error.message, type: 'error' });
    } finally {
      setIsSaving(false);
      setTimeout(() => setNotification(null), 3000);
    }
  };

  // --- WHATSAPP SHARE METHOD ---
  const shareTournamentLink = async () => {
    if (!user) {
      setNotification({ message: "Please sign in to share your results", type: 'error' });
      setTimeout(() => setNotification(null), 3000);
      return;
    }

    setIsSaving(true);
    try {
      const { data, error } = await supabase
        .from('tournament_history')
        .insert([{
          user_id: user.id,
          event_date: new Date().toISOString(),
          sport_type: sportType,
          tournament_name: tournamentFormat,
          player_count: playerCount,
          target_points: targetPoints,
          leaderboard: leaderboard,
          round_history: roundHistory
        }])
        .select()
        .single();

      if (error) throw error;

      const shareUrl = `${window.location.origin}${window.location.pathname}?t=${data.id}`;
      const championName = leaderboard[0]?.name || "N/A";
      const txtMessage = `🏆 Padel ${tournamentFormat} Tournament Results!\n🥇 Champion: ${championName}\n📅 Date: ${tournamentDate}\n\nTap the link to check out the leaderboard rankings and match history:`;
      localStorage.removeItem('padel_tournament_draft');
      if (navigator.share) {
        await navigator.share({
          title: `Tournament Results - ${tournamentDate}`,
          text: txtMessage,
          url: shareUrl,
        });
      } else {
        await navigator.clipboard.writeText(`${txtMessage}\n${shareUrl}`);
        setNotification({ message: "Results link copied to clipboard!", type: 'success' });
      }
    } catch (err: any) {
      console.error(err);
      setNotification({ message: "Could not distribute shareable view.", type: 'error' });
    } finally {
      setIsSaving(false);
      setTimeout(() => setNotification(null), 3000);
    }
  };

  // --- BRANDING & STORAGE ---
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setIsUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}-${Math.random()}.${fileExt}`;
      const filePath = `logos/${fileName}`;
      
      const { error: uploadError } = await supabase.storage.from('branding').upload(filePath, file);
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('branding').getPublicUrl(filePath);
      const { error: updateError } = await supabase.from('profiles').update({ custom_logo_url: publicUrl }).eq('id', user.id);
      if (updateError) throw updateError;

      setCustomLogo(publicUrl);
      setNotification({ message: "Branding updated successfully!", type: 'success' });
      setTimeout(() => setNotification(null), 3000);
    } catch (error: any) {
      setNotification({ message: error.message, type: 'error' });
      setTimeout(() => setNotification(null), 3000);
    } finally {
      setIsUploading(false);
      setShowSettings(false);
    }
  };

  // --- PAYFAST INTEGRATION ---
  const handlePaymentRedirect = (planType: 'monthly' | 'annual') => {
    if (!user) {
      const isLocal = window.location.hostname === 'localhost';
      const redirectUrl = isLocal ? 'http://localhost:3000' : 'https://www.padelamericanoapp.com';
      supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectUrl } });
      return;
    }
    const amount = planType === 'monthly' ? "49.00" : "499.00";
    const itemName = planType === 'monthly' ? "Padel Pro Monthly" : "Padel Pro Annual";
    const params = new URLSearchParams({
      merchant_id: "23019870",
      merchant_key: "1mxjxals11fdu",
      amount: amount,
      item_name: itemName,
      return_url: `${window.location.origin}?pay=success`,
      cancel_url: `${window.location.origin}?pay=cancel`,
      custom_str1: user.id
    });
    window.location.href = `https://www.payfast.co.za/eng/process?${params.toString()}`;
  };

  // --- TOURNAMENT CORE LOGIC ---
  const startTournament = () => {
    setTournamentDate(new Date().toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' }));
    setRound(1);
    setIsEditingHistory(false);
    setIsReadOnlyShare(false);
    
    const initialLeaderboard: PlayerStats[] = playerNames.slice(0, playerCount).map((n, i) => ({
      name: n || `P${i+1}`, played: 0, points: 0, wins: 0, ties: 0, losses: 0
    }));
    setLeaderboard(initialLeaderboard);

    // If Americano, we can pre-generate ALL rounds into history instantly
    if (tournamentFormat === 'Americano') {
      const generatedFullSchedule: RoundHistoryItem[] = [];
      const totalRoundsToGenerate = playerCount - 1;

      for (let r = 1; r <= totalRoundsToGenerate; r++) {
        const roundMatches: MatchRecord[] = [];
        const activeNames = playerNames.slice(0, playerCount).map((n, i) => n || `P${i + 1}`);
        const pool = activeNames.slice(1);
        const rotationCount = r - 1;

        for (let stepRot = 0; stepRot < rotationCount; stepRot++) { 
          pool.push(pool.shift()!);
        }
        const rotated = [activeNames[0], ...pool];

        for (let i = 0; i < playerCount / 4; i++) {
          const base = i * 4;
          roundMatches.push({
            id: i + 1,
            round: r,
            teamA: [rotated[base], rotated[base + 3]],
            teamB: [rotated[base + 1], rotated[base + 2]],
            scoreA: '',
            scoreB: ''
          });
        }
        generatedFullSchedule.push({ round: r, matches: roundMatches });
      }

      setRoundHistory(generatedFullSchedule);
      // Load the pre-generated matches for Round 1 immediately into active view
      setMatches(generatedFullSchedule[0].matches);
      setStep(3);
    } else {
      // Mexicano relies on real-time ranking adjustments so generate Round 1 normally
      setRoundHistory([]);
      generateRound(1, initialLeaderboard);
    }
  };

  const generateRound = (currentRound: number, currentLeaderboard?: PlayerStats[]) => {
    const activeLeaderboard = currentLeaderboard || leaderboard;
    const roundMatches: MatchRecord[] = [];

    if (tournamentFormat === 'Mexicano' && currentRound > 1) {
      const sortedPlayers = [...activeLeaderboard].map(p => p.name);
      for (let i = 0; i < playerCount / 4; i++) {
        const base = i * 4;
        roundMatches.push({
          id: i + 1,
          round: currentRound,
          teamA: [sortedPlayers[base], sortedPlayers[base + 3]],
          teamB: [sortedPlayers[base + 1], sortedPlayers[base + 2]],
          scoreA: '',
          scoreB: ''
        });
      }
      setMatches(roundMatches);
      setStep(3);
    } else {
      // Fallback or non-pregenerated structural safety line
      const activeNames = playerNames.slice(0, playerCount).map((n, i) => n || `P${i + 1}`);
      const pool = activeNames.slice(1);
      const rotationCount = currentRound - 1;
      for(let r=0; r < rotationCount; r++) { pool.push(pool.shift()!); }
      const rotated = [activeNames[0], ...pool];
      for (let i = 0; i < playerCount / 4; i++) {
        const base = i * 4;
        roundMatches.push({
          id: i + 1,
          round: currentRound,
          teamA: [rotated[base], rotated[base + 3]],
          teamB: [rotated[base + 1], rotated[base + 2]],
          scoreA: '',
          scoreB: ''
        });
      }
      setMatches(roundMatches);
      setStep(3);
    }
  };

  const finishRound = () => {
    for (const m of matches) {
      if (m.scoreA === '' || m.scoreB === '' || (Number(m.scoreA) + Number(m.scoreB)) !== targetPoints) {
        setNotification({ message: `Each match must total ${targetPoints} points.`, type: 'error' });
        return;
      }
    }
    setNotification(null);

    const updatedHistory = [...roundHistory];
    const existingIdx = updatedHistory.findIndex(h => h.round === round);
    if (existingIdx !== -1) {
      updatedHistory[existingIdx] = { round, matches: [...matches] };
    } else {
      updatedHistory.push({ round, matches: [...matches] });
    }
    
    setRoundHistory(updatedHistory);
    recalculateLeaderboard(updatedHistory);
    
    if (isEditingHistory) {
      setRound(maxRounds);
    }
    
    setIsEditingHistory(false);
    setStep(4);
  };

  const recalculateLeaderboard = (history: RoundHistoryItem[]) => {
    const newScores: PlayerStats[] = playerNames.slice(0, playerCount).map((n, i) => ({
      name: n || `P${i+1}`, played: 0, points: 0, wins: 0, ties: 0, losses: 0
    }));
    history.forEach(h => {
      // Only aggregate rounds that have actually been played (contain scores)
      const isRoundPlayed = h.matches.some(m => m.scoreA !== '' && m.scoreB !== '');
      if (!isRoundPlayed) return;

      h.matches.forEach((m: MatchRecord) => {
        const valA = Number(m.scoreA);
        const valB = Number(m.scoreB);
        [...m.teamA, ...m.teamB].forEach(pName => {
          const p = newScores.find(s => s.name === pName);
          if (p) {
            p.played += 1;
            const isTeamA = m.teamA.includes(pName);
            const myScore = isTeamA ? valA : valB;
            const oppScore = isTeamA ? valB : valA;
            p.points += myScore;
            if (myScore > oppScore) p.wins += 1;
            else if (myScore === oppScore) p.ties += 1;
            else p.losses += 1;
          }
        });
      });
    });
    const sortedLeaderboard = [...newScores].sort((a, b) => b.points - a.points || b.wins - a.wins);
    setLeaderboard(sortedLeaderboard);
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.setTextColor(37, 99, 235);
    doc.text(`${sportType} ${tournamentFormat} Results`, 14, 22);
    doc.setFontSize(10);
    doc.setTextColor(150, 150, 150);
    doc.text(`Date: ${tournamentDate}`, 14, 30);
    autoTable(doc, {
      startY: 35,
      head: [['Rank', 'Player', 'P', 'W', 'T', 'L', 'PTS']],
      body: leaderboard.map((p, i) => [i + 1, p.name, p.played, p.wins, p.ties, p.losses, p.points]),
      headStyles: { fillColor: [37, 99, 235] },
    });
    doc.save(`${sportType}_${tournamentFormat}_Results_${tournamentDate}.pdf`);
  };

  const BannerAd = () => {
    if (isPremium || isLoadingAuth) return null;
    return (
      <a href="https://webdesignersdurban.co.za" target="_blank" rel="noopener noreferrer" className="block w-full mb-6 overflow-hidden rounded-[2rem] border border-stone-100 shadow-sm active:scale-[0.98]">
        <img src="/padel-banner-main.webp" alt="Durban Web Design" className="w-full h-auto object-cover rounded-[2rem]" />
      </a>
    );
  };

  return (
    <div className="min-h-screen bg-[#E5E7EB] text-[#4A4543] pb-20 relative font-sans">
      {/* PREMIUM BAR */}
      <div className={`h-1.5 w-full bg-gradient-to-r ${isPremium ? 'from-[#BF953F] via-[#FCF6BA] to-[#B38728]' : 'from-blue-400 via-blue-600 to-indigo-600'}`} />

      {/* AUTH BAR */}
      <div className="bg-white border-b border-stone-100 px-6 py-2 flex justify-between items-center shadow-sm">
        {user ? (
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest truncate max-w-[150px]">{user.email}</span>
            <button onClick={() => setShowSettings(true)} className="text-blue-600"><Settings size={14} /></button>
            <button onClick={() => supabase.auth.signOut()} className="text-stone-300"><LogOut size={14} /></button>
          </div>
        ) : (
          <button 
            onClick={() => {
              const isLocal = window.location.hostname === 'localhost';
              const redirectUrl = isLocal ? 'http://localhost:3000' : 'https://www.padelamericanoapp.com';
              supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectUrl } });
            }} 
            className="text-[10px] font-bold text-blue-600 uppercase tracking-widest flex items-center gap-1"
          >
            <Users size={12} /> Sign In
          </button>
        )}
        {isPremium && <span className="text-[10px] font-bold text-[#BF953F] uppercase tracking-widest flex items-center gap-1"><Sparkles size={10} /> Pro</span>}
      </div>

      {notification && (
        <div className={`fixed top-16 left-1/2 -translate-x-1/2 z-[60] px-6 py-3 rounded-full text-white text-xs font-bold shadow-xl animate-bounce ${notification.type === 'error' ? 'bg-red-500' : 'bg-green-500'}`}>{notification.message}</div>
      )}

      {/* SETTINGS MODAL */}
      {showSettings && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-6 bg-stone-900/60 backdrop-blur-md">
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] p-8 shadow-2xl relative">
            <button onClick={() => setShowSettings(false)} className="absolute top-6 right-6 text-stone-300"><X size={24} /></button>
            <div className="text-center space-y-6">
              <h3 className="text-2xl font-light text-stone-800">Pro <span className="font-semibold text-blue-600">Settings</span></h3>
              <div className="w-20 h-20 mx-auto rounded-2xl border-2 border-dashed border-stone-200 flex items-center justify-center overflow-hidden bg-stone-50">
                {customLogo ? <img src={customLogo} alt="Logo" className="w-full h-full object-contain" /> : <ImageIcon className="text-stone-300" size={32} />}
              </div>
              <input type="file" ref={fileInputRef} onChange={handleLogoUpload} className="hidden" accept=".png,.jpg,.jpeg,.svg" />
              <button disabled={isUploading} onClick={() => fileInputRef.current?.click()} className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2">
                {isUploading ? "Uploading..." : <><Upload size={18} /> Update Logo</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HISTORY MODAL */}
      {showHistory && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-6 bg-stone-900/60 backdrop-blur-md">
          <div className="bg-white w-full max-w-sm h-[80vh] rounded-[2.5rem] p-8 shadow-2xl relative flex flex-col">
            <button onClick={() => setShowHistory(false)} className="absolute top-6 right-6 text-stone-300"><X size={24} /></button>
            <h3 className="text-2xl font-light text-stone-800 mb-6">Past <span className="font-semibold text-blue-600">Results</span></h3>
            <div className="flex-1 overflow-y-auto space-y-3 pr-2">
              {pastTournaments.length === 0 ? (
                <p className="text-center text-stone-400 text-xs py-20">No saved tournaments yet.</p>
              ) : (
                pastTournaments.map((t: any) => (
                  <div 
                    key={t.id} 
                    onClick={() => { 
                      setLeaderboard(t.leaderboard || []); 
                      setTournamentDate(t.event_date ? new Date(t.event_date).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' }) : ""); 
                      setSportType(t.sport_type || 'Padel');
                      setTournamentFormat(t.tournament_name || 'Americano');
                      setPlayerCount(t.player_count || 8);
                      setTargetPoints(t.target_points || 16);
                      setRoundHistory(t.round_history || []);
                      setIsReadOnlyShare(false);
                      setStep(4); 
                      setShowHistory(false); 
                      setRound((t.player_count || 8) - 1);
                    }} 
                    className="bg-stone-50 border border-stone-100 p-4 rounded-2xl active:scale-95 transition-transform cursor-pointer"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">
                          {t.event_date ? new Date(t.event_date).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' }) : 'N/A'}
                        </p>
                        <p className="text-sm font-bold text-stone-700">
                          {t.sport_type} {t.tournament_name || 'Americano'} ({t.event_date ? new Date(t.event_date).getFullYear() : 'N/A'})
                        </p>
                      </div>
                      <Trophy size={16} className="text-amber-400" />
                    </div>
                    <p className="text-[11px] text-stone-500 mt-1">
                      Winner: <span className="font-bold text-stone-800">{(t.leaderboard && t.leaderboard[0]?.name) || 'N/A'}</span>
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* UPGRADE MODAL */}
      {showUpgradeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-stone-900/60 backdrop-blur-md">
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] p-8 shadow-2xl relative">
            <button onClick={() => setShowUpgradeModal(false)} className="absolute top-6 right-6 text-stone-300"><X size={24} /></button>
            <div className="text-center space-y-6">
              <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto text-white shadow-lg"><Sparkles size={32} /></div>
              <h3 className="text-3xl font-light text-stone-800">Unlock <span className="font-semibold text-blue-600">Pro</span></h3>
              <div className="space-y-3 text-left text-xs font-medium text-stone-600 bg-stone-50 p-5 rounded-2xl border border-stone-100">
                <div className="flex items-center gap-3"><CheckCircle2 size={16} className="text-blue-600" /> 12 & 16 Player Support</div>
                <div className="flex items-center gap-3"><CheckCircle2 size={16} className="text-blue-600" /> Download Results as PDF</div>
                <div className="flex items-center gap-3"><CheckCircle2 size={16} className="text-blue-600" /> Custom Club Branding</div>
                <div className="flex items-center gap-3"><CheckCircle2 size={16} className="text-blue-600" /> Completely Ad Free</div>
              </div>
              <div className="grid gap-3">
                <button onClick={() => handlePaymentRedirect('monthly')} className="w-full bg-white border-2 border-blue-600 text-blue-600 py-4 rounded-2xl font-bold">R49 / Month</button>
                <button onClick={() => handlePaymentRedirect('annual')} className="w-full bg-blue-600 text-white py-5 rounded-2xl font-bold">R499 / Year</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <main className="max-w-md mx-auto px-6 py-8">
        {step === 1 && (
          <div className="space-y-8">
            <header className="text-center py-4">
              {isPremium && customLogo ? (
                <img src={customLogo} alt="Logo" className="h-20 w-auto mx-auto object-contain" />
              ) : (
                <>
                  <h1 className="text-4xl font-extralight tracking-tight text-stone-800">{sportType} <span className="font-medium text-blue-600 italic">{tournamentFormat}</span></h1>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400 mt-2">Developer - Kreesen</p>
                </>
              )}
            </header>

            <BannerAd />

            <section className="space-y-3">
              <label className="text-[10px] font-bold uppercase tracking-widest text-stone-500">Select Sport</label>
              <div className="grid grid-cols-2 gap-2">
                {['Padel', 'Pickleball'].map((s) => (
                  <button key={s} onClick={() => setSportType(s as any)} className={`py-4 rounded-xl border font-bold transition-all ${sportType === s ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-stone-400 border-stone-100'}`}>{s}</button>
                ))}
              </div>
            </section>

            <section className="space-y-3">
              <label className="text-[10px] font-bold uppercase tracking-widest text-stone-500">Tournament Format</label>
              <div className="grid grid-cols-2 gap-2">
                {['Americano', 'Mexicano'].map((f) => (
                  <button key={f} onClick={() => setTournamentFormat(f as any)} className={`py-4 rounded-xl border font-bold transition-all ${tournamentFormat === f ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-stone-400 border-stone-100'}`}>{f}</button>
                ))}
              </div>
            </section>

            <section className="space-y-3">
              <label className="text-[10px] font-bold uppercase tracking-widest text-stone-500">Total Players</label>
              <div className="grid grid-cols-4 gap-2">
                {[4, 8, 12, 16].map((num) => (
                  <button key={num} onClick={() => num > 8 && !isPremium ? setShowUpgradeModal(true) : setPlayerCount(num)} className={`py-4 rounded-xl border relative ${playerCount === num ? 'bg-blue-600 text-white' : 'bg-white text-stone-400 border-stone-100'}`}>
                    {num > 8 && !isPremium && <Lock size={10} className="absolute top-1 right-1 opacity-40" />}
                    {num}
                  </button>
                ))}
              </div>
            </section>

            <section className="space-y-3">
              <label className="text-[10px] font-bold uppercase tracking-widest text-stone-500">Points per Match</label>
              <div className="grid grid-cols-4 gap-2">
                {[12, 16, 20, 24].map((p) => (
                  <button key={p} onClick={() => setTargetPoints(p)} className={`py-4 rounded-xl border ${targetPoints === p ? 'bg-blue-600 text-white' : 'bg-white text-stone-400 border-stone-100'}`}>{p}</button>
                ))}
              </div>
            </section>

            <div className="space-y-3">
              <button onClick={() => setStep(2)} className="w-full bg-blue-600 text-white py-5 rounded-[2rem] shadow-xl flex items-center justify-between px-8 text-lg font-light">
                <span>Enter Players</span>
                <ChevronRight />
              </button>
              <button onClick={fetchHistory} className="w-full bg-white text-stone-500 border border-stone-100 py-4 rounded-[2rem] shadow-sm flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-widest">
                <History size={16} /> View History
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <button onClick={() => { setStep(1); localStorage.removeItem('padel_tournament_draft'); }} className="flex items-center gap-2 text-stone-400">
              <ArrowLeft size={16} />
              <span className="text-[10px] font-bold uppercase">BACK</span>
            </button>
            <h2 className="text-2xl font-light text-stone-800">Roster</h2>
            <div className="grid gap-2">
              {Array.from({ length: playerCount }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 bg-white px-4 py-1 rounded-2xl border border-stone-100 shadow-sm">
                  <span className="text-xs font-bold text-blue-600 bg-blue-50 w-6 h-6 rounded-lg flex items-center justify-center">{i+1}</span>
                  <input
                    type="text"
                    placeholder={`Player ${i + 1}`}
                    value={playerNames[i] || ""}
                    onChange={(e) => {
                      const updated = [...playerNames];
                      updated[i] = e.target.value;
                      setPlayerNames(updated);
                    }}
                    className="w-full bg-transparent py-3 text-sm font-semibold outline-none text-stone-700 placeholder-stone-300"
                  />
                </div>
              ))}
            </div>
            <button onClick={startTournament} className="w-full bg-blue-600 text-white py-5 rounded-[2rem] font-bold uppercase tracking-widest text-xs shadow-xl mt-4">
              Start Tournament
            </button>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <button 
                onClick={() => {
                  if(round > 1) {
                    const prevRound = round - 1;
                    setRound(prevRound);
                    const historicalRound = roundHistory.find(h => h.round === prevRound);
                    if(historicalRound) setMatches(historicalRound.matches);
                  } else {
                    setStep(2);
                  }
                }} 
                className="flex items-center gap-2 text-stone-400"
              >
                <ArrowLeft size={16} />
                <span className="text-[10px] font-bold uppercase">Back</span>
              </button>
              <div className="text-right">
                <span className="text-[10px] font-bold uppercase tracking-widest text-blue-600 bg-blue-50 px-3 py-1 rounded-full">Round {round} of {maxRounds}</span>
              </div>
            </div>

            <div className="space-y-3">
              {matches.map((m, idx) => (
                <div key={m.id || idx} className="bg-white rounded-3xl p-5 border border-stone-100 shadow-sm space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <div className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Team A</div>
                      <div className="text-sm font-bold text-stone-700 truncate">{m.teamA[0]}</div>
                      <div className="text-sm font-bold text-stone-700 truncate">{m.teamA[1]}</div>
                    </div>
                    <div className="space-y-1 text-right">
                      <div className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Team B</div>
                      <div className="text-sm font-bold text-stone-700 truncate">{m.teamB[0]}</div>
                      <div className="text-sm font-bold text-stone-700 truncate">{m.teamB[1]}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-stone-50">
                    <input
                      type="number"
                      placeholder="Score A"
                      value={m.scoreA}
                      disabled={isReadOnlyShare}
                      onChange={(e) => {
                        const nextMatches = [...matches];
                        nextMatches[idx].scoreA = e.target.value;
                        setMatches(nextMatches);
                      }}
                      className="w-full bg-stone-50 text-center py-3 rounded-xl font-bold text-stone-800 text-sm outline-none border border-stone-100 focus:border-blue-500 transition-colors"
                    />
                    <input
                      type="number"
                      placeholder="Score B"
                      value={m.scoreB}
                      disabled={isReadOnlyShare}
                      onChange={(e) => {
                        const nextMatches = [...matches];
                        nextMatches[idx].scoreB = e.target.value;
                        setMatches(nextMatches);
                      }}
                      className="w-full bg-stone-50 text-center py-3 rounded-xl font-bold text-stone-800 text-sm outline-none border border-stone-100 focus:border-blue-500 transition-colors"
                    />
                  </div>
                </div>
              ))}
            </div>

            {!isReadOnlyShare && (
              <button onClick={finishRound} className="w-full bg-blue-600 text-white py-5 rounded-[2rem] font-bold uppercase tracking-widest text-xs shadow-xl flex items-center justify-center gap-2">
                <CheckCircle2 size={16} /> Confirm Scores
              </button>
            )}

            {/* PRE-GENERATED FULL ROUND COMBINATIONS DISPLAY PANEL */}
            {tournamentFormat === 'Americano' && roundHistory.length > 0 && (
              <div className="mt-8 pt-6 border-t border-stone-200 space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500 flex items-center gap-1">
                  <Calendar size={14} /> Full Tournament Match Schedules
                </h3>
                <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                  {roundHistory.map((rh) => (
                    <div key={rh.round} className={`p-4 rounded-2xl border text-xs transition-colors ${rh.round === round ? 'bg-blue-50/60 border-blue-200' : 'bg-white border-stone-100'}`}>
                      <div className="flex justify-between font-bold text-stone-600 mb-2">
                        <span>Round {rh.round} {rh.round === round && '• Active'}</span>
                        <span className="text-[10px] text-stone-400 font-normal">{rh.matches.length} Matches scheduled</span>
                      </div>
                      <div className="space-y-1.5 divide-y divide-stone-50">
                        {rh.matches.map((m, mIdx) => (
                          <div key={mIdx} className="pt-1.5 flex justify-between items-center text-stone-600">
                            <span className="font-medium truncate max-w-[150px]">{m.teamA.join(' + ')}</span>
                            <span className="text-[9px] font-bold text-stone-400 uppercase px-1.5">vs</span>
                            <span className="font-medium truncate max-w-[150px] text-right">{m.teamB.join(' + ')}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {step === 4 && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-3xl font-light text-stone-800">Standings</h2>
              {round < maxRounds && !isReadOnlyShare && (
                <button 
                  onClick={() => {
                    const nextRound = round + 1;
                    setRound(nextRound);
                    if (tournamentFormat === 'Americano') {
                      const matchingHistoricalRound = roundHistory.find(h => h.round === nextRound);
                      if (matchingHistoricalRound) {
                        setMatches(matchingHistoricalRound.matches);
                        setStep(3);
                      }
                    } else {
                      generateRound(nextRound);
                    }
                  }} 
                  className="bg-blue-600 text-white px-5 py-2.5 rounded-full text-xs font-bold flex items-center gap-1 shadow-md"
                >
                  <PlayCircle size={14}/> Next Round
                </button>
              )}
            </div>

            <div className="bg-white rounded-[2rem] overflow-hidden border border-stone-100 shadow-xl">
              <div className="px-6 py-4 bg-stone-50 border-b border-stone-100 flex justify-between items-center">
                <span className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Leaderboard Rankings</span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-stone-400">PTS</span>
              </div>
              <div className="divide-y divide-stone-50">
                {leaderboard.map((p, i) => (
                  <div key={p.name} className="px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <span className={`text-xs font-bold w-5 h-5 rounded-md flex items-center justify-center ${i === 0 ? 'bg-amber-100 text-amber-700' : i === 1 ? 'bg-stone-200 text-stone-700' : 'bg-stone-100 text-stone-500'}`}>{i + 1}</span>
                      <span className="text-sm font-bold text-stone-700">{p.name}</span>
                    </div>
                    <div className="flex items-center gap-6">
                      <span className="text-[11px] font-semibold text-stone-400">{p.wins}W - {p.losses}L</span>
                      <span className="text-sm font-extrabold text-blue-600">{p.points}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              {!isReadOnlyShare ? (
                <div className="space-y-3">
                  <button 
                    disabled={isSaving}
                    onClick={saveTournamentResults} 
                    className="w-full bg-stone-800 text-white py-5 rounded-[2rem] font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2"
                  >
                    <Save size={18} /> {isSaving ? "Saving..." : "Save Results to History"}
                  </button>
                  
                  <button 
                    disabled={isSaving}
                    onClick={shareTournamentLink}
                    className="w-full bg-emerald-600 text-white py-5 rounded-[2rem] font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-md active:bg-emerald-700 transition-colors"
                  >
                    <Share2 size={18} /> {isSaving ? "Generating Link..." : "Share Tournament Results"}
                  </button>

                  <button onClick={() => (isPremium || isReadOnlyShare) ? exportToPDF() : setShowUpgradeModal(true)} className="w-full bg-blue-600 text-white py-5 rounded-[2rem] font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2">
                    {(!isPremium && !isReadOnlyShare) && <Lock size={14} />} <FileText size={18} /> Download Results PDF
                  </button>
                  
                  <button 
                    onClick={() => {
                      localStorage.removeItem('padel_tournament_draft');
                      window.location.href = window.location.origin + window.location.pathname;
                    }} 
                    className="w-full bg-white text-stone-500 border border-stone-300 py-6 rounded-[2rem] font-bold uppercase tracking-widest text-xs flex items-center justify-center gap-2 shadow-sm"
                  >
                    <RotateCcw size={18}/> <span>New Tournament</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <button onClick={() => exportToPDF()} className="w-full bg-blue-600 text-white py-5 rounded-[2rem] font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2">
                    <FileText size={18} /> Download Results PDF
                  </button>
                  <button 
                    onClick={() => window.location.href = window.location.origin + window.location.pathname} 
                    className="w-full bg-white text-stone-500 border border-stone-300 py-6 rounded-[2rem] font-bold uppercase tracking-widest text-xs flex items-center justify-center gap-2 shadow-sm"
                  >
                    <RotateCcw size={18}/> <span>Create Your Own</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}