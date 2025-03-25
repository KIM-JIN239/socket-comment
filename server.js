const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const comments = [];  // 댓글 저장용 배열

// 댓글 추가 및 삭제 처리
io.on('connection', (socket) => {
  console.log('A user connected');

  // 댓글 추가
  socket.on('newComment', (commentData) => {
    comments.push(commentData);
    io.emit('newComment', commentData); // 새로운 댓글을 모두에게 전송
  });

  // 댓글 삭제
  socket.on('deleteComment', (id) => {
    const index = comments.findIndex((comment) => comment.id === id);
    if (index !== -1) {
      comments.splice(index, 1);  // 댓글 삭제
      io.emit('deleteComment', id); // 삭제된 댓글을 모든 클라이언트에 broadcast
    }
  });

  // 전체 댓글 삭제
  socket.on('deleteAll', () => {
    comments.length = 0; // 배열 초기화
    io.emit('deleteAll');  // 전체 댓글 삭제 broadcast
  });

  // 댓글 로드 (초기화)
  socket.emit('loadComments', comments); // 기존 댓글을 클라이언트로 전달

  socket.on('disconnect', () => {
    console.log('A user disconnected');
  });
});

// 정적 파일 제공 (HTML, CSS, JS 등)
app.use(express.static('public'));

// 서버 시작
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
