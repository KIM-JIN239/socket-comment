const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const XLSX = require("xlsx"); // Excel 라이브러리 추가

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

// ✅ Excel 다운로드 라우트
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
    정렬기준: `${c.room}-${c.subRoom}`
  }));

  // 정렬
  rows.sort((a, b) => a["정렬기준"].localeCompare(b["정렬기준"]));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "전체 이슈");

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Disposition", "attachment; filename=시험장_전체_이슈.xlsx");
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.send(buffer);
});

// ✅ 소켓 설정
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

// ✅ 서버 시작
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ 서버 실행 중: http://localhost:${PORT}`);
});
