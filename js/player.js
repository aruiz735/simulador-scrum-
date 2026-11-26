/**
 * UNAB Scrum Live Simulator - Player (Mobile) Controller
 * Formatted identically to Moderator view with full pedagogical feedback
 */

class ScrumPlayerController {
  constructor() {
    this.sync = null;
    this.pin = '';
    this.playerId = 'player_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    this.name = '';
    this.avatar = '🦊';
    this.score = 0;
    this.streak = 0;
    this.currentQuestion = null;
    this.hasAnswered = false;
    this.selectedOptionId = null;
    this.currentLanguage = 'es'; // 'es' or 'en'
    this.questionStartTime = 0;
    this.timerInterval = null;
    this.timeLeft = 30;
    this.questionDuration = 30;

    this.init();
  }

  init() {
    // Check if PIN is in query parameter (e.g. from QR scan)
    const urlParams = new URLSearchParams(window.location.search);
    const pinParam = urlParams.get('pin');
    if (pinParam) {
      const pinInput = document.getElementById('input-pin');
      if (pinInput) pinInput.value = pinParam;
      this.pin = pinParam;
    }

    this.setupAvatarPicker();
    this.setupUIEvents();
  }

  setupAvatarPicker() {
    const avatars = ['🦊', '🚀', '⚡', '🎯', '🦁', '🦉', '🧙‍♂️', '🤖', '🐱', '🐺', '🐲', '🏆'];
    const container = document.getElementById('avatar-picker');
    if (!container) return;

    container.innerHTML = avatars.map((av, idx) => `
      <button type="button" onclick="playerApp.selectAvatar('${av}', this)" 
        class="avatar-opt p-2 text-3xl rounded-xl border-2 ${idx === 0 ? 'border-amber-400 bg-amber-500/20 shadow-md' : 'border-slate-700 bg-slate-800/80'} hover:border-amber-400 transition transform hover:scale-110">
        ${av}
      </button>
    `).join('');
  }

  selectAvatar(av, btnEl) {
    this.avatar = av;
    document.querySelectorAll('.avatar-opt').forEach(b => {
      b.classList.remove('border-amber-400', 'bg-amber-500/20');
      b.classList.add('border-slate-700', 'bg-slate-800/80');
    });
    if (btnEl) {
      btnEl.classList.remove('border-slate-700', 'bg-slate-800/80');
      btnEl.classList.add('border-amber-400', 'bg-amber-500/20');
    }
  }

