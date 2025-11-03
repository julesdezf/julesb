// src/main.jsx
import React from "react";
import { createRoot } from "react-dom/client";
import CAApp from "./CAApp.jsx";   // <-- assure-toi que le nom de fichier est bien CAApp.jsx
import "./index.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <CAApp />
  </React.StrictMode>
);
