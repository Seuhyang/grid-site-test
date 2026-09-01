/* /assets/about.js
   about/index.html 전용:
   - content/about.json을 읽어서 제목/문단/강조카드를 화면에 채워 넣습니다.
   - 관리자 페이지(admin-shared/admin-ui.js)에서 이 JSON 파일을 고치면
     여기서 그 내용을 그대로 불러와 보여줍니다.
   - gallery-common.js의 스크롤 리빌 관찰자를 재사용해 문단/카드가
     화면에 들어올 때 살짝 떠오르며 나타나게 합니다. */

async function fetchAboutContent(){
  const res = await fetch(`../content/about.json?t=${Date.now()}`);
  if (!res.ok) throw new Error('회사소개 내용을 불러오지 못했습니다.');
  return res.json();
}

function renderAbout(data){
  document.getElementById('eyebrow').textContent = data.eyebrow || '';
  document.getElementById('heroTitle').textContent = data.heroTitle || '';
  document.getElementById('heroSubtitle').textContent = data.heroSubtitle || '';

  const bodyEl = document.getElementById('aboutBody');
  bodyEl.innerHTML = '';
  (data.paragraphs || []).forEach(text => {
    if (!text) return;
    const p = document.createElement('p');
    p.className = 'reveal-block';
    p.textContent = text;
    bodyEl.appendChild(p);
  });

  const highlightsEl = document.getElementById('aboutHighlights');
  highlightsEl.innerHTML = '';
  (data.highlights || []).forEach(h => {
    if (!h || !h.title) return;
    const card = document.createElement('div');
    card.className = 'highlight-card reveal-block';
    const title = document.createElement('h3');
    title.textContent = h.title;
    const desc = document.createElement('p');
    desc.textContent = h.desc || '';
    card.appendChild(title);
    card.appendChild(desc);
    highlightsEl.appendChild(card);
  });

  const observer = createRevealObserver();
  document.querySelectorAll('.reveal-block').forEach(el => wireLazyReveal(el, observer));
}

(async function init(){
  initSiteNav({ homeHref: '../', aboutHref: './', caseHref: '../case/', activeKey: 'about' });
  try {
    const data = await fetchAboutContent();
    renderAbout(data);
  } catch (err) {
    document.getElementById('aboutBody').innerHTML =
      `<p>${err.message} 잠시 후 다시 시도해주세요.</p>`;
  }
})();
