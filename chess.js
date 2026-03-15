//  CHESS GAME
//  Supports: Local (Pass & Play) + Online (Socket.io)

'use strict';

// ---- Piece Unicode maps ----
const UNICODE = {
    white: { king: '♔', queen: '♕', rook: '♖', bishop: '♗', knight: '♘', pawn: '♙' },
    black: { king: '♚', queen: '♛', rook: '♜', bishop: '♝', knight: '♞', pawn: '♟' }
};

// ---- Timer durations (seconds) ----
const TIMER_DURATION = 10 * 60; // 10 minutes per player

//  Screen Manager
const Screens = {
    show(id) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        const el = document.getElementById(id);
        if (el) el.classList.add('active');
    }
};

//  ChessGame Class
class ChessGame {
    constructor() {
        // State
        this.board = null;
        this.currentPlayer = 'white';
        this.selectedSq = null;          // [row, col]
        this.moveHistory = [];           // full state snapshots for undo
        this.capturedPieces = { white: [], black: [] };
        this.enPassantTarget = null;     // [row, col] or null
        this.castlingRights = null;
        this.kingPositions = null;
        this.isGameOver = false;
        this.winner = null;
        this.lastMove = null;            // { from:[r,c], to:[r,c] }

        // Timers
        this.timers = { white: TIMER_DURATION, black: TIMER_DURATION };
        this._timerInterval = null;

        // Mode
        this.gameMode = 'local';    // 'local' | 'online'
        this.myColor = 'white';     // in online mode

        // Pending promotion (online)
        this._pendingPromotion = null;

        this._setupUI();
    }

