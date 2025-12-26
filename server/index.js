const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

let jugadores = [];
const backupPalabras = [
  "PIZZA",
  "PLAYA",
  "DIBUJO",
  "GUITARRA",
  "CELULAR",
  "ELEFANTE",
  "FUTBOL",
];

io.on("connection", (socket) => {
  socket.on("unirse", (nombre) => {
    const nuevoJugador = {
      id: socket.id,
      nombre: nombre || "Jugador",
      rol: null,
    };
    jugadores.push(nuevoJugador);

    // El primero de la lista es el anfitrión
    if (jugadores.length > 0) {
      jugadores.forEach((j, i) => (j.anfitrion = i === 0));
    }

    io.emit("actualizarLista", jugadores);
  });

  socket.on("iniciarJuego", () => {
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
    io.emit("rolesAsignados", { escritor: escritor.nombre });
  });

  socket.on("pedirPalabraAleatoria", async () => {
    try {
      const response = await fetch(
        "https://clientes.api.greenborn.com.ar/public-random-word"
      );
      const data = await response.json();
      let p = data[0]
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase();
      socket.emit("palabraSugerida", p);
    } catch (e) {
      socket.emit(
        "palabraSugerida",
        backupPalabras[Math.floor(Math.random() * backupPalabras.length)]
      );
    }
  });

  socket.on("palabraElegida", (p) => {
    jugadores.forEach((j) => {
      io.to(j.id).emit("revelarRol", {
        rol: j.rol,
        palabra: j.rol === "impostor" ? "???" : p,
      });
    });
  });

  socket.on("disconnect", () => {
    jugadores = jugadores.filter((j) => j.id !== socket.id);
    if (jugadores.length > 0) {
      jugadores.forEach((j, i) => (j.anfitrion = i === 0));
    }
    io.emit("actualizarLista", jugadores);
  });
});

server.listen(process.env.PORT || 10000);
