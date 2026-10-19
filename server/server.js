const express = require("express");
const http = require("http");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { Server } = require("socket.io");
require("dotenv").config();

const { connectDB, dbState } = require("./config/db");
const { getJwtSecret } = require("./config/jwt");
const authRoutes = require("./routes/authRoutes");
const workspaceRoutes = require("./routes/workspaceRoutes");
const invitationRoutes = require("./routes/invitationRoutes");
const meetingRoutes = require("./routes/meetingRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const userRoutes = require("./routes/userRoutes");
const taskRoutes = require("./routes/taskRoutes");
const { seedDemoData } = require("./utils/seedData");
const { authenticateToken, requireAuth } = require("./middleware/authMiddleware");
const { getAccessibleMeeting } = require("./utils/accessControl");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: true,
    credentials: true,
  },
});
const meetingParticipants = new Map();
const meetingRoom = (meetingId) => `meeting:${meetingId}`;
const isMeetingId = (value) => typeof value === "string" && /^[a-z\d_-]{1,128}$/i.test(value);

app.use(helmet());
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
  })
);
app.use(express.json({ limit: "1mb" }));

io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token;
  if (typeof token !== "string" || !token) {
    return next(new Error("Authentication required"));
  }

  try {
    const user = await authenticateToken(token);
    if (!user) return next(new Error("Invalid or expired token"));
    socket.data.user = user;
    return next();
  } catch (error) {
    console.error(`Socket authentication failed: ${error.name || "UnknownError"}`);
    return next(new Error("Authentication failed"));
  }
});

io.on("connection", (socket) => {
  const sendAck = (ack, payload) => {
    if (typeof ack === "function") ack(payload);
  };

  const participantsFor = (meetingId) => [
    ...(meetingParticipants.get(meetingId)?.values() || []),
  ];

  const emitParticipants = (meetingId) => {
    io.to(meetingRoom(meetingId)).emit("meeting:participants", participantsFor(meetingId));
  };

  const removeFromMeeting = async (reason = "left") => {
    const meetingId = socket.data.meetingId;
    if (!meetingId) return;

    const roomName = meetingRoom(meetingId);
    const participants = meetingParticipants.get(meetingId);
    const participant = participants?.get(socket.id);
    participants?.delete(socket.id);
    if (participants?.size === 0) meetingParticipants.delete(meetingId);
    socket.data.meetingId = null;
    await socket.leave(roomName);
    if (participant) {
      io.to(roomName).emit("meeting:user-left", {
        participantId: socket.id,
        userId: participant.userId,
        reason,
      });
      emitParticipants(meetingId);
    }
  };

  socket.on("meeting:join", async (payload, ack) => {
    const meetingId = typeof payload?.meetingId === "string" ? payload.meetingId.trim() : "";
    if (!isMeetingId(meetingId)) {
      return sendAck(ack, { ok: false, status: 400, message: "Invalid meeting ID" });
    }

    if (socket.data.meetingId === meetingId) {
      return sendAck(ack, {
        ok: true,
        participants: participantsFor(meetingId),
        participantId: socket.id,
      });
    }

    try {
      const meeting = await getAccessibleMeeting(meetingId, socket.data.user.id);
      if (!meeting) {
        return sendAck(ack, { ok: false, status: 404, message: "Meeting not found or you do not have access" });
      }

      await removeFromMeeting();
      const roomName = meetingRoom(meetingId);
      await socket.join(roomName);
      socket.data.meetingId = meetingId;
      const user = socket.data.user;
      const participant = {
        participantId: socket.id,
        userId: user.id,
        name: user.name,
        avatar: user.avatar || "",
        role: String(meeting.createdBy) === user.id ? "Host" : "Member",
        micEnabled: true,
        cameraEnabled: true,
        screenshareEnabled: false,
        connectionStatus: "connected",
      };
      if (!meetingParticipants.has(meetingId)) meetingParticipants.set(meetingId, new Map());
      meetingParticipants.get(meetingId).set(socket.id, participant);

      const joined = {
        ok: true,
        meeting: {
          id: String(meeting._id || meeting.id),
          title: meeting.title,
          status: meeting.status,
          createdBy: String(meeting.createdBy),
        },
        participantId: socket.id,
        participants: participantsFor(meetingId),
      };
      socket.emit("meeting:joined", joined);
      socket.to(roomName).emit("meeting:user-joined", participant);
      emitParticipants(meetingId);
      return sendAck(ack, joined);
    } catch (error) {
      console.error(`Socket meeting join failed: ${error.name || "UnknownError"}`);
      return sendAck(ack, { ok: false, status: 503, message: "Could not join the meeting right now" });
    }
  });

  socket.on("meeting:leave", async (_payload, ack) => {
    await removeFromMeeting();
    sendAck(ack, { ok: true });
  });

  for (const [eventName, stateKey] of [
    ["participant:mic", "micEnabled"],
    ["participant:camera", "cameraEnabled"],
    ["participant:screenshare", "screenshareEnabled"],
  ]) {
    socket.on(eventName, (payload) => {
      const meetingId = socket.data.meetingId;
      if (!meetingId || typeof payload?.enabled !== "boolean") return;
      const participant = meetingParticipants.get(meetingId)?.get(socket.id);
      if (!participant) return;
      participant[stateKey] = payload.enabled;
      io.to(meetingRoom(meetingId)).emit(eventName, {
        participantId: socket.id,
        userId: participant.userId,
        enabled: payload.enabled,
      });
      emitParticipants(meetingId);
    });
  }

  for (const eventName of ["webrtc:offer", "webrtc:answer", "webrtc:ice-candidate"]) {
    socket.on(eventName, (payload) => {
      const meetingId = socket.data.meetingId;
      const targetId = typeof payload?.targetId === "string" ? payload.targetId : "";
      if (
        !meetingId ||
        !targetId ||
        targetId === socket.id ||
        !meetingParticipants.get(meetingId)?.has(targetId)
      ) {
        return;
      }
      const signal = {
        meetingId,
        fromId: socket.id,
      };
      if (eventName === "webrtc:offer") signal.offer = payload.offer;
      if (eventName === "webrtc:answer") signal.answer = payload.answer;
      if (eventName === "webrtc:ice-candidate") signal.candidate = payload.candidate;
      io.to(targetId).emit(eventName, signal);
    });
  }

  socket.on("chat:send", (payload, ack) => {
    const meetingId = socket.data.meetingId;
    const message = typeof payload?.message === "string" ? payload.message.trim() : "";
    const participant = meetingId && meetingParticipants.get(meetingId)?.get(socket.id);
    if (!participant || !message || message.length > 4000) {
      return sendAck(ack, { ok: false, message: "Message must be between 1 and 4000 characters" });
    }
    const chatMessage = {
      id: `${socket.id}:${Date.now()}`,
      meetingId,
      senderId: participant.userId,
      senderName: participant.name,
      message,
      timestamp: new Date().toISOString(),
    };
    io.to(meetingRoom(meetingId)).emit("chat:receive", chatMessage);
    return sendAck(ack, { ok: true, message: chatMessage });
  });

  socket.on("chat:typing", () => {
    const meetingId = socket.data.meetingId;
    const participant = meetingId && meetingParticipants.get(meetingId)?.get(socket.id);
    if (participant) socket.to(meetingRoom(meetingId)).emit("chat:typing", {
      participantId: socket.id,
      senderName: participant.name,
    });
  });

  socket.on("chat:stop-typing", () => {
    const meetingId = socket.data.meetingId;
    if (meetingId) socket.to(meetingRoom(meetingId)).emit("chat:stop-typing", { participantId: socket.id });
  });

  socket.on("disconnect", () => {
    void removeFromMeeting("disconnected");
  });
});

