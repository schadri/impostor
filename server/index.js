const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, "../public")));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

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
  if (salas[code]) return generarCodigo(longitud);
  return code;
}

io.on("connection", (socket) => {
  socket.on("crearSala", (nombre) => {
    const code = generarCodigo();
    salas[code] = { jugadores: [], palabraActual: null, enJuego: false };
    const nuevoJugador = { id: socket.id, nombre, rol: null, anfitrion: true };
    salas[code].jugadores.push(nuevoJugador);
    socket.join(code);
    socket.data.room = code;
    io.to(code).emit("actualizarLista", salas[code].jugadores);
    socket.emit("salaCreada", code);
  });

  socket.on("unirseSala", ({ code, nombre }) => {
    if (!code || !salas[code]) {
      socket.emit("errorSala", "Sala no encontrada");
      return;
    }

    let jugadorExistente = salas[code].jugadores.find(
      (j) => j.nombre === nombre
    );

    if (jugadorExistente) {
      jugadorExistente.id = socket.id;
      socket.join(code);
      socket.data.room = code;
      socket.emit("salaUnida", code);
      io.to(code).emit("actualizarLista", salas[code].jugadores);
      return;
    }

    const nuevoJugador = { id: socket.id, nombre, rol: null, anfitrion: false };
    salas[code].jugadores.push(nuevoJugador);
    socket.join(code);
    socket.data.room = code;
    io.to(code).emit("actualizarLista", salas[code].jugadores);
    socket.emit("salaUnida", code);
  });

  socket.on("iniciarJuego", () => {
    const code = socket.data.room;
    if (!salas[code]) return;
    const jugadores = salas[code].jugadores;

    salas[code].enJuego = true;
    salas[code].palabraActual = null;

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

  socket.on("palabraElegida", (p) => {
    const code = socket.data.room;
    if (!salas[code]) return;
    salas[code].palabraActual = p;
    salas[code].jugadores.forEach((j) => {
      io.to(j.id).emit("revelarRol", {
        rol: j.rol,
        palabra: j.rol === "impostor" ? "???" : p,
      });
    });
  });

  socket.on("pedirPalabraAleatoria", async () => {
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
      socket.emit(
        "palabraSugerida",
        backupPalabras[Math.floor(Math.random() * backupPalabras.length)]
      );
    }
  });
});

server.listen(process.env.PORT || 10000);
