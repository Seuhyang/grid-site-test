/* /admin-shared/admin-ui.js
   admin-a, admin-b가 공통으로 쓰는 로직입니다.
   각 admin 페이지는 실제로 GitHub에 파일을 쓰는 방법(putFile/deleteFile)만
   자기 방식대로(토큰 직접 / Worker 경유) 만들어서 AdminUI.start()에 넘겨줍니다. */

const AdminUI = (() => {

  function utf8ToBase64(str){
    return btoa(unescape(encodeURIComponent(str)));
  }

  function slugify(text){
    return text
      .trim().toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  // 이미지를 WebP로 변환 (가로/세로 큰 쪽이 2000px을 넘으면 축소)
  function fileToWebP(file, maxDim = 2000, quality = 0.85){
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        const img = new Image();
        img.onerror = reject;
        img.onload = () => {
          let { width, height } = img;
          if (Math.max(width, height) > maxDim){
            const scale = maxDim / Math.max(width, height);
            width = Math.round(width * scale);
            height = Math.round(height * scale);
          }
          const canvas = document.createElement('canvas');
          canvas.width = width; canvas.height = height;
          canvas.getContext('2d').drawImage(img, 0, 0, width, height);
          canvas.toBlob(blob => {
            if (!blob) return reject(new Error('WebP 변환 실패'));
            const fr = new FileReader();
            fr.onerror = reject;
            fr.onload = () => resolve(fr.result.split(',')[1]);
            fr.readAsDataURL(blob);
          }, 'image/webp', quality);
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  async function pickAvailableSlug(desired){
    let existingSlugs = [];
    try {
      const res = await fetch(`../images/manifest.json?t=${Date.now()}`);
      const data = await res.json();
      existingSlugs = (data.groups || []).map(g => g.slug);
    } catch { /* 목록을 못 가져와도 업로드는 진행 */ }
    let candidate = desired;
    let n = 2;
    while (existingSlugs.includes(candidate)){
      candidate = `${desired}-${n}`;
      n++;
    }
    return candidate;
  }

  function blocksToText(group){
    if (group.blocks && group.blocks.length){
      return group.blocks
        .map(b => b.type === 'text' ? b.text : `{{${b.file}}}`)
        .join('\n\n');
    }
    return '';
  }

  function wireNewGroupUpload(api){
    const statusEl = document.getElementById('newGroupStatus');

    document.getElementById('newGroupUploadBtn').addEventListener('click', async () => {
      const title = document.getElementById('newGroupTitle').value.trim();
      const slugInput = document.getElementById('newGroupSlug').value.trim();
      const files = document.getElementById('newGroupFiles').files;
      if (!files.length) return alert('사진을 선택해주세요.');

      statusEl.className = 'status';
      statusEl.textContent = '준비 중...';

      const desiredSlug = slugInput ? slugify(slugInput) : ('upload-' + Date.now());
      if (slugInput && !desiredSlug) return alert('주소용 이름에 영문/숫자/하이픈만 입력해주세요.');
      const base = await pickAvailableSlug(desiredSlug);
      const filenames = [];

      try {
        for (let i = 0; i < files.length; i++){
          statusEl.textContent = `업로드 중... (${i + 1}/${files.length})`;
          const b64 = await fileToWebP(files[i]);
          const suffix = files.length > 1 ? '_' + String(i + 1).padStart(2, '0') : '';
          const filename = `${base}${suffix}.webp`;
          await api.putFile(`images/${filename}`, b64, `사진 추가: ${filename}`);
          filenames.push(filename);
        }
        if (title){
          await api.putFile(`images/${base}.title.txt`, utf8ToBase64(title), `제목 설정: ${base}`);
        }

        // 사진 사이사이에 "감상평을 적어주세요" 빈칸이 끼워진 본문 초안을 만들어둡니다.
        // 실제 문구는 나중에 관리자 페이지의 "본문" 칸에서 채워 넣으면 됩니다.
        const desc = document.getElementById('newGroupDesc').value.trim();
        const draftParts = [];
        if (desc) draftParts.push(desc);
        filenames.forEach(filename => {
          draftParts.push(`{{${filename}}}`);
          draftParts.push('(여기에 한두 줄 감상평을 적어보세요)');
        });
        await api.putFile(`images/${base}.content.txt`, utf8ToBase64(draftParts.join('\n\n')), `본문 초안 생성: ${base}`);
        statusEl.textContent = '업로드 완료! 1분 내로 사이트에 자동 반영됩니다.';
        statusEl.className = 'status ok';
        document.getElementById('newGroupTitle').value = '';
        document.getElementById('newGroupSlug').value = '';
        document.getElementById('newGroupDesc').value = '';
        document.getElementById('newGroupFiles').value = '';
      } catch (err) {
        statusEl.textContent = err.message;
        statusEl.className = 'status error';
      }
    });
  }

  function renderGroups(groups, api){
    const groupsList = document.getElementById('groupsList');
    groupsList.innerHTML = '';

    groups.forEach(group => {
      const card = document.createElement('div');
      card.className = 'group-card';

      const cover = document.createElement('img');
      cover.className = 'cover';
      cover.src = `../images/${group.cover}`;

      const fields = document.createElement('div');
      fields.className = 'fields';

      const titleInput = document.createElement('input');
      titleInput.type = 'text';
      titleInput.value = group.title;

      const titleBtn = document.createElement('button');
      titleBtn.textContent = '제목 저장';
      titleBtn.addEventListener('click', async () => {
        try {
          await api.putFile(`images/${group.slug}.title.txt`, utf8ToBase64(titleInput.value.trim()), `제목 수정: ${group.slug}`);
          alert('제목을 저장했습니다. 잠시 후 반영됩니다.');
        } catch (err) { alert(err.message); }
      });

      const contentTextarea = document.createElement('textarea');
      contentTextarea.value = blocksToText(group);
      contentTextarea.placeholder = '글을 적고, 사진을 넣고 싶은 자리에 아래 사진을 클릭해서 넣어주세요.';
      contentTextarea.style.minHeight = '160px';

      const contentBtn = document.createElement('button');
      contentBtn.className = 'secondary';
      contentBtn.textContent = '본문 저장';
      contentBtn.addEventListener('click', async () => {
        try {
          await api.putFile(`images/${group.slug}.content.txt`, utf8ToBase64(contentTextarea.value), `본문 수정: ${group.slug}`);
          alert('본문을 저장했습니다. 잠시 후 반영됩니다.');
        } catch (err) { alert(err.message); }
      });

      const coverSelect = document.createElement('select');
      group.photos.forEach(file => {
        const opt = document.createElement('option');
        opt.value = file; opt.textContent = file;
        if (file === group.cover) opt.selected = true;
        coverSelect.appendChild(opt);
      });
      const coverBtn = document.createElement('button');
      coverBtn.className = 'secondary';
      coverBtn.textContent = '대표사진(메인 노출) 저장';
      coverBtn.addEventListener('click', async () => {
        try {
          await api.putFile(`images/${group.slug}.cover.txt`, utf8ToBase64(coverSelect.value), `대표사진 수정: ${group.slug}`);
          alert('대표사진을 저장했습니다. 잠시 후 반영됩니다.');
        } catch (err) { alert(err.message); }
      });

      const photoList = document.createElement('div');
      photoList.className = 'photo-list';
      group.photos.forEach(file => {
        const thumb = document.createElement('div');
        thumb.className = 'thumb';

        const img = document.createElement('img');
        img.src = `../images/${file}`;
        img.title = '클릭하면 본문 커서 위치에 삽입됩니다';
        img.style.cursor = 'pointer';
        img.addEventListener('click', () => {
          const tag = `{{${file}}}`;
          const start = contentTextarea.selectionStart ?? contentTextarea.value.length;
          const end = contentTextarea.selectionEnd ?? contentTextarea.value.length;
          const before = contentTextarea.value.slice(0, start);
          const after = contentTextarea.value.slice(end);
          contentTextarea.value = `${before}\n${tag}\n${after}`;
          contentTextarea.focus();
        });

        const del = document.createElement('button');
        del.className = 'del';
        del.textContent = '×';
        del.title = '이 사진 삭제';
        del.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (!confirm(`${file} 을(를) 삭제할까요?`)) return;
          try {
            await api.deleteFile(`images/${file}`, `사진 삭제: ${file}`);
            alert('삭제했습니다. 잠시 후 반영됩니다.');
            loadGroups(api);
          } catch (err) { alert(err.message); }
        });

        thumb.appendChild(img);
        thumb.appendChild(del);
        photoList.appendChild(thumb);
      });

      const contentHint = document.createElement('p');
      contentHint.className = 'hint';
      contentHint.textContent = '아래 사진 썸네일을 클릭하면 본문 커서 위치에 자동으로 들어갑니다.';

      fields.append(
        Object.assign(document.createElement('label'), { textContent: '제목' }), titleInput, titleBtn,
        document.createElement('br'), document.createElement('br'),
        Object.assign(document.createElement('label'), { textContent: '본문 (글과 사진을 원하는 순서로)' }),
        contentTextarea, contentHint, contentBtn,
        document.createElement('br'), document.createElement('br'),
        Object.assign(document.createElement('label'), { textContent: '대표사진(메인 그리드에 보일 사진)' }), coverSelect, coverBtn,
        photoList
      );

      card.appendChild(cover);
      card.appendChild(fields);
      groupsList.appendChild(card);
    });
  }

  async function loadGroups(api){
    const groupsList = document.getElementById('groupsList');
    groupsList.innerHTML = '불러오는 중...';
    const res = await fetch(`../images/manifest.json?t=${Date.now()}`);
    const data = await res.json();
    renderGroups(data.groups || [], api);
  }

  // 로그인 성공 후 각 admin 페이지가 호출하는 진입점
  function start(api){
    wireNewGroupUpload(api);
    document.getElementById('refreshBtn').addEventListener('click', () => loadGroups(api));
    loadGroups(api);
  }

  return { start, loadGroups };
})();
