const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const XLSX = require("xlsx");

const app = express();
app.use(cors());
app.use(express.json()); // ✅ JSON 바디 파싱

const fileUpload = require("express-fileupload");
const path = require("path");
const fs = require("fs");

// 파일 업로드 미들웨어
app.use(fileUpload());

// 업로드 파일 경로 정적 제공 (브라우저 접근용)
app.use("/files", express.static(path.join(__dirname, "files")));

// 파일이 업로드될 디렉토리가 없으면 자동으로 생성
const uploadDir = path.join(__dirname, "files");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// 루트 확인용
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

let latestPopup = ""; // 🟢 가장 최근 공지를 저장

// 기존 공지 전송 라우트 수정
app.post("/send-popup", (req, res) => {
  const { message } = req.body;

  if (!message || typeof message !== "string") {
    return res.status(400).json({ success: false, error: "공지 내용이 없습니다." });
  }

  latestPopup = message;                    // ✅ 저장
  io.emit("popupNotice", message);         // ✅ 현재 접속자에게만 보냄
  res.json({ success: true });
});

// 🆕 새로 접속한 사용자도 보게 하는 GET 라우트
app.get("/latest-popup", (req, res) => {
  res.json({ message: latestPopup });
});

// 파일 업로드 라우트
app.post("/upload", (req, res) => {
  if (!req.files || !req.files.uploadedFile) {
    return res.status(400).send("❌ 업로드할 파일이 없습니다.");
  }

  const file = req.files.uploadedFile;
  const savePath = path.join(__dirname, "files", file.name);

  // 파일 저장
  file.mv(savePath, (err) => {
    if (err) {
      console.error("❌ 파일 저장 실패:", err);
      return res.status(500).send("파일 저장 실패");
    }

    console.log("✅ 업로드 성공:", file.name);
    res.json({ success: true, path: `/files/${file.name}` });  // 프론트엔드에서 접근 가능하게
  });
});
