/* /assets/gallery-common.js
   index.html과 group 페이지가 공통으로 쓰는 유틸:
   - fetchManifest(): images/manifest.json을 읽어 그룹 배열을 반환
   - createRevealObserver(): 스크롤 진입 시 살짝 페이드인 시키는 관찰자
   - wireLazyReveal(): 이미지에 안전한(브라우저/네트워크 무관) 지연노출 연결
   - initSiteNav(): 상단 메뉴 + 카카오채널/인스타 아이콘 렌더링 (여기 한 곳만 고치면
     index.html과 모든 그룹 페이지에 다 반영됩니다)
   - 페이지 진입/이동 시 부드러운 페이드 전환 (아래 initPageFade)
*/

// ---------------- 페이지 진입/이동 페이드 전환 ----------------
// CSS는 site.css의 body{opacity:0} + body.is-ready{opacity:1} 규칙과 짝을 이룹니다.
(function initPageFade(){
  function reveal(){ document.body.classList.add('is-ready'); }
  // 스크립트가 body 하단에서 실행되므로 이 시점엔 이미 DOM이 준비돼 있음 - 한 프레임 뒤에 표시
  requestAnimationFrame(() => requestAnimationFrame(reveal));
  // 무슨 이유로든 위 코드가 안 걸려도 콘텐츠가 영영 안 보이는 일은 없도록 하는 안전장치
  setTimeout(reveal, 800);
  // 뒤로가기 등으로 캐시된 페이지가 복원될 때도 확실히 보이게
  window.addEventListener('pageshow', reveal);
})();

function isSameOriginNavigableLink(link){
  if (!link || link.target === '_blank' || link.hasAttribute('download')) return false;
  const rawHref = link.getAttribute('href') || '';
  if (!rawHref || rawHref.startsWith('#') || rawHref.startsWith('mailto:') || rawHref.startsWith('tel:')) return false;
  try {
    return new URL(link.href, location.href).origin === location.origin;
  } catch {
    return false;
  }
}

// 같은 사이트 안의 링크를 클릭하면, 살짝 페이드아웃 한 뒤에 이동합니다.
document.addEventListener('click', (e) => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const link = e.target.closest('a');
  if (!isSameOriginNavigableLink(link)) return;
  e.preventDefault();
  document.body.classList.remove('is-ready');
  const dest = link.href;
  setTimeout(() => { location.href = dest; }, 220);
});

// 방문자 통계 (GoatCounter, 무료·회원가입 없이도 카운터만 심을 수 있음)
// https://www.goatcounter.com 에서 사이트 코드를 만든 뒤 여기에 넣으면
// 이 사이트의 모든 페이지에서 자동으로 방문 집계가 시작됩니다.
// admin-a/index.html, admin-b/index.html 상단의 같은 이름 상수에도 똑같이 넣어주세요.
const ANALYTICS_CODE = ''; // 예: 'empowerdesign' (GoatCounter에서 만든 사이트 코드)

(function loadAnalytics(){
  if (!ANALYTICS_CODE) return;
  const script = document.createElement('script');
  script.async = true;
  script.setAttribute('data-goatcounter', `https://${ANALYTICS_CODE}.goatcounter.com/count`);
  script.src = 'https://gc.zgo.at/count.js';
  document.head.appendChild(script);
})();

