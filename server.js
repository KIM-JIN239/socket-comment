const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const XLSX = require("xlsx"); // Excel 라이브러리

const app = express();
app.use(cors());

// ✅ 루트 경로 응답 추가 (UptimeRobot용)
app.get("/", (req, res) => {
  res.send("Socket server is alive!");
});

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

let comments = [];

// ✅ Excel 다운로드 라우트 (정렬 필드 숨김)
app.get("/download-comments", (req, res) => {
  const { pass } = req.query;
  if (pass !== "0285") {
    return res.status(403).send("비밀번호가 틀렸습니다.");
  }

  // 정렬용 필드 포함 → 정렬 후 → 제거
  const rows = comments
    .map(c => ({
      시험장: c.room,
      수검실: c.subRoom,
      내용: c.text,
      시간: c.time,
      _sortKey: `${c.room}-${c.subRoom}`
    }))
    .sort((a, b) => a._sortKey.localeCompare(b._sortKey))
    .map(({ _sortKey, ...rest }) => rest); // 정렬키 제거

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "전체 이슈");

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  const encodedFilename = encodeURIComponent("시험장_전체_이슈.xlsx");
   res.setHeader(
  "Content-Disposition",
  `attachment; filename*=UTF-8''${encodedFilename}`
);

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.send(buffer);
});

// ✅ 소켓 설정
io.on("connection", (socket) => {
  console.log("사용자 연결됨:", socket.id);

  // 사용자 정보 등록
  socket.on("registerUser", (userInfo) => {
    socket.userInfo = userInfo;

   if (userInfo.role === "admin") {
  socket.emit("loadComments", comments); // 관리자: 전체 댓글 수신
} else {
  const filtered = comments.filter(c =>
    c.userId === userInfo.userId
  );
  socket.emit("loadComments", filtered);
}
  });
socket.on("requestComments", ({ room, subRoom }) => {
  const u = socket.userInfo;
  if (!u) return;

  const filtered = comments.filter(c =>
    c.room === room &&
    c.subRoom === subRoom &&
    (u.role === "admin" || c.userId === u.userId)
  );

  socket.emit("loadComments", filtered);
});

  // 새로운 댓글
 socket.on("newComment", (comment) => {
  comments.push(comment);

  io.sockets.sockets.forEach((s) => {
    const u = s.userInfo;
    if (!u) return;

    const isSameRoom = u.room === comment.room;
    const isSameSubRoom = u.subRoom === comment.subRoom;

    if (u.role === "admin" || (isSameRoom && isSameSubRoom && u.userId === comment.userId)) {
      s.emit("newComment", comment);
    }
  });
});
  // 댓글 삭제
  socket.on("deleteComment", (id) => {
    comments = comments.filter(comment => comment.id !== id);
    io.emit("deleteComment", id);
  });

  // 전체 삭제 (관리자만)
  socket.on("deleteAll", () => {
    if (socket.userInfo?.role !== "admin") {
      socket.emit("error", "관리자만 전체 삭제가 가능합니다.");
      return;
    }
    comments = [];
    io.emit("deleteAll");
  });

  socket.on("disconnect", () => {
    console.log("사용자 연결 종료:", socket.id);
  });
});

// ✅ 서버 시작
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ 서버 실행 중: http://localhost:${PORT}`);
});
