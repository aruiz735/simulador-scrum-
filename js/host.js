/**
 * UNAB Scrum Live Simulator - Host (Moderator) Controller
 * Manages game state, question bank sampling, scoring, live charts, leaderboard & podium
 */

class ScrumHostController {
  constructor() {
    this.pin = this.generatePin();
    this.sync = new LiveSyncEngine(true, this.pin);
    this.players = new Map(); // id -> { id, name, avatar, score: 0, streak: 0, isBot: false, answers: [] }
    this.allQuestions = window.QUESTION_BANK || [];
    this.sessionQuestions = [];
    this.currentQIndex = -1;
    this.currentAnswers = new Map(); // playerId -> { optionId, timeMs }
    this.state = 'LOBBY'; // LOBBY, PRE_COUNTDOWN, QUESTION, REVEAL, LEADERBOARD, PODIUM
    this.timerInterval = null;
    this.timeLeft = 30;
    this.questionDuration = 30;
    this.totalQuestionsCount = 10;
    this.selectedArea = 'ALL';
    
    // Audio synthesizer for zero-dependency sounds
    this.audioCtx = null;

    this.init();
  }

  generatePin() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  init() {
    this.renderLobby();
    this.setupListeners();
    this.sync.init(this.pin, (success) => {
      console.log('Host Network status:', success);
      const statusBadge = document.getElementById('network-badge');
      if (statusBadge) {
        statusBadge.innerHTML = success 
          ? '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800"><span class="w-2 h-2 mr-1.5 bg-emerald-500 rounded-full animate-pulse"></span>En línea (Cloud WebSockets Activo)</span>'
          : '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800"><span class="w-2 h-2 mr-1.5 bg-amber-500 rounded-full"></span>Modo Local / Pestañas Activo</span>';
      }
    });
  }

