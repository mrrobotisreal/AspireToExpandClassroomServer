const https = require("https");
const fs = require("fs");
const WebSocket = require("ws");

const certFile = fs.readFileSync(
  "/etc/letsencrypt/live/aspirewithalina.com/fullchain.pem"
);
const keyFile = fs.readFileSync(
  "/etc/letsencrypt/live/aspirewithalina.com/privkey.pem"
);

const server = https.createServer({
  cert: certFile,
  key: keyFile,
});

const wss = new WebSocket.Server({
  server,
  path: "/classroom",
  verifyClient: (info) => {
    console.log("Client origin: ", info.origin); // TODO: Add more verification logic
    return true;
  },
});

const rooms = {};

wss.on("connection", (ws, req) => {
  const params = new URLSearchParams(req.url.split("?")[1]);
  const roomID = params.get("room");
  const clientType = params.get("type");

  if (!roomID || !clientType) {
    ws.close(1008, "Missing room or client type.");
    return;
  }

  if (!rooms[roomID]) {
    rooms[roomID] = { teacher: null, students: [] };
  }

  const room = rooms[roomID];

  if (clientType === "teacher") {
    if (room.teacher) {
      ws.send(
        JSON.stringify({ error: "Teacher is already connected in this room." })
      );
      ws.close();
      return;
    }

    room.teacher = ws;
  } else if (clientType === "student") {
    room.students.push(ws);
  } else {
    ws.send(
      JSON.stringify({
        error: "Invalid client type. Use ?type=teacher or ?type=student.",
      })
    );
    ws.close();
    return;
  }

  ws.on("error", (error) => {
    console.error(`Error in room ${roomID}: ${JSON.stringify(error)}`);
  });

  ws.on("message", (message) => {
    console.log("Incoming message: ", message);
    if (ws === room.teacher) {
      console.log(`Teacher in room ${roomID} sent: ${message}`);
      room.students.forEach((student) => {
        if (student.readyState === WebSocket.OPEN) {
          student.send(message);
        }
      });
    } else {
      if (room.teacher && room.teacher.readyState === WebSocket.OPEN) {
        console.log(`Student in room ${roomID} sent: ${message}`);
        room.teacher.send(message);
        room.students.forEach((student) => {
          if (student !== ws && student.readyState === WebSocket.OPEN) {
            student.send(message);
          }
        });
      }
    }
  });

  ws.on("close", () => {
    if (clientType === "teacher") {
      room.teacher = null;
    } else if (clientType === "student") {
      room.students = room.students.filter((student) => student !== ws);
    }

    if (!room.teacher && room.students.length === 0) {
      delete rooms[roomID];
    }
  });
});

server.listen(9999, () => {
  console.log(
    "WebSocket server started securely on https://localhost:9999/classroom"
  );
});
