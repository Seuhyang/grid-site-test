/* /assets/group.js
   그룹 페이지(group/<slug>/index.html) 전용 로직:
   본문(글+사진 블록) 렌더링 + 라이트박스(팝업).
   공통 유틸은 assets/gallery-common.js 에서 가져옵니다. */

const IMAGES_FOLDER = "../../images";

// 관리자 페이지에서 굵게/기울임/밑줄/색/글꼴 서식을 넣은 글은 HTML 형태로 저장됩니다.
// 여기서는 허용한 태그/속성만 통과시키고 나머지(스크립트 등)는 제거해서 안전하게 보여줍니다.
const RICH_TEXT_ALLOWED_TAGS = new Set(['B','I','U','STRONG','EM','SPAN','FONT','BR','DIV']);
const RICH_TEXT_ALLOWED_ATTRS = new Set(['color', 'face', 'style']);

function sanitizeRichText(html){
  const template = document.createElement('template');
  template.innerHTML = html || '';

  function clean(node){
    [...node.childNodes].forEach(child => {
      if (child.nodeType === Node.ELEMENT_NODE){
        if (!RICH_TEXT_ALLOWED_TAGS.has(child.tagName)){
          child.replaceWith(document.createTextNode(child.textContent));
          return;
        }
        [...child.attributes].forEach(attr => {
          const name = attr.name.toLowerCase();
          if (!RICH_TEXT_ALLOWED_ATTRS.has(name) || /url\(|expression\(|javascript:/i.test(attr.value)){
            child.removeAttribute(attr.name);
          }
        });
        clean(child);
      } else if (child.nodeType !== Node.TEXT_NODE){
        child.remove();
      }
    });
  }
  clean(template.content);
  return template.innerHTML;
}

const galleryEl = document.getElementById('gallery');
const titleEl   = document.getElementById('groupTitle');
const revealObserver = createRevealObserver();

let PHOTOS = []; // 이 그룹에서 실제로 화면에 나오는(=blocks 순서) 사진들. 라이트박스가 이 안에서만 이동

function renderGroup(group){
  document.title = `${group.title} · Empower Design`;
  titleEl.textContent = group.title;

  const blocks = (group.blocks && group.blocks.length)
    ? group.blocks
    : group.photos.map(file => ({ type: 'image', file }));

  PHOTOS = blocks
    .filter(b => b.type === 'image')
    .map(b => ({ src: `${IMAGES_FOLDER}/${b.file}`, alt: group.title }));

  galleryEl.innerHTML = '';
  let photoIndex = 0;

  blocks.forEach(block => {
    if (block.type === 'text'){
      const p = document.createElement('p');
      p.className = 'content-text';
      p.innerHTML = sanitizeRichText(block.text);
      galleryEl.appendChild(p);
      return;
    }

    const wrap = document.createElement('div');
    wrap.className = 'gallery-item';
    wrap.dataset.index = photoIndex++;

    const img = document.createElement('img');
    img.src = `${IMAGES_FOLDER}/${block.file}`;
    img.loading = 'lazy';
    img.decoding = 'async';
    img.alt = group.title;

    wrap.appendChild(img);
    galleryEl.appendChild(wrap);
  });

  document.querySelectorAll('.gallery-item img').forEach(img => wireLazyReveal(img, revealObserver));
}

function getSlugFromLocation(){
  const parts = location.pathname.split('/').filter(p => p && p !== 'index.html');
  const fromPath = parts[parts.length - 1];
  if (fromPath && fromPath !== 'group') {
    // 브라우저/환경에 따라 %20 같은 인코딩이 그대로 남아있는 경우가 있어 디코딩해줍니다.
    try { return decodeURIComponent(fromPath); } catch { return fromPath; }
  }
  return new URLSearchParams(location.search).get('g');
}

(async function init(){
  initSiteNav({ homeHref: '../../', activeKey: null });
  const slug = getSlugFromLocation();
  if (!slug) {
    galleryEl.innerHTML = `<p style="padding:40px 20px; font-size:14px; color:var(--muted);">잘못된 주소입니다.</p>`;
    return;
  }
  try {
    const groups = await fetchManifest(IMAGES_FOLDER);
    const group = groups.find(g => g.slug === slug) || null;
    if (!group) {
      galleryEl.innerHTML = `<p style="padding:40px 20px; font-size:14px; color:var(--muted);">해당 사진을 찾을 수 없습니다.</p>`;
      return;
    }
    renderGroup(group);
  } catch (err) {
    console.error(err);
    galleryEl.innerHTML = `<p style="padding:40px 20px; font-size:14px; color:var(--muted);">사진을 불러오지 못했습니다.</p>`;
  }
})();

/* ---------------- 라이트박스 로직 (이 페이지 = 이 그룹 안에서만 이동) ---------------- */
const lightbox = document.getElementById('lightbox');
const lbImage   = document.getElementById('lbImage');
const lbClose   = document.getElementById('lbClose');
const lbPrev    = document.getElementById('lbPrev');
const lbNext    = document.getElementById('lbNext');

let currentIndex = 0;

function openLightbox(index){
  currentIndex = index;
  updateLightboxImage();
  lightbox.classList.add('is-open');
  document.body.style.overflow = 'hidden';
}
function closeLightbox(){
  lightbox.classList.remove('is-open');
  document.body.style.overflow = '';
}
function updateLightboxImage(){
  const item = PHOTOS[currentIndex];
  lbImage.src = item.src;
  lbImage.alt = item.alt;
}
function showPrev(){
  currentIndex = (currentIndex - 1 + PHOTOS.length) % PHOTOS.length;
  updateLightboxImage();
}
function showNext(){
  currentIndex = (currentIndex + 1) % PHOTOS.length;
  updateLightboxImage();
}

galleryEl.addEventListener('click', (e) => {
  const item = e.target.closest('.gallery-item');
  if (!item) return;
  openLightbox(Number(item.dataset.index));
});

lbClose.addEventListener('click', closeLightbox);
lbPrev.addEventListener('click', showPrev);
lbNext.addEventListener('click', showNext);

lightbox.addEventListener('click', (e) => {
  if (e.target === lightbox) closeLightbox();
});

document.addEventListener('keydown', (e) => {
  if (!lightbox.classList.contains('is-open')) return;
  if (e.key === 'Escape') closeLightbox();
  if (e.key === 'ArrowLeft') showPrev();
  if (e.key === 'ArrowRight') showNext();
});

let touchStartX = 0;
let touchEndX = 0;
const SWIPE_THRESHOLD = 50;

lightbox.addEventListener('touchstart', (e) => {
  touchStartX = e.changedTouches[0].screenX;
}, { passive: true });

lightbox.addEventListener('touchend', (e) => {
  touchEndX = e.changedTouches[0].screenX;
  const delta = touchEndX - touchStartX;
  if (Math.abs(delta) < SWIPE_THRESHOLD) return;
  if (delta > 0) showPrev();
  else showNext();
}, { passive: true });
