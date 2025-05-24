const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const XLSX = require("xlsx");

const app = express();
app.use(cors());
app.use(express.json()); // ✅ JSON 바디 파싱

// 루트 확인용
app.get("/", (req, res) => {
  res.send("Socket server is alive!");
});

// ✅ 실시간 공지 전송 API 추가
app.post("/send-popup", (req, res) => {
  const { message } = req.body;

  if (!message || typeof message !== "string") {
    return res.status(400).json({ success: false, error: "공지 내용이 없습니다." });
  }

  io.emit("popupNotice", message); // 모든 사용자에게 전송
  res.json({ success: true });
});

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

let comments = [];

// Excel 다운로드
app.get("/download-comments", (req, res) => {
  const { pass } = req.query;
  if (pass !== "0285") return res.status(403).send("비밀번호가 틀렸습니다.");

  const rows = comments
    .map(c => ({
      검정장: c.room,
      시험실: c.subRoom,
      감독관: c.supervisor || "",
      내용: c.text,
      시간: c.time,
      _sortKey: `${c.room}-${c.subRoom}`
    }))
    .sort((a, b) => a._sortKey.localeCompare(b._sortKey))
    .map(({ _sortKey, ...rest }) => rest);

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "검정장_전체_이슈");

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  const encodedFilename = encodeURIComponent("검정장_전체_이슈.xlsx");

  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodedFilename}`);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.send(buffer);
});

// 소켓 연결
io.on("connection", (socket) => {
  console.log("사용자 연결됨:", socket.id);

  socket.on("registerUser", (userInfo) => {
    socket.userInfo = userInfo;

    if (userInfo.role === "admin") {
      socket.emit("loadComments", comments);
    } else {
      const filtered = comments.filter(c => c.userId === userInfo.userId);
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

  socket.on("deleteComment", (id) => {
    comments = comments.filter(comment => comment.id !== id);
    io.emit("deleteComment", id);
  });

  socket.on("deleteAll", () => {
    if (socket.userInfo?.role !== "admin") {
      socket.emit("error", "관리자만 전체 삭제가 가능합니다.");
      return;
    }
    comments = [];
    io.emit("deleteAll");
  });

  socket.on("editComment", ({ id, text, userId }) => {
    const target = comments.find(c => c.id === id);
    if (!target || target.userId !== userId) return;

    target.text = text;

    io.sockets.sockets.forEach(s => {
      const u = s.userInfo;
      if (!u) return;

      const isSameRoom = u.room === target.room;
      const isSameSubRoom = u.subRoom === target.subRoom;
      const isSameUser = u.userId === userId;

      if (u.role !== "admin" && !(isSameUser && isSameRoom && isSameSubRoom)) return;

      const modifiedText = u.role === "admin" ? `${text} (수정됨)` : text;
      s.emit("editComment", { id, text: modifiedText });
    });
  });

  socket.on("disconnect", () => {
    console.log("사용자 연결 종료:", socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ 서버 실행 중: http://localhost:${PORT}`);
});
