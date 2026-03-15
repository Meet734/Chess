const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*' }
});

// Serve static files from the Chess directory
app.use(express.static(path.join(__dirname)));

// Room storage: { roomCode: { white: socketId, black: socketId, gameState: {...} } }
const rooms = {};

function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
}

io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);

    // Create a new room
    socket.on('createRoom', () => {
        let code;
        do { code = generateRoomCode(); } while (rooms[code]);

        rooms[code] = { white: socket.id, black: null };
        socket.join(code);
        socket.roomCode = code;
        socket.playerColor = 'white';

        socket.emit('roomCreated', { roomCode: code, color: 'white' });
        console.log(`Room created: ${code} by ${socket.id}`);
    });

    // Join an existing room
    socket.on('joinRoom', ({ roomCode }) => {
        const code = roomCode.toUpperCase().trim();
        const room = rooms[code];

        if (!room) {
            socket.emit('joinError', { message: 'Room not found. Check the code and try again.' });
            return;
        }
        if (room.black) {
            socket.emit('joinError', { message: 'Room is full. This game already has two players.' });
            return;
        }

        room.black = socket.id;
        socket.join(code);
        socket.roomCode = code;
        socket.playerColor = 'black';

        socket.emit('roomJoined', { roomCode: code, color: 'black' });
        io.to(code).emit('gameStart', { roomCode: code });
        console.log(`Room joined: ${code} by ${socket.id}`);
    });

    // Relay a move to the opponent
    socket.on('makeMove', (moveData) => {
        const code = socket.roomCode;
        if (!code || !rooms[code]) return;
        socket.to(code).emit('opponentMove', moveData);
    });

    // Relay pawn promotion choice to opponent
    socket.on('promotePawn', (promotionData) => {
        const code = socket.roomCode;
        if (!code || !rooms[code]) return;
        socket.to(code).emit('opponentPromote', promotionData);
    });

    // Relay resignation
    socket.on('resign', () => {
        const code = socket.roomCode;
        if (!code || !rooms[code]) return;
        socket.to(code).emit('opponentResigned');
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        const code = socket.roomCode;
        if (code && rooms[code]) {
            socket.to(code).emit('opponentDisconnected');
            delete rooms[code];
            console.log(`Room ${code} closed due to disconnect of ${socket.id}`);
        }
        console.log(`Client disconnected: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`\n♟  Chess server running at http://localhost:${PORT}`);
    console.log(`   Share your local IP (e.g., http://192.168.x.x:${PORT}) for LAN play.\n`);
});
