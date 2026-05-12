"use client";
import React, { useState, useEffect } from 'react';
import { 
  Users, Trophy, ChevronRight, PlayCircle, 
  Star, Medal, History, AlertCircle, FileText, RotateCcw 
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function PadelAmericano() {
  const [step, setStep] = useState(1);
  const [round, setRound] = useState(1);
  const [playerCount, setPlayerCount] = useState(8);
  const [targetPoints, setTargetPoints] = useState(16);
  const [playerNames, setPlayerNames] = useState(Array(16).fill(""));
  const [matches, setMatches] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [leaderboard, setLeaderboard] = useState<{name: string, points: number}[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Load data on start
  useEffect(() => {
    const saved = localStorage.getItem('padel_tournament_data');
    if (saved) {
      const data = JSON.parse(saved);
      setStep(data.step);
      setRound(data.round);
      setPlayerCount(data.playerCount);
      setTargetPoints(data.targetPoints);
      setPlayerNames(data.playerNames);
      setMatches(data.matches);
      setHistory(data.history);
      setLeaderboard(data.leaderboard);
    }
  }, []);

  // Save data on change
  useEffect(() => {
    const tournamentData = {
      step, round, playerCount, targetPoints, 
      playerNames, matches, history, leaderboard
    };
    localStorage.setItem('padel_tournament_data', JSON.stringify(tournamentData));
  }, [step, round, playerNames, matches, history, leaderboard]);

  const maxRounds = playerCount - 1;

  const handleNameChange = (index: number, value: string) => {
    const newNames = [...playerNames];
    newNames[index] = value;
    setPlayerNames(newNames);
  };

  const handleScoreChange = (matchId: number, team: 'A' | 'B', value: string) => {
    setError(null);
    const score = value === '' ? '' : parseInt(value);
    setMatches(matches.map(m => {
      if (m.id === matchId) {
        return team === 'A' ? { ...m, scoreA: score } : { ...m, scoreB: score };
      }
      return m;
    }));
  };

  const generateRound = (currentRound: number) => {
    const activeNames = playerNames.slice(0, playerCount).map((n, i) => n || `P${i + 1}`);
    const pool = activeNames.slice(1);
    const rotationCount = currentRound - 1;
    for(let r=0; r < rotationCount; r++) {
        pool.push(pool.shift()!);
    }
    const rotated = [activeNames[0], ...pool];

    const roundMatches = [];
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
  };

  const finishRound = () => {
    for (const m of matches) {
      const total = (Number(m.scoreA) || 0) + (Number(m.scoreB) || 0);
      if (total !== targetPoints) {
        setError(`Match total must be ${targetPoints}. Currently ${total}.`);
        return;
      }
    }

    const newScores = [...leaderboard];
    if (newScores.length === 0) {
      playerNames.slice(0, playerCount).forEach((n, i) => {
        newScores.push({ name: n || `P${i+1}`, points: 0 });
      });
    }

    setHistory(prev => [...prev, ...matches]);

    matches.forEach(m => {
      const valA = Number(m.scoreA);
      const valB = Number(m.scoreB);
      [...m.teamA].forEach(pName => {
        const p = newScores.find(s => s.name === pName);
        if (p) p.points += valA;
      });
      [...m.teamB].forEach(pName => {
        const p = newScores.find(s => s.name === pName);
        if (p) p.points += valB;
      });
    });

    setLeaderboard(newScores.sort((a, b) => b.points - a.points));
    setStep(4);
  };

  // FORCE RESET FUNCTION
  const resetTournament = () => {
    if (window.confirm("This will delete all current scores. Are you sure?")) {
      localStorage.clear(); // Clear all data
      window.location.href = "/"; // Force redirect to home/start
    }
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text("Padel Americano Results", 14, 22);
    doc.setFontSize(10);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 14, 30);

    doc.setFontSize(14);
    doc.text("Final Standings", 14, 45);
    autoTable(doc, {
      startY: 50,
      head: [['Rank', 'Player', 'Total Points']],
      body: leaderboard.map((p, i) => [i + 1, p.name, p.points]),
      theme: 'striped',
      headStyles: { fillColor: [37, 99, 235] }
    });

    const finalY = (doc as any).lastAutoTable.finalY || 50;
    doc.text("Match History", 14, finalY + 15);
    autoTable(doc, {
      startY: finalY + 20,
      head: [['Round', 'Team A', 'Score', 'Team B']],
      body: history.map(m => [
        `R${m.round}`, 
        `${m.teamA[0]} & ${m.teamA[1]}`, 
        `${m.scoreA} - ${m.scoreB}`, 
        `${m.teamB[0]} & ${m.teamB[1]}`
      ]),
      theme: 'grid'
    });

    doc.save("Padel_Americano_Results.pdf");
  };

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#4A4543] font-sans pb-20">
      <div className="h-1 w-full bg-gradient-to-r from-blue-200 via-blue-600 to-blue-200" />
      
      <main className="max-w-md mx-auto px-6 py-8">
        {step === 1 && (
          <div className="space-y-8 animate-in fade-in duration-500">

            <header className="text-center py-4">
              <h1 className="text-4xl font-extralight tracking-tight text-stone-800">
                Padel <span className="font-medium text-blue-600 italic">Americano</span>
              </h1>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400 mt-2">
                Developer - Kreesen
              </p>
            </header>
            <section className="space-y-3">
                <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 ml-1">Total Players</label>
                <div className="grid grid-cols-4 gap-2">
                    {[4, 8, 12, 16].map((num) => (
                    <button key={num} onClick={() => setPlayerCount(num)} className={`py-4 rounded-xl border transition-all ${playerCount === num ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-white text-stone-400 border-stone-100'}`}>{num}</button>
                    ))}
                </div>
            </section>
            <section className="space-y-3">
                <label className="text-[10px] font-bold uppercase tracking-widest text-stone-400 ml-1">Points per Match</label>
                <div className="grid grid-cols-4 gap-2">
                    {[12, 16, 20, 24].map((p) => (
                    <button key={p} onClick={() => setTargetPoints(p)} className={`py-4 rounded-xl border transition-all ${targetPoints === p ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-white text-stone-400 border-stone-100'}`}>{p}</button>
                    ))}
                </div>
            </section>
            <button onClick={() => setStep(2)} className="w-full bg-blue-600 text-white py-5 rounded-2xl shadow-xl flex items-center justify-between px-8 text-lg font-light">
              <span>Next: Player Names</span> <ChevronRight />
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4 animate-in slide-in-from-right duration-300">
            <h2 className="text-2xl font-light text-stone-800">Player Roster</h2>
            <div className="grid gap-2">
              {Array.from({ length: playerCount }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 bg-white px-4 py-1 rounded-xl border border-stone-100 shadow-sm">
                    <span className="text-stone-300 font-bold text-xs w-4">{i+1}</span>
                    <input type="text" placeholder={`Enter name...`} className="w-full py-4 bg-transparent outline-none text-lg font-normal" value={playerNames[i]} onChange={(e) => handleNameChange(i, e.target.value)} />
                </div>
              ))}
            </div>
            <button onClick={() => generateRound(1)} className="w-full bg-stone-800 text-white py-5 rounded-2xl mt-4 font-medium tracking-wide">Start Tournament</button>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4 animate-in fade-in duration-300">
            <div className="flex justify-between items-center px-1">
              <div className="bg-blue-600 text-white px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest">Round {round} of {maxRounds}</div>
              <div className="text-blue-600 text-[10px] font-bold uppercase tracking-widest bg-blue-50 px-3 py-1 rounded-full border border-blue-100">Target Score: {targetPoints}</div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-100 text-red-600 p-3 rounded-xl flex items-center gap-2 text-xs font-semibold">
                <AlertCircle size={14} /> {error}
              </div>
            )}

            {matches.map((match) => (
              <div key={match.id} className="bg-white rounded-2xl p-6 shadow-sm border border-stone-100">
                <div className="flex items-center gap-4">
                   <div className="flex-1 text-center space-y-3">
                      <p className="text-lg font-normal text-stone-700 leading-tight h-12 flex items-center justify-center">
                        {match.teamA[0]} & {match.teamA[1]}
                      </p>
                      <input type="number" className="w-full h-14 bg-blue-50 rounded-xl text-center text-2xl font-semibold text-blue-600 outline-none" value={match.scoreA} onChange={(e) => handleScoreChange(match.id, 'A', e.target.value)} />
                   </div>
                   <div className="text-stone-200 font-extralight text-2xl mt-12">vs</div>
                   <div className="flex-1 text-center space-y-3">
                      <p className="text-lg font-normal text-stone-700 leading-tight h-12 flex items-center justify-center">
                        {match.teamB[0]} & {match.teamB[1]}
                      </p>
                      <input type="number" className="w-full h-14 bg-stone-50 rounded-xl text-center text-2xl font-semibold text-stone-600 outline-none" value={match.scoreB} onChange={(e) => handleScoreChange(match.id, 'B', e.target.value)} />
                   </div>
                </div>
              </div>
            ))}
            
            <button onClick={finishRound} className="w-full bg-blue-600 text-white py-6 rounded-2xl shadow-xl font-bold flex items-center justify-center gap-2 mt-4 transition-transform active:scale-95">
              <Star size={18} fill="currentColor"/> Submit Scores
            </button>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-8 animate-in fade-in duration-500">
            <header className="text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-yellow-400 rounded-full mb-2 shadow-lg">
                 <Trophy className="text-white" size={24} />
              </div>
              <h2 className="text-3xl font-light text-stone-800 tracking-tight">Leaderboard</h2>
              <p className="text-stone-400 text-[10px] font-bold uppercase tracking-widest mt-1">
                {round === maxRounds ? 'Tournament Finalized' : `Round ${round} Results`}
              </p>
            </header>

            <div className="bg-white rounded-3xl shadow-xl border border-stone-100 overflow-hidden">
              {leaderboard.map((player, i) => (
                <div key={i} className={`flex items-center justify-between px-6 py-4 ${i !== leaderboard.length - 1 ? 'border-b border-stone-50' : ''} ${i === 0 ? 'bg-blue-50/20' : ''}`}>
                  <div className="flex items-center gap-4">
                    <span className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold ${i === 0 ? 'bg-yellow-400 text-white' : 'bg-stone-100 text-stone-400'}`}>{i + 1}</span>
                    <p className={`text-xl ${i === 0 ? 'text-stone-900 font-medium' : 'text-stone-600 font-normal'}`}>{player.name}</p>
                  </div>
                  <p className="text-2xl font-light text-blue-600">{player.points}</p>
                </div>
              ))}
            </div>

            <div className="space-y-3 pt-2">
                {round < maxRounds ? (
                    <button onClick={() => { setRound(round + 1); generateRound(round + 1); }} className="w-full bg-stone-800 text-white py-6 rounded-2xl font-medium text-lg shadow-xl flex items-center justify-center gap-3">
                        <PlayCircle size={22}/> Start Next Round
                    </button>
                ) : (
                    <div className="space-y-6 animate-in zoom-in-95 duration-500">
                        <div className="text-center p-10 bg-blue-600 rounded-3xl shadow-2xl text-white relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-full h-1 bg-white/20" />
                            <Medal className="mx-auto mb-4" size={56} />
                            <h3 className="text-2xl font-semibold mb-1">Tournament Complete!</h3>
                            <p className="text-blue-100 text-sm mb-6">Winner: {leaderboard[0]?.name}</p>
                        </div>

                        <button onClick={exportToPDF} className="w-full bg-white border border-stone-200 text-stone-600 py-5 rounded-2xl font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-sm">
                            <FileText size={18} /> Download Final PDF
                        </button>
                    </div>
                )}
            </div>

            {/* PERSISTENT HISTORY LEDGER */}
            <div className="space-y-6 pt-6">
                <div className="flex items-center gap-2 px-2 text-stone-400">
                    <History size={16} />
                    <h4 className="text-[10px] font-bold uppercase tracking-widest">Match Ledger</h4>
                </div>
                {Array.from({ length: round }).map((_, rIdx) => {
                    const roundMatches = history.filter(h => h.round === rIdx + 1);
                    if (roundMatches.length === 0) return null;
                    return (
                        <div key={rIdx} className="bg-white rounded-2xl border border-stone-200 p-5 space-y-4 shadow-sm">
                            <p className="text-[10px] font-bold uppercase text-stone-300 tracking-widest border-b border-stone-50 pb-2">Round {rIdx + 1}</p>
                            {roundMatches.map((match, mIdx) => (
                                <div key={mIdx} className="flex items-center justify-between py-1">
                                    <div className="flex-1 text-stone-700 font-normal text-sm leading-tight">{match.teamA[0]} & {match.teamA[1]}</div>
                                    <div className="px-4 font-bold text-blue-600 text-base">{match.scoreA} — {match.scoreB}</div>
                                    <div className="flex-1 text-right text-stone-700 font-normal text-sm leading-tight">{match.teamB[0]} & {match.teamB[1]}</div>
                                </div>
                            ))}
                        </div>
                    );
                })}
            </div>

            {/* ALWAYS VISIBLE RESET BUTTON AT THE BOTTOM */}
            <div className="pt-10">
                <button onClick={resetTournament} className="w-full bg-stone-100 text-stone-400 py-4 rounded-xl font-bold text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-colors hover:bg-red-50 hover:text-red-400">
                    <RotateCcw size={12} /> Clear & Reset All Tournament Data
                </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}