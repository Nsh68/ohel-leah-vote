(() => {
  const form = document.getElementById("vote-form");
  const canvas = document.getElementById("signature-pad");
  const clearBtn = document.getElementById("clear-signature");
  const messageEl = document.getElementById("form-message");
  const submitBtn = document.getElementById("submit-btn");
  const ctx = canvas.getContext("2d");

  let drawing = false;
  let hasSignature = false;
  let lastPoint = null;

  function resizeCanvas() {
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const snapshot = hasSignature ? canvas.toDataURL() : null;

    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#4a3728";
    ctx.lineWidth = 2.2;

    if (snapshot) {
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, rect.width, rect.height);
        ctx.drawImage(img, 0, 0, rect.width, rect.height);
      };
      img.src = snapshot;
    }
  }

  function getPoint(event) {
    const rect = canvas.getBoundingClientRect();
    const source = event.touches ? event.touches[0] : event;
    return {
      x: source.clientX - rect.left,
      y: source.clientY - rect.top,
    };
  }

  function startDraw(event) {
    event.preventDefault();
    drawing = true;
    lastPoint = getPoint(event);
  }

  function draw(event) {
    if (!drawing) return;
    event.preventDefault();
    const point = getPoint(event);
    ctx.beginPath();
    ctx.moveTo(lastPoint.x, lastPoint.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    lastPoint = point;
    hasSignature = true;
  }

  function endDraw() {
    drawing = false;
    lastPoint = null;
  }

  function clearSignature() {
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    hasSignature = false;
  }

  function showMessage(text, type) {
    messageEl.hidden = false;
    messageEl.textContent = text;
    messageEl.className = `form-message ${type}`;
  }

  function hideMessage() {
    messageEl.hidden = true;
    messageEl.textContent = "";
    messageEl.className = "form-message";
  }

  canvas.addEventListener("mousedown", startDraw);
  canvas.addEventListener("mousemove", draw);
  window.addEventListener("mouseup", endDraw);
  canvas.addEventListener("touchstart", startDraw, { passive: false });
  canvas.addEventListener("touchmove", draw, { passive: false });
  canvas.addEventListener("touchend", endDraw);
  clearBtn.addEventListener("click", clearSignature);
  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    hideMessage();

    const formData = new FormData(form);
    const vote = formData.get("vote");
    const fullName = String(formData.get("fullName") || "").trim();
    const phone = String(formData.get("phone") || "").trim();
    const email = String(formData.get("email") || "").trim();

    if (!vote) {
      showMessage("יש לבחור האם אתם בעד או מתנגדים.", "error");
      return;
    }
    if (!fullName || !phone || !email) {
      showMessage("יש למלא את כל פרטי הקשר.", "error");
      return;
    }
    if (!hasSignature) {
      showMessage("יש לחתום בתיבת החתימה לפני השליחה.", "error");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "שולח...";

    try {
      const response = await fetch("/api/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vote,
          fullName,
          phone,
          email,
          signatureDataUrl: canvas.toDataURL("image/png"),
        }),
      });

      const contentType = response.headers.get("content-type") || "";
      if (response.status === 404 || !contentType.includes("application/json")) {
        throw new Error(
          "שמירת ההצבעות דורשת שרת פעיל (למשל Render). דף GitHub Pages מציג את הטופס בלבד."
        );
      }
      const result = await response.json();
      if (!response.ok || !result.ok) {
        throw new Error(result.error || "שגיאה בשליחה");
      }

      showMessage("תודה! ההצבעה נקלטה בהצלחה.", "success");
      form.reset();
      clearSignature();
    } catch (error) {
      showMessage(error.message || "אירעה שגיאה. נסו שוב.", "error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "שליחת הצבעה";
    }
  });
})();
