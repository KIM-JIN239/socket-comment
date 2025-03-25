// server.js
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*", // 필요한 경우 특정 도메인으로 변경 가능
    methods: ["GET", "POST"]
  }
});

let comments = [];

io.on("connection", (socket) => {
  console.log("사용자 연결됨:", socket.id);

  // 기존 댓글 전송
  socket.emit("loadComments", comments);

  // 새로운 댓글 수신
  socket.on("newComment", (comment) => {
    comments.push(comment);
    io.emit("newComment", comment);
  });

  socket.on("disconnect", () => {
    console.log("사용자 연결 종료:", socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ 서버 실행 중: http://localhost:${PORT}`);
});