app.get("/", (req, res) => {
  res.json({ message: "IntellMeet API is running 🚀" });
});

app.use("/api/auth", authRoutes);
app.use("/api/workspaces", workspaceRoutes);
app.use("/api/invitations", invitationRoutes);
app.get("/api/meetings/active", requireAuth, async (req, res) => {
  try {
    const activeRooms = [...meetingParticipants.entries()].filter(([, participants]) => participants.size > 0);
    const meetings = await Promise.all(
      activeRooms.map(async ([meetingId, participants]) => {
        const meeting = await getAccessibleMeeting(meetingId, req.user.id);
        if (!meeting) return null;
        return {
          id: String(meeting._id || meeting.id),
          title: meeting.title,
          description: meeting.description || "",
          participantCount: participants.size,
        };
      })
    );
    return res.json(meetings.filter(Boolean));
  } catch (error) {
    console.error(`Fetching active meetings failed: ${error.name || "UnknownError"}`);
    return res.status(500).json({ message: "Failed to fetch active meetings" });
  }
});
app.use("/api/meetings", meetingRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/users", userRoutes);
app.use("/api/tasks", taskRoutes);

app.use((err, req, res, next) => {
  if (err?.type === "entity.parse.failed") {
    return res.status(400).json({ message: "Request body contains invalid JSON" });
  }
  if (err?.type === "entity.too.large") {
    return res.status(413).json({ message: "Request body is too large" });
  }
  console.error(`Server error: ${err?.name || "UnknownError"}`);
  return res.status(500).json({ message: "Internal server error" });
});

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  getJwtSecret();

  const connected = await connectDB();

  if (connected && !dbState.fallbackMode && process.env.NODE_ENV !== "production") {
    await seedDemoData();
  }

  server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
};

startServer().catch((error) => {
  console.error("Server startup failed:", error.message);
  process.exitCode = 1;
});