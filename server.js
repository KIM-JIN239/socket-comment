const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

let comments = [];

io.on("connection", (socket) => {
  console.log("사용자 연결됨:", socket.id);

  // 사용자 역할/위치 정보 등록
  socket.on("registerUser", (userInfo) => {
    socket.userInfo = userInfo;

    if (userInfo.role === "admin") {
      socket.emit("loadComments", comments); // 전체 댓글 전송
    } else {
      const filtered = comments.filter(c =>
        c.room === userInfo.room && c.subRoom === userInfo.subRoom
      );
      socket.emit("loadComments", filtered); // 해당 방만 전송
    }
  });

  // 새로운 댓글 수신
  socket.on("newComment", (comment) => {
    comments.push(comment);

    // 사용자마다 조건에 따라 전송
    io.sockets.sockets.forEach((s) => {
      const u = s.userInfo;
      if (!u) return;
      if (u.role === "admin") {
        s.emit("newComment", comment);
      } else if (
        u.room === comment.room &&
        u.subRoom === comment.subRoom
      ) {
        s.emit("newComment", comment);
      }
    });
  });

  // 댓글 삭제
  socket.on("deleteComment", (id) => {
    comments = comments.filter(comment => comment.id !== id);
    io.emit("deleteComment", id);
  });

  // 전체 댓글 삭제 (관리자만 호출한다고 가정)
  socket.on("deleteAll", () => {
    comments = [];
    io.emit("deleteAll");
  });

  socket.on("disconnect", () => {
    console.log("사용자 연결 종료:", socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ 서버 실행 중: http://localhost:${PORT}`);
});
