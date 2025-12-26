const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());
const path = require("path");
// Servir archivos estáticos del cliente
app.use(express.static(path.join(__dirname, "../public")));
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Estructura de salas: { [codigo]: { jugadores: [ {id,nombre,rol,anfitrion} ], backupPalabras: [...]} }
const salas = {};
const backupPalabras = [
  "PIZZA",
  "PLAYA",
  "DIBUJO",
  "GUITARRA",
  "CELULAR",
  "ELEFANTE",
  "FUTBOL",
];

function generarCodigo(longitud = 4) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < longitud; i++)
    code += chars[Math.floor(Math.random() * chars.length)];
  // Asegurar unicidad básica
  if (salas[code]) return generarCodigo(longitud);
  return code;
}

io.on("connection", (socket) => {
  console.log(`[io] connection ${socket.id} from ${socket.handshake.address}`);
  // Crear una sala y unirse como anfitrión
  socket.on("crearSala", (nombre) => {
    console.log(`[io] crearSala from ${socket.id} nombre=${nombre}`);
    const code = generarCodigo();
    salas[code] = { jugadores: [], backupPalabras: backupPalabras.slice() };
    const nuevoJugador = {
      id: socket.id,
      nombre: nombre || "Jugador",
      rol: null,
      anfitrion: true,
    };
    salas[code].jugadores.push(nuevoJugador);
    socket.join(code);
    socket.data.room = code;
    io.to(code).emit("actualizarLista", salas[code].jugadores);
    socket.emit("salaCreada", code);
  });

  // Unirse a una sala existente por código
  socket.on("unirseSala", ({ code, nombre }) => {
    console.log(
      `[io] unirseSala from ${socket.id} code=${code} nombre=${nombre}`
    );
    if (!code || !salas[code]) {
      socket.emit("errorSala", "Sala no encontrada");
      return;
    }
    const nuevoJugador = {
      id: socket.id,
      nombre: nombre || "Jugador",
      rol: null,
      anfitrion: false,
    };
    salas[code].jugadores.push(nuevoJugador);
    // recalcular anfitrión
    salas[code].jugadores.forEach((j, i) => (j.anfitrion = i === 0));
    socket.join(code);
    socket.data.room = code;
    io.to(code).emit("actualizarLista", salas[code].jugadores);
    socket.emit("salaUnida", code);
  });

  // Iniciar juego en la sala del socket
  socket.on("iniciarJuego", () => {
    console.log(`[io] iniciarJuego from ${socket.id} room=${socket.data.room}`);
    const code = socket.data.room;
    if (!code || !salas[code]) return;
    const jugadores = salas[code].jugadores;
    if (jugadores.length < 3) return;
    const idxEscritor = Math.floor(Math.random() * jugadores.length);
    const escritor = jugadores[idxEscritor];
    let posiblesImpostores = jugadores.filter((j) => j.id !== escritor.id);
    const impostor =
      posiblesImpostores[Math.floor(Math.random() * posiblesImpostores.length)];

    jugadores.forEach((j) => {
      if (j.id === escritor.id) j.rol = "escritor";
      else if (j.id === impostor.id) j.rol = "impostor";
      else j.rol = "normal";
    });
    io.to(code).emit("rolesAsignados", { escritor: escritor.nombre });
  });

  socket.on("pedirPalabraAleatoria", async () => {
    console.log(
      `[io] pedirPalabraAleatoria from ${socket.id} room=${socket.data.room}`
    );
    const code = socket.data.room;
    try {
      const response = await fetch(
        "https://clientes.api.greenborn.com.ar/public-random-word"
      );
      const data = await response.json();
      let p = data[0]
        .normalize("NFD")
        .replace(/[^\u0000-\u007F]/g, "")
        .toUpperCase();
      socket.emit("palabraSugerida", p);
    } catch (e) {
      const lista =
        code && salas[code] ? salas[code].backupPalabras : backupPalabras;
      socket.emit(
        "palabraSugerida",
        lista[Math.floor(Math.random() * lista.length)]
      );
    }
  });

  socket.on("palabraElegida", (p) => {
    console.log(
      `[io] palabraElegida from ${socket.id} palabra=${p} room=${socket.data.room}`
    );
    const code = socket.data.room;
    if (!code || !salas[code]) return;
    const jugadores = salas[code].jugadores;
    jugadores.forEach((j) => {
      io.to(j.id).emit("revelarRol", {
        rol: j.rol,
        palabra: j.rol === "impostor" ? "???" : p,
      });
    });
  });

  socket.on("disconnect", () => {
    console.log(`[io] disconnect ${socket.id} room=${socket.data.room}`);
    const code = socket.data.room;
    if (code && salas[code]) {
      salas[code].jugadores = salas[code].jugadores.filter(
        (j) => j.id !== socket.id
      );
      if (salas[code].jugadores.length > 0) {
        salas[code].jugadores.forEach((j, i) => (j.anfitrion = i === 0));
        io.to(code).emit("actualizarLista", salas[code].jugadores);
      } else {
        // eliminar sala vacía
        delete salas[code];
      }
    }
  });
});

// Endpoint simple para comprobar existencia de sala
app.get("/salas/:code", (req, res) => {
  const code = req.params.code;
  if (!code || !salas[code])
    return res.status(404).json({ ok: false, msg: "Sala no encontrada" });
  res.json({ ok: true, jugadores: salas[code].jugadores.length });
});

server.listen(process.env.PORT || 10000);
