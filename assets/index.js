/* /assets/index.js
   메인 화면(index.html) 전용 로직: 그룹 표지 그리드 렌더링 + 정렬 + 스크롤 복원
   공통 유틸(fetchManifest, createRevealObserver, wireLazyReveal)은
   assets/gallery-common.js 에서 가져옵니다. */

const IMAGES_FOLDER = "images";

/*
  표시 순서 설정 (개발자가 직접 지정 - 방문자에게는 선택지가 노출되지 않음)
  SORT_MODE: 'newest' | 'oldest' | 'pinned-random'
  PINNED_SLUGS: pinned-random 모드에서 맨 앞에 고정할 그룹의 slug
*/
const SORT_MODE = 'newest';
const PINNED_SLUGS = [];

function shuffle(arr){
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function getOrderedGroups(groups){
  if (SORT_MODE === 'oldest'){
    return [...groups].sort((a,b) => new Date(a.date) - new Date(b.date));
  }
  if (SORT_MODE === 'newest'){
    return [...groups].sort((a,b) => new Date(b.date) - new Date(a.date));
  }
  if (SORT_MODE === 'pinned-random'){
    const pinned = PINNED_SLUGS.map(slug => groups.find(g => g.slug === slug)).filter(Boolean);
    const pinnedSlugs = new Set(pinned.map(g => g.slug));
    const rest = shuffle(groups.filter(g => !pinnedSlugs.has(g.slug)));
    return [...pinned, ...rest];
  }
  return groups;
}

// 관리자 페이지 "메인 화면 순서"에서 저장한 지정 순서 (images/main-order.txt).
// 파일이 없으면 그냥 무시하고 위 SORT_MODE를 그대로 씁니다.
async function getMainOrder(){
  try {
    const res = await fetch(`${IMAGES_FOLDER}/main-order.txt`);
    if (!res.ok) return [];
    const text = await res.text();
    return text.split('\n').map(s => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function applyMainOrder(groups, order){
  if (!order.length) return getOrderedGroups(groups);
  const bySlug = new Map(groups.map(g => [g.slug, g]));
  const pinned = order.map(slug => bySlug.get(slug)).filter(Boolean);
  const pinnedSlugs = new Set(pinned.map(g => g.slug));
  const rest = getOrderedGroups(groups.filter(g => !pinnedSlugs.has(g.slug)));
  return [...pinned, ...rest];
}

const galleryEl = document.getElementById('gallery');
const revealObserver = createRevealObserver();

function renderGallery(groups){
  galleryEl.innerHTML = '';
  groups.forEach(group => {
    const tile = document.createElement('a');
    tile.className = 'gallery-item';
    tile.href = `group/${encodeURIComponent(group.slug)}/`;

    tile.addEventListener('click', () => {
      sessionStorage.setItem('mainScrollY', String(window.scrollY));
    });

    const img = document.createElement('img');
    img.src = `${IMAGES_FOLDER}/${group.cover}`;
    img.loading = 'lazy';
    img.decoding = 'async';
    img.alt = group.title;

    const titleEl = document.createElement('span');
    titleEl.className = 'tile-title';
    titleEl.textContent = group.title;

    tile.appendChild(img);
    tile.appendChild(titleEl);
    galleryEl.appendChild(tile);
  });

  document.querySelectorAll('.gallery-item img').forEach(img => wireLazyReveal(img, revealObserver));
}

function restoreScrollIfNeeded(){
  const saved = sessionStorage.getItem('mainScrollY');
  if (saved === null) return;
  sessionStorage.removeItem('mainScrollY');
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.scrollTo(0, parseInt(saved, 10) || 0);
    });
  });
}

if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}

(async function init(){
  initSiteNav({ homeHref: './', activeKey: 'home' });
  try {
    const groups = await fetchManifest(IMAGES_FOLDER);
    const mainOrder = await getMainOrder();
    renderGallery(applyMainOrder(groups, mainOrder));
    restoreScrollIfNeeded();
  } catch (err) {
    console.error(err);
    galleryEl.innerHTML = `
      <p style="padding:40px 20px; font-size:14px; color:var(--muted);">
        사진을 불러오지 못했습니다. images/manifest.json 파일이 저장소에
        있는지 확인해주세요. 방금 사진을 처음 올리셨다면 GitHub Actions가
        manifest.json을 만들 때까지 잠깐(보통 몇십 초) 기다려야 할 수 있어요.
      </p>`;
  }
})();
