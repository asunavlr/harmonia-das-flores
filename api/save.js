// Salva o catálogo direto no GitHub (um commit). A Vercel republica o site sozinha.
const REPO = process.env.GITHUB_REPO || "asunavlr/harmonia-das-flores";
const BRANCH = process.env.GITHUB_BRANCH || "main";

async function gh(path, init = {}) {
  const r = await fetch(`https://api.github.com/repos/${REPO}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
  });
  if (!r.ok) throw new Error(`GitHub ${r.status}: ${await r.text()}`);
  return r.json();
}

export default async function handler(req, res) {
  const ok = req.headers["x-admin-password"] === process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD;
  if (!ok) return res.status(401).json({ error: "Senha incorreta" });
  if (req.method === "GET") return res.status(200).json({ ok: true });
  if (req.method !== "POST") return res.status(405).end();

  try {
    const { items, uploads = [] } = req.body || {};
    if (!Array.isArray(items)) return res.status(400).json({ error: "items inválido" });

    const ref = await gh(`/git/ref/heads/${BRANCH}`);
    const base = await gh(`/git/commits/${ref.object.sha}`);

    const tree = [];
    for (const u of uploads) {
      if (!/^img\/cat\/[\w-]+\.(jpg|webp)$/.test(u.path)) continue;
      const blob = await gh(`/git/blobs`, { method: "POST", body: JSON.stringify({ content: u.data, encoding: "base64" }) });
      tree.push({ path: u.path, mode: "100644", type: "blob", sha: blob.sha });
    }
    tree.push({ path: "catalogo.json", mode: "100644", type: "blob", content: JSON.stringify(items, null, 2) + "\n" });

    const newTree = await gh(`/git/trees`, { method: "POST", body: JSON.stringify({ base_tree: base.tree.sha, tree }) });
    const commit = await gh(`/git/commits`, {
      method: "POST",
      body: JSON.stringify({ message: "Atualiza catálogo pelo painel", tree: newTree.sha, parents: [ref.object.sha] }),
    });
    await gh(`/git/refs/heads/${BRANCH}`, { method: "PATCH", body: JSON.stringify({ sha: commit.sha }) });
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}

export const config = { api: { bodyParser: { sizeLimit: "4mb" } } };
