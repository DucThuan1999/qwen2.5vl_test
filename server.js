// server.js
const express = require("express");
const path = require("path");

// ==== CẤU HÌNH KẾT NỐI LM STUDIO ====
// Đổi MODEL_ID thành đúng tên model Qwen2.5-VL bạn đã bật trong LM Studio
// const LM_BASE = process.env.LM_BASE || "http://127.0.0.1:1234/v1";
// const LM_BASE = process.env.LM_BASE || "http://192.168.0.67:1234/v1";
const LM_BASE = process.env.LM_BASE || "http://192.168.2.4:11434/api/chat";
const MODEL_ID = process.env.MODEL_ID || "<PUT_MODEL_ID_FROM_LM_STUDIO>";
const API_KEY = process.env.LM_API_KEY || "lm-studio"; // LM Studio chỉ cần chuỗi bất kỳ
const PORT = process.env.PORT || 8080;

// ==== PROMPT CỐ ĐỊNH ====
const SYSTEM_PROMPT_FRONT = [
  "Bạn là trợ lý OCR/IE đọc giấy tờ (CCCD/Passport/ID/License).",
  "Chỉ trích xuất thông tin và trả về JSON THUẦN (không markdown, không giải thích).",
  "Output là object với 6 khóa: fullname, nationality, birth, doc_type, Id_number, address.",
  "Quy tắc:",
  "- fullname: họ tên đầy đủ.",
  "- nationality: quốc tịch ngắn gọn (VD: 'Việt Nam' hoặc 'Vietnam').",
  "- birth:",
  "   + Nếu giấy tờ là của Việt Nam → giữ nguyên định dạng gốc dd/mm/yyyy.",
  "   + Nếu giấy tờ là của người nước ngoài → giữ nguyên định dạng gốc trên giấy tờ, không tự ý đổi.",
  "- address: cung cấp đầy đủ địa chỉ thường trú, có số nhà, không bịa.",
  "- doc_type: ngắn gọn (VD: 'Vietnam National ID', 'Passport', 'Driver License').",
  "- Id_number: số định danh/hộ chiếu.",
  "Nếu thiếu thông tin, đặt null. TUYỆT ĐỐI không thêm chữ ngoài JSON.",
].join("\n");

const SYSTEM_PROMPT_BACK = [
  "Bạn là trợ lý OCR/IE đọc giấy tờ (CCCD/Passport/ID/License).",
  "Đây là ảnh mặt sau.",
  "Chỉ trích xuất thông tin và trả về JSON THUẦN (không markdown, không giải thích).",
  "Output là object với đúng 1 khóa: issue_date.",
  "Quy tắc:",
  "- issue_date:",
  "   + Nếu giấy tờ là của Việt Nam → giữ nguyên định dạng gốc dd/mm/yyyy.",
  "   + Nếu giấy tờ là của người nước ngoài → giữ nguyên định dạng gốc trên giấy tờ, không tự ý đổi.",
  "Nếu thiếu thông tin, đặt null. TUYỆT ĐỐI không thêm chữ ngoài JSON.",
].join("\n");

const USER_TEXT =
  "Trích xuất: fullname, nationality, birth, doc_type, Id_number, address. Trả JSON thuần.";

// ==== APP ====
const app = express();
app.use(express.json({ limit: "25mb" }));
app.use(express.static(path.join(__dirname, "public")));

function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {}
  const m = text.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      return JSON.parse(m[0]);
    } catch {}
  }
  return { raw: text, error: "JSON parse failed" };
}

app.post("/chat", async (req, res) => {
  const t_total0 = Date.now();
  try {
    const { imageDataUrl } = req.body;
    if (!imageDataUrl) {
      return res.status(400).json({ error: "imageDataUrl is required" });
    }

    let base64Data = imageDataUrl;
    if (base64Data.startsWith("data:")) {
      base64Data = base64Data.split(",")[1];
    }

    const payload = {
      model: "qwen2.5vl",
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT_FRONT,
        },
        {
          role: "user",
          content: USER_TEXT,
          images: [base64Data],
        },
      ],
      stream: false,
    };

    const t_http0 = Date.now();
    const r = await fetch(LM_BASE, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify(payload),
    });
    const txt = await r.text(); // đo dễ hơn
    const t_http1 = Date.now();

    let data = null;
    try {
      data = JSON.parse(txt);
    } catch {}
    const content =
      data?.messages?.[data.messages.length - 1]?.content ?? (txt || "");
    const parsed = tryParseJson(content);

    const t_total1 = Date.now();
    return res.json({
      ok: true,
      result: parsed,
      raw: content,
      lm_error: data?.error || null,
      timings: {
        http_ms: t_http1 - t_http0, // thời gian round-trip tới LM Studio
        total_ms: t_total1 - t_total0, // tổng thời gian xử lý API này
      },
    });
  } catch (e) {
    const t_total1 = Date.now();
    return res.status(500).json({
      ok: false,
      error: String(e),
      timings: { total_ms: t_total1 - t_total0 },
    });
  }
});

app.listen(PORT, () => {
  console.log(`UI:     http://localhost:${PORT}`);
  console.log(`Proxy→  ${LM_BASE}`);
  console.log(`Model:  ${MODEL_ID}`);
});
