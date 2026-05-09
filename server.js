const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

const PORT = process.env.PORT || 3000;
const publicDir = __dirname;

app.use(express.static(publicDir));

app.get("/", (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

function leaveCurrentRoom(socket) {
  const roomId = socket.data.roomId;
  if (!roomId) {
    return;
  }
  socket.leave(roomId);
  socket.to(roomId).emit("player:left", { id: socket.id });
  socket.data.roomId = "";
  socket.data.playerState = null;
}

function getRoomPeers(roomId, selfId) {
  const sockets = io.sockets.adapter.rooms.get(roomId) || new Set();
  return Array.from(sockets)
    .filter((id) => id !== selfId)
    .map((id) => {
      const peer = io.sockets.sockets.get(id);
      return peer ? { id, state: peer.data.playerState || null } : null;
    })
    .filter(Boolean);
}

io.on("connection", (socket) => {
  socket.on("room:join", ({ roomId } = {}) => {
    const normalizedRoomId = String(roomId || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9-]/g, "")
      .slice(0, 8);

    if (!normalizedRoomId) {
      return;
    }

    if (socket.data.roomId && socket.data.roomId !== normalizedRoomId) {
      leaveCurrentRoom(socket);
    }

    socket.data.roomId = normalizedRoomId;
    socket.join(normalizedRoomId);
    socket.emit("room:joined", {
      roomId: normalizedRoomId,
      peers: getRoomPeers(normalizedRoomId, socket.id)
    });
    socket.to(normalizedRoomId).emit("player:joined", { id: socket.id });
  });

  socket.on("player:update", (state) => {
    const roomId = socket.data.roomId;
    if (!roomId || !state) {
      return;
    }

    socket.data.playerState = {
      levelIndex: Number(state.levelIndex) || 0,
      x: Number(state.x) || 0,
      z: Number(state.z) || 0,
      yaw: Number(state.yaw) || 0,
      pitch: Number(state.pitch) || 0,
      flashlightOn: Boolean(state.flashlightOn),
      expression: String(state.expression || "neutral").slice(0, 16).toLowerCase(),
      action: String(state.action || "").slice(0, 16).toLowerCase(),
      actionAt: Number(state.actionAt) || 0
    };

    socket.to(roomId).emit("player:state", {
      id: socket.id,
      state: socket.data.playerState
    });
  });

  socket.on("room:leave", () => {
    leaveCurrentRoom(socket);
  });

  socket.on("disconnecting", () => {
    leaveCurrentRoom(socket);
  });
});

server.listen(PORT, () => {
  console.log(`Houshi server listening on http://localhost:${PORT}`);
});