  setupUIEvents() {
    const joinBtn = document.getElementById('btn-join-game');
    if (joinBtn) {
      joinBtn.addEventListener('click', () => this.joinGame());
    }

    const pinInput = document.getElementById('input-pin');
    if (pinInput) {
      pinInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') document.getElementById('input-name').focus();
      });
    }

    const nameInput = document.getElementById('input-name');
    if (nameInput) {
      nameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') this.joinGame();
      });
    }
  }

  joinGame() {
    const pinInput = document.getElementById('input-pin');
    const nameInput = document.getElementById('input-name');

    this.pin = pinInput ? pinInput.value.trim() : '';
    this.name = nameInput ? nameInput.value.trim() : '';

    if (!this.pin || this.pin.length < 4) {
      alert('Por favor introduce un PIN de juego válido.');
      return;
    }
    if (!this.name) {
      alert('Por favor introduce tu nombre o alias para el ranking.');
      return;
    }

    // Update Header Profile pill
    const profilePill = document.getElementById('player-profile-pill');
    if (profilePill) {
      profilePill.classList.remove('hidden');
      profilePill.classList.add('flex');
      document.getElementById('header-avatar').textContent = this.avatar;
      document.getElementById('header-name').textContent = this.name;
      document.getElementById('header-score').textContent = '0 pts';
    }

    // Connect via LiveSyncEngine
    this.sync = new LiveSyncEngine(false, this.pin);

    // Show loading state
    const statusText = document.getElementById('join-status-msg');
    if (statusText) statusText.textContent = 'Conectando con la sala del facilitador...';

    // Listen for game events
    this.setupGameListeners();

    const sendJoinPayload = () => {
      this.sync.broadcast('PLAYER_JOIN', {
        id: this.playerId,
        name: this.name,
        avatar: this.avatar
      });
    };

    // Connect via WebSockets & BroadcastChannel
    this.sync.connectToHost(this.pin, (success) => {
      console.log('Player connect result:', success);
      if (success) {
        sendJoinPayload();
      }
    });

    // Send immediately (will queue if still connecting) and retry
    sendJoinPayload();
    setTimeout(sendJoinPayload, 1200);
    setTimeout(sendJoinPayload, 2800);

    this.showWaitingLobby();
  }

  setupGameListeners() {
    // Question starts
    this.sync.on('QUESTION_START', (payload) => {
      this.currentQuestion = payload;
      this.hasAnswered = false;
      this.selectedOptionId = null;
      this.questionStartTime = Date.now();
      this.questionDuration = payload.duration || 30;
      this.timeLeft = this.questionDuration;
      this.showQuestionUI(payload);
    });

    // Question ends & reveal
    this.sync.on('QUESTION_END', (payload) => {
      this.showQuestionResult(payload);
    });

    // Game ends
    this.sync.on('GAME_OVER', (payload) => {
      this.showGameOver(payload);
    });
  }

  showWaitingLobby() {
    this.hideAllViews();
    document.getElementById('view-lobby-wait').classList.remove('hidden');
    document.getElementById('lobby-wait-avatar').textContent = this.avatar;
    document.getElementById('lobby-wait-name').textContent = this.name;
    document.getElementById('lobby-wait-pin').textContent = `SALA PIN: ${this.pin}`;
  }

  showQuestionUI(qData) {
    this.hideAllViews();
    document.getElementById('view-active-question').classList.remove('hidden');

    // Header info matching Moderator
    document.getElementById('player-q-progress').textContent = `Pregunta ${qData.questionIndex + 1} / ${qData.totalQuestions}`;
    document.getElementById('player-q-area').textContent = qData.area || 'Marco Scrum';
    
    // Reset status text
    const statusText = document.getElementById('player-status-text');
    if (statusText) {
      statusText.textContent = 'Pendiente';
      statusText.className = 'text-xs font-bold text-amber-400 font-mono';
    }

    // Reset and hide feedback panel
    const feedbackPanel = document.getElementById('player-feedback-panel');
    if (feedbackPanel) feedbackPanel.classList.add('hidden');

    this.updateLanguageDisplay();

    // Render 4 Options Cards Grid (Matching Moderator colors, labels & shapes)
    const container = document.getElementById('player-options-grid');
    const colorThemes = [
      { bg: 'bg-rose-600', hover: 'hover:bg-rose-500', shape: '▲', label: 'A' },
      { bg: 'bg-blue-600', hover: 'hover:bg-blue-500', shape: '◆', label: 'B' },
      { bg: 'bg-amber-600', hover: 'hover:bg-amber-500', shape: '●', label: 'C' },
      { bg: 'bg-emerald-600', hover: 'hover:bg-emerald-500', shape: '■', label: 'D' }
    ];

    container.innerHTML = qData.options.map((opt, i) => {
      const theme = colorThemes[i % colorThemes.length];
      return `
        <button id="player-opt-${opt.id}" type="button" onclick="playerApp.submitAnswer('${opt.id}', this)"
          class="player-option-card relative flex items-center p-4 sm:p-5 rounded-2xl ${theme.bg} ${theme.hover} text-white shadow-lg transition transform active:scale-98 duration-150 text-left w-full group cursor-pointer">
          <div class="flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-black/25 text-2xl font-black mr-3.5 shadow-inner shrink-0 group-hover:scale-105 transition">
            ${theme.shape}
          </div>
          <div class="flex-1 min-w-0 pr-3">
            <span class="text-xs font-bold uppercase tracking-wider text-white/75 block mb-0.5">Opción ${theme.label}</span>
            <p class="text-base sm:text-lg font-bold leading-snug">${opt.text_es}</p>
            ${opt.text_en ? `<p class="text-xs text-white/75 italic mt-1">${opt.text_en}</p>` : ''}
          </div>
          <div id="player-opt-badge-${opt.id}" class="hidden absolute right-3 top-3 bg-black/70 px-2.5 py-1 rounded-lg text-xs font-bold font-mono"></div>
        </button>
      `;
    }).join('');

    container.classList.remove('pointer-events-none');

    // Start synchronized timer
    this.startTimer();
  }

  startTimer() {
    clearInterval(this.timerInterval);
    const timerText = document.getElementById('player-timer-number');
    const timerCircle = document.getElementById('player-timer-circle');
    const circumference = 2 * Math.PI * 19; // r=19 -> ~119.38

    if (timerText) timerText.textContent = this.timeLeft;

    this.timerInterval = setInterval(() => {
      this.timeLeft--;
      if (timerText) timerText.textContent = Math.max(0, this.timeLeft);

      if (timerCircle) {
        const offset = circumference - (Math.max(0, this.timeLeft) / this.questionDuration) * circumference;
        timerCircle.style.strokeDashoffset = offset;
      }

      if (this.timeLeft <= 0) {
        clearInterval(this.timerInterval);
      }
    }, 1000);
  }

  toggleLanguage() {
    this.currentLanguage = this.currentLanguage === 'es' ? 'en' : 'es';
    const langBtn = document.getElementById('btn-lang-toggle');
    if (langBtn) {
      langBtn.textContent = this.currentLanguage === 'es' ? '🌐 ES (Cambiar a EN)' : '🌐 EN (Switch to ES)';
    }
    this.updateLanguageDisplay();
  }

  updateLanguageDisplay() {
    if (!this.currentQuestion) return;
    const qEsEl = document.getElementById('player-q-text-es');
    const qEnEl = document.getElementById('player-q-text-en');
    
    if (qEsEl) qEsEl.textContent = this.currentQuestion.question_es;
    if (qEnEl) qEnEl.textContent = this.currentQuestion.question_en || '';
  }

  submitAnswer(optionId, cardEl) {
    if (this.hasAnswered) return;
    this.hasAnswered = true;
    this.selectedOptionId = optionId;

    // Haptic vibration feedback on mobile
    if (navigator.vibrate) navigator.vibrate(40);

    const timeRemainingMs = Date.now() - this.questionStartTime;

    // Visual feedback on chosen card
    document.querySelectorAll('.player-option-card').forEach(c => {
      c.classList.add('opacity-50');
      c.classList.remove('hover:scale-102');
    });

    if (cardEl) {
      cardEl.classList.remove('opacity-50');
      cardEl.classList.add('ring-4', 'ring-white', 'shadow-2xl', 'scale-[1.02]');
      
      const badge = cardEl.querySelector(`#player-opt-badge-${optionId}`);
      if (badge) {
        badge.textContent = '✓ Tu elección';
        badge.classList.remove('hidden');
        badge.classList.add('bg-white', 'text-slate-950');
      }
    }

    // Disable clicks on options
    document.getElementById('player-options-grid').classList.add('pointer-events-none');

    // Update status bar
    const statusText = document.getElementById('player-status-text');
    if (statusText) {
      statusText.textContent = 'Respondido ✓';
      statusText.className = 'text-xs font-bold text-emerald-400 font-mono';
    }

    // Broadcast answer to host
    this.sync.broadcast('PLAYER_ANSWER', {
      playerId: this.playerId,
      optionId,
      timeRemainingMs
    });
  }

  showQuestionResult(data) {
    clearInterval(this.timerInterval);
    const isCorrect = this.selectedOptionId === data.correctOptionId;
    const totalVotes = data.totalPlayers || 1;

    // 1. Highlight options cards identically to Moderator
    if (this.currentQuestion && this.currentQuestion.options) {
      this.currentQuestion.options.forEach(opt => {
        const card = document.getElementById(`player-opt-${opt.id}`);
        if (!card) return;
        const count = data.stats ? (data.stats[opt.id] || 0) : 0;
        const pct = Math.round((count / totalVotes) * 100);

        if (opt.id === data.correctOptionId) {
          card.classList.remove('bg-rose-600', 'bg-blue-600', 'bg-amber-600', 'opacity-50');
          card.classList.add('bg-emerald-600', 'ring-4', 'ring-emerald-300', 'shadow-2xl', 'scale-[1.02]', 'opacity-100');
          
          const badge = document.getElementById(`player-opt-badge-${opt.id}`);
          if (badge) {
            badge.textContent = `✓ Correcta (${pct}%)`;
            badge.className = 'absolute right-3 top-3 bg-emerald-950 text-emerald-300 border border-emerald-400 px-2.5 py-1 rounded-lg text-xs font-bold font-mono';
            badge.classList.remove('hidden');
          }
        } else if (opt.id === this.selectedOptionId) {
          // Wrong selection by user
          card.classList.add('ring-4', 'ring-rose-400', 'opacity-90');
          const badge = document.getElementById(`player-opt-badge-${opt.id}`);
          if (badge) {
            badge.textContent = `✗ Tuya (${pct}%)`;
            badge.className = 'absolute right-3 top-3 bg-rose-950 text-rose-300 border border-rose-400 px-2.5 py-1 rounded-lg text-xs font-bold font-mono';
            badge.classList.remove('hidden');
          }
        } else {
          card.classList.add('opacity-35', 'grayscale-[30%]');
        }
      });
    }

    // 2. Render Full Pedagogical Feedback Panel (Directly on Mobile)
    const feedbackPanel = document.getElementById('player-feedback-panel');
    if (feedbackPanel) {
      feedbackPanel.classList.remove('hidden');

      // Result banner
      const banner = document.getElementById('player-result-banner');
      const icon = document.getElementById('player-result-icon');
      const title = document.getElementById('player-result-title');
      const subtitle = document.getElementById('player-result-subtitle');
      const pointsEl = document.getElementById('player-points-awarded');
      const streakBadge = document.getElementById('player-streak-badge');

      if (isCorrect) {
        banner.className = 'p-4 rounded-2xl flex items-center justify-between text-white shadow-xl bg-emerald-600 animate-bounce-once';
        icon.textContent = '🎉';
        title.textContent = '¡RESPUESTA CORRECTA!';
        subtitle.textContent = 'Has sumado puntos para el ranking.';
        pointsEl.textContent = '+PUNTOS';
        if (navigator.vibrate) navigator.vibrate([40, 60, 40]);
      } else {
        banner.className = 'p-4 rounded-2xl flex items-center justify-between text-white shadow-xl bg-rose-600';
        icon.textContent = '❌';
        title.textContent = '¡RESPUESTA INCORRECTA!';
        subtitle.textContent = 'Revisa la justificación oficial abajo.';
        pointsEl.textContent = '+0 PTS';
        if (navigator.vibrate) navigator.vibrate(100);
      }

      // Check pedagogical alert
      const alertContainer = document.getElementById('player-pedagogical-alert');
      if (data.pctCorrect !== undefined && data.pctCorrect < 40) {
        alertContainer.innerHTML = `
          <div class="p-3 bg-red-950/70 border border-red-500/50 rounded-xl text-red-200 text-xs flex items-start gap-2.5">
            <span class="text-lg">⚠️</span>
            <div>
              <p class="font-bold">Alerta Pedagógica UNAB (Trampa Crítica de Certificación)</p>
              <p class="text-[11px] text-red-300 mt-0.5">Solo el ${data.pctCorrect}% del grupo acertó esta pregunta. Es un concepto de alta probabilidad de error en el examen PSM I.</p>
            </div>
          </div>
        `;
      } else {
        alertContainer.innerHTML = '';
      }

      // Justification text in Spanish and English
      const expEs = document.getElementById('player-explanation-es');
      const expEn = document.getElementById('player-explanation-en');

      if (expEs && data.explanation_es) {
        expEs.innerHTML = data.explanation_es.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      }
      if (expEn && data.explanation_en) {
        expEn.innerHTML = data.explanation_en.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      }

      // Update score & rank from leaderboard data
      if (data.leaderboard) {
        const myRank = data.leaderboard.findIndex(p => p.id === this.playerId);
        if (myRank !== -1) {
          const me = data.leaderboard[myRank];
          this.score = me.score;
          this.streak = me.streak;
          
          document.getElementById('header-score').textContent = `${me.score.toLocaleString()} pts`;
          if (me.streak >= 2) {
            streakBadge.textContent = `🔥 Racha x${me.streak}`;
          } else {
            streakBadge.textContent = '';
          }
        }
      }
    }
  }

  showGameOver(data) {
    this.hideAllViews();
    document.getElementById('view-gameover').classList.remove('hidden');
    document.getElementById('gameover-avatar').textContent = this.avatar;
    document.getElementById('gameover-score').textContent = `${this.score.toLocaleString()} PTS`;

    if (data.top3) {
      const myRank = data.top3.findIndex(p => p.id === this.playerId);
      const rankEl = document.getElementById('gameover-rank');
      if (rankEl) {
        rankEl.textContent = myRank !== -1 ? `#${myRank + 1}` : 'Top 10';
      }
    }
  }

  hideAllViews() {
    const views = ['view-join', 'view-lobby-wait', 'view-active-question', 'view-gameover'];
    views.forEach(v => {
      const el = document.getElementById(v);
      if (el) el.classList.add('hidden');
    });
  }
}

// Global initialization
window.addEventListener('DOMContentLoaded', () => {
  window.playerApp = new ScrumPlayerController();
});