  playTone(freq = 440, duration = 0.1, type = 'sine') {
    try {
      if (!this.audioCtx) {
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);
      gain.gain.setValueAtTime(0.15, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start();
      osc.stop(this.audioCtx.currentTime + duration);
    } catch (e) {
      // Audio might be blocked by browser autoplay policy before user interaction
    }
  }

  playFanfare() {
    const notes = [261.63, 329.63, 392.00, 523.25];
    notes.forEach((freq, i) => {
      setTimeout(() => this.playTone(freq, 0.25, 'triangle'), i * 140);
    });
  }

  setupListeners() {
    // Player joins
    this.sync.on('PLAYER_JOIN', (payload, senderId) => {
      const { id, name, avatar } = payload;
      const playerId = id || senderId;
      if (!this.players.has(playerId)) {
        this.players.set(playerId, {
          id: playerId,
          name: name || `Agilista_${this.players.size + 1}`,
          avatar: avatar || '🦁',
          score: 0,
          streak: 0,
          isBot: false,
          answers: []
        });
        this.playTone(587.33, 0.12, 'sine');
        this.updateLobbyPlayersUI();
        this.broadcastLobbyState();
      }
    });

    // Player submits answer
    this.sync.on('PLAYER_ANSWER', (payload) => {
      if (this.state !== 'QUESTION') return;
      const { playerId, optionId, timeRemainingMs } = payload;
      if (this.players.has(playerId) && !this.currentAnswers.has(playerId)) {
        this.currentAnswers.set(playerId, {
          optionId,
          timeMs: timeRemainingMs || (this.timeLeft * 1000)
        });
        this.playTone(880, 0.08, 'triangle');
        this.updateLiveAnswersCountUI();

        // Check if all players have answered
        if (this.currentAnswers.size >= this.players.size && this.players.size > 0) {
          clearInterval(this.timerInterval);
          this.endQuestion();
        }
      }
    });

    // Player disconnects
    this.sync.on('PLAYER_DISCONNECT', (payload) => {
      if (payload && payload.peerId) {
        this.players.delete(payload.peerId);
        this.updateLobbyPlayersUI();
      }
    });
  }

  broadcastLobbyState() {
    this.sync.broadcast('LOBBY_UPDATE', {
      playersCount: this.players.size,
      players: Array.from(this.players.values()).map(p => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        score: p.score
      }))
    });
  }

  renderLobby() {
    const pinEl = document.getElementById('game-pin-display');
    if (pinEl) pinEl.textContent = this.pin;

    // Generate dynamic join URL
    let baseUrl = window.location.href.replace(/host\.html.*$/, 'player.html');
    if (!baseUrl.includes('player.html')) {
      baseUrl = window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '/player.html');
    }
    const joinUrl = `${baseUrl}?pin=${this.pin}`;
    
    const urlDisplay = document.getElementById('join-url-display');
    if (urlDisplay) urlDisplay.textContent = joinUrl;

    // Generate QR Code
    const qrContainer = document.getElementById('qrcode-container');
    if (qrContainer && typeof QRCode !== 'undefined') {
      qrContainer.innerHTML = '';
      new QRCode(qrContainer, {
        text: joinUrl,
        width: 170,
        height: 170,
        colorDark: '#0f172a',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M
      });
    }

    this.updateLobbyPlayersUI();
  }

  updateLobbyPlayersUI() {
    const countEl = document.getElementById('players-count-badge');
    if (countEl) countEl.textContent = `${this.players.size} Participantes`;

    const grid = document.getElementById('players-grid');
    if (!grid) return;

    if (this.players.size === 0) {
      grid.innerHTML = `
        <div class="col-span-full py-12 text-center text-slate-400">
          <div class="inline-block p-4 rounded-full bg-slate-800 text-3xl mb-3 animate-bounce">📱</div>
          <p class="text-lg font-medium text-slate-300">Esperando a que los participantes escaneen el código QR...</p>
          <p class="text-sm text-slate-500 mt-1">O digiten el PIN <span class="font-mono font-bold text-amber-400">${this.pin}</span> en sus dispositivos.</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = Array.from(this.players.values()).map(p => `
      <div class="flex items-center gap-3 p-3 bg-slate-800/90 border border-slate-700/80 rounded-xl shadow-sm transform hover:scale-105 transition duration-150 animate-fade-in">
        <span class="text-3xl">${p.avatar}</span>
        <div class="min-w-0 flex-1">
          <p class="text-sm font-bold text-white truncate">${p.name}</p>
          <p class="text-xs text-emerald-400 font-mono">${p.isBot ? 'Bot Simulado' : 'Conectado'}</p>
        </div>
        <button onclick="hostApp.removePlayer('${p.id}')" class="text-slate-500 hover:text-red-400 p-1 text-xs" title="Expulsar">✕</button>
      </div>
    `).join('');
  }

  addBots(count = 5) {
    const botNames = ['Ana_ScrumMaster', 'Diego_Dev', 'Valeria_PO', 'Andrés_Agile', 'Camila_Sprint', 'Mateo_Tester', 'Lucía_Kanban', 'Esteban_Coach'];
    const botAvatars = ['🦊', '🚀', '⚡', '🎯', '🦉', '🧙‍♂️', '🤖', '🐱'];
    
    for (let i = 0; i < count; i++) {
      const id = `bot_${Date.now()}_${i}`;
      const name = botNames[Math.floor(Math.random() * botNames.length)] + '_' + (Math.floor(Math.random() * 89) + 10);
      const avatar = botAvatars[Math.floor(Math.random() * botAvatars.length)];
      this.players.set(id, {
        id,
        name,
        avatar,
        score: 0,
        streak: 0,
        isBot: true,
        answers: []
      });
    }
    this.playTone(600, 0.15, 'sine');
    this.updateLobbyPlayersUI();
    this.broadcastLobbyState();
  }

  removePlayer(id) {
    this.players.delete(id);
    this.updateLobbyPlayersUI();
    this.broadcastLobbyState();
  }

  // Sample questions according to settings
  prepareSessionQuestions() {
    let pool = [...this.allQuestions];

    if (this.selectedArea && this.selectedArea !== 'ALL') {
      pool = pool.filter(q => q.area === this.selectedArea);
    }

    if (pool.length < this.totalQuestionsCount) {
      console.warn('Filtered pool is smaller than required questions, combining all.');
      pool = [...this.allQuestions];
    }

    // Shuffle pool
    const shuffled = pool.sort(() => 0.5 - Math.random());
    this.sessionQuestions = shuffled.slice(0, this.totalQuestionsCount);
    console.log(`Prepared ${this.sessionQuestions.length} questions for this session.`);
  }

  startGame() {
    if (this.players.size === 0) {
      alert('Debes tener al menos 1 participante (o puedes presionar "+ Agregar 5 Bots de Prueba" para probar el simulador).');
      return;
    }

    // Read settings
    const qCountSelect = document.getElementById('setting-qcount');
    if (qCountSelect) this.totalQuestionsCount = parseInt(qCountSelect.value, 10) || 10;

    const areaSelect = document.getElementById('setting-area');
    if (areaSelect) this.selectedArea = areaSelect.value;

    const timeSelect = document.getElementById('setting-time');
    if (timeSelect) this.questionDuration = parseInt(timeSelect.value, 10) || 30;

    this.prepareSessionQuestions();
    this.currentQIndex = 0;
    this.startPreCountdown();
  }

  startPreCountdown() {
    this.state = 'PRE_COUNTDOWN';
    this.hideAllViews();
    document.getElementById('pre-countdown-view').classList.remove('hidden');

    const numBadge = document.getElementById('pre-q-number');
    if (numBadge) numBadge.textContent = `Pregunta ${this.currentQIndex + 1} de ${this.totalQuestionsCount}`;

    const areaBadge = document.getElementById('pre-q-area');
    if (areaBadge) areaBadge.textContent = this.sessionQuestions[this.currentQIndex].area || 'Marco Scrum';

    let count = 3;
    const countDisplay = document.getElementById('pre-count-number');
    countDisplay.textContent = count;
    this.playTone(440, 0.1, 'square');

    const interval = setInterval(() => {
      count--;
      if (count > 0) {
        countDisplay.textContent = count;
        this.playTone(440, 0.1, 'square');
      } else {
        clearInterval(interval);
        this.playTone(880, 0.25, 'triangle');
        this.startQuestion();
      }
    }, 1000);
  }

  startQuestion() {
    this.state = 'QUESTION';
    this.currentAnswers.clear();
    this.timeLeft = this.questionDuration;

    const q = this.sessionQuestions[this.currentQIndex];

    this.hideAllViews();
    document.getElementById('question-view').classList.remove('hidden');

    // UI elements
    document.getElementById('q-progress-badge').textContent = `Pregunta ${this.currentQIndex + 1} / ${this.totalQuestionsCount}`;
    document.getElementById('q-area-badge').textContent = q.area || 'Marco Scrum';
    document.getElementById('q-text-es').textContent = q.question_es;
    document.getElementById('q-text-en').textContent = q.question_en || '';
    
    // Render the 4 options
    const cardsContainer = document.getElementById('options-cards-container');
    const colorThemes = [
      { bg: 'bg-rose-600', hover: 'hover:bg-rose-500', shape: '▲', label: 'A' },
      { bg: 'bg-blue-600', hover: 'hover:bg-blue-500', shape: '◆', label: 'B' },
      { bg: 'bg-amber-600', hover: 'hover:bg-amber-500', shape: '●', label: 'C' },
      { bg: 'bg-emerald-600', hover: 'hover:bg-emerald-500', shape: '■', label: 'D' }
    ];

    cardsContainer.innerHTML = q.options.map((opt, i) => {
      const theme = colorThemes[i % colorThemes.length];
      return `
        <div id="option-card-${opt.id}" class="relative flex items-center p-5 rounded-2xl ${theme.bg} text-white shadow-lg transition transform duration-200">
          <div class="flex items-center justify-center w-12 h-12 rounded-xl bg-black/25 text-2xl font-black mr-4 shadow-inner">
            ${theme.shape}
          </div>
          <div class="flex-1 pr-4">
            <span class="text-xs font-bold uppercase tracking-wider text-white/70 block mb-0.5">Opción ${theme.label}</span>
            <p class="text-lg md:text-xl font-bold leading-snug">${opt.text_es}</p>
            ${opt.text_en ? `<p class="text-xs text-white/75 italic mt-1">${opt.text_en}</p>` : ''}
          </div>
          <div id="stat-bar-${opt.id}" class="hidden absolute inset-0 bg-white/20 rounded-2xl transition-all duration-700 pointer-events-none"></div>
        </div>
      `;
    }).join('');

    this.updateLiveAnswersCountUI();

    // Broadcast to mobile players (Options without revealing is_correct!)
    this.sync.broadcast('QUESTION_START', {
      questionIndex: this.currentQIndex,
      totalQuestions: this.totalQuestionsCount,
      duration: this.questionDuration,
      area: q.area,
      question_es: q.question_es,
      question_en: q.question_en,
      options: q.options.map((opt, i) => ({
        id: opt.id,
        text_es: opt.text_es,
        text_en: opt.text_en,
        label: ['A', 'B', 'C', 'D'][i % 4],
        shape: ['▲', '◆', '●', '■'][i % 4]
      }))
    });

    // Start timer & Bot answers simulation
    this.startTimer();
    this.simulateBotAnswers();
  }

  simulateBotAnswers() {
    const q = this.sessionQuestions[this.currentQIndex];
    const correctOpt = q.options.find(o => o.is_correct);
    
    this.players.forEach(p => {
      if (p.isBot) {
        // Random reaction time between 4s and (duration - 3s)
        const delay = Math.floor(Math.random() * ((this.questionDuration - 4) * 1000)) + 3500;
        setTimeout(() => {
          if (this.state === 'QUESTION' && !this.currentAnswers.has(p.id)) {
            // 75% probability of bot picking the correct answer
            const isSmart = Math.random() < 0.75;
            let chosenId = correctOpt ? correctOpt.id : q.options[0].id;
            if (!isSmart) {
              const wrongOpts = q.options.filter(o => !o.is_correct);
              if (wrongOpts.length > 0) {
                chosenId = wrongOpts[Math.floor(Math.random() * wrongOpts.length)].id;
              }
            }
            this.currentAnswers.set(p.id, {
              optionId: chosenId,
              timeMs: Math.max(1000, (this.timeLeft * 1000) - Math.floor(Math.random() * 800))
            });
            this.updateLiveAnswersCountUI();
            if (this.currentAnswers.size >= this.players.size) {
              clearInterval(this.timerInterval);
              this.endQuestion();
            }
          }
        }, delay);
      }
    });
  }

  startTimer() {
    const timerText = document.getElementById('q-timer-number');
    const timerCircle = document.getElementById('q-timer-circle');
    const circumference = 2 * Math.PI * 45; // r=45

    timerText.textContent = this.timeLeft;

    clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      this.timeLeft--;
      if (timerText) timerText.textContent = this.timeLeft;

      // Update circular SVG progress
      if (timerCircle) {
        const offset = circumference - (this.timeLeft / this.questionDuration) * circumference;
        timerCircle.style.strokeDashoffset = offset;
      }

      // Audio tick during last 5 seconds
      if (this.timeLeft <= 5 && this.timeLeft > 0) {
        this.playTone(520, 0.08, 'square');
      }

      if (this.timeLeft <= 0) {
        clearInterval(this.timerInterval);
        this.playTone(220, 0.4, 'sawtooth');
        this.endQuestion();
      }
    }, 1000);
  }

  updateLiveAnswersCountUI() {
    const counterEl = document.getElementById('q-answered-count');
    if (counterEl) {
      counterEl.textContent = `${this.currentAnswers.size} / ${this.players.size}`;
    }
  }

  endQuestion() {
    this.state = 'REVEAL';
    const q = this.sessionQuestions[this.currentQIndex];
    const correctOpt = q.options.find(o => o.is_correct);

    // Calculate votes distribution
    const voteCounts = {};
    q.options.forEach(opt => voteCounts[opt.id] = 0);
    this.currentAnswers.forEach((ans) => {
      if (voteCounts[ans.optionId] !== undefined) {
        voteCounts[ans.optionId]++;
      }
    });

    // Score calculations for each player
    const totalPlayers = this.players.size || 1;
    let correctCount = 0;

    this.players.forEach(p => {
      const pAnswer = this.currentAnswers.get(p.id);
      const isCorrect = pAnswer && correctOpt && pAnswer.optionId === correctOpt.id;
      let pointsAwarded = 0;

      if (isCorrect) {
        correctCount++;
        p.streak = (p.streak || 0) + 1;
        // Base points: 600 + Speed points: up to 400
        const speedFactor = Math.max(0.1, (pAnswer.timeMs / (this.questionDuration * 1000)));
        const speedBonus = Math.round(speedFactor * 400);
        // Streak bonus
        const streakBonus = p.streak >= 3 ? 150 : (p.streak === 2 ? 50 : 0);
        pointsAwarded = 600 + speedBonus + streakBonus;
        p.score += pointsAwarded;
      } else {
        p.streak = 0;
      }

      p.answers.push({
        qIndex: this.currentQIndex,
        questionId: q.id,
        isCorrect,
        pointsAwarded,
        optionId: pAnswer ? pAnswer.optionId : null
      });
    });

    const pctCorrect = Math.round((correctCount / totalPlayers) * 100);

    // Broadcast results to players (including pedagogical stats & feedback)
    this.sync.broadcast('QUESTION_END', {
      questionIndex: this.currentQIndex,
      correctOptionId: correctOpt ? correctOpt.id : null,
      explanation_es: q.explanation_es,
      explanation_en: q.explanation_en,
      stats: voteCounts,
      pctCorrect: pctCorrect,
      totalPlayers: totalPlayers,
      leaderboard: this.getLeaderboardData()
    });

    // Update Host UI with reveal & bar chart
    this.renderRevealUI(q, correctOpt, voteCounts, correctCount, totalPlayers);
  }

  renderRevealUI(q, correctOpt, voteCounts, correctCount, totalPlayers) {
    // 1. Highlight options cards and display vote percentages
    q.options.forEach(opt => {
      const card = document.getElementById(`option-card-${opt.id}`);
      if (!card) return;
      const count = voteCounts[opt.id] || 0;
      const pct = Math.round((count / totalPlayers) * 100);

      if (opt.is_correct) {
        card.classList.remove('bg-rose-600', 'bg-blue-600', 'bg-amber-600');
        card.classList.add('bg-emerald-600', 'ring-4', 'ring-emerald-300', 'shadow-2xl', 'scale-[1.02]');
        card.innerHTML += `
          <div class="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2 bg-emerald-950/80 px-3 py-1.5 rounded-xl border border-emerald-400">
            <span class="text-emerald-400 text-lg">✓ Correcta</span>
            <span class="font-mono font-black text-white text-base">${count} votos (${pct}%)</span>
          </div>
        `;
      } else {
        card.classList.add('opacity-45', 'grayscale-[30%]');
        card.innerHTML += `
          <div class="absolute right-4 top-1/2 -translate-y-1/2 flex items-center bg-black/60 px-3 py-1 rounded-lg text-slate-300 font-mono text-sm">
            ${count} votos (${pct}%)
          </div>
        `;
      }
    });

    // 2. Show Explanation & Pedagogical Alert Box
    const revealPanel = document.getElementById('reveal-explanation-panel');
    if (revealPanel) {
      revealPanel.classList.remove('hidden');

      const alertContainer = document.getElementById('pedagogical-alert');
      const pctCorrect = Math.round((correctCount / totalPlayers) * 100);
      
      let alertHtml = '';
      if (pctCorrect < 40) {
        alertHtml = `
          <div class="p-3 bg-red-950/70 border border-red-500/50 rounded-xl text-red-200 text-sm flex items-start gap-2.5 mb-3">
            <span class="text-xl">⚠️</span>
            <div>
              <p class="font-bold">Alerta Pedagógica UNAB (Trampa Crítica de Certificación)</p>
              <p class="text-xs text-red-300">Solo el ${pctCorrect}% de los participantes acertó. Este es un punto de alta confusión en los exámenes oficiales PSM I / SPOPC. Tómese un momento para reforzar la justificación abajo.</p>
            </div>
          </div>
        `;
      } else if (pctCorrect >= 80) {
        alertHtml = `
          <div class="p-2.5 bg-emerald-950/60 border border-emerald-500/40 rounded-xl text-emerald-200 text-xs flex items-center gap-2 mb-3">
            <span class="text-lg">🎯</span>
            <span><strong>¡Excelente dominio grupal!</strong> El ${pctCorrect}% del equipo domina este concepto de la Guía Scrum.</span>
          </div>
        `;
      }
      alertContainer.innerHTML = alertHtml;

      document.getElementById('explanation-text-es').innerHTML = q.explanation_es.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      if (q.explanation_en) {
        document.getElementById('explanation-text-en').innerHTML = q.explanation_en.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      }
    }
  }

  showLeaderboard() {
    this.state = 'LEADERBOARD';
    this.hideAllViews();
    document.getElementById('leaderboard-view').classList.remove('hidden');

    const board = this.getLeaderboardData();
    const listContainer = document.getElementById('leaderboard-list');

    listContainer.innerHTML = board.slice(0, 7).map((p, index) => {
      const rankBadges = ['🥇', '🥈', '🥉'];
      const rankBadge = rankBadges[index] || `<span class="font-mono font-bold text-slate-400">#${index + 1}</span>`;
      const isTop3 = index < 3;
      const streakIcon = p.streak >= 3 ? `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">🔥 ${p.streak} racha</span>` : '';

      return `
        <div class="flex items-center justify-between p-4 ${isTop3 ? 'bg-gradient-to-r from-slate-800 to-slate-800/90 border-amber-500/40' : 'bg-slate-800/60 border-slate-700/60'} border rounded-2xl shadow-md transform hover:scale-[1.01] transition duration-200">
          <div class="flex items-center gap-4">
            <div class="w-8 text-center text-2xl font-bold">${rankBadge}</div>
            <div class="text-3xl">${p.avatar}</div>
            <div>
              <p class="font-bold text-white text-base md:text-lg flex items-center gap-2">
                ${p.name}
                ${streakIcon}
              </p>
              <p class="text-xs text-slate-400 font-mono">${p.answersCorrect} de ${this.currentQIndex + 1} aciertos</p>
            </div>
          </div>
          <div class="text-right">
            <span class="text-2xl font-black text-amber-400 font-mono tracking-tight">${p.score.toLocaleString()}</span>
            <span class="text-xs text-slate-400 block font-semibold">PTS</span>
          </div>
        </div>
      `;
    }).join('');

    const nextBtn = document.getElementById('leaderboard-next-btn');
    if (this.currentQIndex + 1 >= this.totalQuestionsCount) {
      nextBtn.innerHTML = 'Ver Gran Podio Final 🏆';
      nextBtn.onclick = () => this.showFinalPodium();
    } else {
      nextBtn.innerHTML = `Siguiente Pregunta (${this.currentQIndex + 2}/${this.totalQuestionsCount}) ➔`;
      nextBtn.onclick = () => {
        this.currentQIndex++;
        this.startPreCountdown();
      };
    }
  }

  showFinalPodium() {
    this.state = 'PODIUM';
    this.hideAllViews();
    document.getElementById('podium-view').classList.remove('hidden');

    const ranking = this.getLeaderboardData();

    // Fill top 3 places on podium
    const p1 = ranking[0] || { name: '-', avatar: '🏆', score: 0 };
    const p2 = ranking[1] || { name: '-', avatar: '🥈', score: 0 };
    const p3 = ranking[2] || { name: '-', avatar: '🥉', score: 0 };

    document.getElementById('podium-1-name').textContent = p1.name;
    document.getElementById('podium-1-avatar').textContent = p1.avatar;
    document.getElementById('podium-1-score').textContent = `${p1.score.toLocaleString()} pts`;

    document.getElementById('podium-2-name').textContent = p2.name;
    document.getElementById('podium-2-avatar').textContent = p2.avatar;
    document.getElementById('podium-2-score').textContent = `${p2.score.toLocaleString()} pts`;

    document.getElementById('podium-3-name').textContent = p3.name;
    document.getElementById('podium-3-avatar').textContent = p3.avatar;
    document.getElementById('podium-3-score').textContent = `${p3.score.toLocaleString()} pts`;

    // Render full participants summary table
    const tableBody = document.getElementById('full-ranking-tbody');
    tableBody.innerHTML = ranking.map((p, i) => `
      <tr class="border-b border-slate-700/60 hover:bg-slate-800/40">
        <td class="px-4 py-3 font-mono font-bold text-amber-400">#${i + 1}</td>
        <td class="px-4 py-3 flex items-center gap-2 font-medium text-white">
          <span>${p.avatar}</span>
          <span>${p.name}</span>
        </td>
        <td class="px-4 py-3 text-center font-mono font-semibold text-emerald-400">${p.answersCorrect} / ${this.totalQuestionsCount}</td>
        <td class="px-4 py-3 text-center font-mono font-bold">${Math.round((p.answersCorrect / this.totalQuestionsCount) * 100)}%</td>
        <td class="px-4 py-3 text-right font-mono font-black text-amber-400">${p.score.toLocaleString()}</td>
      </tr>
    `).join('');

    // Trigger celebration fanfare and confetti
    this.playFanfare();
    if (typeof confetti !== 'undefined') {
      confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
      setTimeout(() => confetti({ particleCount: 80, angle: 60, spread: 55, origin: { x: 0 } }), 500);
      setTimeout(() => confetti({ particleCount: 80, angle: 120, spread: 55, origin: { x: 1 } }), 800);
    }

    // Broadcast Game Over to all mobile clients
    this.sync.broadcast('GAME_OVER', {
      top3: [p1, p2, p3],
      totalQuestions: this.totalQuestionsCount
    });
  }

  getLeaderboardData() {
    return Array.from(this.players.values())
      .map(p => {
        const correctCount = p.answers.filter(a => a.isCorrect).length;
        return {
          id: p.id,
          name: p.name,
          avatar: p.avatar,
          score: p.score,
          streak: p.streak,
          answersCorrect: correctCount
        };
      })
      .sort((a, b) => b.score - a.score);
  }

  exportCSV() {
    const ranking = this.getLeaderboardData();
    let csv = "\uFEFF"; // UTF-8 BOM for Excel Spanish accents
    csv += "Puesto,Nombre,Avatar,Puntos Totales,Preguntas Acertadas,Total Preguntas,Efectividad %,Fecha\n";

    const dateStr = new Date().toLocaleString('es-CO');
    ranking.forEach((p, idx) => {
      const pct = Math.round((p.answersCorrect / this.totalQuestionsCount) * 100);
      csv += `"${idx + 1}","${p.name}","${p.avatar}","${p.score}","${p.answersCorrect}","${this.totalQuestionsCount}","${pct}%","${dateStr}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Resultados_Simulador_UNAB_Scrum_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  hideAllViews() {
    const views = ['lobby-view', 'pre-countdown-view', 'question-view', 'leaderboard-view', 'podium-view'];
    views.forEach(v => {
      const el = document.getElementById(v);
      if (el) el.classList.add('hidden');
    });
  }
}

// Global initialization
window.addEventListener('DOMContentLoaded', () => {
  window.hostApp = new ScrumHostController();
});