// 상단 메뉴 항목. href는 각 메뉴가 실제 연결될 페이지가 생기면 채워주세요.
// '상담문의'는 여기 목록이 아니라 아래에서 아이콘 두 개와 한 묶음으로 따로 그려집니다.
const NAV_ITEMS = [
  { label: '메인', hrefKey: 'home' },
  { label: '회사 소개', hrefKey: 'about' },
  { label: '간판 종류', href: '#' },
  { label: '시공 사례', hrefKey: 'case' },
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

function initSiteNav({ homeHref, aboutHref, caseHref, activeKey }){
  const menuEl = document.getElementById('siteMenu');
  const brandEl = document.querySelector('.brand');
  if (brandEl) brandEl.setAttribute('href', homeHref);
  if (!menuEl) return;

  // 모바일 전용 햄버거 버튼 - 넓은 화면에서는 CSS로 숨겨집니다.
  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = 'nav-toggle';
  toggleBtn.setAttribute('aria-label', '메뉴 열기/닫기');
  toggleBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 6h16M4 12h16M4 18h16"/></svg>`;
  toggleBtn.addEventListener('click', () => {
    menuEl.classList.toggle('is-open');
  });

  const ul = document.createElement('ul');

  NAV_ITEMS.forEach(item => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    if (item.hrefKey === 'home') a.href = homeHref;
    else if (item.hrefKey === 'about') a.href = aboutHref || '#';
    else if (item.hrefKey === 'case') a.href = caseHref || '#';
    else a.href = item.href;
    a.textContent = item.label;
    if (item.hrefKey === activeKey) a.classList.add('active');
    li.appendChild(a);
    ul.appendChild(li);
  });

  // '상담문의' + 카카오채널 + 인스타그램: 시각적으로 한 묶음.
  // 상담문의는 아직 이동할 페이지가 없어 클릭해도 아무 동작 안 하게 둡니다.
  const contactLi = document.createElement('li');
  contactLi.className = 'nav-contact-group';

  const contactLabel = document.createElement('a');
  contactLabel.href = '#';
  contactLabel.textContent = '상담문의';
  contactLabel.addEventListener('click', (e) => e.preventDefault());

  contactLi.appendChild(contactLabel);

  [
    { key: 'kakao', label: '카카오톡 채널', href: SOCIAL_LINKS.kakaoChannel },
    { key: 'instagram', label: '인스타그램', href: SOCIAL_LINKS.instagram },
  ].forEach(social => {
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
    contactLi.appendChild(a);
  });

  // 다크모드 전환 버튼 - 상담문의/아이콘 묶음 안에 같이 넣음
  const themeBtn = document.createElement('button');
  themeBtn.type = 'button';
  themeBtn.className = 'nav-icon nav-theme-toggle';
  themeBtn.setAttribute('aria-label', '다크모드 전환');
  themeBtn.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    setTheme(next);
  });
  contactLi.appendChild(themeBtn);
  updateThemeButtonIcon(themeBtn);

  ul.appendChild(contactLi);

  // 모바일에서 항목 하나를 탭하면 메뉴가 자동으로 닫히게 (다크모드 버튼은 예외 - 눌러도 메뉴 유지)
  ul.addEventListener('click', (e) => {
    if (e.target.closest('.nav-theme-toggle')) return;
    if (e.target.closest('a')) menuEl.classList.remove('is-open');
  });

  menuEl.appendChild(toggleBtn);
  menuEl.appendChild(ul);
}

const THEME_ICONS = {
  light: `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.4M12 19.1v2.4M4.6 4.6l1.7 1.7M17.7 17.7l1.7 1.7M2.5 12h2.4M19.1 12h2.4M4.6 19.4l1.7-1.7M17.7 6.3l1.7-1.7"/></svg>`,
  dark: `<svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" stroke="none"><path d="M20.5 14.6c-1 .4-2 .6-3.1.6-5 0-9-4-9-9 0-1.1.2-2.1.6-3.1C5.1 4.1 2.5 7.6 2.5 11.7c0 5 4 9 9 9 4.1 0 7.6-2.6 8.8-6.2-.1 0-.2.1-.3.1z"/></svg>`,
};

function updateThemeButtonIcon(btn){
  const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  // 지금 상태가 아니라 "눌렀을 때 바뀔 상태"의 아이콘을 보여줌 (라이트면 달, 다크면 해)
  btn.innerHTML = current === 'dark' ? THEME_ICONS.light : THEME_ICONS.dark;
}

function setTheme(theme){
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('site_theme', theme);
  document.querySelectorAll('.nav-theme-toggle').forEach(updateThemeButtonIcon);
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
