"use client";
import React, { useState, useEffect, useRef } from 'react';
import { 
  Trophy, ChevronRight, PlayCircle, 
  FileText, RotateCcw, ArrowLeft, Lock, 
  X, Sparkles, Users, Download, 
  MegaphoneOff, PlusCircle, LogOut,
  Medal, History, Settings, Upload, Image as ImageIcon
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

export default function PadelAmericano() {
  const [user, setUser] = useState<any>(null);
  const [isPremium, setIsPremium] = useState(false);
  const [customLogo, setCustomLogo] = useState<string | null>(null); 
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isUploading, setIsUploading] = useState(false); 
  const [showSettings, setShowSettings] = useState(false); 
  const [step, setStep] = useState(1);
  const [round, setRound] = useState(1);
  const [playerCount, setPlayerCount] = useState(8);
  const [targetPoints, setTargetPoints] = useState(16);
  const [playerNames, setPlayerNames] = useState(Array(16).fill(""));
  const [matches, setMatches] = useState<any[]>([]);
  const [roundHistory, setRoundHistory] = useState<any[]>([]); 
  const [leaderboard, setLeaderboard] = useState<PlayerStats[]>([]);
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'error'} | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const maxRounds = playerCount - 1;

  // --- AUTH & PRO STATUS LOGIC ---
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

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      setInstallPrompt(e);
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

  // --- CUSTOM BRANDING LOGIC ---
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type)) {
      setNotification({ message: "Only PNG, JPG, or SVG allowed", type: 'error' });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setNotification({ message: "File too large (Max 2MB)", type: 'error' });
      return;
    }

    setIsUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}-${Math.random()}.${fileExt}`;
      const filePath = `logos/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('branding')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('branding').getPublicUrl(filePath);

      const { error: dbError } = await supabase
        .from('profiles')
        .update({ custom_logo_url: publicUrl })
        .eq('id', user.id);

      if (dbError) throw dbError;

      setCustomLogo(publicUrl);
      setNotification({ message: "Branding updated!", type: 'success' });
      setShowSettings(false);
    } catch (error: any) {
      setNotification({ message: error.message, type: 'error' });
    } finally {
      setIsUploading(false);
    }
  };

  // UPDATED FOR MOBILE COMPATIBILITY
  const handleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { 
        redirectTo: window.location.origin,
        skipBrowserRedirect: false // Forces redirect on mobile browsers
      }
    });
    if (error) setNotification({ message: "Login failed", type: 'error' });
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.reload();
  };

  const handleInstallClick = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') setInstallPrompt(null);
  };

  const handlePaymentRedirect = (planType: 'monthly' | 'annual') => {
    if (!user) {
      setNotification({ message: "Sign in first to link your Pro account!", type: 'error' });
      handleLogin();
      return;
    }
    const merchantId = "23019870"; 
    const merchantKey = "1mxjxals11fdu"; 
    const baseUrl = "https://www.payfast.co.za/eng/process";
    const finalAmount = planType === 'monthly' ? "49.00" : "499.00";

    const params = new URLSearchParams({
      merchant_id: merchantId,
      merchant_key: merchantKey,
      amount: finalAmount,
      item_name: planType === 'monthly' ? "Padel Pro Monthly" : "Padel Pro Annual",
      return_url: `${window.location.origin}?pay=success`,
      cancel_url: `${window.location.origin}?pay=cancel`,
      custom_str1: user.id
    });
    window.location.href = `${baseUrl}?${params.toString()}`;
  };

  const handlePlayerCountSelection = (num: number) => {
    if (num > 8 && !isPremium) setShowUpgradeModal(true);
    else setPlayerCount(num);
  };

  const generateRound = (currentRound: number) => {
    const activeNames = playerNames.slice(0, playerCount).map((n, i) => n || `P${i + 1}`);
    const pool = activeNames.slice(1);
    const rotationCount = currentRound - 1;
    for(let r=0; r < rotationCount; r++) { pool.push(pool.shift()!); }
    const rotated = [activeNames[0], ...pool];

    const roundMatches = [];
    for (let i = 0; i < playerCount / 4; i++) {
      const base = i * 4;
      roundMatches.push({
        id: i + 1, round: currentRound,
        teamA: [rotated[base], rotated[base + 3]],
        teamB: [rotated[base + 1], rotated[base + 2]],
        scoreA: '', scoreB: ''
      });
    }
    setMatches(roundMatches);
    setStep(3);
  };

  const finishRound = () => {
    for (const m of matches) {
      if (m.scoreA === '' || m.scoreB === '') {
        setNotification({ message: "Enter all scores.", type: 'error' });
        return;
      }
      if ((Number(m.scoreA) + Number(m.scoreB)) !== targetPoints) {
        setNotification({ message: `Total must be ${targetPoints}.`, type: 'error' });
        return;
      }
    }

    setRoundHistory(prev => [...prev, { round, matches: [...matches] }]);

    const newScores = [...leaderboard];
    if (newScores.length === 0) {
      playerNames.slice(0, playerCount).forEach((n, i) => {
        newScores.push({ name: n || `P${i+1}`, played: 0, points: 0, wins: 0, ties: 0, losses: 0 });
      });
    }

    matches.forEach(m => {
      const valA = Number(m.scoreA);
      const valB = Number(m.scoreB);
      [...m.teamA, ...m.teamB].forEach(pName => {
        const p = newScores.find(s => s.name === pName);
        if (p) {
          p.played += 1;
          const isTeamA = m.teamA.includes(pName);
          p.points += isTeamA ? valA : valB;
          const myScore = isTeamA ? valA : valB;
          const oppScore = isTeamA ? valB : valA;
          if (myScore > oppScore) p.wins += 1;
          else if (myScore === oppScore) p.ties += 1;
          else p.losses += 1;
        }
      });
    });

    setLeaderboard([...newScores].sort((a, b) => b.points - a.points || b.wins - a.wins));
    setStep(4);
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.setTextColor(37, 99, 235);
    doc.text("Padel Americano Results", 14, 22);
    autoTable(doc, {
      startY: 30,
      head: [['Rank', 'Player', 'P', 'W', 'T', 'L', 'PTS']],
      body: leaderboard.map((p, i) => [i + 1, p.name, p.played, p.wins, p.ties, p.losses, p.points]),
      headStyles: { fillColor: [37, 99, 235] },
      theme: 'grid'
    });
    doc.save("Padel_Tournament_Results.pdf");
  };

  const BannerAd = () => {
    if (isPremium || isLoadingAuth) return null;
    return (
      <a href="https://webdesignersdurban.co.za" target="_blank" rel="noopener noreferrer" className="block w-full mb-6 overflow-hidden rounded-[2rem] border border-stone-100 shadow-sm transition-transform active:scale-[0.98]">
        <img src="https://webdesignersdurban.co.za/wp-content/uploads/2026/05/padel-banner-main.webp" alt="Durban Web Design" className="w-full h-auto object-cover block rounded-[2rem]" />
      </a>
    );
  };

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#4A4543] pb-20 relative font-sans">
      <div className={`h-1.5 w-full bg-gradient-to-r ${isPremium ? 'from-[#BF953F] via-[#FCF6BA] to-[#B38728]' : 'from-blue-400 via-blue-600 to-indigo-600'}`} />

      {/* AUTH BAR */}
      <div className="bg-white border-b border-stone-100 px-6 py-2 flex justify-between items-center shadow-sm">
        {user ? (
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest truncate max-w-[150px]">{user.email}</span>
            {isPremium && (
              <button onClick={() => setShowSettings(true)} className="text-blue-600 hover:text-blue-800 transition-colors">
                <Settings size={14} />
              </button>
            )}
            <button onClick={handleLogout} className="text-stone-300 hover:text-red-400 transition-colors"><LogOut size={14} /></button>
          </div>
        ) : (
          <button onClick={handleLogin} className="text-[10px] font-bold text-blue-600 uppercase tracking-widest flex items-center gap-1"><Users size={12} /> Sign In for Pro</button>
        )}
        {isPremium && <span className="text-[10px] font-bold text-[#BF953F] uppercase tracking-widest flex items-center gap-1"><Sparkles size={10} /> Pro Member</span>}
      </div>

      {notification && (
        <div className={`fixed top-16 left-1/2 -translate-x-1/2 z-[60] px-6 py-3 rounded-full text-white text-xs font-bold shadow-xl ${notification.type === 'error' ? 'bg-red-500' : 'bg-green-500'}`}>{notification.message}</div>
      )}

      {/* BRANDING SETTINGS MODAL */}
      {showSettings && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-6 bg-stone-900/60 backdrop-blur-md">
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] p-8 shadow-2xl relative">
            <button onClick={() => setShowSettings(false)} className="absolute top-6 right-6 text-stone-300"><X size={24} /></button>
            <div className="text-center space-y-6">
              <h3 className="text-2xl font-light text-stone-800">Pro <span className="font-semibold text-blue-600">Branding</span></h3>
              <div className="w-24 h-24 mx-auto rounded-2xl border-2 border-dashed border-stone-200 flex items-center justify-center overflow-hidden bg-stone-50">
                {customLogo ? (
                  <img src={customLogo} alt="Custom Branding" className="w-full h-full object-contain" />
                ) : (
                  <ImageIcon className="text-stone-300" size={32} />
                )}
              </div>
              <p className="text-xs text-stone-400 px-4 text-center">Upload your club logo to replace the default branding. (PNG, JPG, SVG - Max 2MB)</p>
              <input type="file" ref={fileInputRef} onChange={handleLogoUpload} className="hidden" accept=".png,.jpg,.jpeg,.svg" />
              <button 
                disabled={isUploading}
                onClick={() => fileInputRef.current?.click()} 
                className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-lg disabled:opacity-50"
              >
                {isUploading ? "Uploading..." : <><Upload size={18} /> Choose Logo</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PRO UPGRADE MODAL */}
      {showUpgradeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-stone-900/60 backdrop-blur-md">
            <div className="bg-white w-full max-w-sm rounded-[2.5rem] p-8 shadow-2xl relative">
                <button onClick={() => setShowUpgradeModal(false)} className="absolute top-6 right-6 text-stone-300"><X size={24} /></button>
                <div className="text-center space-y-6">
                    <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto text-white shadow-lg"><Sparkles size={32} /></div>
                    <h3 className="text-3xl font-light text-stone-800">Unlock <span className="font-semibold text-blue-600">Pro</span></h3>
                    <div className="space-y-3">
                      <div className="flex items-center gap-3 text-left bg-stone-50 p-3 rounded-xl border border-stone-100">
                        <Users size={18} className="text-blue-500 shrink-0" />
                        <span className="text-xs font-medium text-stone-600">12 & 16 Player Large Group Support</span>
                      </div>
                      <div className="flex items-center gap-3 text-left bg-stone-50 p-3 rounded-xl border border-stone-100">
                        <Download size={18} className="text-blue-500 shrink-0" />
                        <span className="text-xs font-medium text-stone-600">Download Results as PDF</span>
                      </div>
                      <div className="flex items-center gap-3 text-left bg-stone-50 p-3 rounded-xl border border-stone-100">
                        <ImageIcon size={18} className="text-blue-500 shrink-0" />
                        <span className="text-xs font-medium text-stone-600">Custom Club Branding</span>
                      </div>
                      <div className="flex items-center gap-3 text-left bg-stone-50 p-3 rounded-xl border border-stone-100">
                        <MegaphoneOff size={18} className="text-blue-500 shrink-0" />
                        <span className="text-xs font-medium text-stone-600">Completely Ad-Free Experience</span>
                      </div>
                    </div>
                    <div className="grid gap-3 pt-2">
                        <button onClick={() => handlePaymentRedirect('monthly')} className="w-full bg-white border-2 border-blue-600 text-blue-600 py-4 rounded-2xl font-bold">R49 / Month</button>
                        <button onClick={() => handlePaymentRedirect('annual')} className="w-full bg-blue-600 text-white py-5 rounded-2xl font-bold shadow-xl">R499 / Year</button>
                    </div>
                </div>
            </div>
        </div>
      )}

      <main className="max-w-md mx-auto px-6 py-8">
        {step === 1 && (
          <div className="space-y-8">
            <header className="text-center py-4 flex flex-col items-center">
              {isPremium && customLogo ? (
                <div className="flex flex-col items-center">
                   <img src={customLogo} alt="Club Logo" className="h-20 w-auto object-contain animate-in fade-in zoom-in duration-700" />
                   <p className="text-[9px] font-black uppercase tracking-[0.2em] text-stone-300 mt-2">Padel Americano Edition</p>
                </div>
              ) : (
                <>
                  <h1 className="text-4xl font-extralight tracking-tight text-stone-800">Padel <span className="font-medium text-blue-600 italic">Americano</span></h1>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400 mt-2">Developer - Kreesen</p>
                </>
              )}
            </header>
            <BannerAd />
            
            {installPrompt && (
              <button onClick={handleInstallClick} className="w-full bg-stone-50 border border-blue-100 rounded-2xl p-4 flex items-center justify-between transition-all active:scale-95">
                <div className="flex items-center gap-3">
                  <div className="bg-blue-600 p-2 rounded-lg text-white"><PlusCircle size={20}/></div>
                  <div className="text-left"><p className="text-xs font-bold text-stone-800 uppercase tracking-tighter">Install App</p></div>
                </div>
                <ChevronRight size={16} className="text-blue-600" />
              </button>
            )}

            <section className="space-y-3">
                <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Total Players</label>
                <div className="grid grid-cols-4 gap-2">
                    {[4, 8, 12, 16].map((num) => (
                    <button key={num} onClick={() => handlePlayerCountSelection(num)} className={`py-4 rounded-xl border relative transition-all ${playerCount === num ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-white text-stone-400 border-stone-100'}`}>
                        {num > 8 && !isPremium && <Lock size={10} className="absolute top-1 right-1 opacity-40" />}
                        {num}
                    </button>
                    ))}
                </div>
            </section>

            <section className="space-y-3">
                <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Points per Match</label>
                <div className="grid grid-cols-4 gap-2">
                    {[12, 16, 20, 24].map((p) => (
                    <button key={p} onClick={() => setTargetPoints(p)} className={`py-4 rounded-xl border ${targetPoints === p ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-stone-400'}`}>{p}</button>
                    ))}
                </div>
            </section>

            <button onClick={() => setStep(2)} className="w-full bg-blue-600 text-white py-5 rounded-[2rem] shadow-xl flex items-center justify-between px-8 text-lg font-light active:scale-95 transition-transform">
              <span>Enter Players</span> <ChevronRight />
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <button onClick={() => setStep(1)} className="flex items-center gap-2 text-stone-400"><ArrowLeft size={16} /> <span className="text-[10px] font-bold uppercase tracking-widest">Back</span></button>
            <h2 className="text-2xl font-light text-stone-800">Roster</h2>
            <div className="grid gap-2">
              {Array.from({ length: playerCount }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 bg-white px-4 py-1 rounded-xl border border-stone-100 shadow-sm focus-within:border-blue-300 transition-colors">
                    <span className="text-stone-300 font-bold text-xs">{i+1}</span>
                    <input type="text" placeholder={`Player Name...`} className="w-full py-4 bg-transparent outline-none text-lg text-stone-700" value={playerNames[i]} onChange={(e) => setPlayerNames(prev => { const n = [...prev]; n[i] = e.target.value; return n; })} />
                </div>
              ))}
            </div>
            <button onClick={() => generateRound(1)} className="w-full bg-stone-800 text-white py-5 rounded-[2rem] mt-4 font-medium shadow-lg hover:bg-stone-700 active:scale-[0.98] transition-all">Start Tournament</button>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div className="flex justify-between items-center text-stone-400">
              <button onClick={() => setStep(2)} className="flex items-center gap-2"><ArrowLeft size={16} /> <span className="text-[10px] font-bold uppercase tracking-widest">Edit Roster</span></button>
              <div className="flex flex-col items-end">
                <div className="bg-blue-600 text-white px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest shadow-sm">Round {round}</div>
                <span className="text-[10px] font-bold text-stone-300 mt-1 uppercase tracking-tighter italic">Round {round} of {maxRounds}</span>
              </div>
            </div>
            {matches.map((m) => (
              <div key={m.id} className="bg-white rounded-2xl p-6 shadow-sm border border-stone-100 flex items-center gap-4 transition-all hover:shadow-md">
                <div className="flex-1 text-center space-y-2">
                  <p className="text-xs font-semibold text-stone-600 truncate">{m.teamA[0]} & {m.teamA[1]}</p>
                  <input type="number" className="w-full h-12 bg-blue-50 rounded-xl text-center text-xl font-bold text-blue-600 outline-none border-2 border-transparent focus:border-blue-200" value={m.scoreA} onChange={(e) => setMatches(prev => prev.map(match => match.id === m.id ? { ...match, scoreA: e.target.value } : match))} />
                </div>
                <div className="text-stone-200 font-thin text-xl mt-6">vs</div>
                <div className="flex-1 text-center space-y-2">
                  <p className="text-xs font-semibold text-stone-600 truncate">{m.teamB[0]} & {m.teamB[1]}</p>
                  <input type="number" className="w-full h-12 bg-stone-50 rounded-xl text-center text-xl font-bold text-stone-600 outline-none border-2 border-transparent focus:border-stone-200" value={m.scoreB} onChange={(e) => setMatches(prev => prev.map(match => match.id === m.id ? { ...match, scoreB: e.target.value } : match))} />
                </div>
              </div>
            ))}
            <button onClick={finishRound} className="w-full bg-blue-600 text-white py-6 rounded-[2rem] shadow-xl font-bold mt-4 hover:bg-blue-500 active:scale-[0.98] transition-all">Submit Round</button>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-6">
            {round >= maxRounds && (
              <div className="bg-blue-600 rounded-[2.5rem] p-8 text-center text-white shadow-xl relative overflow-hidden animate-in fade-in zoom-in duration-500">
                  <div className="absolute top-0 right-0 p-4 opacity-10"><Trophy size={100} /></div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.3em] mb-2 text-blue-100 italic">Congratulations</p>
                  <h2 className="text-4xl font-black mb-1 tracking-tight">{leaderboard[0]?.name}</h2>
                  <div className="inline-flex items-center gap-2 bg-white/20 px-4 py-1 rounded-full text-xs font-bold uppercase tracking-widest mt-2">
                      🏆 {leaderboard[0]?.points} Total Points
                  </div>
              </div>
            )}

            <div className="bg-white rounded-[2rem] shadow-sm border border-stone-100 overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 bg-stone-50 border-b border-stone-100">
                <span className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Rankings</span>
                <div className="flex gap-1 text-[9px] font-black text-stone-300 uppercase tracking-widest">
                  <span className="w-7 text-center">P</span>
                  <span className="w-7 text-center">W</span>
                  <span className="w-7 text-center">T</span>
                  <span className="w-7 text-center">L</span>
                  <span className="w-12 text-right pr-1">PTS</span>
                </div>
              </div>
              {leaderboard.map((player, i) => (
                <div key={i} className={`flex items-center justify-between px-6 py-5 ${i !== leaderboard.length - 1 ? 'border-b border-stone-50' : ''}`}>
                  <div className="flex items-center gap-4">
                    {i === 0 ? <Medal className="text-yellow-400" size={24} /> : 
                     i === 1 ? <Medal className="text-stone-300" size={24} /> : 
                     i === 2 ? <Medal className="text-orange-400" size={24} /> : 
                     <span className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold bg-stone-100 text-stone-400">{i + 1}</span>}
                    <p className="text-sm font-semibold text-stone-600 truncate max-w-[80px]">{player.name}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="flex gap-1 text-[10px] font-bold text-stone-300">
                      <span className="w-7 text-center text-stone-400/60">{player.played}</span>
                      <span className="w-7 text-center">{player.wins}</span>
                      <span className="w-7 text-center">{player.ties}</span>
                      <span className="w-7 text-center">{player.losses}</span>
                    </div>
                    <span className="w-12 text-right text-lg font-black text-blue-600">{player.points}</span>
                  </div>
                </div>
              ))}
            </div>

            {round >= maxRounds && roundHistory.length > 0 && (
                <div className="space-y-3">
                    <div className="flex items-center gap-2 text-stone-400 px-2 mt-6">
                        <History size={14} />
                        <span className="text-[10px] font-bold uppercase tracking-widest">Tournament Results</span>
                    </div>
                    {roundHistory.map((rh, idx) => (
                        <div key={idx} className="bg-white rounded-2xl p-4 border border-stone-100 space-y-2">
                            <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Round {rh.round}</p>
                            {rh.matches.map((m: any, midx: number) => (
                                <div key={midx} className="flex justify-between text-[11px] items-center bg-stone-50 p-2 rounded-lg border border-stone-100">
                                    <span className="text-stone-500 truncate w-24 text-left font-medium">{m.teamA[0]} & {m.teamA[1]}</span>
                                    <span className="font-bold text-blue-600 px-2">{m.scoreA} - {m.scoreB}</span>
                                    <span className="text-stone-500 truncate w-24 text-right font-medium">{m.teamB[0]} & {m.teamB[1]}</span>
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            )}

            <div className="space-y-3 pt-4">
                {round < maxRounds ? (
                    <button onClick={() => { setRound(r => r + 1); generateRound(round + 1); }} className="w-full bg-stone-800 text-white py-6 rounded-[2rem] font-medium shadow-xl flex items-center justify-center gap-3 active:scale-[0.98] transition-all">
                        <PlayCircle size={22}/> Next Round
                    </button>
                ) : (
                    <div className="space-y-3">
                      <button onClick={() => isPremium ? exportToPDF() : setShowUpgradeModal(true)} className="w-full bg-blue-600 text-white py-5 rounded-[2rem] font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg transition-all">
                          {!isPremium && <Lock size={14} />} <FileText size={18} /> Download Results PDF
                      </button>
                      <BannerAd />
                    </div>
                )}
            </div>
            
            <button onClick={() => window.location.reload()} className="w-full text-stone-400 py-4 font-bold text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:text-stone-600 transition-colors"><RotateCcw size={12} /> Reset Tournament</button>
          </div>
        )}
      </main>
    </div>
  );
}