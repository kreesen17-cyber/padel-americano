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
  const [step, setStep] = useState(1); // 1: Home/History, 2: Roster, 3: Match, 4: Results
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

  // --- AUTOMATIC RUNTIME CACHING ---
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
    setRoundHistory([]);
    setIsEditingHistory(false);
    setIsReadOnlyShare(false);
    
    const initialLeaderboard: PlayerStats[] = playerNames.slice(0, playerCount).map((n, i) => ({
      name: n || `P${i+1}`, played: 0, points: 0, wins: 0, ties: 0, losses: 0
    }));
    setLeaderboard(initialLeaderboard);
    generateRound(1, initialLeaderboard);
  };

  const generateRound = (currentRound: number, currentLeaderboard?: PlayerStats[]) => {
    const activeLeaderboard = currentLeaderboard || leaderboard;
    const roundMatches: MatchRecord[] = [];
    const activeNames = playerNames.slice(0, playerCount).map((n, i) => n || `P${i + 1}`);

    if (tournamentFormat === 'Mexicano' && currentRound > 1) {
      // Mexicano relies on dynamic leaderboard ladder positioning
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
    } else {
      // Robust Balanced Americano Matrix Generation (No Repeated Partners)
      if (playerCount === 4) {
        const schedule4 = [
          { teamA: [0, 3], teamB: [1, 2] },
          { teamA: [0, 2], teamB: [3, 1] },
          { teamA: [0, 1], teamB: [2, 3] }
        ];
        const matchConf = schedule4[(currentRound - 1) % 3];
        roundMatches.push({
          id: 1,
          round: currentRound,
          teamA: [activeNames[matchConf.teamA[0]], activeNames[matchConf.teamA[1]]],
          teamB: [activeNames[matchConf.teamB[0]], activeNames[matchConf.teamB[1]]],
          scoreA: '',
          scoreB: ''
        });
      } 
      else if (playerCount === 8) {
        const schedule8: { teamA: number[], teamB: number[] }[][] = [
          // Round 1
          [{ teamA: [0, 7], teamB: [3, 4] }, { teamA: [1, 6], teamB: [2, 5] }],
          // Round 2
          [{ teamA: [0, 6], teamB: [2, 3] }, { teamA: [7, 5], teamB: [4, 1] }],
          // Round 3
          [{ teamA: [0, 5], teamB: [1, 2] }, { teamA: [6, 4], teamB: [3, 7] }],
          // Round 4
          [{ teamA: [0, 4], teamB: [7, 1] }, { teamA: [5, 3], teamB: [2, 6] }],
          // Round 5
          [{ teamA: [0, 3], teamB: [6, 7] }, { teamA: [4, 2], teamB: [1, 5] }],
          // Round 6
          [{ teamA: [0, 2], teamB: [5, 6] }, { teamA: [3, 1], teamB: [7, 4] }],
          // Round 7
          [{ teamA: [0, 1], teamB: [4, 5] }, { teamA: [2, 7], teamB: [6, 3] }]
        ];
        const roundConfig = schedule8[(currentRound - 1) % 7];
        roundConfig.forEach((mConf, idx) => {
          roundMatches.push({
            id: idx + 1,
            round: currentRound,
            teamA: [activeNames[mConf.teamA[0]], activeNames[mConf.teamA[1]]],
            teamB: [activeNames[mConf.teamB[0]], activeNames[mConf.teamB[1]]],
            scoreA: '',
            scoreB: ''
          });
        });
      } 
      else {
        // Fallback or Expanded (12 / 16 players) round-robin pivot layout rotation
        const pool = activeNames.slice(1);
        const rotationCount = currentRound - 1;
        for (let r = 0; r < rotationCount; r++) { 
          pool.push(pool.shift()!); 
        }
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
      }
    }
    setMatches(roundMatches);
    setStep(3);
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
                      Winner: <span className="font-bold text-stone-800">
                        {(t.leaderboard && t.leaderboard[0]?.name) || 'N/A'}
                      </span>
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
              <ArrowLeft size={16} /> <span className="text-[10px] font-bold uppercase">BACK</span>
            </button>
            <h2 className="text-2xl font-light text-stone-800">Roster</h2>
            <div className="grid gap-2">
              {Array.from({ length: playerCount }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 bg-white px-4 py-1 rounded-xl border border-stone-200">
                  <span className="text-stone-300 font-bold text-xs">{i+1}</span>
                  <input type="text" placeholder="Player Name..." className="w-full py-4 bg-transparent outline-none text-lg" value={playerNames[i] || ""} onChange={(e) => setPlayerNames(prev => { const n = [...prev]; n[i] = e.target.value; return n; })} />
                </div>
              ))}
            </div>
            <button onClick={startTournament} className="w-full bg-stone-800 text-white py-5 rounded-[2rem] mt-4 font-medium shadow-lg">Start Tournament</button>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div className="flex justify-between items-center text-stone-500">
              {isEditingHistory ? (
                <button onClick={() => setStep(4)} className="flex items-center gap-2 text-[10px] font-bold uppercase text-stone-400">
                  <ArrowLeft size={16} /> BACK
                </button>
              ) : (
                <div />
              )}
              <div className="bg-blue-600 text-white px-4 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest shadow-md">Round {round}</div>
            </div>

            {matches.map((m) => (
              <div key={m.id} className="bg-white rounded-2xl p-6 shadow-sm border border-stone-200 flex items-center gap-4">
                <div className="flex-1 text-center space-y-2">
                  <p className="text-xs font-semibold text-stone-600 truncate">{m.teamA.join(' & ')}</p>
                  <input type="number" className="w-full h-12 bg-blue-50 rounded-xl text-center text-xl font-bold text-blue-600 outline-none" value={m.scoreA} onChange={(e) => setMatches(prev => prev.map(match => match.id === m.id ? { ...match, scoreA: e.target.value } : match))} />
                </div>
                <div className="text-stone-300 font-thin text-xl">vs</div>
                <div className="flex-1 text-center space-y-2">
                  <p className="text-xs font-semibold text-stone-600 truncate">{m.teamB.join(' & ')}</p>
                  <input type="number" className="w-full h-12 bg-stone-50 rounded-xl text-center text-xl font-bold text-stone-600 outline-none" value={m.scoreB} onChange={(e) => setMatches(prev => prev.map(match => match.id === m.id ? { ...match, scoreB: e.target.value } : match))} />
                </div>
              </div>
            ))}

            <button onClick={finishRound} className="w-full bg-emerald-600 text-white py-5 rounded-[2rem] font-bold uppercase tracking-widest text-xs shadow-md mt-4">Confirm Round Scores</button>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-6">
            <header className="flex justify-between items-center">
              <div>
                <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">{tournamentDate}</p>
                <h2 className="text-2xl font-light text-stone-800">{sportType} <span className="font-semibold text-blue-600">{tournamentFormat}</span></h2>
              </div>
              {!isReadOnlyShare && (
                <button 
                  onClick={() => {
                    localStorage.removeItem('padel_tournament_draft');
                    window.location.href = window.location.origin + window.location.pathname;
                  }} 
                  className="bg-white p-3 border border-stone-200 rounded-full text-stone-400 active:scale-90 transition-transform"
                >
                  <RotateCcw size={16}/>
                </button>
              )}
            </header>

            {/* LEADERBOARD RANKINGS */}
            <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-stone-100 space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-widest text-stone-400 flex items-center gap-2"><Medal size={14}/> Leaderboard</h3>
              <div className="divide-y divide-stone-100">
                {leaderboard.map((player, idx) => (
                  <div key={idx} className="py-3 flex justify-between items-center first:pt-0 last:pb-0">
                    <div className="flex items-center gap-3">
                      <span className={`w-5 text-center font-bold text-xs ${idx === 0 ? 'text-amber-500 text-sm' : idx === 1 ? 'text-stone-400' : idx === 2 ? 'text-amber-700' : 'text-stone-300'}`}>{idx + 1}</span>
                      <span className="font-semibold text-stone-700 text-sm">{player.name}</span>
                    </div>
                    <div className="flex gap-4 text-right text-[11px] text-stone-400 font-medium">
                      <span>{player.wins}W-{player.losses}L</span>
                      <span className="font-bold text-stone-800 text-sm w-8">{player.points}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* INTERACTIVE ROUND NAVIGATION BUTTON BETWEEN SECTIONS */}
            {!isReadOnlyShare && round < maxRounds && !isEditingHistory && (
              <button 
                onClick={() => {
                  const nextR = round + 1;
                  setRound(nextR);
                  generateRound(nextR);
                }} 
                className="w-full bg-stone-800 text-white py-5 rounded-[2rem] font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg hover:bg-stone-900 active:scale-[0.99] transition-all"
              >
                <PlayCircle size={18} /> Proceed to Round {round + 1}
              </button>
            )}

            {/* MATCH LOG HISTORICAL LOG */}
            <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-stone-100 space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-widest text-stone-400 flex items-center gap-2"><History size={14}/> Match Log</h3>
              <div className="space-y-4">
                {roundHistory.map((rItem) => (
                  <div key={rItem.round} className="bg-stone-50 rounded-2xl p-4 border border-stone-100 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">Round {rItem.round} Finished</span>
                      {!isReadOnlyShare && (
                        <button 
                          onClick={() => {
                            setRound(rItem.round);
                            const found = roundHistory.find(h => h.round === rItem.round);
                            if (found) {
                              setMatches([...found.matches]);
                              setIsEditingHistory(true);
                              setStep(3);
                            }
                          }} 
                          className="text-stone-400 flex items-center gap-1 text-[10px] font-bold uppercase hover:text-blue-600"
                        >
                          <Edit3 size={10} /> Edit
                        </button>
                      )}
                    </div>
                    <div className="space-y-1">
                      {rItem.matches.map((m) => (
                        <div key={m.id} className="flex justify-between items-center text-xs text-stone-600 py-1">
                          <span className="truncate max-w-[140px] font-medium">{m.teamA.join(' & ')}</span>
                          <span className="font-mono bg-stone-200/60 px-2 py-0.5 rounded text-[11px] font-bold text-stone-700">{m.scoreA} - {m.scoreB}</span>
                          <span className="truncate max-w-[140px] text-right font-medium">{m.teamB.join(' & ')}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* PERSISTENT DOWNLOAD AND LINK OUT DISTRIBUTION TOOLS */}
            <div className="space-y-2">
              {!isReadOnlyShare && (
                <button 
                  onClick={saveTournamentResults} 
                  disabled={isSaving} 
                  className="w-full bg-stone-700 text-white py-5 rounded-[2rem] font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-md active:bg-stone-800 transition-colors"
                >
                  <Save size={18} /> {isSaving ? "Saving..." : "Save to History Log"}
                </button>
              )}

              <button 
                onClick={shareTournamentLink} 
                disabled={isSaving} 
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
          </div>
        )}
      </main>
    </div>
  );
}