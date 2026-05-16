"use client";
import React, { useState, useEffect, useRef } from 'react';
import { 
  Trophy, ChevronRight, PlayCircle, 
  FileText, RotateCcw, ArrowLeft, Lock, 
  X, Sparkles, Users, Download, 
  MegaphoneOff, PlusCircle, LogOut,
  Medal, History, Settings, Upload, Image as ImageIcon,
  Calendar, CheckCircle2, Edit3, Save
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
  const [isViewingHistoryRecord, setIsViewingHistoryRecord] = useState(false); // Context tracking flag
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const maxRounds = playerCount - 1;

  // --- AUTH & PROFILE INITIALIZATION ---
  useEffect(() => {
    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUser(session.user);
        await fetchProfile(session.user.id);
      }
      setIsLoadingAuth(false);
    };

    initAuth();

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

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase.from('profiles').select('is_premium, custom_logo_url').eq('id', userId).single();
    if (data) {
      setIsPremium(data.is_premium);
      setCustomLogo(data.custom_logo_url);
    }
  };

  // --- HISTORY LOGIC ---
  const fetchHistory = async () => {
    // If the user isn't logged in, or if they are logged in but NOT premium
    if (!user || !isPremium) {
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
          leaderboard: leaderboard 
        }]);

      if (error) throw error;
      setNotification({ message: `Tournament saved to history!`, type: 'success' });
    } catch (error: any) {
      setNotification({ message: "Error saving: " + error.message, type: 'error' });
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
    } finally {
      setIsUploading(false);
      setShowSettings(false);
    }
  };

  // --- PAYFAST INTEGRATION ---
  const handlePaymentRedirect = (planType: 'monthly' | 'annual') => {
    if (!user) {
      supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
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
    setIsViewingHistoryRecord(false); // Reset history viewing flag on new run
    
    // Seed initial uniform standings leaderboard before round 1 match allocation
    const initialLeaderboard: PlayerStats[] = playerNames.slice(0, playerCount).map((n, i) => ({
      name: n || `P${i+1}`, played: 0, points: 0, wins: 0, ties: 0, losses: 0
    }));
    setLeaderboard(initialLeaderboard);
    
    generateRound(1, initialLeaderboard);
  };

  const generateRound = (currentRound: number, currentLeaderboard?: PlayerStats[]) => {
    const activeLeaderboard = currentLeaderboard || leaderboard;
    const roundMatches: MatchRecord[] = [];

    if (tournamentFormat === 'Mexicano' && currentRound > 1) {
      // Mexicano Logic: Sort strictly based on performance standings to group closest matches
      const sortedPlayers = [...activeLeaderboard].map(p => p.name);
      for (let i = 0; i < playerCount / 4; i++) {
        const base = i * 4;
        roundMatches.push({
          id: i + 1,
          round: currentRound,
          // Pair Rank 1 & 4 vs Rank 2 & 3 down the tier line for balancing within groups
          teamA: [sortedPlayers[base], sortedPlayers[base + 3]],
          teamB: [sortedPlayers[base + 1], sortedPlayers[base + 2]],
          scoreA: '',
          scoreB: ''
        });
      }
    } else {
      // Americano / Round 1 Logic: Static Round-Robin Matrix Shift
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

  // --- PDF EXPORT ---
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

      {/* AUTH BAR (Increased padding & icon scale to optimize mobile tap target sizing) */}
      <div className="bg-white border-b border-stone-100 px-6 py-3.5 flex justify-between items-center shadow-sm">
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
              supabase.auth.signInWithOAuth({ 
                provider: 'google',
                options: {
                  redirectTo: redirectUrl
                }
              });
            }} 
            className="text-[11px] font-bold text-blue-600 uppercase tracking-widest flex items-center gap-1.5 py-1"
          >
            <Users size={14} /> Sign In
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
            <h3 className="text-2xl font-light text-stone-800 mb-6">Past <span className="font-semibold text-blue-600">Tournaments</span></h3>
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
                      setIsViewingHistoryRecord(true); // Enable historical context tracking 
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
                <span>Enter Players</span> <ChevronRight />
              </button>
              <button onClick={fetchHistory} className="w-full bg-white text-stone-500 border border-stone-100 py-4 rounded-[2rem] shadow-sm flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-widest">
                <History size={16} /> View Past Tournaments
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <button onClick={() => setStep(1)} className="flex items-center gap-2 text-stone-400">
              <ArrowLeft size={16} /> <span className="text-[10px] font-bold uppercase">BACK</span>
            </button>
            <h2 className="text-2xl font-light text-stone-800">Roster</h2>
            <div className="grid gap-2">
              {Array.from({ length: playerCount }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 bg-white px-4 py-1 rounded-xl border border-stone-200">
                  <span className="text-stone-300 font-bold text-xs">{i+1}</span>
                  <input type="text" placeholder="Player Name..." className="w-full py-4 bg-transparent outline-none text-lg" value={playerNames[i]} onChange={(e) => setPlayerNames(prev => { const n = [...prev]; n[i] = e.target.value; return n; })} />
                </div>
              ))}
            </div>
            <button onClick={startTournament} className="w-full bg-stone-800 text-white py-5 rounded-[2rem] mt-4 font-medium shadow-lg">Start Tournament</button>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div className="flex justify-between items-center text-stone-500">
              <button onClick={() => setStep(isEditingHistory ? 4 : 2)} className="flex items-center gap-2 text-[10px] font-bold uppercase text-stone-400">
                <ArrowLeft size={16} /> BACK
              </button>
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
            <button onClick={finishRound} className="w-full bg-blue-600 text-white py-6 rounded-[2rem] shadow-xl font-bold mt-4 uppercase">
              {isEditingHistory ? "UPDATE RESULTS" : "NEXT ROUND"}
            </button>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-6">
            {/* Modal Navigation Control Back Action - Restricted only to historical views */}
            {isViewingHistoryRecord && (
              <button 
                onClick={() => {
                  setIsViewingHistoryRecord(false);
                  fetchHistory();
                }}
                className="flex items-center gap-2 text-blue-600 font-bold text-xs uppercase tracking-wider mb-2 bg-white px-4 py-2.5 rounded-full shadow-sm border border-stone-100 self-start"
              >
                <ArrowLeft size={14} /> Back to Past Tournaments
              </button>
            )}

            {round >= maxRounds ? (
              <div className="bg-blue-600 rounded-[2.5rem] p-8 text-center text-white shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10"><Trophy size={100} /></div>
                <div className="flex flex-col items-center justify-center">
                  <p className="text-[10px] font-bold uppercase tracking-[0.3em] mb-1 text-blue-100 italic">Champion</p>
                  <h2 className="text-4xl font-black mb-1 tracking-tight">{leaderboard[0]?.name}</h2>
                  <p className="text-[10px] font-bold text-blue-200 uppercase tracking-widest">{tournamentDate}</p>
                </div>
              </div>
            ) : (
              <div className="flex justify-between items-center bg-white p-4 rounded-2xl shadow-sm border border-stone-200">
                <span className="text-xs font-bold text-stone-500 uppercase tracking-widest">Round {round}/{maxRounds}</span>
                {/* Hide editing controls when viewing a static data log */}
                {!isViewingHistoryRecord && (
                  <button onClick={() => setStep(3)} className="flex items-center gap-2 text-blue-600 font-bold text-[10px] uppercase tracking-widest"><Edit3 size={14}/> Edit Round {round}</button>
                )}
              </div>
            )}

            <div className="bg-white rounded-[2rem] shadow-sm border border-stone-200 overflow-hidden">
              <div className="px-6 py-4 bg-stone-50 border-b border-stone-200 font-bold text-[10px] uppercase tracking-widest text-stone-400 flex">
                <span className="w-1/3">Rank</span>
                <div className="flex w-2/3 justify-between text-center">
                  <span className="w-8">W</span>
                  <span className="w-8">T</span>
                  <span className="w-8">L</span>
                  <span className="w-12 text-blue-600">PTS</span>
                </div>
              </div>
              {leaderboard.map((player, i) => (
                <div key={i} className={`flex items-center px-6 py-5 ${i !== leaderboard.length - 1 ? 'border-b border-stone-100' : ''}`}>
                  <div className="w-1/3 flex items-center gap-3">
                    <span className="text-[10px] font-bold text-stone-300">{i + 1}</span>
                    <p className="text-sm font-semibold text-stone-700 truncate">{player.name}</p>
                  </div>
                  <div className="flex w-2/3 justify-between text-center text-xs font-bold text-stone-500 items-center">
                    <span className="w-8">{player.wins}</span>
                    <span className="w-8">{player.ties}</span>
                    <span className="w-8">{player.losses}</span>
                    <span className="w-12 text-lg text-blue-600 font-black">{player.points}</span>
                  </div>
                </div>
              ))}
            </div>

            {round >= maxRounds && roundHistory.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-500 ml-2">Match History</h3>
                {roundHistory.map((rh, idx) => (
                  <div key={idx} className="bg-white/70 rounded-2xl p-4 border border-stone-200 shadow-sm">
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-[10px] font-bold text-blue-600 uppercase">Round {rh.round}</span>
                      {/* Hide mid-history editing access fields on closed archives */}
                      {!isViewingHistoryRecord && (
                        <button onClick={() => { setMatches(rh.matches); setRound(rh.round); setIsEditingHistory(true); setStep(3); }} className="text-[9px] font-bold text-stone-400 uppercase tracking-widest flex items-center gap-1"><Edit3 size={10} /> Edit</button>
                      )}
                    </div>
                    {rh.matches.map((m: any, mIdx: number) => (
                      <div key={mIdx} className="flex justify-between items-center py-2 border-t border-stone-100 text-[11px] font-medium text-stone-500">
                        <span className="w-1/3 truncate">{m.teamA.join(' & ')}</span>
                        <span className="w-1/3 text-center font-bold text-stone-800">{m.scoreA} - {m.scoreB}</span>
                        <span className="w-1/3 text-right truncate">{m.teamB.join(' & ')}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-3 pt-4">
              {round < maxRounds ? (
                <button onClick={() => { setRound(r => r + 1); generateRound(round + 1); }} className="w-full bg-stone-800 text-white py-6 rounded-[2rem] font-medium shadow-xl flex items-center justify-center gap-3">
                  <PlayCircle size={22}/> Start Round {round + 1}
                </button>
              ) : (
                <div className="space-y-3">
                  {/* Hide live action state tracking saves on historical views */}
                  {!isViewingHistoryRecord && (
                    <button 
                      disabled={isSaving}
                      onClick={saveTournamentResults} 
                      className="w-full bg-stone-800 text-white py-5 rounded-[2rem] font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2"
                    >
                      <Save size={18} /> {isSaving ? "Saving..." : "Save Results to History"}
                    </button>
                  )}
                  <button onClick={() => isPremium ? exportToPDF() : setShowUpgradeModal(true)} className="w-full bg-blue-600 text-white py-5 rounded-[2rem] font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2">
                    {!isPremium && <Lock size={14} />} <FileText size={18} /> Download Results PDF
                  </button>
                  <button 
                    onClick={() => window.location.reload()} 
                    className="w-full bg-white text-stone-500 border border-stone-300 py-6 rounded-[2rem] font-bold uppercase tracking-widest text-xs flex items-center justify-center gap-2"
                  >
                    <RotateCcw size={18}/> <span>New Tournament</span>
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