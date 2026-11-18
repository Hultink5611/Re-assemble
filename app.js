(() => {
  'use strict';

  /* ---------- kleine hulpjes ---------- */
  const app = document.getElementById('app');
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = v;
      else if (k === 'style') el.style.cssText = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }

  function toast(msg) {
    const host = [...document.querySelectorAll('dialog[open]')].pop() || document.body;
    const t = h('div', { class: 'toast', role: 'status' }, msg);
    host.append(t);
    setTimeout(() => t.remove(), 2600);
  }

  /* ---------- opslag op het toestel (IndexedDB) ---------- */
  let dbp;
  function db() {
    dbp = dbp || new Promise((res, rej) => {
      const r = indexedDB.open('reassemble', 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        d.createObjectStore('projects', { keyPath: 'id' });
        d.createObjectStore('steps', { keyPath: 'id' }).createIndex('p', 'projectId');
        d.createObjectStore('photos', { keyPath: 'id' }).createIndex('p', 'projectId');
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  const rq = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const st = async (name, mode) => (await db()).transaction(name, mode || 'readonly').objectStore(name);
  const get = async (s, id) => rq((await st(s)).get(id));
  const put = async (s, v) => rq((await st(s, 'readwrite')).put(v));
  const del = async (s, id) => rq((await st(s, 'readwrite')).delete(id));
  const all = async (s) => rq((await st(s)).getAll());
  const ofProject = async (s, pid) => rq((await st(s)).index('p').getAll(pid));
  const stepsOf = async (pid) => (await ofProject('steps', pid)).sort((a, b) => a.order - b.order);

  /* ---------- foto's ---------- */
  const urls = new Map();
  async function photoUrl(id) {
    if (urls.has(id)) return urls.get(id);
    const p = await get('photos', id);
    if (!p) return '';
    const u = URL.createObjectURL(p.blob);
    urls.set(id, u);
    return u;
  }

  // Verkleint een foto tot max. 1600 px zodat er honderden op het toestel passen.
  async function shrink(file) {
    let src;
    try {
      src = await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch (e) {
      src = await new Promise((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = rej;
        i.src = URL.createObjectURL(file);
      });
    }
    const w = src.width || src.naturalWidth, hh = src.height || src.naturalHeight;
    const k = Math.min(1, 1600 / Math.max(w, hh));
    const c = document.createElement('canvas');
    c.width = Math.round(w * k);
    c.height = Math.round(hh * k);
    c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
    return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('foto'))), 'image/jpeg', 0.82));
  }

  // Opent de camera (of de galerij) en geeft de opgeslagen foto-id's terug.
  function pickPhotos(pid, camera) {
    return new Promise((resolve) => {
      const inp = h('input', { type: 'file', accept: 'image/*', hidden: true });
      if (camera) inp.setAttribute('capture', 'environment');
      else inp.multiple = true;
      inp.addEventListener('change', async () => {
        const ids = [];
        for (const f of inp.files) {
          try {
            const blob = await shrink(f);
            const id = uid();
            await put('photos', { id, projectId: pid, blob, pins: [] });
            ids.push(id);
          } catch (e) {
            toast('Deze foto kon niet worden gelezen');
          }
        }
        inp.remove();
        resolve(ids);
      });
      inp.addEventListener('cancel', () => { inp.remove(); resolve([]); });
      document.body.append(inp);
      inp.click();
    });
  }

  // Twee knoppen: direct fotograferen, of kiezen uit de galerij.
  function photoButtons(pid, onAdded) {
    const go = (camera) => async () => {
      const ids = await pickPhotos(pid, camera);
      if (ids.length) onAdded(ids);
    };
    return h('div', { class: 'row' },
      h('button', { class: 'btn primary grow', type: 'button', onclick: go(true) }, '📷 Foto maken'),
      h('button', { class: 'btn', type: 'button', onclick: go(false) }, 'Uit galerij'));
  }

  // Foto met genummerde stippen. onTap krijgt de plek (0..1) waar getikt is.
  async function figure(photo, onTap) {
    const img = h('img', { src: await photoUrl(photo.id), alt: 'Foto van deze stap' });
    const box = h('div', { class: 'figure' + (onTap ? ' tap' : '') }, img);
    (photo.pins || []).forEach((p, i) => {
      box.append(h('span', { class: 'pin', style: `left:${p.x * 100}%;top:${p.y * 100}%` }, i + 1));
    });
    if (onTap) {
      box.addEventListener('click', (e) => {
        const r = img.getBoundingClientRect();
        onTap((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
      });
    }
    return box;
  }

  function pinLegend(photo) {
    const pins = (photo.pins || []).filter((p) => p.text);
    if (!pins.length) return null;
    return h('ul', { class: 'pinlist' }, (photo.pins || []).map((p, i) =>
      h('li', {}, h('span', { class: 'pin' }, i + 1), h('span', { class: 'txt' }, p.text || '(geen tekst)'))));
  }

  /* ---------- vensters ---------- */
  function openDialog(content, small) {
    const d = h('dialog', { class: small ? 'small-dlg' : '' }, h('div', { class: 'dlg' }, content));
    document.body.append(d);
    d.addEventListener('close', () => d.remove());
    d.showModal();
    return d;
  }

  function ask(title, text, yesLabel, danger) {
    return new Promise((resolve) => {
      let answer = false;
      const d = openDialog([
        h('h2', {}, title),
        text && h('p', {}, text),
        h('div', { class: 'row' },
          h('button', { class: 'btn grow', onclick: () => d.close() }, 'Annuleren'),
          h('button', { class: 'btn grow ' + (danger ? 'danger' : 'primary'), onclick: () => { answer = true; d.close(); } }, yesLabel)),
      ], true);
      d.addEventListener('close', () => resolve(answer));
    });
  }

  /* ---------- foto bekijken en stippen zetten ---------- */
  async function openPhoto(photoId, opts) {
    const o = opts || {};
    const photo = await get('photos', photoId);
    if (!photo) return;
    const body = h('div', { class: 'stack' });
    const d = openDialog(body);
    let removed = false;

    async function draw(focusLast) {
      const fig = await figure(photo, o.readonly ? null : async (x, y) => {
        photo.pins.push({ x, y, text: '' });
        await put('photos', photo);
        draw(true);
      });
      const list = o.readonly ? pinLegend(photo) : h('ul', { class: 'pinlist' }, photo.pins.map((p, i) => {
        const inp = h('input', {
          type: 'text', id: 'pin-' + i, value: p.text, placeholder: 'Wat zat hier?', 'aria-label': 'Tekst bij stip ' + (i + 1),
          oninput: () => { p.text = inp.value; put('photos', photo); },
        });
        return h('li', {}, h('span', { class: 'pin' }, i + 1), h('div', { class: 'grow', style: 'flex:1;min-width:0' }, inp),
          h('button', { class: 'btn icon', 'aria-label': 'Stip ' + (i + 1) + ' weghalen', onclick: async () => { photo.pins.splice(i, 1); await put('photos', photo); draw(); } }, '✕'));
      }));
      body.replaceChildren(
        h('div', { class: 'top' }, h('h1', {}, 'Foto'), h('button', { class: 'btn primary', onclick: () => d.close() }, 'Klaar')),
        !o.readonly && h('p', { class: 'muted' }, 'Tik op de foto om aan te wijzen wat waar zat. Elke tik zet een genummerde stip.'),
        fig, list,
        !o.readonly && h('button', {
          class: 'btn danger wide', onclick: async () => {
            if (!(await ask('Foto weghalen?', 'De foto en de stippen erop verdwijnen.', 'Weghalen', true))) return;
            await del('photos', photo.id);
            removed = true;
            d.close();
          },
        }, 'Foto weghalen'));
      if (focusLast) { const el = body.querySelector('#pin-' + (photo.pins.length - 1)); if (el) el.focus(); }
    }
    await draw();
    return new Promise((res) => d.addEventListener('close', () => res(removed)));
  }

  async function strip(ids, onOpen, addBtn) {
    const row = h('div', { class: 'strip' });
    for (const id of ids) {
      const p = await get('photos', id);
      if (!p) continue;
      const n = (p.pins || []).length;
      row.append(h('button', { class: 'ph', type: 'button', 'aria-label': 'Foto openen', onclick: () => onOpen(id) },
        h('img', { src: await photoUrl(id), alt: '' }), n ? h('span', { class: 'pincount' }, n + ' ●') : null));
    }
    if (addBtn) row.append(addBtn);
    return row;
  }

  /* ---------- stap bewerken ---------- */
  async function editStep(stepId) {
    const step = await get('steps', stepId);
    const steps = await stepsOf(step.projectId);
    const nr = steps.findIndex((s) => s.id === step.id) + 1;
    const body = h('div', { class: 'stack' });
    const d = openDialog(body);
    const save = () => put('steps', step);

    function field(key, label, hint, area, placeholder) {
      const inp = h(area ? 'textarea' : 'input', {
        id: 'f-' + key, type: area ? null : 'text', value: step[key] || '', placeholder,
        oninput: () => { step[key] = inp.value; save(); },
      });
      return h('div', { class: 'field' }, h('label', { for: 'f-' + key }, label), hint && h('span', { class: 'hint' }, hint), inp);
    }

    const photoArea = h('div', { class: 'stack' });
    async function drawPhotos() {
      photoArea.replaceChildren(
        step.photoIds.length ? await strip(step.photoIds, async (id) => {
          if (await openPhoto(id)) { step.photoIds = step.photoIds.filter((x) => x !== id); await save(); }
          drawPhotos();
        }) : h('p', { class: 'muted' }, 'Nog geen foto. Maak er een vóór je iets losmaakt, en een erna.'),
        photoButtons(step.projectId, async (ids) => { step.photoIds.push(...ids); await save(); drawPhotos(); }),
        step.photoIds.length ? h('p', { class: 'muted small' }, 'Tik op een foto om stippen te zetten bij schroeven, stekkers en slangen.') : null);
    }
    await drawPhotos();

    async function move(dir) {
      const list = await stepsOf(step.projectId);
      const i = list.findIndex((s) => s.id === step.id), j = i + dir;
      if (j < 0 || j >= list.length) return;
      const other = list[j];
      [step.order, other.order] = [other.order, step.order];
      await put('steps', other);
      await save();
      toast(dir < 0 ? 'Stap staat nu eerder' : 'Stap staat nu later');
    }

    body.append(
      h('div', { class: 'top' }, h('h1', {}, 'Stap ' + nr), h('button', { class: 'btn primary', onclick: () => d.close() }, 'Klaar')),
      photoArea,
      field('title', 'Wat heb je losgehaald?', null, false, 'Bijv. achterkap'),
      field('parts', 'Wat kwam eraf?', 'Schroeven, bouten, clips, stekkers', false, 'Bijv. 4 schroeven kruiskop'),
      field('where', 'Waar bewaar je het?', 'Schrijf dit ook op het zakje of bakje', false, 'Bijv. Zakje ' + nr),
      field('warn', 'Let op bij terugzetten', null, false, 'Bijv. blauwe slang zit links'),
      field('note', 'Notitie', null, true, 'Alles wat je later wilt weten'),
      h('div', { class: 'row' },
        h('button', { class: 'btn grow', onclick: () => move(-1) }, '↑ Eerder'),
        h('button', { class: 'btn grow', onclick: () => move(1) }, '↓ Later')),
      h('button', {
        class: 'btn danger wide', onclick: async () => {
          if (!(await ask('Stap weghalen?', 'De stap en zijn foto\'s verdwijnen.', 'Weghalen', true))) return;
          await removeStep(step);
          step.gone = true;
          d.close();
        },
      }, 'Stap weghalen'));

    d.addEventListener('close', async () => {
      const empty = !step.photoIds.length && !['title', 'parts', 'where', 'warn', 'note'].some((k) => (step[k] || '').trim());
      if (empty && !step.gone) await removeStep(step);
      render();
    });
  }

  async function removeStep(step) {
    for (const id of step.photoIds) await del('photos', id);
    await del('steps', step.id);
  }

  async function addStep(pid) {
    const steps = await stepsOf(pid);
    const step = { id: uid(), projectId: pid, order: steps.length ? steps[steps.length - 1].order + 1 : 1, title: '', parts: '', where: '', warn: '', note: '', photoIds: [], back: false };
    await put('steps', step);
    editStep(step.id);
  }

  /* ---------- reservekopie ---------- */
  const toDataUrl = (blob) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });

  async function saveFile(filename, blob) {
    if (window.claude && window.claude.use) {
      const dl = await window.claude.use('downloads');
      if (dl) {
        try { await dl.save({ filename, data: blob }); toast('Reservekopie opgeslagen'); }
        catch (e) { toast(e && e.code === 'declined' ? 'Niet opgeslagen' : 'Opslaan lukte hier niet'); }
        return;
      }
    }
    const a = h('a', { href: URL.createObjectURL(blob), download: filename });
    document.body.append(a);
    a.click();
    a.remove();
    toast('Reservekopie staat bij je downloads');
  }

  async function exportProject(pid) {
    const project = await get('projects', pid);
    const steps = await stepsOf(pid);
    const photos = [];
    for (const p of await ofProject('photos', pid)) photos.push({ id: p.id, pins: p.pins, data: await toDataUrl(p.blob) });
    const name = (project.name || 'project').replace(/[^\w-]+/g, '-').slice(0, 40);
    await saveFile('re-assemble-' + name + '.json', new Blob([JSON.stringify({ app: 're-assemble', v: 1, project, steps, photos })], { type: 'application/json' }));
  }

  function importProject() {
    const inp = h('input', { type: 'file', accept: '.json,application/json', hidden: true });
    inp.addEventListener('change', async () => {
      try {
        const data = JSON.parse(await inp.files[0].text());
        if (data.app !== 're-assemble') throw new Error('x');
        const map = {}, pid = uid();
        for (const p of data.photos) {
          map[p.id] = uid();
          const blob = await (await fetch(p.data)).blob();
          await put('photos', { id: map[p.id], projectId: pid, blob, pins: p.pins || [] });
        }
        const fix = (ids) => (ids || []).map((i) => map[i]).filter(Boolean);
        await put('projects', { ...data.project, id: pid, beforeIds: fix(data.project.beforeIds) });
        for (const s of data.steps) await put('steps', { ...s, id: uid(), projectId: pid, photoIds: fix(s.photoIds) });
        toast('Project teruggezet');
        render();
      } catch (e) {
        toast('Dit is geen reservekopie van Re-assemble');
      }
      inp.remove();
    });
    document.body.append(inp);
    inp.click();
  }

  /* ---------- voorbeeld: de massagestoel uit de video ---------- */
  const CHAIR = [
    ['Achterkap', '4 schroeven', 'Achterkant van de stoel'],
    ['Verbindingsplaatjes hoofdsteun en armleuningen', 'Plaatjes links en rechts, met schroeven', 'Zitten aan beide kanten'],
    ['Beensteun: schroeven bij de romp', 'Schroeven links en rechts', ''],
    ['Beensteun eraf', 'Luchtslangen en stekkers', 'Fotografeer welke kleur slang waar zit vóór je ze lostrekt'],
    ['Rugkussen: luchtslang los', 'Luchtslang bij de romp', ''],
    ['Rugkussen eraf', 'Rits', 'Rits helemaal open, dan kussen wegnemen'],
    ['Armleuningen: schroeven bij de romp', 'Schroeven links en rechts', ''],
    ['Armleuningen eraf', 'Luchtslangen en stekkers', 'Links en rechts apart bewaren en labelen'],
  ];

  /* ---------- schermen ---------- */
  function go(hash) { if (location.hash === '#' + hash) render(); else location.hash = hash; }

  function newProject() {
    const name = h('input', { type: 'text', id: 'np-name', placeholder: 'Bijv. Massagestoel' });
    const sample = h('input', { type: 'checkbox', id: 'np-sample' });
    const d = openDialog(h('form', {
      class: 'stack', onsubmit: async (e) => {
        e.preventDefault();
        const id = uid();
        await put('projects', { id, name: name.value.trim() || 'Nieuw project', createdAt: Date.now(), mode: 'uit', beforeIds: [] });
        if (sample.checked) {
          let n = 0;
          for (const [title, parts, warn] of CHAIR) {
            n++;
            await put('steps', { id: uid(), projectId: id, order: n, title, parts, where: 'Zakje ' + n, warn, note: '', photoIds: [], back: false });
          }
        }
        d.close();
        go('p-' + id);
      },
    },
      h('h2', {}, 'Nieuw project'),
      h('div', { class: 'field' }, h('label', { for: 'np-name' }, 'Wat ga je uit elkaar halen?'), name),
      h('label', { class: 'check', for: 'np-sample' }, sample, h('span', {}, 'Vul alvast de 8 stappen van de massagestoel uit de video in')),
      h('div', { class: 'row' },
        h('button', { class: 'btn grow', type: 'button', onclick: () => d.close() }, 'Annuleren'),
        h('button', { class: 'btn primary grow', type: 'submit' }, 'Beginnen'))), true);
    name.focus();
  }

  async function viewHome() {
    const projects = (await all('projects')).sort((a, b) => b.createdAt - a.createdAt);
    const out = [h('div', { class: 'top' }, h('h1', {}, 'Re-assemble'))];
    if (!projects.length) {
      out.push(h('div', { class: 'panel' },
        h('h2', {}, 'Haal iets uit elkaar en krijg het ook weer in elkaar'),
        h('ol', { class: 'steps3' },
          h('li', {}, h('span', {}, 'Maak bij elke stap een foto en schrijf op wat je losmaakt en waar je het bewaart.')),
          h('li', {}, h('span', {}, 'Tik op de foto om aan te wijzen waar een schroef, stekker of slang zat.')),
          h('li', {}, h('span', {}, 'Bij het terugzetten krijg je dezelfde stappen in omgekeerde volgorde, één per scherm.')))));
    }
    for (const p of projects) {
      const steps = await stepsOf(p.id);
      const done = steps.filter((s) => s.back).length;
      const cover = (p.beforeIds || [])[0] || (steps.find((s) => s.photoIds.length) || { photoIds: [] }).photoIds[0];
      out.push(h('button', { class: 'card', onclick: () => go('p-' + p.id) },
        cover ? h('img', { class: 'thumb', src: await photoUrl(cover), alt: '' }) : h('span', { class: 'thumb' }, 'geen foto'),
        h('span', { class: 'body' },
          h('span', { class: 'title' }, p.name),
          h('span', { class: 'muted small' }, steps.length + (steps.length === 1 ? ' stap' : ' stappen') + (p.mode === 'in' ? ' · ' + done + ' teruggezet' : '')))));
    }
    out.push(h('button', { class: 'btn wide', onclick: importProject }, 'Reservekopie terugzetten'));
    out.push(h('div', { class: 'dock' }, h('div', {}, h('button', { class: 'btn primary', onclick: newProject }, '+ Nieuw project'))));
    return out;
  }

  function projectMenu(p) {
    const d = openDialog([
      h('h2', {}, p.name),
      h('button', {
        class: 'btn wide', onclick: () => {
          d.close();
          const inp = h('input', { type: 'text', id: 'rn', value: p.name });
          const r = openDialog(h('form', { class: 'stack', onsubmit: async (e) => { e.preventDefault(); p.name = inp.value.trim() || p.name; await put('projects', p); r.close(); render(); } },
            h('div', { class: 'field' }, h('label', { for: 'rn' }, 'Nieuwe naam'), inp),
            h('button', { class: 'btn primary wide', type: 'submit' }, 'Opslaan')), true);
        },
      }, 'Naam wijzigen'),
      h('button', { class: 'btn wide', onclick: () => { d.close(); exportProject(p.id); } }, 'Reservekopie maken'),
      h('button', {
        class: 'btn danger wide', onclick: async () => {
          d.close();
          if (!(await ask('Project weghalen?', 'Alle stappen en foto\'s van "' + p.name + '" verdwijnen van dit toestel.', 'Weghalen', true))) return;
          for (const s of await ofProject('steps', p.id)) await del('steps', s.id);
          for (const ph of await ofProject('photos', p.id)) await del('photos', ph.id);
          await del('projects', p.id);
          go('home');
        },
      }, 'Project weghalen'),
      h('button', { class: 'btn wide', onclick: () => d.close() }, 'Sluiten'),
    ], true);
  }

  function stepCard(s, nr, onclick, showDone) {
    return (async () => h('button', { class: 'card' + (showDone && s.back ? ' done' : ''), onclick },
      h('span', { class: 'num' }, showDone && s.back ? '✓' : nr),
      h('span', { class: 'body' },
        h('span', { class: 'title' }, s.title || 'Stap ' + nr),
        s.parts ? h('span', { class: 'muted small' }, s.parts) : null,
        s.where ? h('span', { class: 'tag' }, s.where) : null),
      s.photoIds.length ? h('img', { class: 'thumb', src: await photoUrl(s.photoIds[0]), alt: '' }) : h('span', { class: 'thumb' }, 'geen foto')))();
  }

  async function viewProject(pid) {
    const p = await get('projects', pid);
    if (!p) return viewHome();
    p.beforeIds = p.beforeIds || [];
    const steps = await stepsOf(pid);
    const setMode = async (m) => { p.mode = m; await put('projects', p); render(); };
    const out = [
      h('div', { class: 'top' },
        h('button', { class: 'btn icon', 'aria-label': 'Terug naar projecten', onclick: () => go('home') }, '←'),
        h('h1', {}, p.name),
        h('button', { class: 'btn icon', 'aria-label': 'Meer opties', onclick: () => projectMenu(p) }, '⋯')),
      h('div', { class: 'switch', role: 'group', 'aria-label': 'Wat ben je aan het doen?' },
        h('button', { 'aria-pressed': String(p.mode !== 'in'), onclick: () => setMode('uit') }, 'Uit elkaar halen'),
        h('button', { 'aria-pressed': String(p.mode === 'in'), onclick: () => setMode('in') }, 'In elkaar zetten')),
    ];

    if (p.mode !== 'in') {
      const addBefore = h('button', { class: 'add', type: 'button', onclick: async () => { const ids = await pickPhotos(pid, true); if (ids.length) { p.beforeIds.push(...ids); await put('projects', p); render(); } } }, '+ Foto vooraf');
      out.push(h('div', { class: 'panel' },
        h('span', { class: 'label' }, 'Zo zag het eruit'),
        !p.beforeIds.length && h('p', { class: 'muted' }, 'Fotografeer het geheel van alle kanten vóór je begint.'),
        await strip(p.beforeIds, async (id) => {
          if (await openPhoto(id)) { p.beforeIds = p.beforeIds.filter((x) => x !== id); await put('projects', p); }
          render();
        }, addBefore)));
      if (!steps.length) out.push(h('p', { class: 'muted' }, 'Nog geen stappen. Tik op "Stap toevoegen" telkens als je iets gaat losmaken.'));
      let n = 0;
      for (const s of steps) { n++; out.push(await stepCard(s, n, () => editStep(s.id))); }
      out.push(h('div', { class: 'dock' }, h('div', {}, h('button', { class: 'btn primary', onclick: () => addStep(pid) }, '+ Stap toevoegen'))));
    } else {
      const done = steps.filter((s) => s.back).length;
      out.push(h('div', { class: 'panel' },
        h('div', { class: 'row' }, h('strong', { class: 'grow' }, done + ' van ' + steps.length + ' teruggezet'),
          done ? h('button', { class: 'btn', onclick: async () => { if (await ask('Opnieuw beginnen?', 'Alle vinkjes gaan weg. Je stappen en foto\'s blijven.', 'Opnieuw')) { for (const s of steps) { s.back = false; await put('steps', s); } render(); } } }, 'Opnieuw') : null),
        h('div', { class: 'bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': steps.length, 'aria-valuenow': done }, h('i', { style: 'width:' + (steps.length ? (done / steps.length) * 100 : 0) + '%' })),
        h('p', { class: 'muted small' }, 'De laatste stap van het uit elkaar halen komt als eerste.')));
      const rev = steps.slice().reverse();
      for (const s of rev) out.push(await stepCard(s, steps.indexOf(s) + 1, () => go('g-' + pid + '-' + s.id), true));
      if (steps.length) {
        out.push(h('div', { class: 'dock' }, h('div', {}, h('button', { class: 'btn primary', onclick: () => go('g-' + pid) },
          done === 0 ? 'Begin met terugzetten' : done === steps.length ? 'Alles bekijken' : 'Ga verder'))));
      } else out.push(h('p', { class: 'muted' }, 'Er zijn nog geen stappen om terug te zetten.'));
    }
    return out;
  }

  // Terugzetten: één stap per scherm, in omgekeerde volgorde.
  async function viewGuide(pid, stepId) {
    const p = await get('projects', pid);
    if (!p) return viewHome();
    const steps = await stepsOf(pid);
    const rev = steps.slice().reverse();
    if (!rev.length) return viewProject(pid);
    let i = stepId === 'klaar' ? rev.length : rev.findIndex((s) => s.id === stepId);
    if (i < 0) { i = rev.findIndex((s) => !s.back); if (i < 0) i = rev.length; }
    const back = h('button', { class: 'btn icon', 'aria-label': 'Terug naar het overzicht', onclick: () => go('p-' + pid) }, '←');

    if (i >= rev.length) {
      const out = [h('div', { class: 'top' }, back, h('h1', {}, 'Alles zit er weer in')),
        h('p', {}, 'Vergelijk het resultaat met de foto\'s van vooraf.')];
      for (const id of p.beforeIds || []) { const ph = await get('photos', id); if (ph) out.push(await figure(ph)); }
      out.push(h('div', { class: 'dock' }, h('div', {}, h('button', { class: 'btn primary', onclick: () => go('p-' + pid) }, 'Naar het overzicht'))));
      return out;
    }

    const s = rev[i];
    const nr = steps.indexOf(s) + 1;
    const out = [
      h('div', { class: 'top' }, back, h('div', { class: 'grow', style: 'flex:1;min-width:0' },
        h('span', { class: 'label' }, 'Terugzetten ' + (i + 1) + ' van ' + rev.length + ' · was stap ' + nr),
        h('h1', {}, s.title || 'Stap ' + nr))),
      h('div', { class: 'bar' }, h('i', { style: 'width:' + (rev.filter((x) => x.back).length / rev.length) * 100 + '%' })),
    ];
    if (s.where || s.parts) out.push(h('div', { class: 'panel' }, h('span', { class: 'label' }, 'Pak erbij'), s.where && h('span', { class: 'tag' }, s.where), s.parts && h('p', { class: 'info' }, s.parts)));
    if (s.warn) out.push(h('p', { class: 'warn' }, '⚠ ' + s.warn));
    for (const id of s.photoIds) {
      const ph = await get('photos', id);
      if (!ph) continue;
      out.push(await figure(ph), pinLegend(ph));
    }
    if (!s.photoIds.length) out.push(h('p', { class: 'muted' }, 'Bij deze stap is geen foto gemaakt.'));
    if (s.note) out.push(h('div', { class: 'panel' }, h('span', { class: 'label' }, 'Notitie'), h('p', { class: 'info' }, s.note)));
    const next = rev[i + 1];
    out.push(h('div', { class: 'dock' }, h('div', {},
      h('button', { class: 'btn', disabled: i === 0, onclick: () => go('g-' + pid + '-' + rev[i - 1].id) }, '← Vorige'),
      h('button', { class: 'btn ok', style: 'flex:2', onclick: async () => { s.back = true; await put('steps', s); go('g-' + pid + '-' + (next ? next.id : 'klaar')); } }, s.back ? 'Volgende →' : '✓ Zit erin'))));
    return out;
  }

  let seq = 0;
  async function render() {
    const my = ++seq;
    const hash = location.hash.slice(1);
    let nodes;
    try {
      const m = hash.match(/^([pg])-([a-z0-9]+)(?:-([a-z0-9]+))?$/);
      if (m && m[1] === 'p') nodes = await viewProject(m[2]);
      else if (m) nodes = await viewGuide(m[2], m[3]);
      else nodes = await viewHome();
    } catch (e) {
      nodes = [h('h1', {}, 'Re-assemble'), h('p', { class: 'warn' }, 'Opslaan op dit toestel lukt niet. Open de app in een gewoon browservenster (geen privévenster).')];
    }
    if (my !== seq) return;
    const y = window.scrollY, same = app.dataset.hash === hash;
    app.replaceChildren(...nodes.filter(Boolean));
    app.dataset.hash = hash;
    window.scrollTo(0, same ? y : 0);
  }

  window.addEventListener('hashchange', render);
  render();
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  if ('serviceWorker' in navigator && location.protocol === 'https:' && !window.claude) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
