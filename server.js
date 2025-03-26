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
  console.log("✅ 사용자 연결됨:", socket.id);

  // 사용자 정보 등록
  socket.on("registerUser", (userInfo) => {
    socket.userInfo = userInfo;

    const visibleComments = comments.filter((c) =>
      userInfo.role === "admin" ||
      (c.room === userInfo.room && c.subRoom === userInfo.subRoom) ||
      c.senderId === socket.id
    );

    socket.emit("loadComments", visibleComments);
  });

  // 새로운 댓글 추가
  socket.on("newComment", (comment) => {
    comment.senderId = socket.id; // 작성자 식별 정보 추가
    comments.push(comment);

    // 대상별 전파
    io.sockets.sockets.forEach((s) => {
      const u = s.userInfo;
      if (!u) return;

      const isSameRoom = u.room === comment.room && u.subRoom === comment.subRoom;
      const isOwner = s.id === comment.senderId;
      const isAdmin = u.role === "admin";

      if (isAdmin || isSameRoom || isOwner) {
        s.emit("newComment", comment);
      }
    });
  });

  // 댓글 삭제
  socket.on("deleteComment", (id) => {
    const comment = comments.find(c => c.id === id);
    if (!comment) return;

    const isAdmin = socket.userInfo?.role === "admin";
    const isOwner = comment.senderId === socket.id;

    if (isAdmin || isOwner) {
      comments = comments.filter(c => c.id !== id);
      io.emit("deleteComment", id);
    } else {
      socket.emit("error", "삭제 권한이 없습니다.");
    }
  });

  // 전체 삭제 (관리자 전용)
  socket.on("deleteAll", () => {
    const isAdmin = socket.userInfo?.role === "admin";
    if (!isAdmin) {
      socket.emit("error", "관리자만 전체 삭제가 가능합니다.");
      return;
    }

    comments = [];
    io.emit("deleteAll");
  });

  socket.on("disconnect", () => {
    console.log("👋 사용자 연결 종료:", socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  const XLSX = require("xlsx");

app.get("/download-comments", (req, res) => {
  const { pass } = req.query;
  if (pass !== "0285") {
    return res.status(403).send("비밀번호가 틀렸습니다.");
  }

  const rows = comments.map(c => ({
    시험장: c.room,
    수검실: c.subRoom,
    내용: c.text,
    시간: c.time,
    작성자: c.senderId,
    정렬키: `${c.room}-${c.subRoom}`
  }));

  // 시험장+수검실 기준 정렬
  rows.sort((a, b) => a["정렬키"].localeCompare(b["정렬키"]));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "전체 이슈");

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Disposition", "attachment; filename=시험장_전체_이슈.xlsx");
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.send(buffer);
});
  console.log(`✅ 서버 실행 중: http://localhost:${PORT}`);
});
