"use client"; // This must be the very first line

import React, { useState, useEffect } from 'react';
import { 
  Trophy, Users, Play, RotateCcw, ChevronRight, 
  History, Award, Settings, Save, Edit3, Trash2,
  ChevronLeft, LayoutGrid, List, CheckCircle2, AlertCircle
} from 'lucide-react';

interface Player {
  id: number;
  name: string;
  points: number;
  matchesPlayed: number;
  wins: number;
  diff: number;
}

const PadelTournament = () => {
  // --- STATE ---
  const [players, setPlayers] = useState<Player[]>([]);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [totalRounds, setTotalRounds] = useState(4);
  const [currentRound, setCurrentRound] = useState(1);
  const [matches, setMatches] = useState<any[]>([]);
  const [roundHistory, setRoundHistory] = useState<any[]>([]);
  const [currentStep, setCurrentStep] = useState(1);
  const [isMexicano, setIsMexicano] = useState(false);
  const [targetScore, setTargetScore] = useState(24);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  // Load state from local storage on mount
  useEffect(() => {
    const saved = localStorage.getItem('padel-americano-pro-state');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setPlayers(parsed.players || []);
        setTotalRounds(parsed.totalRounds || 4);
        setCurrentRound(parsed.currentRound || 1);
        setMatches(parsed.matches || []);
        setRoundHistory(parsed.roundHistory || []);
        setCurrentStep(parsed.currentStep || 1);
        setIsMexicano(parsed.isMexicano || false);
        setTargetScore(parsed.targetScore || 24);
      } catch (e) {
        console.error("Failed to load saved state", e);
      }
    }
  }, []);

  // Save state to local storage whenever it changes
  useEffect(() => {
    const state = {
      players, totalRounds, currentRound, matches,
      roundHistory, currentStep, isMexicano, targetScore
    };
    localStorage.setItem('padel-americano-pro-state', JSON.stringify(state));
  }, [players, totalRounds, currentRound, matches, roundHistory, currentStep, isMexicano, targetScore]);

  // --- LOGIC ---
  const addPlayer = () => {
    if (newPlayerName.trim()) {
      setPlayers([...players, { 
        id: Date.now(), 
        name: newPlayerName.trim(), 
        points: 0,
        matchesPlayed: 0,
        wins: 0,
        diff: 0
      }]);
      setNewPlayerName('');
    }
  };

  const removePlayer = (id) => {
    setPlayers(players.filter(p => p.id !== id));
  };

  const generateMatches = (roundNumber) => {
    let pairings = [];
    let activePlayers = [...players];
    
    // Sort for Mexicano if active
    if (isMexicano && roundNumber > 1) {
      activePlayers.sort((a, b) => b.points - a.points);
    } else {
      activePlayers.sort(() => Math.random() - 0.5);
    }

    // Standard Americano / Mexicano pairing logic
    for (let i = 0; i < Math.floor(activePlayers.length / 4); i++) {
      const p1 = activePlayers[i * 4];
      const p2 = activePlayers[i * 4 + 1];
      const p3 = activePlayers[i * 4 + 2];
      const p4 = activePlayers[i * 4 + 3];
      
      pairings.push({
        id: i,
        teamA: [p1.name, p2.name],
        teamB: [p3.name, p4.name],
        scoreA: '',
        scoreB: ''
      });
    }
    setMatches(pairings);
  };

  const startTournament = () => {
    if (players.length < 4) return;
    generateMatches(1);
    setCurrentStep(2);
  };

  const updateScore = (matchId, team, value) => {
    const newMatches = matches.map(m => {
      if (m.id === matchId) {
        return { ...m, [team]: value };
      }
      return m;
    });
    setMatches(newMatches);
  };

  // --- UPDATED LOGIC BLOCK 1: handleScoreSubmit (ALLOWS EDITING EXISTING ROUNDS) ---
  const handleScoreSubmit = () => {
    const updatedHistory = [...roundHistory];
    const existingIndex = updatedHistory.findIndex(h => h.round === currentRound);

    // If we are editing a previous round, replace it. Otherwise, add new.
    if (existingIndex > -1) {
      updatedHistory[existingIndex] = { 
        round: currentRound, 
        matches: [...matches].map(m => ({ ...m })) 
      };
    } else {
      updatedHistory.push({ 
        round: currentRound, 
        matches: [...matches].map(m => ({ ...m })) 
      });
    }

    setRoundHistory(updatedHistory);

    // Recalculate Leaderboard Stats from scratch based on full history
    const newPlayers = players.map(p => ({
      ...p,
      points: 0,
      matchesPlayed: 0,
      wins: 0,
      diff: 0
    }));

    updatedHistory.forEach(round => {
      round.matches.forEach(m => {
        const sA = parseInt(m.scoreA) || 0;
        const sB = parseInt(m.scoreB) || 0;

        newPlayers.forEach(p => {
          if (m.teamA.includes(p.name)) {
            p.points += sA;
            p.matchesPlayed += 1;
            p.diff += (sA - sB);
            if (sA > sB) p.wins += 1;
          }
          if (m.teamB.includes(p.name)) {
            p.points += sB;
            p.matchesPlayed += 1;
            p.diff += (sB - sA);
            if (sB > sA) p.wins += 1;
          }
        });
      });
    });

    setPlayers(newPlayers);

    // Determine if we move to next round or final leaderboard
    if (currentRound < totalRounds && existingIndex === -1) {
      const nextRound = currentRound + 1;
      setCurrentRound(nextRound);
      generateMatches(nextRound);
      setCurrentStep(2); // Go to next round schedule
    } else {
      setCurrentStep(4); // Show leaderboard/match history
    }
  };

  const resetTournament = () => {
    if (window.confirm("Start fresh? This clears all current progress.")) {
      localStorage.removeItem('padel-americano-pro-state');
      window.location.reload();
    }
  };

  // --- UI RENDERING ---

  const renderStep1 = () => (
    <div className="max-w-md mx-auto p-6 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="space-y-2">
        <h1 className="text-4xl font-black text-stone-900 italic tracking-tight uppercase">
          Padel <span className="text-blue-600">Americano</span> Pro
        </h1>
        <p className="text-stone-400 font-medium text-sm">Professional Tournament Manager</p>
      </div>

      <div className="space-y-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={newPlayerName}
            onChange={(e) => setNewPlayerName(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && addPlayer()}
            placeholder="Enter player name..."
            className="flex-1 bg-white border-2 border-stone-100 rounded-2xl px-5 py-4 text-stone-700 focus:outline-none focus:border-blue-500 transition-all font-bold shadow-sm"
          />
          <button 
            onClick={addPlayer}
            className="bg-blue-600 hover:bg-blue-700 text-white w-14 h-14 rounded-2xl flex items-center justify-center transition-all shadow-lg active:scale-95"
          >
            <Users className="w-6 h-6" />
          </button>
        </div>

        <div className="bg-white rounded-3xl border border-stone-100 shadow-sm divide-y divide-stone-50 overflow-hidden">
          {players.map((p) => (
            <div key={p.id} className="flex items-center justify-between p-5 hover:bg-stone-50 transition-colors">
              <div className="flex items-center gap-4">
                <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 font-bold text-xs">
                  {p.name.charAt(0)}
                </div>
                <span className="font-bold text-stone-700">{p.name}</span>
              </div>
              <button onClick={() => removePlayer(p.id)} className="text-stone-300 hover:text-red-500 transition-colors">
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          ))}
          {players.length === 0 && (
            <div className="p-10 text-center space-y-2 text-stone-400">
              <Users className="w-10 h-10 mx-auto opacity-20" />
              <p className="text-sm font-medium">Add at least 4 players to start</p>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white p-4 rounded-3xl border border-stone-100 shadow-sm space-y-2">
          <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Rounds</label>
          <div className="flex items-center justify-between">
            <button onClick={() => setTotalRounds(Math.max(1, totalRounds - 1))} className="text-stone-400 p-1">
               <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="text-xl font-black text-stone-800">{totalRounds}</span>
            <button onClick={() => setTotalRounds(totalRounds + 1)} className="text-stone-400 p-1">
               <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="bg-white p-4 rounded-3xl border border-stone-100 shadow-sm space-y-2">
          <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Format</label>
          <button 
            onClick={() => setIsMexicano(!isMexicano)}
            className={`w-full flex items-center justify-between text-left transition-all ${isMexicano ? 'text-blue-600' : 'text-stone-400'}`}
          >
            <span className="text-xs font-black uppercase">{isMexicano ? 'Mexicano' : 'Americano'}</span>
            <Settings className={`w-4 h-4 ${isMexicano ? 'animate-spin-slow' : ''}`} />
          </button>
        </div>
      </div>

      <button
        onClick={startTournament}
        disabled={players.length < 4}
        className="w-full bg-stone-900 disabled:opacity-30 text-white py-5 rounded-3xl font-black text-lg flex items-center justify-center gap-3 shadow-xl active:scale-95 transition-all"
      >
        <Play className="w-6 h-6 fill-current" />
        GENERATE TOURNAMENT
      </button>
    </div>
  );

  const renderStep2 = () => (
    <div className="max-w-md mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Match Schedule</span>
          <h2 className="text-2xl font-black text-stone-900 uppercase italic">Round {currentRound}</h2>
        </div>
        <div className="text-right">
          <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Progress</span>
          <div className="text-lg font-black text-stone-800">{currentRound}/{totalRounds}</div>
        </div>
      </div>

      <div className="space-y-4">
        {matches.map((match) => (
          <div key={match.id} className="bg-white rounded-3xl p-6 shadow-sm border border-stone-100 space-y-4">
            <div className="grid grid-cols-2 gap-8 relative">
              <div className="space-y-3">
                <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest">Team A</span>
                {match.teamA.map((p, i) => (
                  <div key={i} className="font-bold text-stone-700 truncate">{p}</div>
                ))}
              </div>
              <div className="space-y-3 text-right">
                <span className="text-[10px] font-black text-red-500 uppercase tracking-widest">Team B</span>
                {match.teamB.map((p, i) => (
                  <div key={i} className="font-bold text-stone-700 truncate">{p}</div>
                ))}
              </div>
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-stone-50 w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black text-stone-300">VS</div>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={() => setCurrentStep(3)}
        className="w-full bg-blue-600 text-white py-5 rounded-3xl font-black text-lg flex items-center justify-center gap-3 shadow-xl active:scale-95 transition-all"
      >
        START SCORING
        <ChevronRight className="w-6 h-6" />
      </button>
    </div>
  );

  const renderStep3 = () => (
    <div className="max-w-md mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-black text-stone-900 italic uppercase">Enter Scores</h2>
        <div className="px-4 py-1 bg-stone-900 rounded-full text-white text-[10px] font-bold">ROUND {currentRound}</div>
      </div>

      <div className="space-y-4">
        {matches.map((match) => (
          <div key={match.id} className="bg-white rounded-3xl p-6 shadow-sm border border-stone-100">
            <div className="flex items-center gap-4">
              <div className="flex-1 space-y-1">
                <p className="text-[10px] font-bold text-stone-400 uppercase">Team A</p>
                <p className="font-bold text-stone-800 text-sm truncate">{match.teamA.join(' & ')}</p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  value={match.scoreA}
                  onChange={(e) => updateScore(match.id, 'scoreA', e.target.value)}
                  className="w-16 h-16 bg-stone-50 border-2 border-stone-100 rounded-2xl text-center text-2xl font-black text-stone-800 focus:border-blue-500 focus:outline-none transition-all"
                />
                <span className="text-stone-300 font-black">:</span>
                <input
                  type="number"
                  inputMode="numeric"
                  value={match.scoreB}
                  onChange={(e) => updateScore(match.id, 'scoreB', e.target.value)}
                  className="w-16 h-16 bg-stone-50 border-2 border-stone-100 rounded-2xl text-center text-2xl font-black text-stone-800 focus:border-blue-500 focus:outline-none transition-all"
                />
              </div>
              <div className="flex-1 space-y-1 text-right">
                <p className="text-[10px] font-bold text-stone-400 uppercase">Team B</p>
                <p className="font-bold text-stone-800 text-sm truncate">{match.teamB.join(' & ')}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={handleScoreSubmit}
        className="w-full bg-stone-900 text-white py-5 rounded-3xl font-black text-lg flex items-center justify-center gap-3 shadow-xl active:scale-95 transition-all"
      >
        SUBMIT RESULTS
        <CheckCircle2 className="w-6 h-6" />
      </button>
    </div>
  );

  // --- UPDATED LOGIC BLOCK 2: renderStep4 (FULL EXPANDED STEP 4 UI) ---
  const renderStep4 = () => {
    const sortedPlayers = [...players].sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      return b.diff - a.diff;
    });

    return (
      <div className="max-w-md mx-auto p-4 space-y-6">
        {/* Podium/Winner Display */}
        <div className="bg-stone-900 rounded-[2.5rem] p-8 text-center relative overflow-hidden shadow-2xl">
          <div className="absolute top-0 right-0 p-8 opacity-10">
            <Trophy className="w-32 h-32 text-white" />
          </div>
          <Trophy className="w-16 h-16 text-yellow-400 mx-auto mb-4" />
          <h2 className="text-3xl font-black text-white italic uppercase tracking-tight">Champion</h2>
          <div className="text-4xl font-black text-blue-400 uppercase mt-2">{sortedPlayers[0]?.name}</div>
          <div className="mt-4 flex justify-center gap-4 text-white/60 text-[10px] font-bold uppercase tracking-widest">
            <span>{sortedPlayers[0]?.points} Total Points</span>
            <span>{sortedPlayers[0]?.wins} Wins</span>
          </div>
        </div>

        {/* Standings Table */}
        <div className="border-none shadow-sm bg-white rounded-[2rem] overflow-hidden">
          <div className="border-b border-stone-50 bg-white p-6">
            <div className="text-[10px] font-black uppercase tracking-[0.3em] text-stone-400">
              Final Standings
            </div>
          </div>
          <div className="p-0">
            <div className="divide-y divide-stone-50">
              {sortedPlayers.map((p, i) => (
                <div key={p.id} className="flex items-center justify-between p-5 hover:bg-stone-50 transition-colors">
                  <div className="flex items-center gap-4">
                    <span className={`w-6 text-[10px] font-black ${i < 3 ? 'text-blue-600' : 'text-stone-300'}`}>
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className="font-bold text-stone-700">{p.name}</span>
                  </div>
                  <div className="flex gap-8 items-center">
                    <div className="text-right">
                      <p className="text-[8px] font-black text-stone-300 uppercase">Diff</p>
                      <p className={`text-xs font-bold ${p.diff > 0 ? 'text-green-500' : 'text-stone-400'}`}>{p.diff > 0 ? `+${p.diff}` : p.diff}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[8px] font-black text-stone-300 uppercase">Points</p>
                      <p className="text-lg font-black text-stone-900">{p.points}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* --- EDITABLE MATCH HISTORY SECTION --- */}
        <div className="space-y-4 mt-8">
          <div className="flex items-center justify-between px-2">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400">
              Match History
            </h3>
            <span className="text-[10px] text-blue-500 font-medium italic">Tap round to edit</span>
          </div>

          {roundHistory.map((r, i) => (
            <div 
              key={i} 
              onClick={() => {
                setCurrentRound(r.round);
                setMatches(r.matches);
                setCurrentStep(3); // Load Round into Scoring Screen
              }}
              className="group cursor-pointer bg-white rounded-2xl border border-stone-100 overflow-hidden shadow-sm hover:border-blue-200 transition-all active:scale-[0.98]"
            >
              <div className="bg-stone-50 px-4 py-2 border-b border-stone-100 flex justify-between items-center group-hover:bg-blue-50">
                <span className="text-[10px] font-bold text-stone-500 uppercase">Round {r.round}</span>
                <Edit3 className="w-3 h-3 text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              
              <div className="divide-y divide-stone-50">
                {r.matches.map((m, idx) => (
                  <div key={idx} className="p-4 flex justify-between items-center text-xs">
                    <div className="flex-1 text-stone-600 font-semibold">{m.teamA.join(' & ')}</div>
                    <div className="flex items-center gap-3 px-4">
                      <span className={`text-lg font-black ${Number(m.scoreA) > Number(m.scoreB) ? 'text-blue-600' : 'text-stone-800'}`}>
                        {m.scoreA}
                      </span>
                      <span className="text-stone-300 font-light">:</span>
                      <span className={`text-lg font-black ${Number(m.scoreB) > Number(m.scoreA) ? 'text-blue-600' : 'text-stone-800'}`}>
                        {m.scoreB}
                      </span>
                    </div>
                    <div className="flex-1 text-right text-stone-600 font-semibold">{m.teamB.join(' & ')}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <button 
          onClick={resetTournament}
          className="w-full py-5 bg-stone-100 text-stone-400 hover:text-red-500 rounded-3xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2"
        >
          <RotateCcw className="w-4 h-4" />
          Reset Tournament Data
        </button>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] pb-20">
      {currentStep === 1 && renderStep1()}
      {currentStep === 2 && renderStep2()}
      {currentStep === 3 && renderStep3()}
      {currentStep === 4 && renderStep4()}
      
      {/* Footer Navigation */}
      {currentStep > 1 && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/80 backdrop-blur-lg border-t border-stone-100 flex justify-center gap-2 z-50">
           <button 
            onClick={() => setCurrentStep(1)}
            className={`p-4 rounded-2xl transition-all ${currentStep === 1 ? 'bg-blue-600 text-white' : 'text-stone-400'}`}
           >
             <Users className="w-5 h-5" />
           </button>
           <button 
            onClick={() => setCurrentStep(4)}
            className={`p-4 rounded-2xl transition-all ${currentStep === 4 ? 'bg-blue-600 text-white' : 'text-stone-400'}`}
           >
             <Trophy className="w-5 h-5" />
           </button>
        </div>
      )}
    </div>
  );
};

export default PadelTournament;