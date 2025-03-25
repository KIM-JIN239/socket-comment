const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors({
  origin: "*", // 모든 도메인에서 접근을 허용
  methods: ["GET", "POST"]
}));

const server = http.createServer(app);
const io = socketIo(server);

// 댓글을 저장하는 변수
let comments = [];

// 새로운 댓글이 추가되면 모든 클라이언트에 전송
io.on("connection", (socket) => {
  console.log("새로운 클라이언트 연결");

  // 클라이언트에서 'newComment' 이벤트가 발생하면 댓글을 추가
  socket.on("newComment", (commentData) => {
    comments.push(commentData); // 댓글 저장
    io.emit("newComment", commentData); // 모든 클라이언트에 댓글 전송
  });

  // 클라이언트에서 'deleteComment' 이벤트가 발생하면 해당 댓글 삭제
  socket.on("deleteComment", (id) => {
    comments = comments.filter(comment => comment.id !== id);
    io.emit("deleteComment", id); // 삭제된 댓글을 모든 클라이언트에 알림
  });

  // 클라이언트에서 'deleteAll' 이벤트가 발생하면 모든 댓글 삭제
  socket.on("deleteAll", () => {
    comments = [];
    io.emit("deleteAll"); // 모든 댓글 삭제를 모든 클라이언트에 알림
  });

  // 클라이언트에서 기존 댓글을 요청하면 보내기
  socket.emit("loadComments", comments);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`서버가 ${PORT}에서 실행 중...`);
});
