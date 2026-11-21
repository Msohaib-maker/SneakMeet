'use strict';

const os = require('os');
const http = require('http');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT) || 8787;
const MAX_PER_ROOM = 6;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('BetterZoom signaling server is running.\n');
});
const wss = new WebSocketServer({ server, maxPayload: 256 * 1024 });
const rooms = new Map();
let nextId = 1;

const send = (ws, msg) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg)); };
const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);

wss.on('connection', (ws) => {
  let id = null;
  let roomName = null;
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'join' && !id) {
      roomName = clean(msg.room, 64).toLowerCase();
      if (!roomName) return send(ws, { type: 'error', message: 'Room code is required.' });
      if (!rooms.has(roomName)) rooms.set(roomName, { members: new Map(), hostId: null });
      const room = rooms.get(roomName);
      if (room.members.size >= MAX_PER_ROOM) return send(ws, { type: 'error', message: `Room is full (max ${MAX_PER_ROOM}).` });

      const name = clean(msg.name, 40) || 'Guest';
      id = String(nextId++);
      if (msg.host === true && !room.hostId) room.hostId = id;

      send(ws, {
        type: 'joined', id, hostId: room.hostId,
        peers: [...room.members].map(([pid, m]) => ({ id: pid, name: m.name })),
      });
      for (const m of room.members.values()) send(m.ws, { type: 'peer-joined', id, name, hostId: room.hostId });
      room.members.set(id, { ws, name });
      console.log(`[room ${roomName}] ${name} joined${room.hostId === id ? ' as host' : ''} (${room.members.size} in room)`);
      return;
    }

    if (msg.type === 'signal' && id) {
      const target = rooms.get(roomName)?.members.get(String(msg.to));
      if (target) send(target.ws, { type: 'signal', from: id, data: msg.data });
    }
  });

  ws.on('close', () => {
    if (!id) return;
    const room = rooms.get(roomName);
    if (!room) return;
    const name = room.members.get(id)?.name;
    room.members.delete(id);
    for (const m of room.members.values()) send(m.ws, { type: 'peer-left', id });
    if (room.hostId === id) {
      room.hostId = null;
      for (const m of room.members.values()) send(m.ws, { type: 'host-changed', hostId: null });
    }
    if (room.members.size === 0) rooms.delete(roomName);
    console.log(`[room ${roomName}] ${name} left (${room.members.size} in room)`);
  });
});

setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 15000);

server.listen(PORT, '0.0.0.0');

const lan = Object.values(os.networkInterfaces()).flat()
  .filter((a) => a && a.family === 'IPv4' && !a.internal).map((a) => a.address);
console.log(`BetterZoom signaling server on port ${PORT}`);
console.log(`  this machine:  ws://localhost:${PORT}`);
for (const ip of lan) console.log(`  other devices: ws://${ip}:${PORT}`);