    // ----------------------------------------------------------
    //  UI Wiring
    // ----------------------------------------------------------
    _setupUI() {
        // Mode screen
        document.getElementById('btn-local').addEventListener('click', () => {
            this.gameMode = 'local';
            this.myColor = null;
            Screens.show('game-screen');
            this.startNewGame();
        });

        document.getElementById('btn-online').addEventListener('click', () => {
            Screens.show('lobby-screen');
        });

        // Lobby screen
        document.getElementById('back-btn').addEventListener('click', () => {
            Screens.show('mode-screen');
            this._resetLobbyUI();
        });

        document.getElementById('btn-create-room').addEventListener('click', () => {
            this._createRoom();
        });

        document.getElementById('btn-join-room').addEventListener('click', () => {
            const code = document.getElementById('room-code-input').value.trim();
            if (code.length < 1) return;
            this._joinRoom(code);
        });

        document.getElementById('room-code-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') document.getElementById('btn-join-room').click();
        });

        // Game toolbar
        document.getElementById('btn-new-game').addEventListener('click', () => this.startNewGame());
        document.getElementById('btn-undo').addEventListener('click', () => this.undoLastMove());
        document.getElementById('btn-resign').addEventListener('click', () => this._resign());
        document.getElementById('btn-switch-mode').addEventListener('click', () => {
            this._stopTimer();
            if (socket) { socket.disconnect(); socket = null; }
            Screens.show('mode-screen');
            this._resetLobbyUI();
        });

        // Game over modal
        document.getElementById('btn-play-again').addEventListener('click', () => {
            document.getElementById('gameover-modal').classList.add('hidden');
            this.startNewGame();
        });
        document.getElementById('btn-gameover-menu').addEventListener('click', () => {
            document.getElementById('gameover-modal').classList.add('hidden');
            this._stopTimer();
            if (socket) { socket.disconnect(); socket = null; }
            Screens.show('mode-screen');
            this._resetLobbyUI();
        });

        // Build coordinate labels
        this._buildLabels();
    }

    _buildLabels() {
        const rankLeft = document.getElementById('rank-labels-left');
        const rankRight = document.getElementById('rank-labels-right');
        const fileEl = document.getElementById('file-labels');

        rankLeft.innerHTML = '';
        rankRight.innerHTML = '';
        fileEl.innerHTML = '';

        for (let r = 8; r >= 1; r--) {
            rankLeft.innerHTML += `<span>${r}</span>`;
            rankRight.innerHTML += `<span>${r}</span>`;
        }
        'abcdefgh'.split('').forEach(f => {
            fileEl.innerHTML += `<span>${f}</span>`;
        });
    }

    //  Game Lifecycle
    startNewGame() {
        this._stopTimer();

        this.board = this._createInitialBoard();
        this.currentPlayer = 'white';
        this.selectedSq = null;
        this.moveHistory = [];
        this.capturedPieces = { white: [], black: [] };
        this.enPassantTarget = null;
        this.castlingRights = {
            white: { kingside: true, queenside: true },
            black: { kingside: true, queenside: true }
        };
        this.kingPositions = { white: [7, 4], black: [0, 4] };
        this.isGameOver = false;
        this.winner = null;
        this.lastMove = null;
        this.timers = { white: TIMER_DURATION, black: TIMER_DURATION };

        this._renderBoard();
        this._updatePlayerBars();
        this._updateStatus();
        this._updateHistory();
        this._updateCaptured();
        this._renderTimers();
        this._startTimer();
    }

    _createInitialBoard() {
        const b = Array(8).fill(null).map(() => Array(8).fill(null));
        const order = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];
        for (let c = 0; c < 8; c++) {
            b[0][c] = { type: order[c], color: 'black' };
            b[1][c] = { type: 'pawn', color: 'black' };
            b[6][c] = { type: 'pawn', color: 'white' };
            b[7][c] = { type: order[c], color: 'white' };
        }
        return b;
    }

    //  Timer
    _startTimer() {
        this._stopTimer();
        this._timerInterval = setInterval(() => {
            if (this.isGameOver) { this._stopTimer(); return; }
            this.timers[this.currentPlayer]--;
            this._renderTimers();
            if (this.timers[this.currentPlayer] <= 0) {
                this._stopTimer();
                this.isGameOver = true;
                const opp = this.currentPlayer === 'white' ? 'black' : 'white';
                this._showGameOver(`${opp.charAt(0).toUpperCase() + opp.slice(1)} wins`, 'on time');
            }
        }, 1000);
    }

    _stopTimer() {
        clearInterval(this._timerInterval);
        this._timerInterval = null;
    }

    _renderTimers() {
        const fmt = (s) => {
            const m = Math.floor(s / 60).toString().padStart(2, '0');
            const sec = (s % 60).toString().padStart(2, '0');
            return `${m}:${sec}`;
        };

        // In local: top = black, bottom = white
        // In online flipped: if myColor = black, flip view
        const topColor = (this.gameMode === 'online' && this.myColor === 'black') ? 'white' : 'black';
        const bottomColor = (this.gameMode === 'online' && this.myColor === 'black') ? 'black' : 'white';

        const topTimer = document.getElementById('top-timer');
        const bottomTimer = document.getElementById('bottom-timer');

        topTimer.textContent = fmt(this.timers[topColor]);
        bottomTimer.textContent = fmt(this.timers[bottomColor]);

        topTimer.classList.toggle('low-time', this.timers[topColor] <= 30);
        bottomTimer.classList.toggle('low-time', this.timers[bottomColor] <= 30);
    }

    //  Board Rendering
    _renderBoard() {
        const boardEl = document.getElementById('chess-board');
        boardEl.innerHTML = '';

        const flip = (this.gameMode === 'online' && this.myColor === 'black');

        for (let ri = 0; ri < 8; ri++) {
            for (let ci = 0; ci < 8; ci++) {
                const row = flip ? 7 - ri : ri;
                const col = flip ? 7 - ci : ci;

                const sq = document.createElement('div');
                sq.className = `sq ${(row + col) % 2 === 0 ? 'light' : 'dark'}`;
                sq.dataset.row = row;
                sq.dataset.col = col;

                // Last move highlight
                if (this.lastMove) {
                    const [fr, fc] = this.lastMove.from;
                    const [tr, tc] = this.lastMove.to;
                    if (row === fr && col === fc) sq.classList.add('last-from');
                    if (row === tr && col === tc) sq.classList.add('last-to');
                }

                // Piece
                const piece = this.board[row][col];
                if (piece) {
                    const span = document.createElement('span');
                    span.className = `piece piece-${piece.color}`;
                    span.textContent = UNICODE[piece.color][piece.type];
                    sq.appendChild(span);
                }

                sq.addEventListener('click', () => this._handleClick(row, col));
                boardEl.appendChild(sq);
            }
        }
    }

    //  Input Handling
    _handleClick(row, col) {
        if (this.isGameOver) return;

        // In online mode, only current player's turn and their color
        if (this.gameMode === 'online' && this.currentPlayer !== this.myColor) return;

        const piece = this.board[row][col];

        if (this.selectedSq) {
            const [sr, sc] = this.selectedSq;
            // Clicking own piece again → re-select
            if (piece && piece.color === this.currentPlayer) {
                this._clearHighlights();
                this._selectSquare(row, col);
                return;
            }
            // Attempt move
            if (this._isValidMove(sr, sc, row, col)) {
                this._executePlayerMove(sr, sc, row, col);
            } else {
                this._clearHighlights();
            }
        } else {
            if (piece && piece.color === this.currentPlayer) {
                this._selectSquare(row, col);
            }
        }
    }

    _selectSquare(row, col) {
        this.selectedSq = [row, col];
        const sq = this._getSqEl(row, col);
        if (sq) sq.classList.add('selected');
        this._highlightMoves(row, col);
    }

    _clearHighlights() {
        document.querySelectorAll('.sq').forEach(sq => {
            sq.classList.remove('selected', 'can-move', 'can-capture');
        });
        this.selectedSq = null;
    }

    _highlightMoves(row, col) {
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                if (this._isValidMove(row, col, r, c)) {
                    const el = this._getSqEl(r, c);
                    if (el) {
                        if (this.board[r][c]) {
                            el.classList.add('can-capture');
                        } else {
                            el.classList.add('can-move');
                        }
                    }
                }
            }
        }
    }

    _getSqEl(row, col) {
        return document.querySelector(`.sq[data-row="${row}"][data-col="${col}"]`);
    }

    //  Move Execution
    async _executePlayerMove(fromRow, fromCol, toRow, toCol) {
        // Save snapshot for undo BEFORE move
        this._saveSnapshot();

        const move = await this._applyMove(fromRow, fromCol, toRow, toCol);

        if (this.gameMode === 'online' && socket) {
            socket.emit('makeMove', { fromRow, fromCol, toRow, toCol });
        }

        this._afterMove(move);
    }

    async _applyMove(fromRow, fromCol, toRow, toCol, skipPromoUI = false) {
        const piece = this.board[fromRow][fromCol];
        const captured = this.board[toRow][toCol];

        // En passant capture
        let enPassantCaptured = null;
        if (piece.type === 'pawn' && this.enPassantTarget &&
            toRow === this.enPassantTarget[0] && toCol === this.enPassantTarget[1]) {
            const capRow = piece.color === 'white' ? toRow + 1 : toRow - 1;
            enPassantCaptured = this.board[capRow][toCol];
            this.board[capRow][toCol] = null;
        }

        // Castle: move rook
        if (piece.type === 'king' && Math.abs(toCol - fromCol) === 2) {
            const rookFrom = toCol > fromCol ? 7 : 0;
            const rookTo = toCol > fromCol ? 5 : 3;
            this.board[toRow][rookTo] = this.board[toRow][rookFrom];
            this.board[toRow][rookFrom] = null;
        }

        // Record captures
        if (captured) this.capturedPieces[captured.color].push({ ...captured });
        if (enPassantCaptured) this.capturedPieces[enPassantCaptured.color].push({ ...enPassantCaptured });

        // Move piece
        this.board[toRow][toCol] = { ...piece };
        this.board[fromRow][fromCol] = null;
        if (piece.type === 'king') this.kingPositions[piece.color] = [toRow, toCol];

        // Promotion
        let promotedTo = null;
        if (piece.type === 'pawn' && (toRow === 0 || toRow === 7)) {
            if (!skipPromoUI) {
                promotedTo = await this._showPromotion(toRow, toCol, piece.color);
            } else {
                promotedTo = 'queen'; // default for undo replay
            }
            this.board[toRow][toCol] = { type: promotedTo, color: piece.color };
        }

        // Update state
        const prevEnPassant = this.enPassantTarget;
        this._updateEnPassant(piece, fromRow, fromCol, toRow, toCol);
        this._updateCastlingRights(piece, fromRow, fromCol, captured, toRow, toCol);

        const notation = this._notation(piece, fromRow, fromCol, toRow, toCol, captured || enPassantCaptured, promotedTo);
        this.lastMove = { from: [fromRow, fromCol], to: [toRow, toCol] };

        this.moveHistory.push({
            notation,
            player: piece.color
        });

        this.currentPlayer = this.currentPlayer === 'white' ? 'black' : 'white';

        return { piece, captured, enPassantCaptured, notation };
    }

    _afterMove(move) {
        // Check for game end
        if (this._isCheckmate(this.currentPlayer)) {
            this.isGameOver = true;
            this.winner = this.currentPlayer === 'white' ? 'black' : 'white';
        } else if (this._isStalemate(this.currentPlayer)) {
            this.isGameOver = true;
        }

        this._clearHighlights();
        this._renderBoard();
        this._updatePlayerBars();
        this._updateStatus();
        this._updateHistory();
        this._updateCaptured();

        if (this.isGameOver) {
            this._stopTimer();
            setTimeout(() => {
                if (this.winner) {
                    const wn = this.winner.charAt(0).toUpperCase() + this.winner.slice(1);
                    this._showGameOver(`${wn} wins`, 'by checkmate');
                } else {
                    this._showGameOver('Draw', 'by stalemate');
                }
            }, 400);
        } else {
            // Restart timer on the new current player
            this._startTimer();
        }
    }

    //  Undo Move
    _saveSnapshot() {
        // Push the current full state as a deep clone onto a snapshot stack
        if (!this._snapshots) this._snapshots = [];
        this._snapshots.push({
            board: this.board.map(r => r.map(c => c ? { ...c } : null)),
            currentPlayer: this.currentPlayer,
            enPassantTarget: this.enPassantTarget ? [...this.enPassantTarget] : null,
            castlingRights: JSON.parse(JSON.stringify(this.castlingRights)),
            kingPositions: { white: [...this.kingPositions.white], black: [...this.kingPositions.black] },
            capturedPieces: {
                white: [...this.capturedPieces.white.map(p => ({ ...p }))],
                black: [...this.capturedPieces.black.map(p => ({ ...p }))]
            },
            moveHistory: this.moveHistory.map(m => ({ ...m })),
            lastMove: this.lastMove ? { from: [...this.lastMove.from], to: [...this.lastMove.to] } : null,
            timers: { ...this.timers }
        });
    }

    undoLastMove() {
        if (this.gameMode === 'online') return; // No undo in online
        if (!this._snapshots || this._snapshots.length === 0) return;

        this._stopTimer();
        const snap = this._snapshots.pop();

        this.board = snap.board;
        this.currentPlayer = snap.currentPlayer;
        this.enPassantTarget = snap.enPassantTarget;
        this.castlingRights = snap.castlingRights;
        this.kingPositions = snap.kingPositions;
        this.capturedPieces = snap.capturedPieces;
        this.moveHistory = snap.moveHistory;
        this.lastMove = snap.lastMove;
        this.timers = snap.timers;
        this.isGameOver = false;
        this.winner = null;

        this._clearHighlights();
        this._renderBoard();
        this._updatePlayerBars();
        this._updateStatus();
        this._updateHistory();
        this._updateCaptured();
        this._renderTimers();
        this._startTimer();
    }

    //  Promotion UI
    _showPromotion(row, col, color) {
        return new Promise((resolve) => {
            const modal = document.getElementById('promotion-modal');
            const choices = document.getElementById('promotion-choices');
            modal.classList.remove('hidden');
            choices.innerHTML = '';

            const types = ['queen', 'rook', 'bishop', 'knight'];
            types.forEach(type => {
                const btn = document.createElement('div');
                btn.className = 'promo-piece piece-' + color;
                btn.textContent = UNICODE[color][type];
                btn.title = type;
                btn.addEventListener('click', () => {
                    modal.classList.add('hidden');

                    // In online mode, tell opponent about promotion
                    if (this.gameMode === 'online' && socket) {
                        socket.emit('promotePawn', { row, col, type, color });
                    }
                    resolve(type);
                });
                choices.appendChild(btn);
            });
        });
    }

    //  Move Validation
    _isValidMove(fromRow, fromCol, toRow, toCol) {
        const piece = this.board[fromRow][fromCol];
        if (!piece || piece.color !== this.currentPlayer) return false;

        const target = this.board[toRow][toCol];
        if (target && target.color === piece.color) return false;

        if (!this._isLegalPieceMove(piece, fromRow, fromCol, toRow, toCol)) return false;

        // Simulate to check for self-check
        return this._moveLeavesKingSafe(fromRow, fromCol, toRow, toCol, piece);
    }

    _moveLeavesKingSafe(fromRow, fromCol, toRow, toCol, piece) {
        // Deep clone board
        const bkp = this.board.map(r => r.map(c => c ? { ...c } : null));
        const kpBkp = { white: [...this.kingPositions.white], black: [...this.kingPositions.black] };
        const epBkp = this.enPassantTarget;

        // Apply the move temporarily
        const p = this.board[fromRow][fromCol];

        // En passant
        if (p.type === 'pawn' && this.enPassantTarget &&
            toRow === this.enPassantTarget[0] && toCol === this.enPassantTarget[1]) {
            const capRow = p.color === 'white' ? toRow + 1 : toRow - 1;
            this.board[capRow][toCol] = null;
        }

        // Castle rook
        if (p.type === 'king' && Math.abs(toCol - fromCol) === 2) {
            const rf = toCol > fromCol ? 7 : 0;
            const rt = toCol > fromCol ? 5 : 3;
            this.board[toRow][rt] = this.board[toRow][rf];
            this.board[toRow][rf] = null;
        }

        this.board[toRow][toCol] = { ...p };
        this.board[fromRow][fromCol] = null;
        if (p.type === 'king') this.kingPositions[p.color] = [toRow, toCol];

        const safe = !this._isInCheck(p.color);

        // Restore
        this.board = bkp;
        this.kingPositions = kpBkp;
        this.enPassantTarget = epBkp;

        return safe;
    }

    _isLegalPieceMove(piece, fr, fc, tr, tc) {
        const dr = tr - fr, dc = tc - fc;
        switch (piece.type) {
            case 'pawn': return this._pawnMove(piece, fr, fc, tr, tc);
            case 'rook': return this._rookMove(fr, fc, tr, tc);
            case 'bishop': return this._bishopMove(fr, fc, tr, tc);
            case 'queen': return this._rookMove(fr, fc, tr, tc) || this._bishopMove(fr, fc, tr, tc);
            case 'knight': return (Math.abs(dr) === 2 && Math.abs(dc) === 1) || (Math.abs(dr) === 1 && Math.abs(dc) === 2);
            case 'king': return this._kingMove(piece, fr, fc, tr, tc);
        }
        return false;
    }

    _pawnMove(piece, fr, fc, tr, tc) {
        const dir = piece.color === 'white' ? -1 : 1;
        const start = piece.color === 'white' ? 6 : 1;
        const dr = tr - fr, dc = tc - fc;
        const target = this.board[tr][tc];

        if (dc === 0 && !target) {
            if (dr === dir) return true;
            if (fr === start && dr === 2 * dir && !this.board[fr + dir][fc]) return true;
        }
        if (Math.abs(dc) === 1 && dr === dir) {
            if (target && target.color !== piece.color) return true;
            if (this.enPassantTarget && tr === this.enPassantTarget[0] && tc === this.enPassantTarget[1]) return true;
        }
        return false;
    }

    _rookMove(fr, fc, tr, tc) {
        if (fr !== tr && fc !== tc) return false;
        return this._pathClear(fr, fc, tr, tc);
    }

    _bishopMove(fr, fc, tr, tc) {
        if (Math.abs(tr - fr) !== Math.abs(tc - fc)) return false;
        return this._pathClear(fr, fc, tr, tc);
    }

    _kingMove(piece, fr, fc, tr, tc) {
        const dr = Math.abs(tr - fr), dc = Math.abs(tc - fc);
        if (dr <= 1 && dc <= 1) return true;
        // Castling
        if (dr === 0 && dc === 2) {
            const side = tc > fc ? 'kingside' : 'queenside';
            return this._canCastle(piece.color, side);
        }
        return false;
    }

    _canCastle(color, side) {
        if (!this.castlingRights[color][side]) return false;
        if (this._isInCheck(color)) return false;

        const row = color === 'white' ? 7 : 0;
        const kingCol = 4;
        const rookCol = side === 'kingside' ? 7 : 0;

        const king = this.board[row][kingCol];
        const rook = this.board[row][rookCol];
        if (!king || king.type !== 'king' || king.color !== color) return false;
        if (!rook || rook.type !== 'rook' || rook.color !== color) return false;

        const start = Math.min(kingCol, rookCol) + 1;
        const end = Math.max(kingCol, rookCol);
        for (let c = start; c < end; c++) {
            if (this.board[row][c]) return false;
        }

        // King must not pass through or land on attacked square
        const step = side === 'kingside' ? 1 : -1;
        const dest = kingCol + 2 * step;

        const orig = this.board[row][kingCol];
        this.board[row][kingCol] = null;
        for (let c = kingCol; c !== dest + step; c += step) {
            if (this._squareAttacked(row, c, color)) {
                this.board[row][kingCol] = orig;
                return false;
            }
        }
        this.board[row][kingCol] = orig;
        return true;
    }

    _pathClear(fr, fc, tr, tc) {
        const rs = fr === tr ? 0 : (tr > fr ? 1 : -1);
        const cs = fc === tc ? 0 : (tc > fc ? 1 : -1);
        let r = fr + rs, c = fc + cs;
        while (r !== tr || c !== tc) {
            if (this.board[r][c]) return false;
            r += rs; c += cs;
        }
        return true;
    }

    _squareAttacked(row, col, defendColor) {
        const att = defendColor === 'white' ? 'black' : 'white';
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const p = this.board[r][c];
                if (!p || p.color !== att) continue;

                if (p.type === 'pawn') {
                    const d = p.color === 'white' ? -1 : 1;
                    if (Math.abs(c - col) === 1 && r + d === row) return true;
                } else if (p.type === 'knight') {
                    const dr = Math.abs(r - row), dc = Math.abs(c - col);
                    if ((dr === 2 && dc === 1) || (dr === 1 && dc === 2)) return true;
                } else if (p.type === 'king') {
                    if (Math.abs(r - row) <= 1 && Math.abs(c - col) <= 1) return true;
                } else {
                    if (this._isLegalPieceMove(p, r, c, row, col) && this._pathClear(r, c, row, col)) return true;
                }
            }
        }
        return false;
    }

    _isInCheck(color) {
        const [kr, kc] = this.kingPositions[color];
        return this._squareAttacked(kr, kc, color);
    }

    _isCheckmate(color) {
        if (!this._isInCheck(color)) return false;
        return !this._hasAnyMove(color);
    }

    _isStalemate(color) {
        if (this._isInCheck(color)) return false;
        return !this._hasAnyMove(color);
    }

    _hasAnyMove(color) {
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const p = this.board[r][c];
                if (!p || p.color !== color) continue;
                for (let tr = 0; tr < 8; tr++) {
                    for (let tc = 0; tc < 8; tc++) {
                        // Temporarily set currentPlayer for validation
                        const prev = this.currentPlayer;
                        this.currentPlayer = color;
                        const valid = this._isValidMove(r, c, tr, tc);
                        this.currentPlayer = prev;
                        if (valid) return true;
                    }
                }
            }
        }
        return false;
    }

    //  State Updates
    _updateEnPassant(piece, fr, fc, tr, tc) {
        this.enPassantTarget = null;
        if (piece.type === 'pawn' && Math.abs(tr - fr) === 2) {
            const dir = piece.color === 'white' ? -1 : 1;
            this.enPassantTarget = [fr + dir, fc];
        }
    }

    _updateCastlingRights(piece, fr, fc, captured, tr, tc) {
        if (piece.type === 'king') {
            this.castlingRights[piece.color].kingside = false;
            this.castlingRights[piece.color].queenside = false;
        }
        if (piece.type === 'rook') {
            const homeRow = piece.color === 'white' ? 7 : 0;
            if (fr === homeRow) {
                if (fc === 0) this.castlingRights[piece.color].queenside = false;
                if (fc === 7) this.castlingRights[piece.color].kingside = false;
            }
        }
        // If a rook is captured, revoke opponent's rights
        if (captured && captured.type === 'rook') {
            const homeRow = captured.color === 'white' ? 7 : 0;
            if (tr === homeRow) {
                if (tc === 0) this.castlingRights[captured.color].queenside = false;
                if (tc === 7) this.castlingRights[captured.color].kingside = false;
            }
        }
    }

    //  Notation
    _notation(piece, fr, fc, tr, tc, captured, promotedTo) {
        const files = 'abcdefgh';
        const pn = piece.type === 'pawn' ? '' : piece.type === 'knight' ? 'N' : piece.type[0].toUpperCase();
        const dest = files[tc] + (8 - tr);
        let n = '';

        if (piece.type === 'king' && Math.abs(tc - fc) === 2) {
            n = tc > fc ? 'O-O' : 'O-O-O';
        } else if (captured) {
            n = (piece.type === 'pawn' ? files[fc] : pn) + 'x' + dest;
        } else {
            n = pn + dest;
        }

        if (promotedTo) {
            const pnt = promotedTo === 'knight' ? 'N' : promotedTo[0].toUpperCase();
            n += '=' + pnt;
        }

        const opp = piece.color === 'white' ? 'black' : 'white';
        if (this._isInCheck(opp)) {
            n += this._isCheckmate(opp) ? '#' : '+';
        }

        return n;
    }

    //  UI Updates
    _updatePlayerBars() {
        const topBar = document.getElementById('player-top');
        const bottomBar = document.getElementById('player-bottom');
        const topName = document.getElementById('top-name');
        const bottomName = document.getElementById('bottom-name');
        const topAvatar = document.getElementById('top-avatar');
        const bottomAvatar = document.getElementById('bottom-avatar');

        const flip = (this.gameMode === 'online' && this.myColor === 'black');
        const topColor = flip ? 'white' : 'black';
        const bottomColor = flip ? 'black' : 'white';

        topName.textContent = topColor === 'white' ? 'White' : 'Black';
        bottomName.textContent = bottomColor === 'white' ? 'White' : 'Black';
        topAvatar.textContent = topColor === 'white' ? '♙' : '♟';
        bottomAvatar.textContent = bottomColor === 'white' ? '♙' : '♟';

        topBar.classList.toggle('active-bar', this.currentPlayer === topColor);
        bottomBar.classList.toggle('active-bar', this.currentPlayer === bottomColor);

        // Highlight king if in check
        this._renderBoard(); // re-renders with check highlight if needed
        const [kr, kc] = this.kingPositions[this.currentPlayer];
        if (this._isInCheck(this.currentPlayer)) {
            const sq = this._getSqEl(kr, kc);
            if (sq) sq.classList.add('in-check');
        }
    }

    _updateStatus() {
        const el = document.getElementById('game-status');
        if (this.isGameOver) {
            if (this.winner) {
                const wn = this.winner.charAt(0).toUpperCase() + this.winner.slice(1);
                el.textContent = `${wn} wins`;
            } else {
                el.textContent = 'Draw — Stalemate';
            }
        } else {
            const cp = this.currentPlayer.charAt(0).toUpperCase() + this.currentPlayer.slice(1);
            el.textContent = this._isInCheck(this.currentPlayer)
                ? `${cp} to move — Check!`
                : `${cp} to move`;
        }
    }

    _updateHistory() {
        const list = document.getElementById('history-list');
        list.innerHTML = '';
        const whites = this.moveHistory.filter(m => m.player === 'white');
        const blacks = this.moveHistory.filter(m => m.player === 'black');
        const count = Math.max(whites.length, blacks.length);
        for (let i = 0; i < count; i++) {
            const row = document.createElement('div');
            row.className = 'history-row';
            row.innerHTML = `<span class="move-num">${i + 1}.</span><span class="move-txt">${whites[i] ? whites[i].notation : ''}</span><span class="move-txt">${blacks[i] ? blacks[i].notation : ''}</span>`;
            list.appendChild(row);
        }
        list.scrollTop = list.scrollHeight;
    }

    _updateCaptured() {
        ['white', 'black'].forEach(color => {
            const el = document.getElementById(`captured-${color}-pieces`);
            el.innerHTML = '';
            this.capturedPieces[color]
                .sort((a, b) => ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king'].indexOf(a.type) - ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king'].indexOf(b.type))
                .forEach(p => {
                    const span = document.createElement('span');
                    span.className = `piece-${color}`;
                    span.textContent = UNICODE[color][p.type];
                    el.appendChild(span);
                });
        });
    }

    //  Game Over
    _showGameOver(title, sub) {
        document.getElementById('gameover-title').textContent = title;
        document.getElementById('gameover-sub').textContent = sub;
        const icon = this.winner === 'white' ? '♔' : this.winner === 'black' ? '♚' : '⊕';
        document.getElementById('gameover-icon').textContent = icon;
        document.getElementById('gameover-modal').classList.remove('hidden');
    }

    //  Resign
    _resign() {
        if (this.isGameOver) return;
        if (this.gameMode === 'online' && socket) {
            socket.emit('resign');
        }
        this.isGameOver = true;
        this.winner = this.currentPlayer === 'white' ? 'black' : 'white';
        this._stopTimer();
        const wn = this.winner.charAt(0).toUpperCase() + this.winner.slice(1);
        this._showGameOver(`${wn} wins`, 'by resignation');
    }

    //  Online: Receive opponent's move
    async _receiveOpponentMove(fromRow, fromCol, toRow, toCol) {
        // Set current player to the opponent temporarily so _applyMove works
        await this._applyMove(fromRow, fromCol, toRow, toCol);
        this._afterMove({});
    }

    //  Lobby helpers
    _resetLobbyUI() {
        document.getElementById('room-code-display').classList.add('hidden');
        document.getElementById('room-code-value').textContent = '------';
        document.getElementById('room-code-input').value = '';
        document.getElementById('join-error').classList.add('hidden');
        document.getElementById('join-error').textContent = '';
    }

    _createRoom() {
        if (!socket) _initSocket();
        socket.emit('createRoom');
    }

    _joinRoom(code) {
        if (!socket) _initSocket();
        socket.emit('joinRoom', { roomCode: code });
    }
}

