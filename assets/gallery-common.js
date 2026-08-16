/* /assets/gallery-common.js
   index.html과 group 페이지가 공통으로 쓰는 유틸:
   - fetchManifest(): images/manifest.json을 읽어 그룹 배열을 반환
   - createRevealObserver(): 스크롤 진입 시 살짝 페이드인 시키는 관찰자
   - wireLazyReveal(): 이미지에 안전한(브라우저/네트워크 무관) 지연노출 연결
   - initSiteNav(): 상단 메뉴 + 카카오채널/인스타 아이콘 렌더링 (여기 한 곳만 고치면
     index.html과 모든 그룹 페이지에 다 반영됩니다)
*/

// 상단 메뉴 항목. href는 각 메뉴가 실제 연결될 페이지가 생기면 채워주세요.
const NAV_ITEMS = [
  { label: '메인', hrefKey: 'home' },
  { label: '회사 소개', href: '#' },
  { label: '간판 종류', href: '#' },
  { label: '시공 사례', href: '#' },
  { label: '상담문의', href: '#' },
];

// 카카오채널 링크는 나중에 만들어지면 이 값만 채워 넣으면 자동으로 활성화됩니다.
const SOCIAL_LINKS = {
  kakaoChannel: '', // 예: 'https://pf.kakao.com/_xxxxxx'
  instagram: 'https://www.instagram.com/empowerdesign2023/',
};

const ICONS = {
  kakao: `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 3.5C6.75 3.5 2.5 6.86 2.5 11c0 2.62 1.72 4.93 4.33 6.26-.19.7-.68 2.5-.78 2.9-.12.48.18.48.37.35.15-.1 2.4-1.6 3.38-2.26.7.1 1.42.15 2.2.15 5.25 0 9.5-3.36 9.5-7.4S17.25 3.5 12 3.5z"/></svg>`,
  instagram: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r="0.9" fill="currentColor" stroke="none"/></svg>`,
};

function initSiteNav({ homeHref, activeKey }){
  const menuEl = document.getElementById('siteMenu');
  const brandEl = document.querySelector('.brand');
  if (brandEl) brandEl.setAttribute('href', homeHref);
  if (!menuEl) return;

  const ul = document.createElement('ul');

  NAV_ITEMS.forEach(item => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = item.hrefKey === 'home' ? homeHref : item.href;
    a.textContent = item.label;
    if (item.hrefKey === activeKey) a.classList.add('active');
    li.appendChild(a);
    ul.appendChild(li);
  });

  // 카카오채널 / 인스타그램 아이콘
  [
    { key: 'kakao', label: '카카오톡 채널', href: SOCIAL_LINKS.kakaoChannel },
    { key: 'instagram', label: '인스타그램', href: SOCIAL_LINKS.instagram },
  ].forEach(social => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.className = 'nav-icon';
    a.innerHTML = ICONS[social.key];
    a.setAttribute('aria-label', social.label);
    if (social.href){
      a.href = social.href;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    } else {
      a.href = '#';
      a.classList.add('is-disabled');
      a.setAttribute('aria-disabled', 'true');
      a.addEventListener('click', (e) => e.preventDefault());
    }
    li.appendChild(a);
    ul.appendChild(li);
  });

  menuEl.appendChild(ul);
}

async function fetchManifest(imagesFolder){
  const res = await fetch(`${imagesFolder}/manifest.json`);
  if (!res.ok) throw new Error(`매니페스트를 불러오지 못했습니다 (status: ${res.status})`);
  const data = await res.json();
  return data.groups || [];
}

function createRevealObserver(){
  return new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.remove('is-loading');
        entry.target._revealObserver.unobserve(entry.target);
      }
    });
  }, { rootMargin: '0px 0px -5% 0px', threshold: 0.05 });
}

// 페이드인은 연출용입니다. 어떤 환경에서든(느린 네트워크, 인앱브라우저 등)
// 이미지 자체는 기본 상태(opacity:1)로 항상 보이고, 이 연출이 안 걸려도
// 문제가 되지 않도록 안전장치(setTimeout)를 같이 겁니다.
function wireLazyReveal(imgEl, observer){
  imgEl.classList.add('is-loading');
  imgEl._revealObserver = observer;
  observer.observe(imgEl);
  setTimeout(() => imgEl.classList.remove('is-loading'), 1200);
}
