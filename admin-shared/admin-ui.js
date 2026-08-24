/* /admin-shared/admin-ui.js
   admin-a, admin-b가 공통으로 쓰는 로직입니다.
   각 admin 페이지는 실제로 GitHub에 파일을 쓰는 방법(putFile/deleteFile)만
   자기 방식대로(토큰 직접 / Worker 경유) 만들어서 AdminUI.start()에 넘겨줍니다.

   ------------------------------------------------------------------
   블록 에디터: 글/사진을 순서대로 쌓아서(블로그 글처럼) 만드는 공용 UI.
   - + 글 추가 / + 사진 추가 로 블록을 늘리고
   - ▲▼ 로 순서를 바꾸고
   - 사진 블록에서 ★ 대표사진으로 지정
   - × 로 블록 삭제 (사진은 저장을 눌러야 실제로 삭제됩니다)
   ------------------------------------------------------------------ */

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

  // 기존 사진들 중 "key_숫자두자리" 패턴의 가장 큰 번호 다음 번호를 돌려줍니다.
  function nextSuffixNumber(existingPhotos, key){
    const re = new RegExp('^' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '_(\\d{2})\\.');
    let max = 0;
    existingPhotos.forEach(file => {
      const m = file.match(re);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    return max + 1;
  }

  function blocksToText(blocks){
    return blocks
      .map(b => b.type === 'text' ? b.text : `{{${b.file}}}`)
      .join('\n\n');
  }

  // 에디터 내부 블록(썸네일 src, 임시 파일 등 포함)을 저장/캐시용 순수 데이터로 변환
  function blocksToPlainData(blocks){
    return blocks.map(b => b.type === 'text'
      ? { type: 'text', text: b.text }
      : { type: 'image', file: b.file }
    );
  }

  function groupBlocksToEditorBlocks(group){
    const source = (group.blocks && group.blocks.length)
      ? group.blocks
      : group.photos.map(file => ({ type: 'image', file }));
    return source.map(b => {
      if (b.type === 'text') return { id: nextBlockId(), type: 'text', text: b.text };
      return {
        id: nextBlockId(), type: 'image', file: b.file,
        src: `../images/${b.file}`, isNew: false, isCover: b.file === group.cover
      };
    });
  }

  let _blockIdSeq = 0;
  function nextBlockId(){ return 'blk' + (_blockIdSeq++); }

  /* ---------------- 블록 에디터 컴포넌트 ---------------- */
  function createBlockEditor(initialBlocks){
    const state = { blocks: initialBlocks.slice() };

    const wrap = document.createElement('div');
    wrap.className = 'block-editor';

    const list = document.createElement('div');
    list.className = 'block-list';

    const toolbar = document.createElement('div');
    toolbar.className = 'block-toolbar';

    const addTextBtn = document.createElement('button');
    addTextBtn.type = 'button';
    addTextBtn.className = 'secondary';
    addTextBtn.textContent = '+ 글 추가';
    addTextBtn.addEventListener('click', () => {
      state.blocks.push({ id: nextBlockId(), type: 'text', text: '' });
      render();
    });

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.multiple = true;
    fileInput.style.display = 'none';
    fileInput.addEventListener('change', () => {
      Array.from(fileInput.files).forEach(f => {
        state.blocks.push({
          id: nextBlockId(), type: 'image', file: null, pendingFile: f,
          src: URL.createObjectURL(f), isNew: true, isCover: false
        });
      });
      fileInput.value = '';
      render();
    });

    const addImageBtn = document.createElement('button');
    addImageBtn.type = 'button';
    addImageBtn.className = 'secondary';
    addImageBtn.textContent = '+ 사진 추가';
    addImageBtn.addEventListener('click', () => fileInput.click());

    toolbar.append(addTextBtn, addImageBtn, fileInput);

    function move(index, dir){
      const target = index + dir;
      if (target < 0 || target >= state.blocks.length) return;
      const tmp = state.blocks[index];
      state.blocks[index] = state.blocks[target];
      state.blocks[target] = tmp;
      render();
    }

    function setCover(id){
      state.blocks.forEach(b => { if (b.type === 'image') b.isCover = (b.id === id); });
      render();
    }

    function removeBlock(id){
      state.blocks = state.blocks.filter(b => b.id !== id);
      render();
    }

    function render(){
      list.innerHTML = '';
      if (!state.blocks.length){
        const empty = document.createElement('p');
        empty.className = 'hint';
        empty.textContent = '아직 블록이 없습니다. 아래 버튼으로 글이나 사진을 추가해주세요.';
        list.appendChild(empty);
      }
      state.blocks.forEach((block, i) => {
        const row = document.createElement('div');
        row.className = 'block block-' + block.type;

        const controls = document.createElement('div');
        controls.className = 'block-controls';
        const upBtn = document.createElement('button');
        upBtn.type = 'button'; upBtn.textContent = '▲'; upBtn.title = '위로';
        upBtn.disabled = (i === 0);
        upBtn.addEventListener('click', () => move(i, -1));
        const downBtn = document.createElement('button');
        downBtn.type = 'button'; downBtn.textContent = '▼'; downBtn.title = '아래로';
        downBtn.disabled = (i === state.blocks.length - 1);
        downBtn.addEventListener('click', () => move(i, 1));
        const delBtn = document.createElement('button');
        delBtn.type = 'button'; delBtn.textContent = '×'; delBtn.title = '이 블록 삭제';
        delBtn.className = 'block-del';
        delBtn.addEventListener('click', () => removeBlock(block.id));
        controls.append(upBtn, downBtn, delBtn);

        const body = document.createElement('div');
        body.className = 'block-body';

        if (block.type === 'text'){
          const richToolbar = document.createElement('div');
          richToolbar.className = 'rich-toolbar';

          const editable = document.createElement('div');
          editable.className = 'block-richtext';
          editable.contentEditable = 'true';
          editable.innerHTML = block.text || '';
          editable.setAttribute('data-placeholder', '이 위치에 들어갈 글을 적어주세요.');
          editable.addEventListener('input', () => { block.text = editable.innerHTML; });

          function addCmdBtn(label, cmd, value, title){
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = label;
            btn.title = title || '';
            // 버튼 클릭 시 편집 영역의 선택(드래그해둔 글자) 범위가 풀리지 않게 함
            btn.addEventListener('mousedown', (e) => e.preventDefault());
            btn.addEventListener('click', () => {
              editable.focus();
              document.execCommand(cmd, false, value);
              block.text = editable.innerHTML;
            });
            return btn;
          }

          richToolbar.appendChild(addCmdBtn('B', 'bold', null, '굵게'));
          richToolbar.appendChild(addCmdBtn('I', 'italic', null, '기울임'));
          richToolbar.appendChild(addCmdBtn('U', 'underline', null, '밑줄'));

          const colorInput = document.createElement('input');
          colorInput.type = 'color';
          colorInput.title = '글자색';
          colorInput.value = '#131211';
          colorInput.addEventListener('mousedown', (e) => e.preventDefault());
          colorInput.addEventListener('input', () => {
            editable.focus();
            document.execCommand('foreColor', false, colorInput.value);
            block.text = editable.innerHTML;
          });
          richToolbar.appendChild(colorInput);

          const fontSelect = document.createElement('select');
          fontSelect.title = '글꼴';
          [
            ['기본 글꼴', ''],
            ['고딕', 'Work Sans, sans-serif'],
            ['세리프', 'Fraunces, serif'],
            ['필기체', 'Yellowtail, cursive'],
          ].forEach(([label, value]) => {
            const opt = document.createElement('option');
            opt.textContent = label; opt.value = value;
            fontSelect.appendChild(opt);
          });
          fontSelect.addEventListener('mousedown', (e) => e.stopPropagation());
          fontSelect.addEventListener('change', () => {
            editable.focus();
            if (fontSelect.value) document.execCommand('fontName', false, fontSelect.value);
            block.text = editable.innerHTML;
          });
          richToolbar.appendChild(fontSelect);

          body.append(richToolbar, editable);
        } else {
          const img = document.createElement('img');
          img.src = block.src;
          img.className = 'block-thumb';

          const meta = document.createElement('div');
          meta.className = 'block-image-meta';

          const nameEl = document.createElement('span');
          nameEl.className = 'block-image-name';
          nameEl.textContent = block.isNew ? '새 사진 (저장 시 업로드됨)' : block.file;

          const coverBtn = document.createElement('button');
          coverBtn.type = 'button';
          coverBtn.className = 'cover-toggle' + (block.isCover ? ' is-cover' : '');
          coverBtn.textContent = block.isCover ? '★ 대표사진' : '☆ 대표사진으로 지정';
          coverBtn.addEventListener('click', () => setCover(block.id));

          meta.append(nameEl, coverBtn);
          body.append(img, meta);
        }

        row.append(controls, body);
        list.appendChild(row);
      });
    }

    render();
    wrap.append(list, toolbar);

    return {
      el: wrap,
      getBlocks: () => state.blocks,
      reset: () => { state.blocks = []; render(); }
    };
  }

  /* ---------------- 새 그룹 만들기 ---------------- */
  function wireNewGroupUpload(api){
    const statusEl = document.getElementById('newGroupStatus');
    const editorHost = document.getElementById('newGroupEditor');
    const editor = createBlockEditor([]);
    editorHost.appendChild(editor.el);

    document.getElementById('newGroupUploadBtn').addEventListener('click', async () => {
      const title = document.getElementById('newGroupTitle').value.trim();
      const slugInput = document.getElementById('newGroupSlug').value.trim();
      const blocks = editor.getBlocks();
      const imageBlocks = blocks.filter(b => b.type === 'image');
      if (!imageBlocks.length) return alert('사진을 최소 한 장 추가해주세요.');

      statusEl.className = 'status';
      statusEl.textContent = '준비 중...';

      const desiredSlug = slugInput ? slugify(slugInput) : ('upload-' + Date.now());
      if (slugInput && !desiredSlug) return alert('주소용 이름에 영문/숫자/하이픈만 입력해주세요.');
      const key = await pickAvailableSlug(desiredSlug);

      try {
        let idx = 0;
        for (const block of imageBlocks){
          idx++;
          statusEl.textContent = `업로드 중... (${idx}/${imageBlocks.length})`;
          const suffix = imageBlocks.length > 1 ? '_' + String(idx).padStart(2, '0') : '';
          const filename = `${key}${suffix}.webp`;
          const b64 = await fileToWebP(block.pendingFile);
          await api.putFile(`images/${filename}`, b64, `사진 추가: ${filename}`);
          block.file = filename;
          block.isNew = false;
        }

        if (title){
          await api.putFile(`images/${key}.title.txt`, utf8ToBase64(title), `제목 설정: ${key}`);
        }

        const contentText = blocksToText(blocks);
        await api.putFile(`images/${key}.content.txt`, utf8ToBase64(contentText), `본문 생성: ${key}`);

        const coverBlock = imageBlocks.find(b => b.isCover) || imageBlocks[0];
        if (coverBlock){
          await api.putFile(`images/${key}.cover.txt`, utf8ToBase64(coverBlock.file), `대표사진 설정: ${key}`);
        }

        // Actions/manifest.json을 기다리지 않고, 방금 만든 그룹을 목록에 바로 추가합니다.
        allGroups.unshift({
          slug: key,
          key,
          title: title || key,
          date: new Date().toISOString(),
          cover: coverBlock ? coverBlock.file : imageBlocks[0].file,
          photos: imageBlocks.map(b => b.file),
          blocks: blocksToPlainData(blocks),
        });
        renderGroupBrowser(api);

        statusEl.textContent = '만들었습니다! 이 화면 목록에는 바로 나타나고, 실제 사이트에는 1분 내로 반영됩니다.';
        statusEl.className = 'status ok';
        document.getElementById('newGroupTitle').value = '';
        document.getElementById('newGroupSlug').value = '';
        editor.reset();
      } catch (err) {
        statusEl.textContent = err.message;
        statusEl.className = 'status error';
      }
    });
  }

  /* ---------------- 기존 그룹 저장 (바뀐 것만 반영) ---------------- */
  async function saveGroupCard({ group, api, titleInput, editor, statusEl, saveBtn, coverImgEl, onSaved }){
    saveBtn.disabled = true;
    statusEl.className = 'status';
    statusEl.textContent = '저장 중...';
    try {
      const key = group.key || group.slug;
      const blocks = editor.getBlocks();

      // 1) 새로 추가된 사진 업로드
      let suffixCounter = nextSuffixNumber(group.photos, key);
      for (const block of blocks){
        if (block.type === 'image' && block.isNew){
          const b64 = await fileToWebP(block.pendingFile);
          const filename = `${key}_${String(suffixCounter).padStart(2, '0')}.webp`;
          suffixCounter++;
          await api.putFile(`images/${filename}`, b64, `사진 추가: ${filename}`);
          block.file = filename;
          block.isNew = false;
        }
      }

      // 2) 에디터에서 빠진 기존 사진은 삭제
      const keptFiles = new Set(blocks.filter(b => b.type === 'image').map(b => b.file));
      const removed = group.photos.filter(f => !keptFiles.has(f));
      for (const file of removed){
        await api.deleteFile(`images/${file}`, `사진 삭제: ${file}`);
      }

      // 3) 대표사진 결정 (지정 안 했으면 첫 사진)
      const imageBlocks = blocks.filter(b => b.type === 'image');
      const coverBlock = imageBlocks.find(b => b.isCover) || imageBlocks[0];
      const coverFile = coverBlock ? coverBlock.file : group.cover;

      // 4) 실제로 바뀐 항목만 저장
      const newTitle = titleInput.value.trim();
      if (newTitle !== group.title){
        await api.putFile(`images/${key}.title.txt`, utf8ToBase64(newTitle), `제목 수정: ${key}`);
      }
      if (coverFile && coverFile !== group.cover){
        await api.putFile(`images/${key}.cover.txt`, utf8ToBase64(coverFile), `대표사진 수정: ${key}`);
      }
      const newContentText = blocksToText(blocks);
      const originalContentText = blocksToText(groupBlocksToEditorBlocks(group));
      if (newContentText !== originalContentText){
        await api.putFile(`images/${key}.content.txt`, utf8ToBase64(newContentText), `본문 수정: ${key}`);
      }

      // 실제 방문자용 사이트는 GitHub Actions가 돌아야 반영되지만(약 1분),
      // 관리자 화면은 그걸 기다리지 않고 지금 편집한 내용으로 바로 갱신합니다.
      // (group 객체는 목록에 있는 것과 같은 참조라서, 목록으로 돌아가도 바로 반영돼 보여요)
      group.title = newTitle;
      group.cover = coverFile || group.cover;
      group.photos = imageBlocks.map(b => b.file);
      group.blocks = blocksToPlainData(blocks);
      if (coverImgEl) coverImgEl.src = `../images/${group.cover}`;

      statusEl.textContent = '저장했습니다. 이 화면엔 바로 반영됐어요. 실제 사이트에는 1분 내로 반영됩니다.';
      statusEl.className = 'status ok';
      if (onSaved) onSaved(group);
    } catch (err) {
      statusEl.textContent = err.message;
      statusEl.className = 'status error';
    } finally {
      saveBtn.disabled = false;
    }
  }

  // 그룹 목록 상태 - manifest.json에서 한 번 불러온 뒤로는 이걸 계속 씀
  // (저장할 때마다 다시 불러오지 않음 - Actions 기다릴 필요 없음)
  let allGroups = [];
  let viewMode = localStorage.getItem('admin_group_view') || 'grid'; // 'grid' | 'list'

  function renderGroupBrowser(api){
    const host = document.getElementById('groupsList');
    host.innerHTML = '';

    const toolbar = document.createElement('div');
    toolbar.className = 'group-view-toggle';

    const gridBtn = document.createElement('button');
    gridBtn.type = 'button';
    gridBtn.className = 'secondary' + (viewMode === 'grid' ? ' is-active' : '');
    gridBtn.textContent = '이미지로 보기';
    gridBtn.addEventListener('click', () => {
      viewMode = 'grid';
      localStorage.setItem('admin_group_view', 'grid');
      renderGroupBrowser(api);
    });

    const listBtn = document.createElement('button');
    listBtn.type = 'button';
    listBtn.className = 'secondary' + (viewMode === 'list' ? ' is-active' : '');
    listBtn.textContent = '제목으로 보기';
    listBtn.addEventListener('click', () => {
      viewMode = 'list';
      localStorage.setItem('admin_group_view', 'list');
      renderGroupBrowser(api);
    });

    toolbar.append(gridBtn, listBtn);
    host.appendChild(toolbar);

    if (!allGroups.length){
      const empty = document.createElement('p');
      empty.className = 'hint';
      empty.textContent = '아직 그룹이 없습니다. 위에서 새 그룹을 먼저 만들어보세요.';
      host.appendChild(empty);
      return;
    }

    const container = document.createElement('div');
    container.className = viewMode === 'grid' ? 'group-grid' : 'group-textlist';

    allGroups.forEach(group => {
      const item = document.createElement('button');
      item.type = 'button';
      item.addEventListener('click', () => openGroupDetail(group, api));

      if (viewMode === 'grid'){
        item.className = 'group-grid-item';
        const img = document.createElement('img');
        img.src = `../images/${group.cover}`;
        const cap = document.createElement('span');
        cap.textContent = group.title;
        item.append(img, cap);
      } else {
        item.className = 'group-textlist-item';
        item.textContent = group.title;
      }
      container.appendChild(item);
    });

    host.appendChild(container);
  }

  function openGroupDetail(group, api){
    const host = document.getElementById('groupsList');
    host.innerHTML = '';

    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.className = 'secondary back-to-list';
    backBtn.textContent = '← 목록으로';
    backBtn.addEventListener('click', () => renderGroupBrowser(api));
    host.appendChild(backBtn);

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

    const editor = createBlockEditor(groupBlocksToEditorBlocks(group));

    const saveBtn = document.createElement('button');
    saveBtn.textContent = '저장';

    const statusEl = document.createElement('p');
    statusEl.className = 'status';

    saveBtn.addEventListener('click', () => saveGroupCard({
      group, api, titleInput, editor, statusEl, saveBtn,
      coverImgEl: cover
    }));

    fields.append(
      Object.assign(document.createElement('label'), { textContent: '제목' }),
      titleInput,
      Object.assign(document.createElement('label'), { textContent: '본문 (글·사진 블록 — ▲▼로 순서 변경, ★로 대표사진 지정)' }),
      editor.el,
      saveBtn,
      statusEl
    );

    card.appendChild(cover);
    card.appendChild(fields);
    host.appendChild(card);
  }

  async function loadGroups(api){
    const groupsList = document.getElementById('groupsList');
    groupsList.innerHTML = '불러오는 중...';
    const res = await fetch(`../images/manifest.json?t=${Date.now()}`);
    const data = await res.json();
    allGroups = data.groups || [];
    renderGroupBrowser(api);
  }

  // 로그인 성공 후 각 admin 페이지가 호출하는 진입점
  function start(api){
    wireNewGroupUpload(api);
    document.getElementById('refreshBtn').addEventListener('click', () => loadGroups(api));
    loadGroups(api);
  }

  return { start, loadGroups };
})();
