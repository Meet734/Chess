class ChessGame {
    constructor() {
        this.board = this.createInitialBoard();
        this.currentPlayer = 'white';
        this.selectedSquare = null;
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
        this.initialize();
    }

    createInitialBoard() {
        const board = Array(8).fill(null).map(() => Array(8).fill(null));
        
        for (let col = 0; col < 8; col++) {
            board[1][col] = { type: 'pawn', color: 'black' };
            board[6][col] = { type: 'pawn', color: 'white' };
        }
        
        const initialPieceOrder = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];
        for (let col = 0; col < 8; col++) {
            board[0][col] = { type: initialPieceOrder[col], color: 'black' };
            board[7][col] = { type: initialPieceOrder[col], color: 'white' };
        }
        
        return board;
    }

    initialize() {
        this.renderBoard();
        this.setupEventListeners();
        this.updateGameStatus();
    }

    renderBoard() {
        const boardElement = document.getElementById('chess-board');
        boardElement.innerHTML = '';
        
        const pieceUnicodes = {
            white: {
                king: '♔', queen: '♕', rook: '♖',
                bishop: '♗', knight: '♘', pawn: '♙'
            },
            black: {
                king: '♚', queen: '♛', rook: '♜',
                bishop: '♝', knight: '♞', pawn: '♟'
            }
        };
        
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const squareElement = document.createElement('div');
                const isLightSquare = (row + col) % 2 === 0;
                squareElement.className = `square ${isLightSquare ? 'light' : 'dark'}`;
                squareElement.dataset.row = row;
                squareElement.dataset.col = col;
                
                const piece = this.board[row][col];
                if (piece) {
                    const pieceSpan = document.createElement('span');
                    pieceSpan.className = `piece-${piece.color}`;
                    pieceSpan.textContent = pieceUnicodes[piece.color][piece.type];
                    pieceSpan.style.cssText = 'position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); line-height: 1; user-select: none; pointer-events: none;';
                    squareElement.appendChild(pieceSpan);
                }
                
                squareElement.addEventListener('click', () => this.handleSquareClick(row, col));
                boardElement.appendChild(squareElement);
            }
        }
        
        const allSquares = boardElement.querySelectorAll('.square');
        allSquares.forEach((squareElement, index) => {
            const row = Math.floor(index / 8);
            const col = index % 8;
            if (col === 0) {
                const rowNumberLabel = document.createElement('div');
                rowNumberLabel.className = 'row-label';
                rowNumberLabel.textContent = 8 - row;
                rowNumberLabel.style.cssText = 'position: absolute; left: -35px; top: 50%; transform: translateY(-50%); font-weight: 500; color: #b0b0b0; font-size: 0.8125rem; z-index: 10; pointer-events: none; letter-spacing: 1px;';
                squareElement.appendChild(rowNumberLabel);
            }
        });
    }

    setupEventListeners() {
        document.getElementById('new-game-btn').addEventListener('click', () => this.newGame());
        document.getElementById('undo-btn').addEventListener('click', () => this.undoMove());
        document.getElementById('reset-btn').addEventListener('click', () => this.resetGame());
    }

    handleSquareClick(row, col) {
        if (this.isGameOver) return;
        
        const clickedPiece = this.board[row][col];
        
        if (this.selectedSquare) {
            const [selectedRow, selectedCol] = this.selectedSquare;
            const selectedPiece = this.board[selectedRow][selectedCol];
            
            if (clickedPiece && clickedPiece.color === this.currentPlayer) {
                this.selectSquare(row, col);
                return;
            }
            
            if (this.isValidMove(selectedRow, selectedCol, row, col)) {
                this.makeMove(selectedRow, selectedCol, row, col).catch(err => {
                    console.error('Error making move:', err);
                });
            } else {
                this.clearSelection();
            }
        } else {
            if (clickedPiece && clickedPiece.color === this.currentPlayer) {
                this.selectSquare(row, col);
            }
        }
    }

    selectSquare(row, col) {
        this.clearSelection();
        this.selectedSquare = [row, col];
        
        const squareElement = document.querySelector(`[data-row="${row}"][data-col="${col}"]`);
        squareElement.classList.add('selected');
        
        this.highlightPossibleMoves(row, col);
    }

    clearSelection() {
        if (this.selectedSquare) {
            const [row, col] = this.selectedSquare;
            const squareElement = document.querySelector(`[data-row="${row}"][data-col="${col}"]`);
            squareElement.classList.remove('selected');
        }
        
        document.querySelectorAll('.square').forEach(square => {
            square.classList.remove('possible-move', 'possible-capture');
        });
        
        this.selectedSquare = null;
    }

    highlightPossibleMoves(row, col) {
        const piece = this.board[row][col];
        if (!piece || piece.color !== this.currentPlayer) return;
        
        for (let newRow = 0; newRow < 8; newRow++) {
            for (let newCol = 0; newCol < 8; newCol++) {
                if (this.isValidMove(row, col, newRow, newCol)) {
                    const squareElement = document.querySelector(`[data-row="${newRow}"][data-col="${newCol}"]`);
                    const targetPiece = this.board[newRow][newCol];
                    
                    if (targetPiece) {
                        squareElement.classList.add('possible-capture');
                    } else {
                        squareElement.classList.add('possible-move');
                    }
                }
            }
        }
    }

    isValidMove(fromRow, fromCol, toRow, toCol) {
        const piece = this.board[fromRow][fromCol];
        if (!piece || piece.color !== this.currentPlayer) return false;
        
        const targetPiece = this.board[toRow][toCol];
        if (targetPiece && targetPiece.color === piece.color) return false;
        
        if (!this.isLegalPieceMove(piece, fromRow, fromCol, toRow, toCol)) {
            return false;
        }
        
        if (piece.type === 'king') {
            const boardBackup = this.board.map(r => r.map(c => c ? {...c} : null));
            const kingPositionBackup = {...this.kingPositions};
            
            this.board[fromRow][fromCol] = null;
            this.board[toRow][toCol] = piece;
            this.kingPositions[piece.color] = [toRow, toCol];
            
            const isUnderAttack = this.isSquareUnderAttack(toRow, toCol, piece.color);
            
            this.board = boardBackup;
            this.kingPositions = kingPositionBackup;
            
            return !isUnderAttack;
        }
        
        const boardBackup = this.board.map(r => r.map(c => c ? {...c} : null));
        const enPassantBackup = this.enPassantTarget;
        const castlingBackup = JSON.parse(JSON.stringify(this.castlingRights));
        const kingPosBackup = {...this.kingPositions};
        
        this.executeMove(fromRow, fromCol, toRow, toCol, false);
        
        const kingInCheck = this.isInCheck(this.currentPlayer);
        
        this.board = boardBackup;
        this.enPassantTarget = enPassantBackup;
        this.castlingRights = castlingBackup;
        this.kingPositions = kingPosBackup;
        
        return !kingInCheck;
    }

    isLegalPieceMove(piece, fromRow, fromCol, toRow, toCol) {
        const rowDifference = toRow - fromRow;
        const colDifference = toCol - fromCol;
        
        switch (piece.type) {
            case 'pawn':
                return this.isValidPawnMove(piece, fromRow, fromCol, toRow, toCol);
            case 'rook':
                return this.isValidRookMove(fromRow, fromCol, toRow, toCol);
            case 'knight':
                return (Math.abs(rowDifference) === 2 && Math.abs(colDifference) === 1) ||
                       (Math.abs(rowDifference) === 1 && Math.abs(colDifference) === 2);
            case 'bishop':
                return this.isValidBishopMove(fromRow, fromCol, toRow, toCol);
            case 'queen':
                return this.isValidRookMove(fromRow, fromCol, toRow, toCol) ||
                       this.isValidBishopMove(fromRow, fromCol, toRow, toCol);
            case 'king':
                return this.isValidKingMove(piece, fromRow, fromCol, toRow, toCol);
            default:
                return false;
        }
    }

    isValidPawnMove(piece, fromRow, fromCol, toRow, toCol) {
        const moveDirection = piece.color === 'white' ? -1 : 1;
        const startingRow = piece.color === 'white' ? 6 : 1;
        const rowDifference = toRow - fromRow;
        const colDifference = toCol - fromCol;
        const targetPiece = this.board[toRow][toCol];
        
        if (colDifference === 0 && !targetPiece) {
            if (rowDifference === moveDirection) {
                return true;
            }
            if (fromRow === startingRow && rowDifference === 2 * moveDirection && !this.board[fromRow + moveDirection][fromCol]) {
                return true;
            }
        }
        
        if (Math.abs(colDifference) === 1 && rowDifference === moveDirection && targetPiece && targetPiece.color !== piece.color) {
            return true;
        }
        
        if (this.enPassantTarget && 
            toRow === this.enPassantTarget[0] && 
            toCol === this.enPassantTarget[1] &&
            Math.abs(colDifference) === 1 && 
            rowDifference === moveDirection) {
            return true;
        }
        
        return false;
    }

    isValidRookMove(fromRow, fromCol, toRow, toCol) {
        if (fromRow !== toRow && fromCol !== toCol) return false;
        
        const rowStep = fromRow === toRow ? 0 : (toRow > fromRow ? 1 : -1);
        const colStep = fromCol === toCol ? 0 : (toCol > fromCol ? 1 : -1);
        
        let checkRow = fromRow + rowStep;
        let checkCol = fromCol + colStep;
        
        while (checkRow !== toRow || checkCol !== toCol) {
            if (this.board[checkRow][checkCol]) return false;
            checkRow += rowStep;
            checkCol += colStep;
        }
        
        return true;
    }

    isValidBishopMove(fromRow, fromCol, toRow, toCol) {
        if (Math.abs(toRow - fromRow) !== Math.abs(toCol - fromCol)) return false;
        
        const rowStep = toRow > fromRow ? 1 : -1;
        const colStep = toCol > fromCol ? 1 : -1;
        
        let checkRow = fromRow + rowStep;
        let checkCol = fromCol + colStep;
        
        while (checkRow !== toRow && checkCol !== toCol) {
            if (this.board[checkRow][checkCol]) return false;
            checkRow += rowStep;
            checkCol += colStep;
        }
        
        return true;
    }

    isValidKingMove(piece, fromRow, fromCol, toRow, toCol) {
        const rowDifference = Math.abs(toRow - fromRow);
        const colDifference = Math.abs(toCol - fromCol);
        
        if (rowDifference <= 1 && colDifference <= 1) {
            return true;
        }
        
        if (rowDifference === 0 && colDifference === 2) {
            const side = toCol > fromCol ? 'kingside' : 'queenside';
            return this.canCastle(piece.color, side);
        }
        
        return false;
    }

    canCastle(color, side) {
        if (this.isInCheck(color)) return false;
        
        const row = color === 'white' ? 7 : 0;
        const rookCol = side === 'kingside' ? 7 : 0;
        const kingCol = 4;
        
        if (!this.castlingRights[color][side]) return false;
        
        const king = this.board[row][kingCol];
        const rook = this.board[row][rookCol];
        
        if (!king || king.type !== 'king' || king.color !== color) return false;
        if (!rook || rook.type !== 'rook' || rook.color !== color) return false;
        
        const startCol = Math.min(kingCol, rookCol) + 1;
        const endCol = Math.max(kingCol, rookCol);
        for (let col = startCol; col < endCol; col++) {
            if (this.board[row][col]) return false;
        }
        
        const step = side === 'kingside' ? 1 : -1;
        const destinationCol = kingCol + 2 * step;
        
        const originalKing = this.board[row][kingCol];
        this.board[row][kingCol] = null;
        
        for (let col = kingCol; col !== destinationCol + step; col += step) {
            if (this.isSquareUnderAttack(row, col, color)) {
                this.board[row][kingCol] = originalKing;
                return false;
            }
        }
        
        this.board[row][kingCol] = originalKing;
        
        return true;
    }

    async makeMove(fromRow, fromCol, toRow, toCol) {
        const piece = this.board[fromRow][fromCol];
        const targetPiece = this.board[toRow][toCol];
        
        let capturedByEnPassant = null;
        if (piece.type === 'pawn' && this.enPassantTarget && 
            toRow === this.enPassantTarget[0] && toCol === this.enPassantTarget[1]) {
            const captureRow = piece.color === 'white' ? toRow + 1 : toRow - 1;
            capturedByEnPassant = this.board[captureRow][toCol];
            this.board[captureRow][toCol] = null;
            this.capturedPieces[capturedByEnPassant.color].push(capturedByEnPassant);
        }
        
        if (piece.type === 'king' && Math.abs(toCol - fromCol) === 2) {
            const rookCol = toCol > fromCol ? 7 : 0;
            const rookNewCol = toCol > fromCol ? 5 : 3;
            const rook = this.board[toRow][rookCol];
            this.board[toRow][rookCol] = null;
            this.board[toRow][rookNewCol] = rook;
        }
        
        if (targetPiece) {
            this.capturedPieces[targetPiece.color].push(targetPiece);
        }
        
        this.executeMove(fromRow, fromCol, toRow, toCol, true);
        
        if (piece.type === 'pawn' && (toRow === 0 || toRow === 7)) {
            await this.promotePawn(toRow, toCol, piece.color);
        }
        
        this.updateEnPassantTarget(piece, fromRow, fromCol, toRow, toCol);
        this.updateCastlingRights(piece, fromRow, fromCol);
        
        const moveNotation = this.getMoveNotation(piece, fromRow, fromCol, toRow, toCol, targetPiece);
        
        this.moveHistory.push({
            from: [fromRow, fromCol],
            to: [toRow, toCol],
            piece: {...piece},
            captured: targetPiece ? {...targetPiece} : null,
            notation: moveNotation,
            enPassant: capturedByEnPassant ? {...capturedByEnPassant} : null
        });
        
        this.currentPlayer = this.currentPlayer === 'white' ? 'black' : 'white';
        
        if (this.isCheckmate(this.currentPlayer)) {
            this.isGameOver = true;
            this.winner = this.currentPlayer === 'white' ? 'black' : 'white';
        } else if (this.isStalemate(this.currentPlayer)) {
            this.isGameOver = true;
        }
        
        this.clearSelection();
        this.renderBoard();
        this.updateGameStatus();
        this.updateMoveHistory();
        this.updateCapturedPieces();
    }

    executeMove(fromRow, fromCol, toRow, toCol, updateKingPos) {
        const piece = this.board[fromRow][fromCol];
        this.board[toRow][toCol] = piece;
        this.board[fromRow][fromCol] = null;
        
        if (updateKingPos && piece.type === 'king') {
            this.kingPositions[piece.color] = [toRow, toCol];
        }
    }

    updateEnPassantTarget(piece, fromRow, fromCol, toRow, toCol) {
        this.enPassantTarget = null;
        
        if (piece.type === 'pawn' && Math.abs(toRow - fromRow) === 2) {
            const moveDirection = piece.color === 'white' ? -1 : 1;
            this.enPassantTarget = [fromRow + moveDirection, fromCol];
        }
    }

    updateCastlingRights(piece, fromRow, fromCol) {
        if (piece.type === 'king') {
            this.castlingRights[piece.color].kingside = false;
            this.castlingRights[piece.color].queenside = false;
        } else if (piece.type === 'rook') {
            const isHomeRow = fromRow === (piece.color === 'white' ? 7 : 0);
            if (isHomeRow) {
                if (fromCol === 0) {
                    this.castlingRights[piece.color].queenside = false;
                } else if (fromCol === 7) {
                    this.castlingRights[piece.color].kingside = false;
                }
            }
        }
    }

    promotePawn(row, col, color) {
        return new Promise((resolve) => {
            const modal = document.getElementById('promotion-modal');
            modal.classList.add('show');
            
            const promotionPieces = modal.querySelectorAll('.promotion-piece');
            const handlePromotionClick = (event) => {
                const selectedPieceType = event.target.dataset.piece;
                this.board[row][col] = { type: selectedPieceType, color: color };
                modal.classList.remove('show');
                promotionPieces.forEach(piece => piece.removeEventListener('click', handlePromotionClick));
                resolve();
            };
            
            promotionPieces.forEach(pieceElement => {
                pieceElement.addEventListener('click', handlePromotionClick);
            });
        });
    }

    isSquareUnderAttack(row, col, defendingColor) {
        const attackingColor = defendingColor === 'white' ? 'black' : 'white';
        
        for (let checkRow = 0; checkRow < 8; checkRow++) {
            for (let checkCol = 0; checkCol < 8; checkCol++) {
                const piece = this.board[checkRow][checkCol];
                if (piece && piece.color === attackingColor) {
                    if (piece.type === 'pawn') {
                        const pawnAttackDirection = piece.color === 'white' ? -1 : 1;
                        if (Math.abs(checkCol - col) === 1 && checkRow + pawnAttackDirection === row) {
                            return true;
                        }
                    }
                    else if (piece.type === 'knight') {
                        const rowDistance = Math.abs(checkRow - row);
                        const colDistance = Math.abs(checkCol - col);
                        if ((rowDistance === 2 && colDistance === 1) || (rowDistance === 1 && colDistance === 2)) {
                            return true;
                        }
                    }
                    else if (piece.type === 'king') {
                        const rowDistance = Math.abs(checkRow - row);
                        const colDistance = Math.abs(checkCol - col);
                        if (rowDistance <= 1 && colDistance <= 1 && (rowDistance !== 0 || colDistance !== 0)) {
                            return true;
                        }
                    }
                    else {
                        if (this.isLegalPieceMove(piece, checkRow, checkCol, row, col) && 
                            this.isPathClear(checkRow, checkCol, row, col)) {
                            return true;
                        }
                    }
                }
            }
        }
        
        return false;
    }

    isInCheck(color) {
        const [kingRow, kingCol] = this.kingPositions[color];
        return this.isSquareUnderAttack(kingRow, kingCol, color);
    }

    isPathClear(fromRow, fromCol, toRow, toCol) {
        const rowStep = fromRow === toRow ? 0 : (toRow > fromRow ? 1 : -1);
        const colStep = fromCol === toCol ? 0 : (toCol > fromCol ? 1 : -1);
        
        let checkRow = fromRow + rowStep;
        let checkCol = fromCol + colStep;
        
        while (checkRow !== toRow || checkCol !== toCol) {
            if (this.board[checkRow][checkCol]) return false;
            checkRow += rowStep;
            checkCol += colStep;
        }
        
        return true;
    }

    isCheckmate(color) {
        if (!this.isInCheck(color)) return false;
        
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const piece = this.board[row][col];
                if (piece && piece.color === color) {
                    for (let toRow = 0; toRow < 8; toRow++) {
                        for (let toCol = 0; toCol < 8; toCol++) {
                            if (this.isValidMove(row, col, toRow, toCol)) {
                                return false;
                            }
                        }
                    }
                }
            }
        }
        
        return true;
    }

    isStalemate(color) {
        if (this.isInCheck(color)) return false;
        
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const piece = this.board[row][col];
                if (piece && piece.color === color) {
                    for (let toRow = 0; toRow < 8; toRow++) {
                        for (let toCol = 0; toCol < 8; toCol++) {
                            if (this.isValidMove(row, col, toRow, toCol)) {
                                return false;
                            }
                        }
                    }
                }
            }
        }
        
        return true;
    }

    getMoveNotation(piece, fromRow, fromCol, toRow, toCol, targetPiece) {
        const columnLetters = 'abcdefgh';
        const fromFile = columnLetters[fromCol];
        const toFile = columnLetters[toCol];
        const toRank = 8 - toRow;
        
        const pieceNotation = piece.type === 'pawn' ? '' : 
            piece.type === 'knight' ? 'N' :
            piece.type.charAt(0).toUpperCase();
        
        let notation = '';
        
        if (targetPiece) {
            if (piece.type === 'pawn') {
                notation = fromFile + 'x' + toFile + toRank;
            } else {
                notation = pieceNotation + 'x' + toFile + toRank;
            }
        } else {
            notation = pieceNotation + toFile + toRank;
        }
        
        const opponentColor = piece.color === 'white' ? 'black' : 'white';
        if (this.isInCheck(opponentColor)) {
            if (this.isCheckmate(opponentColor)) {
                notation += '#';
            } else {
                notation += '+';
            }
        }
        
        return notation;
    }

    updateGameStatus() {
        const statusElement = document.getElementById('game-status');
        const whitePlayerElement = document.querySelector('.white-player');
        const blackPlayerElement = document.querySelector('.black-player');
        
        whitePlayerElement.classList.remove('active');
        blackPlayerElement.classList.remove('active');
        
        if (this.isGameOver) {
            if (this.winner) {
                const winnerName = this.winner.charAt(0).toUpperCase() + this.winner.slice(1);
                statusElement.textContent = `${winnerName} wins by checkmate!`;
            } else {
                statusElement.textContent = 'Stalemate!';
            }
        } else {
            const currentPlayerName = this.currentPlayer.charAt(0).toUpperCase() + this.currentPlayer.slice(1);
            statusElement.textContent = `${currentPlayerName} to move`;
            
            if (this.isInCheck(this.currentPlayer)) {
                statusElement.textContent += ' (Check!)';
                const [kingRow, kingCol] = this.kingPositions[this.currentPlayer];
                const kingSquare = document.querySelector(`[data-row="${kingRow}"][data-col="${kingCol}"]`);
                if (kingSquare) {
                    kingSquare.classList.add('in-check');
                }
            }
            
            if (this.currentPlayer === 'white') {
                whitePlayerElement.classList.add('active');
            } else {
                blackPlayerElement.classList.add('active');
            }
        }
    }

    updateMoveHistory() {
        const historyList = document.getElementById('history-list');
        historyList.innerHTML = '';
        
        for (let i = 0; i < this.moveHistory.length; i += 2) {
            const moveNumber = Math.floor(i / 2) + 1;
            const whiteMove = this.moveHistory[i];
            const blackMove = this.moveHistory[i + 1];
            
            const historyItem = document.createElement('div');
            historyItem.className = 'history-item';
            historyItem.innerHTML = `
                <span class="move-number">${moveNumber}.</span>
                <span class="move">${whiteMove ? whiteMove.notation : ''}</span>
                <span class="move">${blackMove ? blackMove.notation : ''}</span>
            `;
            historyList.appendChild(historyItem);
        }
        
        historyList.scrollTop = historyList.scrollHeight;
    }

    updateCapturedPieces() {
        const whiteCapturedElement = document.getElementById('captured-white-pieces');
        const blackCapturedElement = document.getElementById('captured-black-pieces');
        
        whiteCapturedElement.innerHTML = '';
        blackCapturedElement.innerHTML = '';
        
        const pieceUnicodes = {
            white: { king: '♔', queen: '♕', rook: '♖', bishop: '♗', knight: '♘', pawn: '♙' },
            black: { king: '♚', queen: '♛', rook: '♜', bishop: '♝', knight: '♞', pawn: '♟' }
        };
        
        this.capturedPieces.white.forEach(piece => {
            const pieceSpan = document.createElement('span');
            pieceSpan.className = 'piece-white';
            pieceSpan.textContent = pieceUnicodes.white[piece.type];
            whiteCapturedElement.appendChild(pieceSpan);
        });
        
        this.capturedPieces.black.forEach(piece => {
            const pieceSpan = document.createElement('span');
            pieceSpan.className = 'piece-black';
            pieceSpan.textContent = pieceUnicodes.black[piece.type];
            blackCapturedElement.appendChild(pieceSpan);
        });
    }

    undoMove() {
        if (this.moveHistory.length === 0) return;
        
        alert('Undo functionality requires more complex state management. Please use Reset to start over.');
    }

    newGame() {
        this.board = this.createInitialBoard();
        this.currentPlayer = 'white';
        this.selectedSquare = null;
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
        this.clearSelection();
        this.renderBoard();
        this.updateGameStatus();
        this.updateMoveHistory();
        this.updateCapturedPieces();
    }

    resetGame() {
        this.newGame();
    }
}

let game;
window.addEventListener('DOMContentLoaded', () => {
    game = new ChessGame();
});

