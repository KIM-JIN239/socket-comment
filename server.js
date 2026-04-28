const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const ExcelJS = require("exceljs");

const app = express();
app.use(cors());
app.use(express.json()); // ✅ JSON 바디 파싱

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
app.get("/download-comments", async (req, res) => {
  const { pass } = req.query;
  if (pass !== "0285") return res.status(403).send("비밀번호가 틀렸습니다.");

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ICQA";
  workbook.created = new Date();

  // ── 색상 팔레트 ──────────────────────────────────────
  const COLOR = {
    headerBg:  "2C3E50",   // 헤더 배경 (다크 네이비)
    headerFg:  "FFFFFF",   // 헤더 글씨 (흰색)
    okBg:      "D1FAE5",   // 이상없음 행 배경 (연초록)
    okFg:      "065F46",   // 이상없음 글씨
    issueBg:   "FEF2F2",   // 이슈 행 배경 (연빨간)
    issueFg:   "991B1B",   // 이슈 글씨
    tagBg:     "EFF6FF",   // 태그 셀 배경
    summaryHd: "1ABC9C",   // 요약 시트 헤더 (민트)
    border:    "D1D5DB",   // 테두리 색
  };

  const thin = { style: "thin", color: { argb: "FF" + COLOR.border } };
  const borders = { top: thin, left: thin, bottom: thin, right: thin };

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Sheet 1 – 전체 이슈 목록
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const sheet1 = workbook.addWorksheet("전체 이슈 목록");
  sheet1.columns = [
    { header: "No",     key: "no",         width: 6  },
    { header: "검정장", key: "room",        width: 24 },
    { header: "시험실", key: "subRoom",     width: 14 },
    { header: "감독관", key: "supervisor",  width: 14 },
    { header: "상태",   key: "status",      width: 10 },
    { header: "이슈태그", key: "tag",       width: 18 },
    { header: "내용",   key: "text",        width: 50 },
    { header: "제출시간", key: "time",      width: 14 },
  ];

  // 헤더 스타일
  sheet1.getRow(1).eachCell(cell => {
    cell.fill   = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + COLOR.headerBg } };
    cell.font   = { bold: true, color: { argb: "FF" + COLOR.headerFg }, size: 11 };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = borders;
  });
  sheet1.getRow(1).height = 22;

  // 데이터 행 추가
  const sorted = [...comments].sort((a, b) =>
    `${a.room}-${a.subRoom}`.localeCompare(`${b.room}-${b.subRoom}`)
  );

  sorted.forEach((c, i) => {
    const isOk = c.text === "이상없음";
    const row = sheet1.addRow({
      no:         i + 1,
      room:       c.room,
      subRoom:    c.subRoom,
      supervisor: c.supervisor || "",
      status:     isOk ? "✅ 이상없음" : "⚠️ 이슈있음",
      tag:        c.tag || "",
      text:       c.text,
      time:       c.time,
    });

    const bgColor = isOk ? "FF" + COLOR.okBg : "FF" + COLOR.issueBg;
    const fgColor = isOk ? "FF" + COLOR.okFg  : "FF" + COLOR.issueFg;

    row.eachCell(cell => {
      cell.fill   = { type: "pattern", pattern: "solid", fgColor: { argb: bgColor } };
      cell.font   = { color: { argb: fgColor }, size: 10 };
      cell.alignment = { vertical: "middle", wrapText: true };
      cell.border = borders;
    });

    // 상태 셀 가운데 정렬
    row.getCell("status").alignment = { horizontal: "center", vertical: "middle" };
    row.getCell("no").alignment     = { horizontal: "center", vertical: "middle" };
    row.height = 20;
  });

  // 행 없을 때 안내
  if (sorted.length === 0) {
    const row = sheet1.addRow({ no: "", room: "등록된 데이터가 없습니다.", subRoom:"", supervisor:"", status:"", tag:"", text:"", time:"" });
    row.getCell("room").font = { italic: true, color: { argb: "FF999999" } };
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Sheet 2 – 검정장별 요약
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const sheet2 = workbook.addWorksheet("검정장별 요약");
  sheet2.columns = [
    { header: "검정장",       key: "room",    width: 26 },
    { header: "시험실",       key: "subRoom", width: 14 },
    { header: "감독관",       key: "sup",     width: 14 },
    { header: "상태",         key: "status",  width: 12 },
    { header: "이슈 내용",    key: "text",    width: 52 },
    { header: "제출시간",     key: "time",    width: 14 },
  ];

  // 요약 헤더 스타일
  sheet2.getRow(1).eachCell(cell => {
    cell.fill   = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + COLOR.summaryHd } };
    cell.font   = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = borders;
  });
  sheet2.getRow(1).height = 22;

  // 검정장별 그룹화
  const grouped = {};
  sorted.forEach(c => {
    const key = c.room;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(c);
  });

  let prevRoom = null;
  Object.entries(grouped).forEach(([room, entries]) => {
    entries.forEach((c, idx) => {
      const isOk = c.text === "이상없음";
      const bgColor = isOk ? "FF" + COLOR.okBg : "FF" + COLOR.issueBg;
      const fgColor = isOk ? "FF" + COLOR.okFg  : "FF" + COLOR.issueFg;

      const row = sheet2.addRow({
        room:    idx === 0 ? room : "",   // 검정장명은 첫 행만
        subRoom: c.subRoom,
        sup:     c.supervisor || "",
        status:  isOk ? "✅ 이상없음" : "⚠️ 이슈있음",
        text:    isOk ? "" : c.text,
        time:    c.time,
      });

      row.eachCell(cell => {
        cell.border = borders;
        cell.alignment = { vertical: "middle", wrapText: true };
        cell.font = { size: 10 };
      });

      // 이슈 행만 색상 적용
      if (!isOk) {
        row.eachCell(cell => {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgColor } };
          cell.font = { color: { argb: fgColor }, size: 10 };
        });
      }

      row.getCell("status").alignment = { horizontal: "center", vertical: "middle" };
      if (!isOk) row.height = 32;
    });

    // 검정장 구분선 (빈 행)
    const sep = sheet2.addRow({});
    sep.height = 6;
    prevRoom = room;
  });

  // ── 파일 전송 ──────────────────────────────────────
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,"0")}${String(now.getDate()).padStart(2,"0")}_${String(now.getHours()).padStart(2,"0")}${String(now.getMinutes()).padStart(2,"0")}`;
  const filename = encodeURIComponent(`검정장_이슈_${stamp}.xlsx`);

  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${filename}`);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  await workbook.xlsx.write(res);
  res.end();
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

// 🆕 공지 취소 라우트
app.post("/cancel-popup", (req, res) => {
  latestPopup = "";                        // ✅ 저장된 공지 제거
  io.emit("cancelPopup");                  // ✅ 모든 클라이언트에 취소 신호
  res.json({ success: true });
});