// web_dong_hang/api/admin-action.js
import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // Kiểm tra key nội bộ do bạn gửi từ client (có thể thay bằng JWT/OAuth)
  const key = req.headers["x-internal-key"] || "";
  if (!process.env.INTERNAL_API_KEY || key !== process.env.INTERNAL_API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Bảo mật: dùng SERVICE ROLE trên server
  const url = process.env.SUPABASE_URL;
  const srv = process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !srv) return res.status(500).json({ error: "Missing server env" });

  const sb = createClient(url, srv);

  // Ví dụ thao tác: cập nhật trạng thái đơn
  try {
    const { table, id, patch } = req.body || {};
    if (!table || !id || !patch) return res.status(400).json({ error: "Missing params" });

    const { data, error } = await sb.from(table).update(patch).eq("id", id).select().single();
    if (error) throw error;

    res.status(200).json({ ok: true, data });
  } catch (e) {
    res.status(500).json({ error: e?.message || String(e) });
  }
}