//  Socket.io Integration
let socket = null;
let game = null;

function _initSocket() {
    // Use current window location so it works on any host/port
    socket = io(window.location.origin, { autoConnect: true });

    socket.on('connect', () => {
        console.log('Connected to server:', socket.id);
    });

    socket.on('roomCreated', ({ roomCode, color }) => {
        game.myColor = color;
        document.getElementById('room-code-value').textContent = roomCode;
        document.getElementById('room-code-display').classList.remove('hidden');
    });

    socket.on('roomJoined', ({ roomCode, color }) => {
        game.myColor = color;
    });

    socket.on('gameStart', ({ roomCode }) => {
        game.gameMode = 'online';
        Screens.show('game-screen');
        game.startNewGame();
    });

    socket.on('joinError', ({ message }) => {
        const errEl = document.getElementById('join-error');
        errEl.textContent = message;
        errEl.classList.remove('hidden');
    });

    socket.on('opponentMove', async ({ fromRow, fromCol, toRow, toCol }) => {
        await game._receiveOpponentMove(fromRow, fromCol, toRow, toCol);
    });

    socket.on('opponentPromote', ({ row, col, type, color }) => {
        game.board[row][col] = { type, color };
        game._renderBoard();
    });

    socket.on('opponentResigned', () => {
        game.isGameOver = true;
        game.winner = game.myColor;
        game._stopTimer();
        const wn = game.myColor.charAt(0).toUpperCase() + game.myColor.slice(1);
        game._showGameOver(`${wn} wins`, 'opponent resigned');
    });

    socket.on('opponentDisconnected', () => {
        game.isGameOver = true;
        game._stopTimer();
        game._showGameOver('Opponent left', 'the game has ended');
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from server');
    });
}

//  Bootstrap
window.addEventListener('DOMContentLoaded', () => {
    game = new ChessGame();
    Screens.show('mode-screen');
});
