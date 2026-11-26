# Simulador Multijugador Scrum Live en Tiempo Real
## Universidad Autónoma de Bucaramanga (UNAB)
**Maestría en Gerencia de Proyectos · Curso de Agilismo y Certificación PSM I**  
*Versión 4.0 - Plataforma Interactiva Multijugador Estilo Mentimeter / Kahoot*

---

## 🌟 Resumen de la Solución

Este simulador permite realizar sesiones de evaluación y refuerzo en tiempo real para grupos de estudiantes, docentes y equipos de trabajo.

### Principales Capacidades:
1. **Conexión Multidispositivo en Vivo:** Docenas de estudiantes pueden conectarse simultáneamente desde sus teléfonos móviles escaneando un **Código QR dinámico** o ingresando un **PIN numérico de 6 dígitos**.
2. **Dinámica estilo Mentimeter / Kahoot:**
   - Temporizador sincronizado por pregunta (por defecto 30 segundos).
   - Opciones táctiles identificadas con colores y figuras geométricas (`▲`, `◆`, `●`, `■`).
   - Conmutador bilingüe en el celular del estudiante (**Español / Inglés**).
3. **Analítica Pedagógica en Pantalla Gigante:**
   - **Gráfica de barras en vivo:** Visualiza la distribución de respuestas de todo el salón.
   - **Justificación Oficial Guía Scrum 2020:** Revelación pedagógica para cada pregunta.
   - **Alerta de Trampa de Examen:** Se activa si más del 60% del curso se equivoca, señalando el concepto crítico a reforzar.
4. **Puntuación y Podio de Campeones:**
   - Puntuación ponderada por acierto (600 pts) + bonificación por velocidad de respuesta (hasta 400 pts) + bonificaciones por racha (`🔥 Streak`).
   - Podio olímpico interactivo para el 1º, 2º y 3º puesto con animación de confeti.
5. **Exportación de Calificaciones:**
   - Descarga en 1 clic de archivo **CSV / Excel** con los nombres, puntajes, cantidad de aciertos y porcentaje de efectividad de cada estudiante.
6. **Simulador de Bots Integrado:**
   - Botón `+ Agregar 5 Estudiantes Virtuales` para que el facilitador pueda probar toda la experiencia (sala, gráficas, leaderboard y podio) sin requerir celulares físicos.

---

## 📂 Estructura del Proyecto

```
Simulador/
│
├── index.html                # Portal principal de bienvenida y selección de rol
├── host.html                 # Pantalla del Moderador / Proyector (QR, PIN, Gráficas, Podio)
├── player.html               # Pantalla del Participante móvil (Botones táctiles, ES/EN)
├── questions.js              # Banco oficial de 185 preguntas bilingües categorizadas
├── iniciar_simulador.bat     # Lanzador rápido con doble clic
│
├── css/
│   └── styles.css            # Estilos personalizados, podio 3D y animaciones
│
└── js/
    ├── engine.js             # Motor de sincronización dual (WebRTC PeerJS + BroadcastChannel)
    ├── host.js               # Controlador del moderador, temporizador, scoring y exportador CSV
    ├── player.js             # Controlador del móvil, avatares, registro de respuestas
    ├── qrcode.min.js         # Generador de códigos QR autónomo
    ├── peerjs.min.js         # Cliente WebRTC P2P gratuito
    └── canvas-confetti.min.js# Motor de confeti y celebración
```

---

## 🚀 Cómo Usarlo en Clase

### Opción 1: En Vivo en el Salón de Clase o por Zoom / Teams
1. Abre `host.html` en la computadora conectada al proyector o comparte la ventana en tu llamada de Zoom/Teams.
2. Configura los parámetros deseados:
   - **Número de preguntas:** 10 preguntas (o 5, 15, 20).
   - **Tiempo:** 30 segundos por pregunta.
   - **Enfoque:** Todas las áreas o módulos específicos.
3. Los estudiantes apuntan con la cámara de su teléfono al **Código QR** proyectado (o ingresan a la URL y digitan el PIN).
4. Elige su nombre y avatar. Conforme entran, verás sus nombres en la **Sala de Espera**.
5. Presiona **"¡INICIAR PARTIDA!"** y observa la competencia formativa en vivo.
6. Al finalizar el podio, pulsa **"Descargar Reporte (Excel / CSV)"** para registrar las calificaciones.

### Opción 2: Probarlo en un Solo Computador (Modo Demostración)
1. Abre `host.html`.
2. Haz clic en el botón **"🤖 + Agregar 5 Estudiantes Virtuales (Bots de Prueba)"**.
3. Presiona **"¡INICIAR PARTIDA!"**. Los bots responderán automáticamente con tiempos y precisiones realistas, permitiéndote explorar todo el flujo en 2 minutos.
4. O abre una segunda pestaña con `player.html?pin=EL_PIN` para jugar como un estudiante real.

---

## 🌐 Cómo Publicarlo 100% Gratis en Internet

Para que los estudiantes accedan desde cualquier red sin estar conectados a la misma red local:

### Método Recomendado: GitHub Pages (0 Costo, de por vida)
1. Crea un repositorio gratuito en [GitHub.com](https://github.com) (ej. `simulador-scrum-unab`).
2. Sube todos los archivos de esta carpeta `Simulador`.
3. Ve a **Settings > Pages > Source** y selecciona la rama `main` (carpeta `/root`).
4. ¡Listo! En 1 minuto tendrás una URL pública con HTTPS (ej: `https://tu-usuario.github.io/simulador-scrum-unab/`).
5. Al abrir `host.html` desde esa URL, el código QR generado apuntará automáticamente a la dirección de internet para que cualquier celular en el aula se conecte de inmediato.

### Método Alternativo: Vercel o Netlify
- Arrastra y suelta la carpeta `Simulador` en el panel de **Vercel** o **Netlify Drop**. Obtendrás un dominio gratuito `.vercel.app` o `.netlify.app` en menos de 30 segundos.

---

## 📊 Banco de Preguntas Incorporado

El simulador utiliza el banco curado bilingüe en `questions.js`, que contiene **185 preguntas oficiales auditadas**:
- **88 preguntas:** 1. Entender y aplicar el marco Scrum (Fundamentos, Pilares, Valores, Reglas).
- **42 preguntas:** 2. Desarrollar personas y equipos (Auto-organización, Facilitación, Responsabilidades SM / PO / Developers).
- **55 preguntas:** 3. Gestionar productos con agilidad (Product Backlog, Pronósticos, Valor de Negocio, DoD y Casos Situacionales).
- **Justificaciones Oficiales:** Cada pregunta contiene su explicación citando textualmente las premisas y cambios de la **Guía Scrum 2020**.
