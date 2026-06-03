"use client";
import React, { useState, useEffect, useRef } from 'react';
import { 
  Trophy, ChevronRight, PlayCircle, 
  FileText, RotateCcw, ArrowLeft, Lock, 
  X, Sparkles, Users, Download, 
  PlusCircle, LogOut, Settings, Upload, Image as ImageIcon,
  CheckCircle2, Edit3, Save, Share2
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '@/lib/supabase';

interface PlayerStats {
  name: string;
  played: number;
  points: number;
  wins: number;
  ties: number;
  losses: number;
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
  const [user, setUser] = useState<any>(null);
  const [isPremium, setIsPremium] = useState(false);
  const [customLogo, setCustomLogo] = useState<string | null>(null); 
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isUploading, setIsUploading] = useState(false); 
  const [showSettings, setShowSettings] = useState(false);
  
  const [step, setStep] = useState(1);
  const [pastTournaments, setPastTournaments] = useState([]);
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
  const [isSaving, setIsSaving] = useState(false);
  const [isReadOnlyShare, setIsReadOnlyShare] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const maxRounds = playerCount - 1;

  useEffect(() => {
    const handleIncomingShareAndAuth = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const sharedTournamentId = urlParams.get('t');

      if (sharedTournamentId) {
        setIsLoadingAuth(true);
        try {
          const { data } = await supabase
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
          }
        }
      } catch (e) {
        console.error("Failed to recover draft:", e);
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUser(session.user);
        await fetchProfile(session.user.id);
      }
      setIsLoadingAuth(false);
    };

    handleIncomingShareAndAuth();
  }, []);

  useEffect(() => {
    if (step === 1 || isReadOnlyShare) return;
    const draftPayload = {
      step, round, sportType, tournamentFormat, playerCount, targetPoints,
      playerNames, matches, roundHistory, leaderboard, tournamentDate
    };
    localStorage.setItem('padel_tournament_draft', JSON.stringify(draftPayload));
  }, [step, round, sportType, tournamentFormat, playerCount, targetPoints, playerNames, matches, roundHistory, leaderboard, tournamentDate, isReadOnlyShare]);

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase.from('profiles').select('is_premium, custom_logo_url').eq('id', userId).single();
    if (data) {
      setIsPremium(data.is_premium);
      setCustomLogo(data.custom_logo_url);
    }
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
        .select().single();

      if (error) throw error;
      const shareUrl = `${window.location.origin}${window.location.pathname}?t=${data.id}`;
      const txtMessage = `🏆 ${sportType} ${tournamentFormat} Results!\n🥇 Champion: ${leaderboard[0]?.name || "N/A"}\n📅 Date: ${tournamentDate}\n\nLink:`;
      
      localStorage.removeItem('padel_tournament_draft');
      if (navigator.share) {
        await navigator.share({ title: `Tournament Results`, text: txtMessage, url: shareUrl });
      } else {
        await navigator.clipboard.writeText(`${txtMessage}\n${shareUrl}`);
        setNotification({ message: "Results link copied to clipboard!", type: 'success' });
      }
    } catch (err: any) {
      setNotification({ message: "Could not share results view.", type: 'error' });
    } finally {
      setIsSaving(false);
      setTimeout(() => setNotification(null), 3000);
    }
  };

  // --- MATHEMATICALLY VALIDATED BALANCED MATRICES ---
  const startTournament = () => {
    setTournamentDate(new Date().toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' }));
    setRound(1);
    setIsReadOnlyShare(false);
    
    const activeNames = playerNames.slice(0, playerCount).map((n, i) => n || `P${i+1}`);
    const initialLeaderboard: PlayerStats[] = activeNames.map(name => ({
      name, played: 0, points: 0, wins: 0, ties: 0, losses: 0
    }));
    setLeaderboard(initialLeaderboard);

    const generatedHistory: RoundHistoryItem[] = [];

    if (tournamentFormat === 'Mexicano') {
      const roundMatches: MatchRecord[] = [];
      for (let c = 0; c < playerCount / 4; c++) {
        const base = c * 4;
        roundMatches.push({
          id: c + 1, round: 1,
          teamA: [activeNames[base], activeNames[base + 3]],
          teamB: [activeNames[base + 1], activeNames[base + 2]],
          scoreA: '', scoreB: '', completed: false
        });
      }
      generatedHistory.push({ round: 1, matches: roundMatches });
    } else {
      // 4 PLAYER AMERICANO MATRIX
      if (playerCount === 4) {
        const m4 = [
          [[0, 3], [1, 2]],
          [[0, 1], [2, 3]],
          [[0, 2], [3, 1]]
        ];
        m4.forEach((rnd, rIdx) => {
          generatedHistory.push({
            round: rIdx + 1,
            matches: rnd.map((m, mIdx) => ({
              id: mIdx + 1, round: rIdx + 1,
              teamA: [activeNames[m[0][0]], activeNames[m[0][1]]],
              teamB: [activeNames[m[1][0]], activeNames[m[1][1]]],
              scoreA: '', scoreB: '', completed: false
            }))
          });
        });
      } 
      // 8 PLAYER AMERICANO MATRIX
      else if (playerCount === 8) {
        const m8 = [
          [[0, 7], [1, 6]], [[2, 5], [3, 4]],
          [[0, 6], [7, 5]], [[1, 4], [2, 3]],
          [[0, 5], [6, 4]], [[7, 3], [1, 2]],
          [[0, 4], [5, 3]], [[6, 2], [7, 1]],
          [[0, 3], [4, 2]], [[5, 1], [6, 7]],
          [[0, 2], [3, 1]], [[4, 7], [5, 6]],
          [[0, 1], [2, 7]], [[3, 6], [4, 5]]
        ];
        for (let r = 1; r <= 7; r++) {
          const rMatches = m8.slice((r - 1) * 2, r * 2);
          generatedHistory.push({
            round: r,
            matches: rMatches.map((m, mIdx) => ({
              id: mIdx + 1, round: r,
              teamA: [activeNames[m[0][0]], activeNames[m[0][1]]],
              teamB: [activeNames[m[1][0]], activeNames[m[1][1]]],
              scoreA: '', scoreB: '', completed: false
            }))
          });
        }
      } 
      // 12 PLAYER AMERICANO MATRIX (100% COLLISION FREE PROOFS)
      else if (playerCount === 12) {
        const m12 = [
          [[0, 11], [1, 10]], [[2, 9], [3, 8]], [[4, 7], [5, 6]],
          [[0, 10], [11, 9]], [[1, 8], [2, 7]], [[3, 6], [4, 5]],
          [[0, 9], [10, 8]], [[11, 7], [1, 6]], [[2, 5], [3, 4]],
          [[0, 8], [9, 7]], [[10, 6], [11, 5]], [[1, 4], [2, 3]],
          [[0, 7], [8, 6]], [[9, 5], [10, 4]], [[11, 3], [1, 2]],
          [[0, 6], [7, 5]], [[8, 4], [9, 3]], [[10, 2], [11, 1]],
          [[0, 5], [6, 4]], [[7, 3], [8, 2]], [[9, 1], [10, 11]],
          [[0, 4], [5, 3]], [[6, 2], [7, 1]], [[8, 11], [9, 10]],
          [[0, 3], [4, 2]], [[5, 1], [6, 11]], [[7, 10], [8, 9]],
          [[0, 2], [3, 1]], [[4, 11], [5, 10]], [[6, 9], [7, 8]],
          [[0, 1], [2, 11]], [[3, 10], [4, 9]], [[5, 8], [6, 7]]
        ];
        for (let r = 1; r <= 11; r++) {
          const rMatches = m12.slice((r - 1) * 3, r * 3);
          generatedHistory.push({
            round: r,
            matches: rMatches.map((m, mIdx) => ({
              id: mIdx + 1, round: r,
              teamA: [activeNames[m[0][0]], activeNames[m[0][1]]],
              teamB: [activeNames[m[1][0]], activeNames[m[1][1]]],
              scoreA: '', scoreB: '', completed: false
            }))
          });
        }
      } 
      // 16 PLAYER AMERICANO MATRIX (100% COLLISION FREE PROOFS)
      else if (playerCount === 16) {
        const m16 = [
          [[0, 15], [1, 14]], [[2, 13], [3, 12]], [[4, 11], [5, 10]], [[6, 9], [7, 8]],
          [[0, 14], [15, 13]], [[1, 12], [2, 11]], [[3, 10], [4, 9]], [[5, 8], [6, 7]],
          [[0, 13], [14, 12]], [[15, 11], [1, 10]], [[2, 9], [3, 8]], [[4, 7], [5, 6]],
          [[0, 12], [13, 11]], [[14, 10], [15, 9]], [[1, 8], [2, 7]], [[3, 6], [4, 5]],
          [[0, 11], [12, 10]], [[13, 9], [14, 8]], [[15, 7], [1, 6]], [[2, 5], [3, 4]],
          [[0, 10], [11, 9]], [[12, 8], [13, 7]], [[14, 6], [15, 5]], [[1, 4], [2, 3]],
          [[0, 9], [10, 8]], [[11, 7], [12, 6]], [[13, 5], [14, 4]], [[15, 3], [1, 2]],
          [[0, 8], [9, 7]], [[10, 6], [11, 5]], [[12, 4], [13, 3]], [[14, 2], [15, 1]],
          [[0, 7], [8, 6]], [[9, 5], [10, 4]], [[11, 3], [12, 2]], [[13, 1], [14, 15]],
          [[0, 6], [7, 5]], [[8, 4], [9, 3]], [[10, 2], [11, 1]], [[12, 15], [13, 14]],
          [[0, 5], [6, 4]], [[7, 3], [8, 2]], [[9, 1], [10, 15]], [[11, 14], [12, 13]],
          [[0, 4], [5, 3]], [[6, 2], [7, 1]], [[8, 15], [9, 14]], [[10, 13], [11, 12]],
          [[0, 3], [4, 2]], [[5, 1], [6, 15]], [[7, 14], [8, 13]], [[9, 12], [10, 11]],
          [[0, 2], [3, 1]], [[4, 15], [5, 14]], [[6, 13], [7, 12]], [[8, 11], [9, 10]],
          [[0, 1], [2, 15]], [[3, 14], [4, 13]], [[5, 12], [6, 11]], [[7, 10], [8, 9]]
        ];
        for (let r = 1; r <= 15; r++) {
          const rMatches = m16.slice((r - 1) * 4, r * 4);
          generatedHistory.push({
            round: r,
            matches: rMatches.map((m, mIdx) => ({
              id: mIdx + 1, round: r,
              teamA: [activeNames[m[0][0]], activeNames[m[0][1]]],
              teamB: [activeNames[m[1][0]], activeNames[m[1][1]]],
              scoreA: '', scoreB: '', completed: false
            }))
          });
        }
      }
    }

    setRoundHistory(generatedHistory);
    setMatches(generatedHistory[0].matches);
    setStep(3); // Goes straight to score input loop view
  }

  const generateMexicanoNextRound = (nextRoundNum: number, currentHistory: RoundHistoryItem[]) => {
    const scores: PlayerStats[] = playerNames.slice(0, playerCount).map((n, i) => ({
      name: n || `P${i+1}`, played: 0, points: 0, wins: 0, ties: 0, losses: 0
    }));
    currentHistory.forEach(h => {
      h.matches.forEach((m) => {
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
    for (let i = 0; i < playerCount / 4; i++) {
      const base = i * 4;
      nextRoundMatches.push({
        id: i + 1, round: nextRoundNum,
        teamA: [sortedPlayers[base], sortedPlayers[base + 3]],
        teamB: [sortedPlayers[base + 1], sortedPlayers[base + 2]],
        scoreA: '', scoreB: '', completed: false
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
    setRoundHistory(updatedHistory);
    
    if (round < maxRounds) {
      const nextRoundNum = round + 1;
      if (tournamentFormat === 'Mexicano') {
        const nextMatches = generateMexicanoNextRound(nextRoundNum, updatedHistory);
        updatedHistory.push({ round: nextRoundNum, matches: nextMatches });
        setRoundHistory(updatedHistory);
        setMatches(nextMatches);
      } else {
        setMatches(updatedHistory[nextRoundNum - 1].matches);
      }
      setRound(nextRoundNum);
      // Keeps state fixed in Step 3 for entering the upcoming scores natively!
    } else {
      setStep(4); // Only goes to absolute end state once completely finished!
    }
  };

  const recalculateLeaderboard = (history: RoundHistoryItem[]) => {
    const newScores: PlayerStats[] = playerNames.slice(0, playerCount).map((n, i) => ({
      name: n || `P${i+1}`, played: 0, points: 0, wins: 0, ties: 0, losses: 0
    }));

    history.forEach(h => {
      h.matches.forEach((m) => {
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
    setLeaderboard([...newScores].sort((a, b) => b.points - a.points || b.wins - a.wins));
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.setTextColor(37, 99, 235);
    doc.text(`${sportType} ${tournamentFormat} Results`, 14, 22);
    autoTable(doc, {
      startY: 35,
      head: [['Rank', 'Player', 'P', 'W', 'T', 'L', 'PTS']],
      body: leaderboard.map((p, i) => [i + 1, p.name, p.played, p.wins, p.ties, p.losses, p.points]),
      headStyles: { fillColor: [37, 99, 235] },
    });
    doc.save(`${sportType}_Results.pdf`);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setIsUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `logos/${user.id}-${Math.random()}.${fileExt}`;
      await supabase.storage.from('branding').upload(filePath, file);
      const { data: { publicUrl } } = supabase.storage.from('branding').getPublicUrl(filePath);
      await supabase.from('profiles').update({ custom_logo_url: publicUrl }).eq('id', user.id);
      setCustomLogo(publicUrl);
    } catch (error: any) {
      console.error(error);
    } finally {
      setIsUploading(false);
      setShowSettings(false);
    }
  };

  const isTournamentComplete = roundHistory.length > 0 && roundHistory.every(rh => rh.matches.every(m => m.completed));

  return (
    <div className="min-h-screen bg-[#E5E7EB] text-[#4A4543] pb-20 relative font-sans">
      <div className="h-1.5 w-full bg-gradient-to-r from-blue-400 via-blue-600 to-indigo-600" />
      
      {/* HEADER CONTROLS */}
      <div className="bg-white border-b border-stone-100 px-6 py-2 flex justify-between items-center shadow-sm">
        {user ? (
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest truncate max-w-[150px]">{user.email}</span>
            <button onClick={() => setShowSettings(true)} className="text-blue-600"><Settings size={14} /></button>
            <button onClick={() => supabase.auth.signOut()} className="text-stone-300"><LogOut size={14} /></button>
          </div>
        ) : (
          <button onClick={() => supabase.auth.signInWithOAuth({ provider: 'google' })} className="text-[10px] font-bold text-blue-600 uppercase tracking-widest flex items-center gap-1"><Users size={12} /> Sign In</button>
        )}
      </div>

      {notification && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[60] px-6 py-3 rounded-full text-white text-xs font-bold shadow-xl bg-red-500">{notification.message}</div>
      )}

      <main className="max-w-md mx-auto px-6 py-8">
        {step === 1 && (
          <div className="space-y-8">
            <header className="text-center py-4">
              <h1 className="text-4xl font-extralight tracking-tight text-stone-800">{sportType} <span className="font-medium text-blue-600 italic">{tournamentFormat}</span></h1>
            </header>

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
                  <button key={num} onClick={() => setPlayerCount(num)} className={`py-4 rounded-xl border ${playerCount === num ? 'bg-blue-600 text-white' : 'bg-white text-stone-400 border-stone-100'}`}>{num}</button>
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

            <button onClick={() => setStep(2)} className="w-full bg-blue-600 text-white py-5 rounded-[2rem] shadow-xl flex items-center justify-between px-8 text-lg font-light">
              <span>Enter Players</span> <ChevronRight />
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <button onClick={() => setStep(1)} className="flex items-center gap-2 text-stone-400"><ArrowLeft size={16} /><span className="text-[10px] font-bold uppercase">BACK</span></button>
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

        {/* STEP 3 SCORE INPUT ACTION GRID */}
        {step === 3 && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <button onClick={() => setStep(2)} className="flex items-center gap-2 text-[10px] font-bold uppercase text-stone-400"><ArrowLeft size={16} /> ROSTER</button>
              <div className="bg-blue-600 text-white px-4 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest shadow-md">Round {round} / {maxRounds}</div>
            </div>

            <div className="space-y-4">
              {matches.map((m, idx) => (
                <div key={idx} className="bg-white rounded-2xl p-6 shadow-sm border border-stone-200 flex items-center gap-4">
                  <div className="flex-1 text-center space-y-2">
                    <p className="text-xs font-semibold text-stone-600 truncate">{m.teamA.join(' & ')}</p>
                    <input type="number" className="w-full h-12 bg-blue-50 rounded-xl text-center text-xl font-bold text-blue-600 outline-none" value={m.scoreA} onChange={(e) => {
                      const nextMatches = matches.map(match => match.id === m.id ? { ...match, scoreA: e.target.value } : match);
                      setMatches(nextMatches);
                    }} />
                  </div>
                  <div className="text-stone-300 font-thin text-xl">vs</div>
                  <div className="flex-1 text-center space-y-2">
                    <p className="text-xs font-semibold text-stone-600 truncate">{m.teamB.join(' & ')}</p>
                    <input type="number" className="w-full h-12 bg-stone-50 rounded-xl text-center text-xl font-bold text-stone-600 outline-none" value={m.scoreB} onChange={(e) => {
                      const nextMatches = matches.map(match => match.id === m.id ? { ...match, scoreB: e.target.value } : match);
                      setMatches(nextMatches);
                    }} />
                  </div>
                </div>
              ))}
            </div>

            <button onClick={finishRound} className="w-full bg-blue-600 text-white py-6 rounded-[2rem] shadow-xl font-bold uppercase tracking-wider">
              CONFIRM ROUND {round} RESULTS
            </button>
          </div>
        )}

        {/* STEP 4 LEADERBOARD & ENTIRE COMPLETED MATCH FIXTURE TRAILING SUMMARY */}
        {step === 4 && (
          <div className="space-y-6">
            <div className="bg-blue-600 rounded-[2.5rem] p-8 text-center text-white shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-10"><Trophy size={100} /></div>
              <p className="text-[10px] font-bold uppercase tracking-[0.3em] mb-1 text-blue-100 italic">Champion</p>
              <h2 className="text-4xl font-black mb-1 tracking-tight">{leaderboard[0]?.name}</h2>
              <p className="text-[10px] font-bold text-blue-200 uppercase tracking-widest">{tournamentDate}</p>
            </div>

            {/* LEADERBOARD CARD WITH LABELS EXACTLY MATCHED */}
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

            {/* COMPREHENSIVE FIXTURES LOG AS DISPLAYED IN SCREENSHOT */}
            <div className="space-y-4">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-stone-500 ml-2">MATCH FIXTURE COMBINATIONS</h3>
              {roundHistory.map((rh, idx) => (
                <div key={idx} className="bg-white rounded-2xl p-5 border border-stone-200 shadow-sm space-y-3">
                  <span className="text-xs font-black text-blue-600 uppercase tracking-wider">ROUND {rh.round}</span>
                  {rh.matches.map((m, mIdx) => (
                    <div key={mIdx} className="flex justify-between items-center py-3 px-4 bg-stone-50 rounded-xl border border-stone-100 text-sm font-medium">
                      <div className="w-[38%] text-left flex flex-col leading-tight text-stone-700">
                        <span>{m.teamA[0]}</span>
                        <span>{m.teamA[1]}</span>
                      </div>
                      <span className="w-[24%] text-center font-black text-stone-800 bg-white px-2 py-1 rounded-lg border border-stone-200 shadow-sm">
                        {m.scoreA} - {m.scoreB}
                      </span>
                      <div className="w-[38%] text-right flex flex-col leading-tight text-stone-700">
                        <span>{m.teamB[0]}</span>
                        <span>{m.teamB[1]}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {/* ACTION FOOTER */}
            <div className="space-y-3 pt-4 border-t border-stone-300">
              <button onClick={saveTournamentResults} className="w-full bg-stone-800 text-white py-5 rounded-[2rem] font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2"><Save size={18} /> Save Results to History</button>
              <button onClick={shareTournamentLink} className="w-full bg-emerald-600 text-white py-5 rounded-[2rem] font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2"><Share2 size={18} /> Share Tournament Results</button>
              <button onClick={exportToPDF} className="w-full bg-blue-600 text-white py-5 rounded-[2rem] font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2"><FileText size={18} /> Download Results PDF</button>
              <button onClick={() => { localStorage.removeItem('padel_tournament_draft'); window.location.reload(); }} className="w-full bg-white text-stone-500 border border-stone-300 py-6 rounded-[2rem] font-bold uppercase tracking-widest text-xs flex items-center justify-center gap-2"><RotateCcw size={18}/> New Tournament</button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}