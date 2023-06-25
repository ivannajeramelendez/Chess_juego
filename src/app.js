const path = require('path')
const http = require('http')
const express = require('express')
const socketio = require('socket.io')

var Chess = require('chess.js').Chess;

const app = express()
const server = http.createServer(app)
const io = socketio(server)

const port = process.env.PORT || 3000
const publicDirectoryPath = path.join(__dirname, '../public')

app.use(express.static(publicDirectoryPath))

// const Data = new Map()
const gameData = new Map()
const userData = new Map()
const roomsList = new Set()

let totalUsers = 0;

//Conseguir una conexión
io.on('connection', (socket) => {
    totalUsers++;
    // console.log(totalUsers)
    //Para renderizar la lista de habitaciones inicialmente
    io.emit('roomsList', Array.from(roomsList));
    io.emit('updateTotalUsers', totalUsers)
    const updateStatus = (game, room) => {
        // Jaquemate
        if (game.in_checkmate()) {
            io.to(room).emit('gameOver', game.turn(), true)
        }
        // Tablas
        else if (game.in_draw()) {
            io.to(room).emit('gameOver', game.turn(), false)
        }
        // En Progreso
        else {
            if (game.in_check()) {
                io.to(room).emit('inCheck', game.turn())
            }
            else {
                io.to(room).emit('updateStatus', game.turn())
            }
        }
    }

    //Crear y entrar a una room
    socket.on('joinRoom', ({ user, room }, callback) => {
        //Tenemos que limitar el número de usuarios en una sala a solo 2
        if (io.nsps['/'].adapter.rooms[room] && io.nsps['/'].adapter.rooms[room].length === 2) {
            return callback('¡Ya hay 2 usuarios en la sala!')
        }

        var alreadyPresent = false
        for (var x in userData) {
            if (userData[x].user == user && userData[x].room == room) {
                alreadyPresent = true
            }
        }
        // console.log(userData);
        //Si el mismo nombre de usuario ya está presente
        if (alreadyPresent) {
            return callback('¡Elige un nombre diferente!')
        }

        socket.join(room)
        //Actualización de la lista de rooms
        roomsList.add(room);
        io.emit('roomsList', Array.from(roomsList));
        totalRooms = roomsList.length
        io.emit('totalRooms', totalRooms)
        userData[user + "" + socket.id] = {
            room, user,
            id: socket.id
        }

        //Si dos usuarios están en la misma habitación, podemos empezar
        if (io.nsps['/'].adapter.rooms[room].length === 2) {
            //Eliminar lista de rooms
            roomsList.delete(room);
            io.emit('roomsList', Array.from(roomsList));
            totalRooms = roomsList.length
            io.emit('totalRooms', totalRooms)
            var game = new Chess()
            //Para obtener identificaciones de los clientes
            for (var x in io.nsps['/'].adapter.rooms[room].sockets) {
                gameData[x] = game
            }
            //Checa los turnos de uno en uno
            io.to(room).emit('Dragging', socket.id)
            io.to(room).emit('DisplayBoard', game.fen(), socket.id, game.pgn())
            updateStatus(game, room)
        }
    })

    //Para capturar eventos caídos
    socket.on('Dropped', ({ source, target, room }) => {
        var game = gameData[socket.id]
        var move = game.move({
            from: source,
            to: target,
            promotion: 'q' // NOTA: siempre ascienda a una reina por ejemplo simplicidad
        })
        // Si el movimiento es correcto, cambie los giros
        if (move != null) {
            io.to(room).emit('Dragging', socket.id)
        }
        io.to(room).emit('DisplayBoard', game.fen(), undefined, game.pgn())
        updateStatus(game, room)
        // io.to(room).emit('printing', game.fen())
    })

    //Evento de mensaje para captura
    socket.on('sendMessage', ({ user, room, message }) => {
        io.to(room).emit('receiveMessage', user, message)
    })

    //Desconectado
    socket.on('Desconectado', () => {
        totalUsers--;
        io.emit('updateTotalUsers', totalUsers)
        var room = '', user = '';
        for (var x in userData) {
            if (userData[x].id == socket.id) {
                room = userData[x].room
                user = userData[x].user
                delete userData[x]
            }
        }
        //Remover Rooms
        if (userData[room] == null) {
            //Eliminar lista de rooms
            roomsList.delete(room);
            io.emit('roomsList', Array.from(roomsList));
            totalRooms = roomsList.length
            io.emit('totalRooms', totalRooms)
        }
        gameData.delete(socket.id)
        if (user != '' && room != '') {
            io.to(room).emit('disconnectedStatus');
        }
    })
})

server.listen(port, () => {
    console.log(`El servidor está arriba en el puerto ${port}!`)
})