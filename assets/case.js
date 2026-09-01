/* /assets/case.js
   시공 사례(case/index.html) 전용 로직:
   - 메인 화면과 같은 그룹 데이터(images/manifest.json)를 그대로 사용해 그리드로 보여줌
   - 타일을 클릭하면 페이지 이동 없이 팝업(라이트박스)이 뜨고,
     그 그룹의 대표사진(썸네일)이 먼저 나온 뒤 나머지 사진이 순서대로 이어짐
   - 팝업 안에는 사진을 가리지 않는 작은 "상세페이지 보기" 링크만 둠 */

const IMAGES_FOLDER = "../images";

let GROUPS = [];

const galleryEl = document.getElementById('gallery');
const revealObserver = createRevealObserver();

// 그룹의 사진을 "대표사진(cover) 먼저 → 나머지는 원래 순서대로"로 정렬
function getOrderedPhotos(group){
  const blocks = (group.blocks && group.blocks.length)
    ? group.blocks
    : group.photos.map(file => ({ type: 'image', file }));

  const files = blocks.filter(b => b.type === 'image').map(b => b.file);
  const rest = files.filter(f => f !== group.cover);
  const ordered = files.includes(group.cover) ? [group.cover, ...rest] : files;

  return ordered.map(file => ({ src: `${IMAGES_FOLDER}/${file}`, alt: group.title }));
}

function renderGallery(groups){
  galleryEl.innerHTML = '';
  groups.forEach((group, i) => {
    const tile = document.createElement('a');
    tile.className = 'gallery-item';
    tile.href = `../group/${encodeURIComponent(group.slug)}/`;
    tile.dataset.index = i;

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

(async function init(){
  initSiteNav({ homeHref: '../', aboutHref: '../about/', caseHref: './', activeKey: 'case' });
  try {
    GROUPS = await fetchManifest(IMAGES_FOLDER);
    GROUPS = [...GROUPS].sort((a, b) => new Date(b.date) - new Date(a.date));
    renderGallery(GROUPS);
  } catch (err) {
    console.error(err);
    galleryEl.innerHTML = `
      <p style="padding:40px 20px; font-size:14px; color:var(--muted);">
        사진을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.
      </p>`;
  }
})();

/* ---------------- 팝업(라이트박스): 클릭한 그룹의 사진만 대표사진부터 순서대로 ---------------- */
const lightbox   = document.getElementById('lightbox');
const lbImage    = document.getElementById('lbImage');
const lbClose    = document.getElementById('lbClose');
const lbPrev     = document.getElementById('lbPrev');
const lbNext     = document.getElementById('lbNext');
const lbCounter  = document.getElementById('lbCounter');
const lbDetail   = document.getElementById('lbDetailLink');

let PHOTOS = [];
let currentIndex = 0;

function openLightbox(groupIndex){
  const group = GROUPS[groupIndex];
  PHOTOS = getOrderedPhotos(group);
  currentIndex = 0;
  lbDetail.href = `../group/${encodeURIComponent(group.slug)}/`;
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
  lbCounter.textContent = PHOTOS.length > 1 ? `${currentIndex + 1} / ${PHOTOS.length}` : '';
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
  e.preventDefault(); // 페이지 이동 대신 팝업으로 먼저 보여줌
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
