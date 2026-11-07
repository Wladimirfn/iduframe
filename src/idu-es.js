/* iduframe — capa de español para HyperFrames Studio.
 *
 * No toca el bundle: traduce el DOM, observa los re-render de React y agrega
 * un boton ES/EN al lado del toggle de tema. Todo el estado vive en
 * localStorage("iduframe-lang"); cambiar de idioma recarga la pagina, que es
 * mas honesto que intentar restaurar texto que React ya reemplazo.
 */
(function () {
  var KEY = "iduframe-lang";
  var lang = localStorage.getItem(KEY) || "es";

  var dict = {
    // barra superior
    "Inspector": "Inspector",
    "Window": "Ventana",
    "Export": "Exportar",
    "Capture": "Capturar",
    "Install the desktop app": "Instalar la app de escritorio",
    // paneles
    "Compositions": "Composiciones",
    "Assets": "Recursos",
    "Code": "Código",
    "Catalog": "Catálogo",
    "Preview": "Vista previa",
    "Design": "Diseño",
    "Layers": "Capas",
    "Renders": "Renders",
    "Variables": "Variables",
    "Blur": "Desenfoque",
    "Timeline": "Línea de tiempo",
    "Lint": "Revisión",
    "Root": "Raíz",
    // estado vacio
    "Nothing selected": "Nada seleccionado",
    "Click any element on the canvas to edit it, or drag to select several.":
      "Clic en cualquier elemento del lienzo para editarlo, o arrastrá para seleccionar varios.",
    "Record a gesture": "Grabar un gesto",
    "Describe a change to the agent": "Describir un cambio al agente",
    // timeline / canvas
    "Drop media here or describe your video to start":
      "Arrastrá material acá o describí tu video para empezar",
    "Toggle ruler": "Mostrar regla",
    "Toggle safe margins": "Mostrar márgenes seguros",
    "Toggle snap": "Activar imán",
    "Toggle grid": "Mostrar grilla",
    "Grid options": "Opciones de grilla",
    "Play": "Reproducir",
    "Pause": "Pausar",
    "Fit": "Ajustar",
    // menus
    "Panel menu": "Menú del panel",
    "Maximize panel": "Maximizar panel",
    "Close group": "Cerrar grupo",
    "Close": "Cerrar",
    "Copy to Agent": "Copiar al agente",
    "HyperFrame Lint Results": "Resultados de revisión",
    "Undo": "Deshacer",
    "Redo": "Rehacer",
    // gaps que reportó `measure`
    "No effects": "Sin efectos",
    "Resize columns": "Redimensionar columnas",
    "Resize rows": "Redimensionar filas",
    "Root composition: opens automatically on load":
      "Composición raíz: se abre automáticamente al cargar",
    "Capture current frame": "Capturar el frame actual",
    "Get the free HyperFrames desktop app": "Descargá la app de escritorio gratis",
    "Blur opened": "Desenfoque abierto",
    "Composition preview": "Vista previa de la composición",
    "Composition canvas": "Lienzo de la composición",
    "Seek preview": "Buscar en la vista previa",
    "Hyperframes": "HyperFrames",
    "Design panel": "Panel de diseño",
    "Timeline panel": "Panel de línea de tiempo",
    "Add a composition": "Agregar una composición",
    "Render": "Renderizar",
    "Settings": "Ajustes",
    // barra de transporte / herramientas de timeline
    "Preview volume": "Volumen de la vista previa",
    "Mute audio": "Silenciar audio",
    "Playback speed": "Velocidad de reproducción",
    "Enable loop playback": "Repetir reproducción",
    "Enter fullscreen": "Pantalla completa",
    "Shortcuts and tools": "Atajos y herramientas",
    "Timeline tool: Select": "Herramienta: Seleccionar",
    "Linked Selection": "Selección vinculada",
    "Toggle timeline snapping": "Activar imán de la línea de tiempo",
    "Toggle ripple edit": "Activar edición ripple",
    "Toggle audio meters": "Mostrar medidores de audio",
    "Add keyframe at playhead": "Agregar keyframe en el cursor",
    "Auto-record manual edits as keyframes":
      "Grabar automáticamente los cambios manuales como keyframes",
    "Split at playhead": "Dividir en el cursor",
    "Add beat at playhead": "Agregar beat en el cursor",
    "Hide thumbnails: labels only": "Ocultar miniaturas: sólo etiquetas",
    "Select a clip to zoom the timeline": "Seleccioná un clip para hacer zoom",
    "Fit timeline to width": "Ajustar la línea de tiempo al ancho",
    "Zoom out": "Alejar",
    "Zoom in": "Acercar",
    "Timeline zoom": "Zoom de la línea de tiempo",
    "Timeline zoom level": "Nivel de zoom",
    "lint findings, warnings only": "hallazgos, sólo avisos",
  };

  // Reglas para texto con partes variables. Cada entrada: [regex, reemplazo].
  var patterns = [
    [/^Switch to dark theme$/, "Cambiar a tema oscuro"],
    [/^Switch to light theme$/, "Cambiar a tema claro"],
    [/^Close (.+)$/, "Cerrar $1"],
    [/^Render (.+)$/, "Renderizar $1"],
    [/^Add (.+) to timeline at playhead$/, "Agregar $1 a la línea de tiempo"],
    [/^(\d+) lint findings?, including errors$/, "$1 hallazgos, con errores"],
    [/^(\d+) lint findings?$/, "$1 hallazgos"],
    [/^(\d+) error, (\d+) warnings?$/, "$1 error, $2 avisos"],
    [/^(\d+) errors, (\d+) warnings?$/, "$1 errores, $2 avisos"],
    [/^(\d+) warnings?$/, "$1 avisos"],
    [/^Ruler (on|off)$/, "Regla $1"],
    [/^Safe margins (on|off)$/, "Márgenes seguros $1"],
    [/^Snap enabled \(S\)$/, "Imán activo (S)"],
    [/^Grid hidden \(G\).*$/, "Grilla oculta (G)"],
    [/^(Hide|Show) track (\d+)$/, (_full, action, n) => `${action === "Hide" ? "Ocultar" : "Mostrar"} pista ${n}`],
    [/^Select off-canvas element (.+)$/, "Seleccionar elemento fuera del lienzo $1"],
    [/^Off-canvas: (.+)\. Click to select$/, "Fuera del lienzo: $1. Clic para seleccionar"],
    [/^Preview volume: (\d+)%$/, "Volumen de la vista previa: $1%"],
    [/^Open composition (.+)$/, "Abrir composición $1"],
  ];

  var SKIP = { SCRIPT: 1, STYLE: 1, CODE: 1, PRE: 1, TEXTAREA: 1, IFRAME: 1 };

  function tr(text) {
    var t = text.trim();
    if (!t) return null;
    if (dict[t]) return text.replace(t, dict[t]);
    for (var i = 0; i < patterns.length; i++) {
      var p = patterns[i];
      if (p[0].test(t)) return text.replace(t, t.replace(p[0], p[1]));
    }
    return null;
  }

  function walk(node) {
    if (node.nodeType === 3) {
      var out = tr(node.nodeValue);
      if (out !== null) node.nodeValue = out;
      return;
    }
    if (node.nodeType !== 1) return;
    if (SKIP[node.tagName]) return;
    if (node.hasAttribute && node.hasAttribute("data-iduframe-ui")) return;

    ["title", "aria-label", "placeholder"].forEach(function (attr) {
      var v = node.getAttribute && node.getAttribute(attr);
      if (!v) return;
      var out = tr(v);
      if (out !== null) node.setAttribute(attr, out);
    });
    for (var i = 0; i < node.childNodes.length; i++) walk(node.childNodes[i]);
  }

  function mountButton() {
    if (document.querySelector("[data-iduframe-btn]")) return;
    var anchor =
      document.querySelector('button[aria-label^="Switch to"][aria-label$="theme"]') ||
      document.querySelector('button[aria-label="Inspector"]');
    if (!anchor || !anchor.parentElement) return;

    var btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("data-iduframe-btn", "1");
    btn.setAttribute("data-iduframe-ui", "1");
    btn.textContent = lang === "es" ? "ES" : "EN";
    btn.title = lang === "es" ? "Cambiar a inglés" : "Switch to Spanish";
    btn.style.cssText =
      "margin-left:6px;height:28px;padding:0 10px;border-radius:6px;" +
      "font:600 11px/1 ui-sans-serif,system-ui;letter-spacing:.04em;" +
      "border:1px solid currentColor;opacity:.75;cursor:pointer;" +
      "background:transparent;color:inherit";
    btn.addEventListener("click", function () {
      localStorage.setItem(KEY, lang === "es" ? "en" : "es");
      location.reload();
    });
    anchor.parentElement.insertBefore(btn, anchor.nextSibling);
  }

  function boot() {
    mountButton();
    if (lang !== "es") return;
    walk(document.body);
    var pending = null;
    new MutationObserver(function () {
      if (pending) return;
      pending = requestAnimationFrame(function () {
        pending = null;
        try { mountButton(); walk(document.body); } catch (e) {}
      });
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  // Expuesto para el comando `measure`: cobertura sin duplicar el diccionario.
  window.__IDUFRAME_ES__ = { dict: dict, patterns: patterns, lang: lang };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
