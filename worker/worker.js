/*
  Empower Design 관리자 백엔드 (Cloudflare Worker)
  ------------------------------------------------
  GitHub 토큰과 관리자 비밀번호는 여기(서버)에만 저장되고,
  브라우저(admin-b.html)에는 절대 노출되지 않습니다.

  필요한 환경변수(Secret):
    ADMIN_PASSWORD  - 관리자 페이지 로그인 비밀번호
    GITHUB_TOKEN    - Contents: Read and write 권한의 GitHub Fine-grained Token
    GITHUB_OWNER    - 예: abcd
    GITHUB_REPO     - 예: my-site
    GITHUB_BRANCH   - 예: main
*/

function corsHeaders(){
  return {
    'Access-Control-Allow-Origin': '*', // 필요하면 실제 사이트 주소로 좁혀도 됩니다
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}

function json(obj, status = 200){
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() }
  });
}

async function gh(path, env, opts = {}){
  return fetch(`https://api.github.com${path}`, {
    ...opts,
    cache: 'no-store', // 방금 커밋한 내용을 바로 다시 조회할 때 예전 응답이 캐시되는 것을 방지
    headers: {
      'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'empower-design-admin',
      ...(opts.headers || {})
    }
  });
}

async function getSha(path, env){
  const r = await gh(`/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${encodeURIComponent(path)}?ref=${env.GITHUB_BRANCH}`, env);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`sha 조회 실패 (${r.status})`);
  const data = await r.json();
  return data.sha;
}

export default {
  async fetch(request, env){
    const url = new URL(request.url);

    if (request.method === 'OPTIONS'){
      return new Response(null, { headers: corsHeaders() });
    }
    if (request.method !== 'POST'){
      return json({ error: 'POST만 지원합니다' }, 405);
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return json({ error: '잘못된 요청 본문' }, 400);
    }

    if (payload.password !== env.ADMIN_PASSWORD){
      return json({ error: '비밀번호가 올바르지 않습니다' }, 401);
    }

    try {
      if (url.pathname === '/api/ping'){
        return json({ ok: true });
      }

      if (url.pathname === '/api/put'){
        const { path, content, message } = payload;
        if (!path || !content) return json({ error: 'path/content가 필요합니다' }, 400);
        const sha = await getSha(path, env);
        const body = { message: message || `update ${path}`, content, branch: env.GITHUB_BRANCH };
        if (sha) body.sha = sha;
        const r = await gh(`/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${encodeURIComponent(path)}`, env, {
          method: 'PUT', body: JSON.stringify(body)
        });
        const data = await r.json();
        if (!r.ok) return json({ error: data.message || '저장 실패' }, r.status);
        return json({ ok: true });
      }

      if (url.pathname === '/api/delete'){
        const { path, message } = payload;
        if (!path) return json({ error: 'path가 필요합니다' }, 400);
        const sha = await getSha(path, env);
        if (!sha) return json({ ok: true, note: '이미 없는 파일입니다' });
        const r = await gh(`/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${encodeURIComponent(path)}`, env, {
          method: 'DELETE',
          body: JSON.stringify({ message: message || `delete ${path}`, sha, branch: env.GITHUB_BRANCH })
        });
        if (!r.ok) { const data = await r.json(); return json({ error: data.message || '삭제 실패' }, r.status); }
        return json({ ok: true });
      }

      return json({ error: 'not found' }, 404);
    } catch (err) {
      return json({ error: err.message || String(err) }, 500);
    }
  }
};
