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
  completed: boolean;
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

  // --- HIGH-PERFORMANCE MULTI-SIZE AMERICANO SCHEDULING ENGINE ---
  const startTournament = () => {
    setTournamentDate(new Date().toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' }));
    setRound(1);
    setIsEditingHistory(false);
    setIsReadOnlyShare(false);
    
    const activeNames = playerNames.slice(0, playerCount).map((n, i) => n || `P${i+1}`);
    const initialLeaderboard: PlayerStats[] = activeNames.map(name => ({
      name, played: 0, points: 0, wins: 0, ties: 0, losses: 0
    }));
    setLeaderboard(initialLeaderboard);

    const generatedHistory: RoundHistoryItem[] = [];
    const totalRounds = playerCount - 1;
    const courtsPerRound = playerCount / 4;

    if (tournamentFormat === 'Mexicano') {
      // Mexicano generates dynamically on a round-by-round basis based on active points standing.
      // We initialize Round 1 using a balanced baseline.
      const roundMatches: MatchRecord[] = [];
      for (let c = 0; c < courtsPerRound; c++) {
        const base = c * 4;
        roundMatches.push({
          id: c + 1,
          round: 1,
          teamA: [activeNames[base], activeNames[base + 3]],
          teamB: [activeNames[base + 1], activeNames[base + 2]],
          scoreA: '',
          scoreB: '',
          completed: false
        });
      }
      generatedHistory.push({ round: 1, matches: roundMatches });
    } else {
      // PURE AMERICANO MASTER GENERATION BLOCKS
      if (playerCount === 4) {
        const matrix4P = [
          { r: 1, matches: [{ id: 1, teamA: [0, 3], teamB: [1, 2] }] },
          { r: 2, matches: [{ id: 1, teamA: [0, 1], teamB: [2, 3] }] },
          { r: 3, matches: [{ id: 1, teamA: [0, 2], teamB: [3, 1] }] }
        ];
        matrix4P.forEach(rh => {
          generatedHistory.push({
            round: rh.r,
            matches: rh.matches.map(m => ({
              id: m.id, round: rh.r,
              teamA: [activeNames[m.teamA[0]], activeNames[m.teamA[1]]],
              teamB: [activeNames[m.teamB[0]], activeNames[m.teamB[1]]],
              scoreA: '', scoreB: '', completed: false
            }))
          });
        });
      } else if (playerCount === 8) {
        for (let r = 1; r <= totalRounds; r++) {
          const roundMatches: MatchRecord[] = [];
          for (let c = 0; c < courtsPerRound; c++) {
            const idxA1 = (r - 1 + c) % 7;
            const idxA2 = (r - 1 + 6 - c) % 7;
            const idxB1 = (r - 1 + 3 + c) % 7;
            const idxB2 = c === 0 ? 7 : (r - 1 + 3 - c + 7) % 7;

            roundMatches.push({
              id: c + 1, round: r,
              teamA: [activeNames[idxA1], activeNames[idxA2]],
              teamB: [activeNames[idxB1], activeNames[idxB2]],
              scoreA: '', scoreB: '', completed: false
            });
          }
          generatedHistory.push({ round: r, matches: roundMatches });
        }
      } else if (playerCount === 12) {
        // High-order Whist Social combinatorial array for 12 players across 11 rounds
        const matrix12P = [
          [[0,1,2,3], [4,7,8,11], [5,6,9,10]],
          [[0,2,4,6], [1,3,8,10], [5,7,9,11]],
          [[0,3,5,8], [1,6,7,10], [2,4,9,11]],
          [[0,4,7,9], [1,2,5,11], [3,6,8,10]],
          [[0,5,6,11], [1,4,8,9], [2,3,7,10]],
          [[0,6,8,9], [1,5,7,10], [2,3,4,11]],
          [[0,7,10,11], [1,2,6,9], [3,4,5,8]],
          [[0,8,10,11], [1,4,5,6], [2,3,7,9]],
          [[0,9,4,10], [1,3,6,11], [2,5,7,8]],
          [[0,10,1,7], [2,6,8,11], [3,4,5,9]],
          [[0,11,3,9], [1,4,6,7], [2,5,8,10]]
        ];
        matrix12P.forEach((rMatches, rIdx) => {
          const roundMatches: MatchRecord[] = rMatches.map((m, cIdx) => ({
            id: cIdx + 1, round: rIdx + 1,
            teamA: [activeNames[m[0]], activeNames[m[1]]],
            teamB: [activeNames[m[2]], activeNames[m[3]]],
            scoreA: '', scoreB: '', completed: false
          }));
          generatedHistory.push({ round: rIdx + 1, matches: roundMatches });
        });
      } else if (playerCount === 16) {
        // High-order Whist Social combinatorial array for 16 players across 15 rounds
        const matrix16P = [
          [[0,1,2,3], [4,5,6,7], [8,9,10,11], [12,13,14,15]],
          [[0,4,8,12], [1,5,9,13], [2,6,10,14], [3,7,11,15]],
          [[0,5,10,15], [1,4,11,14], [2,7,8,13], [3,6,9,12]],
          [[0,6,11,13], [1,7,10,12], [2,4,9,15], [3,5,8,14]],
          [[0,7,9,14], [1,6,8,15], [2,5,11,12], [3,4,10,13]],
          [[0,2,5,7], [1,3,4,6], [8,10,13,15], [9,11,12,14]],
          [[0,3,6,5], [1,2,7,4], [8,11,14,13], [9,10,15,12]],
          [[0,8,1,9], [2,10,3,11], [4,12,5,13], [6,14,7,15]],
          [[0,9,3,10], [1,8,2,11], [4,13,7,14], [5,12,6,15]],
          [[0,10,4,14], [1,11,5,15], [2,8,6,12], [3,9,7,13]],
          [[0,11,7,12], [1,10,6,13], [2,9,5,14], [3,8,4,15]],
          [[0,12,6,9], [1,13,7,8], [2,15,4,11], [3,14,5,10]],
          [[0,13,5,11], [1,12,4,10], [2,14,7,9], [3,15,6,8]],
          [[0,14,2,13], [1,15,3,12], [4,8,7,11], [5,9,6,10]],
          [[0,15,1,14], [2,12,3,13], [4,9,5,8], [6,11,7,10]]
        ];
        matrix16P.forEach((rMatches, rIdx) => {
          const roundMatches: MatchRecord[] = rMatches.map((m, cIdx) => ({
            id: cIdx + 1, round: rIdx + 1,
            teamA: [activeNames[m[0]], activeNames[m[1]]],
            teamB: [activeNames[m[2]], activeNames[m[3]]],
            scoreA: '', scoreB: '', completed: false
          }));
          generatedHistory.push({ round: rIdx + 1, matches: roundMatches });
        });
      }
    }

    setRoundHistory(generatedHistory);
    setMatches(generatedHistory[0].matches);
    setStep(4); 
  };

  const syncActiveMatchesToHistory = (activeMatches: MatchRecord[]) => {
    return roundHistory.map(rh => rh.round === round ? { ...rh, matches: [...activeMatches] } : rh);
  };

  const generateMexicanoNextRound = (nextRoundNum: number, currentHistory: RoundHistoryItem[]) => {
    // Dynamically calculate leaderboard layout specifically to match upcoming pairs for Mexicano logic
    const scores: PlayerStats[] = playerNames.slice(0, playerCount).map((n, i) => ({
      name: n || `P${i+1}`, played: 0, points: 0, wins: 0, ties: 0, losses: 0
    }));
    currentHistory.forEach(h => {
      h.matches.forEach((m: MatchRecord) => {
        if (m.scoreA !== '' && m.scoreB !== '') {
          const valA = Number(m.scoreA);
          const valB = Number(m.scoreB);
          [...m.teamA, ...m.teamB].forEach(pName => {
            const p = scores.find(s => s.name === pName);
            if (p) {
              p.played += 1;
              const isTeamA = m.teamA.includes(pName);
              p.points += isTeamA ? valA : valB;
              if (isTeamA ? valA > valB : valB > valA) p.wins += 1;
              else if (valA === valB) p.ties += 1;
              else p.losses += 1;
            }
          });
        }
      });
    });
    const sortedPlayers = [...scores].sort((a, b) => b.points - a.points || b.wins - a.wins).map(p => p.name);
    
    const nextRoundMatches: MatchRecord[] = [];
    const courtsPerRound = playerCount / 4;
    for (let i = 0; i < courtsPerRound; i++) {
      const base = i * 4;
      nextRoundMatches.push({
        id: i + 1,
        round: nextRoundNum,
        teamA: [sortedPlayers[base], sortedPlayers[base + 3]],
        teamB: [sortedPlayers[base + 1], sortedPlayers[base + 2]],
        scoreA: '',
        scoreB: '',
        completed: false
      });
    }
    return nextRoundMatches;
  };

  const finishRound = () => {
    for (const m of matches) {
      if (m.scoreA === '' || m.scoreB === '' || (Number(m.scoreA) + Number(m.scoreB)) !== targetPoints) {
        setNotification({ message: `Each match must total ${targetPoints} points.`, type: 'error' });
        return;
      }
    }
    setNotification(null);

    const verifiedMatches = matches.map(m => ({ ...m, completed: true }));
    let updatedHistory = roundHistory.map(rh => rh.round === round ? { ...rh, matches: verifiedMatches } : rh);
    
    recalculateLeaderboard(updatedHistory);
    
    if (isEditingHistory) {
      setIsEditingHistory(false);
    } else if (round < maxRounds) {
      const nextRoundNum = round + 1;
      if (tournamentFormat === 'Mexicano') {
        const nextMatches = generateMexicanoNextRound(nextRoundNum, updatedHistory);
        // Add or inject next round blueprint cleanly
        const existingNextIdx = updatedHistory.findIndex(h => h.round === nextRoundNum);
        if (existingNextIdx !== -1) {
          updatedHistory[existingNextIdx] = { round: nextRoundNum, matches: nextMatches };
        } else {
          updatedHistory.push({ round: nextRoundNum, matches: nextMatches });
        }
      }
      setRound(nextRoundNum);
    }
    
    setRoundHistory(updatedHistory);
    setStep(4);
  };

  const recalculateLeaderboard = (history: RoundHistoryItem[]) => {
    const newScores: PlayerStats[] = playerNames.slice(0, playerCount).map((n, i) => ({
      name: n || `P${i+1}`, played: 0, points: 0, wins: 0, ties: 0, losses: 0
    }));

    history.forEach(h => {
      h.matches.forEach((m: MatchRecord) => {
        if (m.scoreA !== '' && m.scoreB !== '') {
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
        }
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

  const isTournamentComplete = roundHistory.length > 0 && roundHistory.every(rh => rh.matches.every(m => m.completed));

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
                <span>Enter Players</span> <ChevronRight />
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
              <button onClick={() => setStep(4)} className="flex items-center gap-2 text-[10px] font-bold uppercase text-stone-400">
                <ArrowLeft size={16} /> BACK
              </button>
              <div className="bg-blue-600 text-white px-4 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest shadow-md">Round {round}</div>
            </div>
            
            {matches.map((m) => (
              <div key={m.id} className="bg-white rounded-2xl p-6 shadow-sm border border-stone-200 flex items-center gap-4">
                <div className="flex-1 text-center space-y-2">
                  <p className="text-xs font-semibold text-stone-600 truncate">{m.teamA.join(' & ')}</p>
                  <input type="number" className="w-full h-12 bg-blue-50 rounded-xl text-center text-xl font-bold text-blue-600 outline-none" value={m.scoreA} onChange={(e) => {
                    const nextMatches = matches.map(match => match.id === m.id ? { ...match, scoreA: e.target.value } : match);
                    setMatches(nextMatches);
                    setRoundHistory(syncActiveMatchesToHistory(nextMatches));
                  }} />
                </div>
                <div className="text-stone-300 font-thin text-xl">vs</div>
                <div className="flex-1 text-center space-y-2">
                  <p className="text-xs font-semibold text-stone-600 truncate">{m.teamB.join(' & ')}</p>
                  <input type="number" className="w-full h-12 bg-stone-50 rounded-xl text-center text-xl font-bold text-stone-600 outline-none" value={m.scoreB} onChange={(e) => {
                    const nextMatches = matches.map(match => match.id === m.id ? { ...match, scoreB: e.target.value } : match);
                    setMatches(nextMatches);
                    setRoundHistory(syncActiveMatchesToHistory(nextMatches));
                  }} />
                </div>
              </div>
            ))}
            
            <button onClick={finishRound} className="w-full bg-blue-600 text-white py-6 rounded-[2rem] shadow-xl font-bold mt-4 uppercase">
              CONFIRM ROUND RESULTS
            </button>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-6">
            {isTournamentComplete ? (
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
                <span className="text-xs font-bold text-stone-500 uppercase tracking-widest">Active Match Tracker</span>
                <span className="text-xs font-black text-blue-600 bg-blue-50 px-3 py-1 rounded-full">Round {round}/{maxRounds}</span>
              </div>
            )}

            {/* LEADERBOARD CARD */}
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

            {/* FULL MATCH HISTORY COMBINATIONS */}
            {roundHistory.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-stone-500 ml-2">MATCH FIXTURE COMBINATIONS</h3>
                {roundHistory.map((rh, idx) => (
                  <div key={idx} className="bg-[#E5E7EB] rounded-2xl p-5 border border-stone-400 shadow-sm relative space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-black text-blue-600 uppercase tracking-wider">
                        ROUND {rh.round} {rh.round === round && !rh.matches.every(m => m.completed) ? "(ACTIVE)" : ""}
                      </span>
                      {!isReadOnlyShare && (
                        <button 
                          onClick={() => { 
                            setMatches(rh.matches);
                            setRound(rh.round); 
                            setIsEditingHistory(true); 
                            setStep(3); 
                          }} 
                          className="text-[11px] font-bold text-stone-500 uppercase tracking-widest flex items-center gap-1 hover:text-blue-600 transition-colors"
                        >
                          <Edit3 size={12} /> {rh.matches.some(m => m.completed) ? "EDIT SCORES" : "ENTER SCORES"}
                        </button>
                      )}
                    </div>
                    {rh.matches.map((m: any, mIdx: number) => {
                      const hasScores = m.scoreA !== '' && m.scoreB !== '';
                      const scoreA = Number(m.scoreA || 0);
                      const scoreB = Number(m.scoreB || 0);
                      const isWinnerA = hasScores && scoreA > scoreB;
                      const isWinnerB = hasScores && scoreB > scoreA;

                      return (
                        <div 
                          key={mIdx} 
                          className="flex justify-between items-center py-3 px-4 bg-white rounded-xl border border-stone-200 text-sm font-medium relative shadow-inner overflow-hidden min-h-[56px]"
                        >
                          {isWinnerA && <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-emerald-500" />}
                          {isWinnerB && <div className="absolute right-0 top-0 bottom-0 w-1.5 bg-emerald-500" />}

                          <div className="w-[38%] text-left flex flex-col justify-center leading-tight text-[#57544d] pl-1">
                            <span className="truncate">{m.teamA[0]}</span>
                            <span className="truncate">{m.teamA[1]}</span>
                          </div>

                          <span className="w-[24%] text-center font-black text-stone-800 text-base bg-stone-50 px-2 py-1 rounded-lg border border-stone-200 shadow-sm flex items-center justify-center h-9">
                            {hasScores ? `${m.scoreA} - ${m.scoreB}` : "vs"}
                          </span>

                          <div className="w-[38%] text-right flex flex-col justify-center leading-tight text-[#57544d] pr-1">
                            <span className="truncate">{m.teamB[0]}</span>
                            <span className="truncate">{m.teamB[1]}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}

            {/* CONTROL BAR ALWAYS REMAINS AT THE BOTTOM */}
            <div className="space-y-3 pt-4 border-t border-stone-300">
              {!isReadOnlyShare && (
                <button 
                  disabled={isSaving}
                  onClick={saveTournamentResults} 
                  className="w-full bg-stone-800 text-white py-5 rounded-[2rem] font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-md"
                >
                  <Save size={18} /> {isSaving ? "Saving..." : "Save Results to History"}
                </button>
              )}
              
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
          </div>
        )}
      </main>
    </div>
  );
}